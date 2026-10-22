import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { CandidateRoutineSchema, PreflightRunSchema, DomainError, type CandidateChange, type HomeEvent,
  type Routine, type RoutineView, type Verdict } from './contracts.js';
import { evaluate, localDate, POLICY_VERSION } from './policy.js';
import { sunsetFor } from './fixtures.js';
import { household, hash } from './db.js';
import { readRoutine } from './routines.js';

// Side-effect free: evaluates hypothetical events with the production evaluate() and never
// touches events, decisions, actions, approvals, routine heads or simulated devices.
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const scheduleText = (weekdays: number[]) => [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => days[d]).join(', ');
const actionsText = (actions: Routine['actions']) => actions.map(a => `${a.deviceId}/${a.action}`).join(', ');
const scenarios = [
  { scenarioId: 'weekday-after-sunset', title: 'Approved weekday arrival after sunset', occurredAt: '2026-10-21T19:00:00+05:30',
    approved: true, mustDeny: false, explanation: 'Wednesday 19:00, sunset fixture 18:00. The routine should light the porch.' },
  { scenarioId: 'saturday-after-sunset', title: 'Saturday arrival after sunset', occurredAt: '2026-10-24T19:00:00+05:30',
    approved: true, mustDeny: false, explanation: 'Saturday 19:00, sunset fixture 17:58. Allowed only if the schedule includes Saturday.' },
  { scenarioId: 'before-sunset', title: 'Arrival before sunset', occurredAt: '2026-10-21T17:30:00+05:30',
    approved: true, mustDeny: true, explanation: 'Wednesday 17:30, before the 18:00 sunset fixture. Must stay off.' },
  { scenarioId: 'missing-sunset', title: 'Missing sunset evidence', occurredAt: '2026-10-22T19:00:00+05:30',
    approved: true, mustDeny: true, explanation: 'Thursday 19:00 has no dated sunset fixture. Policy must not guess.' },
  { scenarioId: 'unapproved-routine', title: 'Unapproved routine', occurredAt: '2026-10-21T19:00:00+05:30',
    approved: false, mustDeny: true, explanation: 'Same matching arrival with no approval. Not eligible to execute.' },
  { scenarioId: 'door-unlock', title: 'Prohibited door unlock', occurredAt: '2026-10-21T19:00:00+05:30',
    approved: true, mustDeny: true, explanation: 'The routine requests front-door/unlock with approval. Must always be denied.' }
] as const;

function run(routine: Routine, scenario: typeof scenarios[number], event: HomeEvent) {
  const subject = scenario.scenarioId === 'door-unlock' ? { ...routine, actions: [{ deviceId: 'front-door', action: 'unlock' } as const] } : routine;
  const approval = scenario.approved ? { revisionId: subject.revisionId, contentHash: hash(subject),
    actor: 'preflight-simulation', approvedAt: '2026-10-21T00:00:00.000Z' } : null;
  const verdicts: Verdict[] = evaluate({ event, routine: subject, approval, currentRevision: true,
    sunset: sunsetFor(localDate(event.occurredAt, subject.timezone)) });
  return { outcome: verdicts.some(v => v.verdict === 'allow') ? 'allow' as const : 'deny' as const, verdicts };
}

export function preflightSuite(view: RoutineView, change: CandidateChange) {
  const base = view.routine;
  const candidate = CandidateRoutineSchema.parse({ ...base, revisionId: 'preflight-candidate',
    sourceText: `Preflight candidate derived from ${base.revisionId}; not saved, approved or activated.`,
    weekdays: change.weekdays, actions: change.actions ?? base.actions });
  const changes = [];
  if (scheduleText(base.weekdays) !== scheduleText(candidate.weekdays))
    changes.push({ field: 'weekdays' as const, before: scheduleText(base.weekdays), after: scheduleText(candidate.weekdays) });
  if (actionsText(base.actions) !== actionsText(candidate.actions))
    changes.push({ field: 'actions' as const, before: actionsText(base.actions), after: actionsText(candidate.actions) });
  const cases = scenarios.map(scenario => {
    const event: HomeEvent = { eventId: `preflight-${scenario.scenarioId}`, routineRevisionId: base.revisionId,
      kind: 'arrival', occurredAt: scenario.occurredAt, source: 'simulated' };
    const before = run(base, scenario, event), after = run(candidate, scenario, event);
    const changed = JSON.stringify(before.verdicts) !== JSON.stringify(after.verdicts);
    const unlockAllowed = after.verdicts.some(v => v.action === 'unlock' && v.verdict === 'allow');
    return { scenarioId: scenario.scenarioId, title: scenario.title, explanation: scenario.explanation, event,
      sunset: sunsetFor(localDate(event.occurredAt, base.timezone)),
      approvalBasis: scenario.approved ? 'simulated_for_preflight' as const : 'none' as const, mustDeny: scenario.mustDeny,
      baseline: before, candidate: after, changed,
      change: before.outcome === after.outcome ? (changed ? 'reason_changed' as const : 'unchanged' as const)
        : after.outcome === 'allow' ? 'newly_allowed' as const : 'newly_denied' as const,
      safetyViolation: unlockAllowed || (scenario.mustDeny && after.outcome === 'allow') };
  });
  const safetyViolations = cases.filter(c => c.safetyViolation).length;
  const findings = [
    ...(safetyViolations ? ['SAFETY_INVARIANT_VIOLATED' as const] : []),
    ...(candidate.actions.some(a => a.action === 'unlock') ? ['PROHIBITED_ACTION_REQUESTED' as const] : []),
    ...(cases.some(c => c.change === 'newly_denied') ? ['PREVIOUSLY_ALLOWED_CASE_DENIED' as const] : [])
  ];
  return { baseline: view, candidate, changes, simulatedApproval: { actor: 'preflight-simulation' as const, persisted: false as const },
    activated: false as const, cases, summary: { verdict: findings.length ? 'fail' as const : 'pass' as const,
      total: cases.length, changed: cases.filter(c => c.changed).length, safetyViolations, findings } };
}

export async function runPreflight(pool: pg.Pool, routineRevisionId: string, change: CandidateChange) {
  const view = await readRoutine(pool, routineRevisionId);
  if (!view) throw new DomainError('NOT_FOUND');
  const result = PreflightRunSchema.parse({ runId: randomUUID(), createdAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION, ...preflightSuite(view, change) });
  // Only the test-run record is written; it is insert-only and never read by event processing.
  await pool.query('INSERT INTO preflight_runs (run_id, household_id, routine_revision_id, result) VALUES ($1,$2,$3,$4)',
    [result.runId, household, routineRevisionId, result]);
  return result;
}

export async function getPreflightRun(pool: pg.Pool, runId: string) {
  const row = await pool.query('SELECT result FROM preflight_runs WHERE household_id=$1 AND run_id=$2', [household, runId]);
  return row.rowCount ? PreflightRunSchema.parse(row.rows[0].result) : null;
}

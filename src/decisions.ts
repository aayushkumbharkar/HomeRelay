import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { EventSchema, DecisionSchema, DomainError, type HomeEvent, type Decision } from './contracts.js';
import { household, hash, transaction } from './db.js';
import { readRoutine } from './routines.js';
import { evaluate, localDate, POLICY_VERSION } from './policy.js';
import { sunsetFor } from './fixtures.js';
import { executeSimulated } from './simulated-action.js';

export async function processEvent(pool: pg.Pool, input: HomeEvent) {
  const parsed = EventSchema.parse(input);
  const event = { ...parsed, occurredAt: new Date(parsed.occurredAt).toISOString() };
  return transaction(pool, async db => {
    const inserted = await db.query('INSERT INTO events VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id',
      [household, event.eventId, event, hash(event)]);
    if (!inserted.rowCount) {
      const existing = await db.query(`SELECT e.payload_hash, d.evidence FROM events e
        JOIN decisions d USING (household_id,event_id) WHERE e.household_id=$1 AND e.event_id=$2`, [household, event.eventId]);
      if (!existing.rowCount) throw new DomainError('UNAVAILABLE');
      if (existing.rows[0].payload_hash !== hash(event)) throw new DomainError('IDEMPOTENCY_CONFLICT');
      return { decision: DecisionSchema.parse(existing.rows[0].evidence), replayed: true };
    }
    const view = await readRoutine(db, event.routineRevisionId, true);
    if (!view) throw new DomainError('NOT_FOUND');
    const devices = await db.query('SELECT device_id,state FROM devices WHERE household_id=$1 ORDER BY device_id FOR UPDATE', [household]);
    const states = new Map<string, string>(devices.rows.map(row => [row.device_id, row.state]));
    const sunset = sunsetFor(localDate(event.occurredAt, view.routine.timezone));
    const verdicts = evaluate({ event, routine: view.routine, approval: view.approval,
      currentRevision: view.currentRevision, sunset });
    const actions: Decision['actions'] = [];
    for (const verdict of verdicts) {
      const before = states.get(verdict.deviceId);
      if (!before) throw new DomainError('UNAVAILABLE');
      const allowed = verdict.verdict === 'allow';
      const after = allowed ? await executeSimulated(db, verdict) : before;
      actions.push({ ...verdict, before, after, executionStatus: allowed ? 'executed' : 'not_executed',
        actionId: allowed ? randomUUID() : null });
    }
    const decision = DecisionSchema.parse({ decisionId: randomUUID(), eventId: event.eventId,
      routineRevisionId: event.routineRevisionId, policyVersion: POLICY_VERSION, evaluatedAt: new Date().toISOString(),
      eventSnapshot: event, routineSnapshot: view.routine, approvalSnapshot: view.approval,
      sunsetSnapshot: sunset, currentRevision: view.currentRevision, actions });
    await db.query('INSERT INTO decisions VALUES ($1,$2,$3,$4)', [decision.decisionId, household, event.eventId, decision]);
    for (const [ordinal, action] of actions.entries()) {
      if (action.actionId) await db.query('INSERT INTO actions VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [action.actionId, decision.decisionId, ordinal, action.deviceId, action.action, action.before, action.after]);
    }
    return { decision, replayed: false };
  });
}
export async function getDecision(pool: pg.Pool, id: string): Promise<Decision | null> {
  const result = await pool.query('SELECT evidence FROM decisions WHERE household_id=$1 AND event_id=$2', [household, id]);
  return result.rowCount ? DecisionSchema.parse(result.rows[0].evidence) : null;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightSuite } from '../../src/preflight.js';
import { reconstruct } from '../../src/incident.js';
import { evaluate, CHECK_ORDER } from '../../src/policy.js';
import { routine } from '../../src/fixtures.js';
import { hash } from '../../src/db.js';
import { PreflightSuiteSchema, IncidentSchema, PreflightInput, type Decision, type RoutineView, type PolicyInput } from '../../src/contracts.js';

const unapproved: RoutineView = { routine, contentHash: hash(routine), currentRevision: true, approval: null };
const saturday = { weekdays: [1, 2, 3, 4, 5, 6] };
const byId = (suite: any) => Object.fromEntries(suite.cases.map((c: any) => [c.scenarioId, c]));
const reasons = (side: any) => side.verdicts.map((v: any) => v.reasonCode);

test('preflight: Saturday candidate changes only the Saturday decision and passes', () => {
  const suite = PreflightSuiteSchema.parse(preflightSuite(unapproved, saturday));
  const c = byId(suite);
  assert.deepEqual(Object.keys(c), ['weekday-after-sunset', 'saturday-after-sunset', 'before-sunset',
    'missing-sunset', 'unapproved-routine', 'door-unlock']);
  assert.deepEqual([reasons(c['weekday-after-sunset'].baseline), reasons(c['weekday-after-sunset'].candidate)],
    [['ARRIVAL_RULE_MATCHED'], ['ARRIVAL_RULE_MATCHED']]);
  assert.deepEqual([reasons(c['saturday-after-sunset'].baseline), reasons(c['saturday-after-sunset'].candidate)],
    [['OUTSIDE_WEEKDAYS'], ['ARRIVAL_RULE_MATCHED']]);
  assert.equal(c['saturday-after-sunset'].change, 'newly_allowed');
  assert.deepEqual(suite.cases.filter(x => x.changed).map(x => x.scenarioId), ['saturday-after-sunset']);
  assert.deepEqual(reasons(c['before-sunset'].candidate), ['NOT_AFTER_SUNSET']);
  assert.deepEqual(reasons(c['missing-sunset'].candidate), ['SUNSET_UNAVAILABLE']);
  assert.equal(c['missing-sunset'].sunset, null);
  assert.deepEqual(reasons(c['unapproved-routine'].candidate), ['APPROVAL_REQUIRED']);
  assert.equal(c['unapproved-routine'].approvalBasis, 'none');
  assert.deepEqual(reasons(c['door-unlock'].candidate), ['DOOR_UNLOCK_FORBIDDEN']);
  for (const id of ['before-sunset', 'missing-sunset', 'unapproved-routine', 'door-unlock']) {
    assert.equal(c[id].mustDeny, true); assert.equal(c[id].candidate.outcome, 'deny'); assert.equal(c[id].baseline.outcome, 'deny');
  }
  assert.equal(suite.cases.some(x => x.safetyViolation), false);
  assert.deepEqual(suite.summary, { verdict: 'pass', total: 6, changed: 1, safetyViolations: 0, findings: [] });
  assert.deepEqual(suite.changes, [{ field: 'weekdays', before: 'Mon, Tue, Wed, Thu, Fri', after: 'Mon, Tue, Wed, Thu, Fri, Sat' }]);
});

test('preflight: simulated approval is labelled and never confused with the persisted approval', () => {
  const suite = PreflightSuiteSchema.parse(preflightSuite(unapproved, saturday));
  assert.equal(suite.baseline.approval, null);
  assert.deepEqual(suite.simulatedApproval, { actor: 'preflight-simulation', persisted: false });
  assert.equal(suite.activated, false);
  assert.equal(suite.candidate.revisionId, 'preflight-candidate');
  assert.equal(byId(suite)['weekday-after-sunset'].approvalBasis, 'simulated_for_preflight');
});

test('preflight: a candidate that adds door unlock cannot bypass the unlock invariant', () => {
  const suite = PreflightSuiteSchema.parse(preflightSuite(unapproved, { weekdays: [1, 2, 3, 4, 5],
    actions: [{ deviceId: 'porch-light', action: 'turn_on' }, { deviceId: 'front-door', action: 'unlock' }] }));
  for (const c of suite.cases) for (const v of c.candidate.verdicts) {
    if (v.action === 'unlock') { assert.equal(v.verdict, 'deny'); assert.equal(v.reasonCode, 'DOOR_UNLOCK_FORBIDDEN'); }
  }
  assert.equal(suite.summary.safetyViolations, 0);
  assert.equal(suite.summary.verdict, 'fail');
  assert.deepEqual(suite.summary.findings, ['PROHIBITED_ACTION_REQUESTED']);
});

test('preflight: removing an allowed weekday is reported as a regression', () => {
  const suite = PreflightSuiteSchema.parse(preflightSuite(unapproved, { weekdays: [1, 2, 4, 5] }));
  assert.equal(byId(suite)['weekday-after-sunset'].change, 'newly_denied');
  assert.deepEqual(suite.summary.findings, ['PREVIOUSLY_ALLOWED_CASE_DENIED']);
  assert.equal(suite.summary.verdict, 'fail');
});

test('preflight input rejects forged approval, unknown weekdays and duplicates', () => {
  const ok = { routineRevisionId: 'r1', candidate: saturday };
  assert.equal(PreflightInput.safeParse(ok).success, true);
  assert.equal(PreflightInput.safeParse({ ...ok, approved: true }).success, false);
  assert.equal(PreflightInput.safeParse({ ...ok, candidate: { ...saturday, approved: true } }).success, false);
  assert.equal(PreflightInput.safeParse({ ...ok, candidate: { weekdays: [7] } }).success, false);
  assert.equal(PreflightInput.safeParse({ ...ok, candidate: { weekdays: [6, 6] } }).success, false);
});

test('CHECK_ORDER matches evaluate precedence', () => {
  const input: PolicyInput = {
    event: { eventId: 'e', routineRevisionId: 'r1', kind: 'departure', occurredAt: '2026-10-24T17:00:00+05:30', source: 'simulated' },
    routine: { ...routine, actions: [{ deviceId: 'front-door', action: 'unlock' }] }, approval: null, currentRevision: false, sunset: null
  };
  const repairs: Array<(i: PolicyInput) => void> = [
    i => { i.routine.actions = [{ deviceId: 'porch-light', action: 'turn_on' }]; },
    i => { i.currentRevision = true; },
    i => { i.approval = { revisionId: 'r1', contentHash: 'a'.repeat(64), actor: 'x', approvedAt: '2026-10-22T00:00:00.000Z' }; },
    i => { i.event.kind = 'arrival'; },
    i => { i.event.occurredAt = '2026-10-21T17:00:00+05:30'; },
    i => { i.sunset = { date: '2026-10-21', timezone: 'Asia/Kolkata', sunsetAt: '2026-10-21T18:00:00+05:30', source: 'simulated' }; },
    i => { i.event.occurredAt = '2026-10-21T19:00:00+05:30'; }
  ];
  const observed = [evaluate(input)[0].reasonCode];
  for (const repair of repairs) { repair(input); observed.push(evaluate(input)[0].reasonCode); }
  assert.deepEqual(observed, [...CHECK_ORDER, 'ARRIVAL_RULE_MATCHED']);
});

const stored: Decision = {
  decisionId: '11111111-1111-4111-8111-111111111111', eventId: 'sat-1', routineRevisionId: 'r1', policyVersion: 'household-v1',
  evaluatedAt: '2026-10-23T10:00:00.000Z',
  eventSnapshot: { eventId: 'sat-1', routineRevisionId: 'r1', kind: 'arrival', occurredAt: '2026-10-24T13:30:00.000Z', source: 'simulated' },
  routineSnapshot: routine,
  approvalSnapshot: { revisionId: 'r1', contentHash: hash(routine), actor: 'demo-operator', approvedAt: '2026-10-22T00:00:00.000Z' },
  sunsetSnapshot: null, currentRevision: true,
  actions: [{ deviceId: 'porch-light', action: 'turn_on', verdict: 'deny', reasonCode: 'OUTSIDE_WEEKDAYS',
    executionStatus: 'not_executed', actionId: null, before: 'off', after: 'off' }]
};

test('incident: recorded reason code locates the failed check; later checks are not reached', () => {
  const incident = IncidentSchema.parse(reconstruct(stored));
  assert.deepEqual(incident.decision, stored);
  const checks = incident.actions[0].checks;
  assert.deepEqual(checks.map(c => [c.reasonCode, c.status]), [
    ['DOOR_UNLOCK_FORBIDDEN', 'passed'], ['REVISION_SUPERSEDED', 'passed'], ['APPROVAL_REQUIRED', 'passed'],
    ['TRIGGER_MISMATCH', 'passed'], ['OUTSIDE_WEEKDAYS', 'failed'], ['SUNSET_UNAVAILABLE', 'not_reached'],
    ['NOT_AFTER_SUNSET', 'not_reached']]);
  assert.match(checks[2].evidence, /demo-operator/);
  assert.match(checks[4].evidence, /Sat/);
  assert.match(checks[5].evidence, /No sunset snapshot recorded/);
});

test('incident: an executed decision cites its receipt and passes every check', () => {
  const executed: Decision = { ...stored, actions: [{ ...stored.actions[0], verdict: 'allow', reasonCode: 'ARRIVAL_RULE_MATCHED',
    executionStatus: 'executed', actionId: '22222222-2222-4222-8222-222222222222', after: 'on' }] };
  const incident = IncidentSchema.parse(reconstruct(executed));
  assert.equal(incident.actions[0].actionId, '22222222-2222-4222-8222-222222222222');
  assert.ok(incident.actions[0].checks.every(c => c.status === 'passed'));
});

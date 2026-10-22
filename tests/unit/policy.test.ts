import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/policy.js';
import { EventSchema, RoutineSchema, type PolicyInput } from '../../src/contracts.js';

const base: PolicyInput = {
  event: { eventId: 'event1', routineRevisionId: 'r1', kind: 'arrival', occurredAt: '2026-10-21T19:00:00+05:30', source: 'simulated' },
  routine: { revisionId: 'r1', routineId: 'arrival', sourceText: 'Weekday arrival after sunset',
    trigger: 'arrival', weekdays: [1,2,3,4,5], timezone: 'Asia/Kolkata', actions: [{ deviceId: 'porch-light', action: 'turn_on' }] },
  approval: { revisionId: 'r1', contentHash: 'a'.repeat(64), actor: 'demo-operator', approvedAt: '2026-10-22T00:00:00.000Z' },
  currentRevision: true,
  sunset: { date: '2026-10-21', timezone: 'Asia/Kolkata', sunsetAt: '2026-10-21T18:00:00+05:30', source: 'simulated' }
};

const cases: Array<[string, (i: PolicyInput) => void, string]> = [
  ['unapproved', i => { i.approval = null; }, 'APPROVAL_REQUIRED'],
  ['approved matching arrival', () => {}, 'ARRIVAL_RULE_MATCHED'],
  ['unlock despite approval', i => { i.routine.actions = [{ deviceId: 'front-door', action: 'unlock' }]; }, 'DOOR_UNLOCK_FORBIDDEN'],
  ['superseded', i => { i.currentRevision = false; }, 'REVISION_SUPERSEDED'],
  ['different trigger', i => { i.event.kind = 'departure'; }, 'TRIGGER_MISMATCH'],
  ['weekend', i => { i.event.occurredAt = '2026-10-24T19:00:00+05:30'; }, 'OUTSIDE_WEEKDAYS'],
  ['UTC Friday is local Saturday', i => { i.event.occurredAt = '2026-10-23T20:00:00Z'; }, 'OUTSIDE_WEEKDAYS'],
  ['before sunset', i => { i.event.occurredAt = '2026-10-21T17:59:59+05:30'; }, 'NOT_AFTER_SUNSET'],
  ['exact sunset', i => { i.event.occurredAt = '2026-10-21T18:00:00+05:30'; }, 'NOT_AFTER_SUNSET'],
  ['missing sunset', i => { i.sunset = null; }, 'SUNSET_UNAVAILABLE'],
  ['wrong dated sunset', i => { i.sunset!.date = '2026-10-20'; }, 'SUNSET_UNAVAILABLE']
];
for (const [name, change, reasonCode] of cases) test(`policy: ${name}`, () => {
  const input = structuredClone(base); change(input);
  assert.deepEqual(evaluate(input), [{ ...input.routine.actions[0], reasonCode,
    verdict: reasonCode === 'ARRIVAL_RULE_MATCHED' ? 'allow' : 'deny' }]);
});
test('strict contracts reject invalid dates, forged approval and unsupported action', () => {
  assert.equal(EventSchema.safeParse({ ...base.event, occurredAt: '2026-02-30T19:00:00Z' }).success, false);
  assert.equal(EventSchema.safeParse({ ...base.event, approved: true }).success, false);
  assert.equal(RoutineSchema.safeParse({ ...base.routine, actions: [{ deviceId: 'front-door', action: 'turn_on' }] }).success, false);
});

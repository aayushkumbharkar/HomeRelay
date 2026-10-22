import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../helpers/database.js';
import { event } from '../helpers/fixtures.js';
import { approveRoutine, getRoutine } from '../../src/routines.js';
import { processEvent, getDecision } from '../../src/decisions.js';

test('sequential and ten concurrent duplicates commit exactly one action per event', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const draft = await getRoutine(db.pool, 'r1'); assert.ok(draft);
  await approveRoutine(db.pool, 'r1', draft.contentHash);
  const original = await processEvent(db.pool, event);
  const replay = await processEvent(db.pool, { ...event, occurredAt: '2026-10-21T13:30:00Z' });
  assert.deepEqual(replay, { decision: original.decision, replayed: true });
  await assert.rejects(processEvent(db.pool, { ...event, occurredAt: '2026-10-21T20:00:00+05:30' }), /IDEMPOTENCY_CONFLICT/);
  const results = await Promise.all(Array.from({ length: 10 }, () => processEvent(db.pool, { ...event, eventId: 'race' })));
  assert.equal(new Set(results.map(r => r.decision.decisionId)).size, 1);
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 2);
  assert.equal((await db.pool.query('SELECT * FROM events')).rowCount, 2);
  assert.equal((await db.pool.query('SELECT * FROM decisions')).rowCount, 2);
  assert.deepEqual(await getDecision(db.pool, event.eventId), original.decision);
});

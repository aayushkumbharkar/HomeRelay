import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../helpers/database.js';
import { event } from '../helpers/fixtures.js';
import { routine } from '../../src/fixtures.js';
import { household, hash } from '../../src/db.js';
import { approveRoutine } from '../../src/routines.js';
import { processEvent, getDecision } from '../../src/decisions.js';

test('approved unlock is denied durably and past evidence survives a new routine head', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const unlock = { ...routine, revisionId: 'unlock-r1', routineId: 'unlock', actions: [{ deviceId: 'front-door', action: 'unlock' }] };
  await db.pool.query('INSERT INTO routine_revisions (household_id,revision_id,routine_id,content,content_hash) VALUES ($1,$2,$3,$4,$5)',
    [household, unlock.revisionId, unlock.routineId, unlock, hash(unlock)]);
  await db.pool.query('INSERT INTO routine_heads VALUES ($1,$2,$3)', [household, unlock.routineId, unlock.revisionId]);
  await approveRoutine(db.pool, unlock.revisionId, hash(unlock));
  const result = await processEvent(db.pool, { ...event, routineRevisionId: unlock.revisionId });
  assert.equal(result.decision.actions[0].reasonCode, 'DOOR_UNLOCK_FORBIDDEN');
  assert.equal(result.decision.actions[0].executionStatus, 'not_executed');
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 0);
  assert.equal((await db.pool.query("SELECT state FROM devices WHERE device_id='front-door'")).rows[0].state, 'locked');
  await assert.rejects(db.pool.query("UPDATE devices SET state='unlocked' WHERE device_id='front-door'"), /check constraint/);
  const replacement = { ...unlock, revisionId: 'unlock-r2', sourceText: 'New draft, not approved' };
  await db.pool.query('INSERT INTO routine_revisions (household_id,revision_id,routine_id,content,content_hash) VALUES ($1,$2,$3,$4,$5)',
    [household, replacement.revisionId, replacement.routineId, replacement, hash(replacement)]);
  await db.pool.query('UPDATE routine_heads SET revision_id=$1 WHERE household_id=$2 AND routine_id=$3', [replacement.revisionId, household, 'unlock']);
  assert.deepEqual(await getDecision(db.pool, event.eventId), result.decision);
});

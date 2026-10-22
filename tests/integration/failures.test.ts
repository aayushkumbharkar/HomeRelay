import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../helpers/database.js';
import { event } from '../helpers/fixtures.js';
import { approveRoutine, getRoutine } from '../../src/routines.js';
import { processEvent } from '../../src/decisions.js';

test('action receipt failure rolls back event, decision and simulated device state; retry recovers', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const draft = await getRoutine(db.pool, 'r1'); assert.ok(draft);
  await approveRoutine(db.pool, 'r1', draft.contentHash);
  await db.pool.query(`CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'test receipt failure'; END $$;
    CREATE TRIGGER receipt_failure BEFORE INSERT ON actions FOR EACH ROW EXECUTE FUNCTION reject_receipt()`);
  await assert.rejects(processEvent(db.pool, event), /test receipt failure/);
  for (const table of ['events', 'decisions', 'actions']) assert.equal((await db.pool.query(`SELECT * FROM ${table}`)).rowCount, 0);
  assert.equal((await db.pool.query("SELECT state FROM devices WHERE device_id='porch-light'")).rows[0].state, 'off');
  await db.pool.query('DROP TRIGGER receipt_failure ON actions');
  assert.equal((await processEvent(db.pool, event)).decision.actions[0].executionStatus, 'executed');
});

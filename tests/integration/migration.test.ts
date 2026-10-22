import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';
import { event } from '../helpers/fixtures.js';
import { migrate } from '../../src/db.js';
import { seed } from '../../src/fixtures.js';
import { approveRoutine, getRoutine } from '../../src/routines.js';
import { processEvent, getDecision } from '../../src/decisions.js';

test('preflight migration upgrades a populated v1 database without touching history; MCP refuses an unmigrated schema', async t => {
  const db = await testDatabase({ prepare: false }); t.after(() => db.close());
  await migrate(db.pool, 1); await seed(db.pool);
  const draft = await getRoutine(db.pool, 'r1'); assert.ok(draft);
  await approveRoutine(db.pool, 'r1', draft.contentHash);
  const original = (await processEvent(db.pool, event)).decision;
  assert.equal((await db.pool.query("SELECT to_regclass('preflight_runs') AS t")).rows[0].t, null);

  const token = randomBytes(32).toString('hex');
  const started = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' })
    .then(process => process, (error: Error) => error);
  if (!(started instanceof Error)) await started.stop();
  assert.match(started instanceof Error ? started.message : 'MCP started on an unmigrated schema', /exited before readiness/);

  await migrate(db.pool);
  await migrate(db.pool);
  assert.deepEqual((await db.pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r => r.version), [1, 2]);
  assert.deepEqual(await getDecision(db.pool, event.eventId), original);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 1);
  assert.equal((await db.pool.query("SELECT state FROM devices WHERE device_id='porch-light'")).rows[0].state, 'on');
  assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM preflight_runs')).rows[0].n, 0);

  await db.pool.query("UPDATE schema_migrations SET checksum='tampered' WHERE version=2");
  await assert.rejects(migrate(db.pool), /checksum mismatch/);
});

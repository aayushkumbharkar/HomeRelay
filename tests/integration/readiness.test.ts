import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';

const tables = ['devices', 'events', 'decisions', 'actions', 'approvals', 'preflight_runs'];

test('readiness checks web -> MCP -> PostgreSQL read-only and distinguishes outage from rejected credentials', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const token = randomBytes(32).toString('hex');
  let mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  const web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  const wrongToken = await startProcess('dist/src/web.js', { MCP_TOKEN: randomBytes(32).toString('hex'), MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  t.after(async () => { await wrongToken.stop(); await web.stop(); await mcp.stop(); });
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async table =>
    [table, (await db.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n])));
  const before = await counts();

  const ready = await fetch(`${web.url}/api/ready`);
  assert.equal(ready.status, 200);
  const body = await ready.text();
  assert.deepEqual(JSON.parse(body), { status: 'ready', checked: 'web, MCP, PostgreSQL (read-only)' });
  assert.ok(!body.includes(token) && !body.includes(mcp.url), 'no token or internal URL in readiness output');

  const rejected = await fetch(`${wrongToken.url}/api/ready`);
  assert.equal(rejected.status, 502);
  assert.deepEqual(await rejected.json(), { error: 'UPSTREAM_REJECTED' });
  assert.equal((await fetch(`${wrongToken.url}/api/home`)).status, 502);

  await mcp.stop();
  const down = await fetch(`${web.url}/api/ready`);
  assert.equal(down.status, 503);
  assert.deepEqual(await down.json(), { error: 'UNAVAILABLE' });
  const live = await fetch(`${web.url}/healthz`);
  assert.equal(live.status, 200, 'web liveness is independent of MCP');
  assert.deepEqual(await live.json(), { status: 'ok', service: 'web', checks: 'process liveness only; see /api/ready' });

  mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: String(new URL(mcp.url).port) });
  assert.equal((await fetch(`${web.url}/api/ready`)).status, 200);
  assert.deepEqual(await counts(), before, 'readiness and failed reads wrote nothing');
});

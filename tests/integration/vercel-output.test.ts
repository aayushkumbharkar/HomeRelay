import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';

const out = '.vercel/output';
test('Vercel Build Output: packaged web and stateless MCP functions run the full workflow on PostgreSQL', async t => {
  execFileSync(process.execPath, ['scripts/build-vercel.mjs'], { stdio: 'pipe' });
  const config = JSON.parse(readFileSync(`${out}/config.json`, 'utf8'));
  assert.equal(config.version, 3);
  assert.ok(config.routes.some((r: any) => r.src === '/mcp' && r.dest === '/api/mcp'));
  assert.ok(config.routes.some((r: any) => r.headers?.['Content-Security-Policy']));
  for (const file of ['static/index.html', 'static/app.js', 'static/style.css']) assert.ok(existsSync(`${out}/${file}`), file);
  for (const fn of ['web', 'mcp']) {
    const vc = JSON.parse(readFileSync(`${out}/functions/api/${fn}.func/.vc-config.json`, 'utf8'));
    assert.match(vc.runtime, /^nodejs\d+\.x$/); assert.equal(vc.launcherType, 'Nodejs'); assert.equal(vc.shouldAddHelpers, false);
  }
  assert.ok(!existsSync(`${out}/static/.env`) && !readFileSync(`${out}/config.json`, 'utf8').includes('postgres'), 'no secrets in output');

  const db = await testDatabase(); t.after(() => db.close());
  const env = { DATABASE_URL: db.url, MCP_TOKEN: randomBytes(32).toString('hex'), CSRF_SECRET: randomBytes(32).toString('hex'), PG_POOL_MAX: '2' };
  const a = await startProcess('dist/tests/helpers/vercel-harness.js', env);
  const b = await startProcess('dist/tests/helpers/vercel-harness.js', { ...env, MCP_URL: `${a.url}/mcp` });
  const brokenDb = await startProcess('dist/tests/helpers/vercel-harness.js', { ...env, DATABASE_URL: 'postgresql://homerelay:x@127.0.0.1:1/homerelay_test', PG_CONNECT_TIMEOUT_MS: '1000' });
  t.after(async () => { await brokenDb.stop(); await b.stop(); await a.stop(); });

  const client = new Client({ name: 'vercel-output-proof', version: '0.1.0' }); t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL(`${a.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${env.MCP_TOKEN}` } } });
  await client.connect(transport);
  assert.ok(transport.protocolVersion && transport.protocolVersion >= '2025-11-25');
  t.diagnostic(`Packaged MCP function negotiated ${transport.protocolVersion}`);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  for (const name of ['get_home', 'simulate_event', 'reconstruct_incident', 'run_preflight', 'get_preflight_run']) assert.ok(names.includes(name), name);
  assert.equal((await fetch(`${a.url}/mcp`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${a.url}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer wrong-token-that-is-long-enough-000000' } })).status, 401);

  assert.equal((await fetch(`${a.url}/api/ready`)).status, 200);
  const csrf = (await (await fetch(`${a.url}/api/session`)).json()).csrfToken;
  const post = (base: string, path: string, value: unknown) => fetch(base + path, { method: 'POST',
    headers: { Origin: base, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const draft = await (await fetch(`${a.url}/api/routines/r1`)).json();
  // Token issued by instance A is accepted by instance B: CSRF is stateless across function instances.
  assert.equal((await post(b.url, '/api/approve', { routineRevisionId: 'r1', contentHash: draft.contentHash })).status, 200);
  const event = { eventId: 'vercel-sat', routineRevisionId: 'r1', kind: 'arrival', occurredAt: '2026-10-24T19:00:00+05:30', source: 'simulated' };
  const recorded = await (await post(a.url, '/api/events', event)).json();
  assert.equal(recorded.decision.actions[0].reasonCode, 'OUTSIDE_WEEKDAYS');
  const replay = await (await post(b.url, '/api/events', event)).json();
  assert.equal(replay.replayed, true); assert.deepEqual(replay.decision, recorded.decision);
  const incident = await (await fetch(`${b.url}/api/incidents/vercel-sat`)).json();
  assert.deepEqual(incident.decision, recorded.decision);
  const run = await (await post(a.url, '/api/preflight', { routineRevisionId: 'r1', candidate: { weekdays: [1, 2, 3, 4, 5, 6] } })).json();
  assert.deepEqual(run.summary, { verdict: 'pass', total: 6, changed: 1, safetyViolations: 0, findings: [] });
  assert.deepEqual(await (await fetch(`${b.url}/api/preflight/${run.runId}`)).json(), run, 'saved run retrieved by another instance');
  const unlock = await (await post(a.url, '/api/preflight', { routineRevisionId: 'r1', candidate: { weekdays: [1, 2, 3, 4, 5],
    actions: [{ deviceId: 'porch-light', action: 'turn_on' }, { deviceId: 'front-door', action: 'unlock' }] } })).json();
  assert.deepEqual(unlock.summary.findings, ['PROHIBITED_ACTION_REQUESTED']);
  const denied = await (await post(a.url, '/api/events', { ...event, eventId: 'vercel-unlock', routineRevisionId: 'door-denial-r1' })).json();
  assert.equal(denied.decision.actions[0].reasonCode, 'DOOR_UNLOCK_FORBIDDEN', 'unlock is denied before approval is even considered');
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 0);
  assert.equal((await post(a.url, '/api/events', { ...event, approved: true })).status, 400);
  assert.equal((await fetch(`${a.url}/api/events`, { method: 'POST', headers: { Origin: 'https://evil.example', 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(event) })).status, 403);

  const started = Date.now();
  const down = await fetch(`${brokenDb.url}/api/ready`);
  assert.equal(down.status, 503); assert.deepEqual(await down.json(), { error: 'UNAVAILABLE' });
  assert.ok(Date.now() - started < 15000, 'unavailable database fails fast');
});

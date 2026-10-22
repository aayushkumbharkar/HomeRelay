import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';

const saturday = { routineRevisionId: 'r1', candidate: { weekdays: [1, 2, 3, 4, 5, 6] } };
const sideEffectTables = ['devices', 'events', 'decisions', 'actions', 'approvals', 'routine_revisions', 'routine_heads'];

test('preflight and incident reconstruction run through real web -> MCP -> PostgreSQL without side effects', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const token = randomBytes(32).toString('hex');
  let mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  let web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  t.after(async () => { await web.stop(); await mcp.stop(); });
  const snapshot = async () => Object.fromEntries(await Promise.all(sideEffectTables.map(async table =>
    [table, (await db.pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows.map(r => JSON.stringify(r.row)).sort()])));
  const get = (path: string) => fetch(web.url + path);
  const csrf = (await (await get('/api/session')).json()).csrfToken;
  const post = (path: string, value: unknown) => fetch(web.url + path, { method: 'POST',
    headers: { Origin: web.url, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

  const client = new Client({ name: 'preflight-proof', version: '0.1.0' }); t.after(() => client.close());
  const transport = new StreamableHTTPClientTransport(new URL(`${mcp.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  assert.ok(transport.protocolVersion && transport.protocolVersion >= '2025-11-25');
  const listed = Object.fromEntries((await client.listTools()).tools.map(tool => [tool.name, tool]));
  for (const name of ['run_preflight', 'get_preflight_run', 'reconstruct_incident']) {
    assert.ok(listed[name]?.inputSchema && listed[name]?.outputSchema, `${name} has typed schemas`);
  }
  assert.equal((await client.callTool({ name: 'run_preflight', arguments: { ...saturday, approved: true } })).isError, true);
  assert.equal((await client.callTool({ name: 'run_preflight', arguments: { ...saturday, candidate: { weekdays: [9] } } })).isError, true);

  const before = await snapshot();
  const response = await post('/api/preflight', saturday);
  assert.equal(response.status, 200);
  const run = await response.json();
  assert.equal(run.baseline.approval, null);
  assert.equal(run.activated, false);
  assert.deepEqual(run.summary, { verdict: 'pass', total: 6, changed: 1, safetyViolations: 0, findings: [] });
  assert.deepEqual(run.cases.filter((c: any) => c.changed).map((c: any) => c.scenarioId), ['saturday-after-sunset']);
  const unlock = await (await post('/api/preflight', { routineRevisionId: 'r1', candidate: { weekdays: [1, 2, 3, 4, 5, 6],
    actions: [{ deviceId: 'porch-light', action: 'turn_on' }, { deviceId: 'front-door', action: 'unlock' }] } })).json();
  assert.deepEqual(unlock.summary.findings, ['PROHIBITED_ACTION_REQUESTED']);
  assert.ok(unlock.cases.every((c: any) => c.candidate.verdicts.every((v: any) => v.action !== 'unlock' || v.verdict === 'deny')));
  assert.deepEqual(await snapshot(), before, 'preflight changed no device, event, decision, action, approval or routine row');
  assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM preflight_runs')).rows[0].n, 2);
  assert.equal((await post('/api/preflight', { ...saturday, candidate: { weekdays: [6], approved: true } })).status, 400);
  assert.equal((await post('/api/preflight', { ...saturday, routineRevisionId: 'absent' })).status, 404);
  assert.equal((await fetch(web.url + '/api/preflight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saturday) })).status, 403);
  const direct = await client.callTool({ name: 'get_preflight_run', arguments: { runId: run.runId } });
  assert.deepEqual((direct.structuredContent as any).value, run);

  const draft = await (await get('/api/routines/r1')).json();
  assert.equal((await post('/api/approve', { routineRevisionId: 'r1', contentHash: draft.contentHash })).status, 200);
  const saturdayEvent = { eventId: 'saturday-incident', routineRevisionId: 'r1', kind: 'arrival', occurredAt: '2026-10-24T19:00:00+05:30', source: 'simulated' };
  const recorded = await (await post('/api/events', saturdayEvent)).json();
  assert.equal(recorded.decision.actions[0].reasonCode, 'OUTSIDE_WEEKDAYS');
  const incident = await (await get('/api/incidents/saturday-incident')).json();
  assert.deepEqual(incident.decision, recorded.decision);
  assert.equal(incident.actions[0].checks.find((c: any) => c.status === 'failed').reasonCode, 'OUTSIDE_WEEKDAYS');
  assert.match(incident.actions[0].checks.find((c: any) => c.reasonCode === 'APPROVAL_REQUIRED').evidence, /demo-operator/);
  assert.equal((await get('/api/incidents/never-recorded')).status, 404);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 0);

  await web.stop(); await mcp.stop();
  mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  const restored = await get('/api/preflight/' + run.runId);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), run);
  assert.equal((await get('/api/preflight/00000000-0000-4000-8000-000000000000')).status, 404);
});

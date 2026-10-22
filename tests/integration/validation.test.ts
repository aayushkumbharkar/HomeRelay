import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';
import { event } from '../helpers/fixtures.js';

test('HTTP and SDK boundaries reject forged fields, bad credentials, origins and oversized bodies', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const token = randomBytes(32).toString('hex');
  const mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  const web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  t.after(async () => { await web.stop(); await mcp.stop(); });
  const client = new Client({ name: 'invalid-caller', version: '0.1.0' }); t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${mcp.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  assert.equal((await client.callTool({ name: 'simulate_event', arguments: { ...event, approved: true } })).isError, true);
  assert.equal((await client.callTool({ name: 'simulate_event', arguments: { ...event, occurredAt: 'yesterday' } })).isError, true);
  assert.equal((await fetch(`${mcp.url}/mcp`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${mcp.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  // fetch normalizes Host; node:http lets this test actually send the forged header.
  const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(`${mcp.url}/mcp`, { method: 'POST', headers: { Host: 'evil.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    req.on('error', reject); req.end();
  });
  assert.equal(forgedHostStatus, 403);
  assert.equal((await fetch(`${mcp.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: 'x'.repeat(17000) })).status, 413);
  const session = await (await fetch(`${web.url}/api/session`)).json();
  const headers = { 'Content-Type': 'application/json', Origin: web.url, 'X-CSRF-Token': session.csrfToken };
  assert.equal((await fetch(`${web.url}/api/events`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify(event) })).status, 403);
  assert.equal((await fetch(`${web.url}/api/events`, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'wrong' }, body: JSON.stringify(event) })).status, 403);
  assert.equal((await fetch(`${web.url}/api/events`, { method: 'POST', headers, body: JSON.stringify({ ...event, approved: true }) })).status, 400);
  assert.equal((await fetch(`${web.url}/api/events`, { method: 'POST', headers, body: 'x'.repeat(17000) })).status, 413);
  assert.equal((await db.pool.query('SELECT * FROM events')).rowCount, 0);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 0);
});

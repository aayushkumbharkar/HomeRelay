import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';
import { event } from '../helpers/fixtures.js';

test('web calls real MCP; concurrent replay and restart preserve evidence; outage has no fallback', async t => {
  const db = await testDatabase(); t.after(() => db.close());
  const token = randomBytes(32).toString('hex');
  let mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  let web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  t.after(async () => { await web.stop(); await mcp.stop(); });
  const json = async (path: string) => { const r = await fetch(`${web.url}${path}`); assert.equal(r.status, 200); return r.json(); };
  let csrf = (await json('/api/session')).csrfToken;
  const post = (path: string, body: unknown) => fetch(`${web.url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: web.url, 'X-CSRF-Token': csrf }, body: JSON.stringify(body)
  });
  const draft = await json('/api/routines/r1');
  assert.equal(draft.approval, null);
  assert.equal((await post('/api/approve', { routineRevisionId: 'r1', contentHash: draft.contentHash })).status, 200);
  const first = await post('/api/events', event); assert.equal(first.status, 200);
  const original = await first.json();
  assert.equal(original.decision.actions[0].executionStatus, 'executed');
  const replies = await Promise.all(Array.from({ length: 10 }, async () => {
    const response = await post('/api/events', { ...event, eventId: 'wire-race' });
    assert.equal(response.status, 200); return response.json();
  }));
  assert.equal(new Set(replies.map(r => r.decision.decisionId)).size, 1);
  assert.equal(replies.filter(r => !r.replayed).length, 1);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 2);
  assert.equal((await post('/api/events', { ...event, kind: 'departure' })).status, 409);
  assert.equal((await fetch(`${web.url}/api/decisions/absent`)).status, 404);

  await mcp.stop();
  assert.equal((await post('/api/events', { ...event, eventId: 'outage' })).status, 503);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 2);
  await web.stop();
  mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
  web = await startProcess('dist/src/web.js', { MCP_TOKEN: token, MCP_URL: `${mcp.url}/mcp`, WEB_PORT: '0' });
  csrf = (await json('/api/session')).csrfToken;
  assert.deepEqual(await json(`/api/decisions/${event.eventId}`), original.decision);
  const replay = await (await post('/api/events', event)).json();
  assert.equal(replay.replayed, true); assert.deepEqual(replay.decision, original.decision);
  assert.equal((await db.pool.query('SELECT * FROM actions')).rowCount, 2);
  assert.equal((await post('/api/events', { ...event, eventId: 'outage' })).status, 200);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';

const writeTables = ['events', 'decisions', 'approvals', 'actions', 'preflight_runs'];
async function stack(t: any, { mcpUp = true } = {}) {
 const db = await testDatabase(); t.after(() => db.close());
 const token = randomBytes(32).toString('hex');
 let mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: '0' });
 const port = String(mcp.port);
 const web = await startProcess('dist/src/web.js', { MCP_URL: mcp.url + '/mcp', MCP_TOKEN: token, WEB_PORT: '0' });
 if (!mcpUp) await mcp.stop();
 const browser = await chromium.launch({ channel: 'msedge' });
 t.after(async () => { await browser.close(); await web.stop(); await mcp.stop(); });
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 const snapshot = async () => ({ devices: (await db.pool.query('SELECT device_id,state FROM devices ORDER BY 1')).rows,
  ...Object.fromEntries(await Promise.all(writeTables.map(async n => [n, (await db.pool.query(`SELECT count(*)::int AS c FROM ${n}`)).rows[0].c]))) });
 const startMcp = async () => { mcp = await startProcess('dist/src/mcp-server.js', { DATABASE_URL: db.url, MCP_TOKEN: token, MCP_PORT: port }); };
 const post = async (path: string, value: unknown) => {
  const csrf = (await (await fetch(web.url + '/api/session')).json()).csrfToken;
  const r = await fetch(web.url + path, { method: 'POST', headers: { Origin: web.url, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal(r.status, 200); return r.json();
 };
 return { db, web, page, errors, snapshot, startMcp, post };
}
const noStuckLoading = async (page: Page) => {
 for (const id of ['approval-state', 'porch-state', 'door-state', 'history-count', 'incident-basis']) {
  const text = (await page.locator('#' + id).textContent()) ?? '';
  assert.ok(!/Loading|Unknown/.test(text), `#${id} left at "${text}"`);
 }
};

test('one failed read (non-JSON HTML 503) leaves other sections ready; keyboard retry recovers it; no writes', async t => {
 const { web, page, errors, snapshot } = await stack(t);
 const before = await snapshot();
 let homeCalls = 0;
 await page.route('**/api/home', route => ++homeCalls === 1
  ? route.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>Service waking up…</body></html>' }) : route.continue());
 await page.goto(web.url);
 await expect(page.locator('#approval-state')).toHaveText('Awaiting approval');
 await expect(page.locator('#history')).toContainText('No decisions yet');
 await expect(page.locator('#incident-basis')).toHaveText('Scenario fixture · not recorded');
 await expect(page.locator('#porch-state')).toHaveText('Not loaded');
 await expect(page.locator('#door-state')).toHaveText('Not loaded');
 await expect(page.locator('#device-caption')).toContainText('not a reading of the devices');
 await expect(page.locator('#lamp')).not.toHaveClass(/on/);
 await expect(page.locator('body')).not.toContainText(/SyntaxError|Unexpected token|JSON/);
 const retry = page.getByRole('button', { name: 'Retry device state', exact: true });
 await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter');
 await expect(page.locator('#porch-state')).toHaveText('Off');
 await expect(page.locator('#door-state')).toHaveText('Locked');
 await expect(page.locator('#device-caption')).toContainText('Current state from PostgreSQL');
 await expect(page.locator('#notice')).toHaveAttribute('role', 'status');
 await noStuckLoading(page);
 assert.deepEqual(await snapshot(), before);
 assert.deepEqual(errors, []);
});

test('MCP down on first load, then up: connecting state, automatic recovery without reload; no writes', async t => {
 const { web, page, errors, snapshot, startMcp } = await stack(t, { mcpUp: false });
 const before = await snapshot();
 await page.goto(web.url);
 await page.evaluate(() => { (window as any).sameDocument = true; });
 await expect(page.locator('#notice')).toContainText(/waking|Connecting/, { timeout: 15000 });
 await expect(page.locator('#connection')).toContainText('Connecting');
 await startMcp();
 await expect(page.locator('#connection')).toHaveText('● MCP connected', { timeout: 30000 });
 await expect(page.locator('#porch-state')).toHaveText('Off');
 await expect(page.locator('#approval-state')).toHaveText('Awaiting approval');
 await expect(page.locator('#incident-basis')).toHaveText('Scenario fixture · not recorded');
 assert.equal(await page.evaluate(() => (window as any).sameDocument), true, 'recovered without a reload');
 await noStuckLoading(page);
 assert.deepEqual(await snapshot(), before);
 assert.deepEqual(errors, []);
});

test('MCP stays unavailable: bounded retries stop, clear message, no Loading labels; manual refresh retries once', async t => {
 const { web, page, errors } = await stack(t);
 let readyHits = 0;
 await page.route('**/api/ready', route => { readyHits++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"UNAVAILABLE"}' }); });
 await page.clock.install();
 await page.goto(web.url);
 for (let attempt = 1; attempt < 8; attempt++) {
  await expect.poll(() => readyHits).toBe(attempt);
  await page.clock.fastForward(30000);
 }
 await expect.poll(() => readyHits).toBe(8);
 await expect(page.locator('#notice')).toContainText('after 8 attempts');
 await expect(page.locator('#notice')).toContainText('report it');
 await expect(page.locator('#connection')).toHaveText('○ MCP unavailable');
 await page.clock.fastForward(300000);
 assert.equal(readyHits, 8, 'retries stopped at the limit');
 await noStuckLoading(page);
 await expect(page.locator('#porch-state')).toHaveText('Not loaded');
 await expect(page.getByRole('button', { name: 'Run arrival scenario', exact: true })).toBeDisabled();
 await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
 await expect.poll(() => readyHits).toBe(9);
 assert.deepEqual(errors, []);
});

test('rejected MCP credentials are reported as a configuration problem without retry loops', async t => {
 const { web, page, errors } = await stack(t);
 let readyHits = 0;
 await page.route('**/api/ready', route => { readyHits++; return route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"UPSTREAM_REJECTED"}' }); });
 await page.goto(web.url);
 await expect(page.locator('#notice')).toContainText('configuration problem');
 await page.waitForTimeout(3000);
 assert.equal(readyHits, 1);
 await noStuckLoading(page);
 assert.deepEqual(errors, []);
});

test('overlapping refreshes collapse to one; recorded incident is not shown as a new action; action success waits for the backend', async t => {
 const { web, page, errors, snapshot, post } = await stack(t);
 const draft = await (await fetch(web.url + '/api/routines/r1')).json();
 await post('/api/approve', { routineRevisionId: 'r1', contentHash: draft.contentHash });
 await post('/api/events', { eventId: 'saturday-1', routineRevisionId: 'r1', kind: 'arrival', occurredAt: '2026-10-24T19:00:00+05:30', source: 'simulated' });
 await page.goto(web.url);
 await expect(page.locator('#incident-basis')).toHaveText('Recorded · PostgreSQL');
 await expect(page.locator('#scenario-state')).toHaveText('No scenario run this visit');
 await expect(page.locator('#notice')).not.toContainText('Executed');
 await expect(page.locator('#porch-state')).toHaveText('Off');

 const before = await snapshot();
 let readyHits = 0, release!: () => void; const gate = new Promise<void>(r => { release = r; });
 await page.route('**/api/ready', async route => { readyHits++; await gate; await route.continue(); });
 await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('refresh')!.click(); });
 await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click({ force: true }).catch(() => {});
 await expect.poll(() => readyHits).toBe(1);
 release();
 await expect(page.locator('#connection')).toHaveText('● MCP connected');
 await expect(page.locator('#incident-basis')).toHaveText('Recorded · PostgreSQL');
 assert.equal(readyHits, 1, 'one refresh cycle ran');
 assert.deepEqual(await snapshot(), before, 'refresh wrote nothing');
 await page.unroute('**/api/ready');

 const bodies: string[] = []; let eventCalls = 0, releaseEvent!: () => void;
 const eventGate = new Promise<void>(r => { releaseEvent = r; });
 await page.route('**/api/events', async route => {
  bodies.push(route.request().postData() ?? '');
  if (++eventCalls === 1) return route.fulfill({ status: 503, contentType: 'text/html', body: '<html>Bad gateway</html>' });
  await eventGate; await route.continue();
 });
 await page.getByRole('button', { name: 'Run arrival scenario', exact: true }).click();
 await expect(page.locator('#notice')).toContainText('unavailable');
 await expect(page.locator('#porch-state')).toHaveText('Off');
 await expect(page.locator('#scenario-state')).toHaveText('No scenario run this visit');
 await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Retry arrival', exact: true })).toBeEnabled();
 await page.getByRole('button', { name: 'Retry arrival', exact: true }).click();
 await expect(page.locator('#notice')).toContainText('Working through MCP');
 await expect(page.locator('#porch-state')).toHaveText('Off');
 await expect(page.locator('#scenario-state')).toHaveText('No scenario run this visit');
 releaseEvent();
 await expect(page.locator('#scenario-state')).toHaveText('Executed · porch light on');
 await expect(page.locator('#porch-state')).toHaveText('On');
 assert.equal(JSON.parse(bodies[0]).eventId, JSON.parse(bodies[1]).eventId, 'retry reuses the same event ID');
 assert.equal((await snapshot()).actions, 1);
 assert.deepEqual(errors, []);
});

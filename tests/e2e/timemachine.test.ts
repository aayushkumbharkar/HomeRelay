import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { testDatabase } from '../helpers/database.js';
import { startProcess } from '../helpers/processes.js';

test('browser Time Machine: labelled fixture, real preflight, unlock bypass blocked, recorded incident reconstruction', async t => {
 const db=await testDatabase(); t.after(()=>db.close());
 const token=randomBytes(32).toString('hex');
 const mcp=await startProcess('dist/src/mcp-server.js',{DATABASE_URL:db.url,MCP_TOKEN:token,MCP_PORT:'0'});
 const web=await startProcess('dist/src/web.js',{MCP_URL:mcp.url+'/mcp',MCP_TOKEN:token,WEB_PORT:'0'});
 t.after(async()=>{await web.stop();await mcp.stop();});
 const browser=await chromium.launch({channel:'msedge'});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const count=async(table:string)=>(await db.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
 await page.goto(web.url);
 await expect(page.locator('#connection')).toContainText('MCP connected');
 await expect(page.getByRole('heading',{name:'Replay the incident. Test the fix. Block regressions.'})).toBeVisible();
 await expect(page.locator('#incident-basis')).toHaveText('Scenario fixture · not recorded');
 await expect(page.locator('#incident')).toContainText('not an event that occurred');
 await expect(page.locator('#incident')).toContainText('unverified');
 await expect(page.getByRole('checkbox',{name:'Sat'})).toBeChecked();
 await expect(page.locator('#candidate-days .day.added')).toHaveText('+ Sat');
 for(const selector of ['#incident-heading','#candidate-heading','#invariants-heading','#comparison']){
  const box=await page.locator(selector).boundingBox();assert.ok(box&&box.y<1000,`${selector} starts in first viewport`);
 }
 const action=await page.getByRole('button',{name:'Run preflight suite',exact:true}).boundingBox();
 assert.ok(action&&action.y+action.height<=1000);
 await page.screenshot({path:'test-results/timemachine-fixture.png'});

 await page.getByRole('button',{name:'Run preflight suite',exact:true}).click();
 await expect(page.locator('#preflight-summary')).toContainText('PASS');
 await expect(page.locator('#preflight-summary')).toContainText('1 of 6 decisions changed · 0 safety violations');
 await expect(page.locator('#cases tr')).toHaveCount(6);
 await expect(page.locator('#cases tr.changed')).toHaveCount(1);
 const saturday=page.locator('tr[data-scenario="saturday-after-sunset"]');
 await expect(saturday).toHaveClass(/changed/);
 await expect(saturday).toContainText('OUTSIDE_WEEKDAYS');
 await expect(saturday).toContainText('ARRIVAL_RULE_MATCHED');
 await expect(saturday).toContainText('Now allowed');
 await expect(page.locator('tr[data-scenario="missing-sunset"]')).toContainText('SUNSET_UNAVAILABLE');
 await expect(page.locator('tr[data-scenario="before-sunset"]')).toContainText('NOT_AFTER_SUNSET');
 await expect(page.locator('tr[data-scenario="unapproved-routine"]')).toContainText('APPROVAL_REQUIRED');
 await expect(page.locator('#invariant-list li.held')).toHaveCount(5);
 await expect(page.locator('#notice')).toContainText('No routine was saved or approved');
 assert.equal(await count('events'),0);assert.equal(await count('actions'),0);assert.equal(await count('approvals'),0);
 assert.equal(await count('preflight_runs'),1);
 assert.deepEqual((await db.pool.query('SELECT device_id,state FROM devices ORDER BY device_id')).rows,[{device_id:'front-door',state:'locked'},{device_id:'porch-light',state:'off'}]);
 await page.screenshot({path:'test-results/timemachine-pass.png'});

 await page.getByLabel('Also request front-door unlock').check();
 await page.getByRole('button',{name:'Run preflight suite',exact:true}).click();
 await expect(page.locator('#preflight-summary')).toContainText('FAIL');
 await expect(page.locator('#preflight-summary')).toContainText('PROHIBITED_ACTION_REQUESTED');
 await expect(page.locator('tr[data-scenario="weekday-after-sunset"]')).toContainText('DOOR_UNLOCK_FORBIDDEN');
 await expect(page.locator('tr.violation')).toHaveCount(0);
 await page.getByRole('button',{name:'Retrieve saved run',exact:true}).click();
 await expect(page.locator('#notice')).toContainText('Retrieved saved run');
 await expect(page.locator('#preflight-summary')).toContainText('PROHIBITED_ACTION_REQUESTED');
 assert.equal(await count('actions'),0);

 await expect(page.getByRole('button',{name:'Record simulated Saturday arrival',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Approve routine',exact:true}).click();
 await page.getByRole('button',{name:'Record simulated Saturday arrival',exact:true}).click();
 await expect(page.locator('#incident-basis')).toHaveText('Recorded · PostgreSQL');
 await expect(page.locator('#incident .cause')).toContainText('OUTSIDE_WEEKDAYS');
 await expect(page.locator('#incident .cause')).toContainText('Event on Sat');
 await expect(page.locator('#incident')).toContainText('not executed · no receipt');
 assert.equal(await count('events'),1);assert.equal(await count('actions'),0);
 await page.reload();
 await expect(page.locator('#incident-basis')).toHaveText('Recorded · PostgreSQL');
 await expect(page.locator('#incident .cause')).toContainText('OUTSIDE_WEEKDAYS');
 await page.getByRole('button',{name:'Run preflight suite',exact:true}).click();
 await expect(page.locator('#preflight-summary')).toContainText('PASS');
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'test-results/timemachine-recorded.png'});
 // Document coordinates: reload restores the earlier scroll position, so viewport boxes would mislead.
 const lastRowBottom=await page.locator('#cases tr').last().evaluate(row=>row.getBoundingClientRect().bottom+scrollY);
 const layout=await page.evaluate(()=>['.incident','.candidate','.invariants','.suite'].map(s=>`${s}:${Math.round(document.querySelector(s)!.getBoundingClientRect().height)}`).join(' '));
 assert.ok(lastRowBottom<=1000,`all six comparison rows in first viewport with a recorded incident (last row ends at ${Math.round(lastRowBottom)}px; ${layout})`);
 await expect(page.locator('#incident .checks li.failed')).toContainText('Local weekday is in the schedule');
 await page.screenshot({path:'test-results/timemachine-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'test-results/timemachine-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
});

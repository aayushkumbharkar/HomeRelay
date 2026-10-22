import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SMOKE_URL;if(!base?.startsWith('https://'))throw new Error('SMOKE_URL required');
await mkdir('test-results/hosted',{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'test-results/hosted',size:{width:1440,height:1000}}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const hold=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 await page.goto(base);await expect(page.getByRole('button',{name:'Approve routine',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Simulate arrival',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/hosted/draft.png',fullPage:true});console.log('Hosted draft loaded; explicit approval required');await hold(12000);
 await page.getByRole('button',{name:'Approve routine',exact:true}).click();await expect(page.getByRole('button',{name:'Simulate arrival',exact:true})).toBeEnabled();await hold(7000);
 await page.getByRole('button',{name:'Simulate arrival',exact:true}).click();await expect(page.locator('#porch-state')).toHaveText('On');await expect(page.locator('#door-state')).toHaveText('Locked');await hold(12000);
 await page.locator('#evidence').scrollIntoViewIfNeeded();await expect(page.locator('#evidence')).toContainText('ARRIVAL_RULE_MATCHED');await hold(14000);
 await page.getByRole('button',{name:'Request unlock',exact:true}).click();await hold(6000);await page.getByRole('button',{name:'Approve and test denial',exact:true}).click();await expect(page.locator('#notice')).toContainText('Denied');await page.locator('#evidence').scrollIntoViewIfNeeded();await expect(page.locator('#evidence')).toContainText('DOOR_UNLOCK_FORBIDDEN');await hold(14000);
 await page.getByRole('button',{name:'Replay arrival',exact:true}).click();await expect(page.locator('#notice')).toContainText('No duplicate action');await hold(12000);
 await page.reload();await expect(page.locator('#history button')).toHaveCount(2);await page.locator('#history button').last().click();await expect(page.locator('#evidence')).toContainText('ARRIVAL_RULE_MATCHED');await page.locator('#evidence').scrollIntoViewIfNeeded();await hold(14000);
 await page.screenshot({path:'test-results/hosted/verified.png',fullPage:true});assert.deepEqual(errors,[]);
 const history=await (await page.request.get(base+'/api/history')).json();await writeFile('test-results/hosted/browser-evidence.json',JSON.stringify(history,null,2));
 console.log('PASS deployed browser approval, execution, denial, replay and refresh; 0 JS errors');
}finally{await context.close();await browser.close();}

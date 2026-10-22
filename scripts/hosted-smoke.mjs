import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.env.SMOKE_URL;
if (!base || !base.startsWith('https://')) throw new Error('SMOKE_URL must be an explicit HTTPS deployment');
const mode=process.argv[2] ?? 'flow';
const get=async path=>{const response=await fetch(base+path);assert.equal(response.status,200,path);return response.json();};
const session=await get('/api/session');
const post=async (path,value)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(value)});
await mkdir('.local',{recursive:true});
if(mode==='flow'){
 const draft=await get('/api/routines/r1');
 assert.equal((await post('/api/approve',{routineRevisionId:'r1',contentHash:draft.contentHash})).status,200);
 const event={eventId:randomUUID(),routineRevisionId:'r1',kind:'arrival',occurredAt:'2026-10-21T19:00:00+05:30',source:'simulated'};
 const response=await post('/api/events',event);assert.equal(response.status,200);const original=await response.json();
 assert.equal(original.decision.actions[0].executionStatus,'executed');
 const unlock=await get('/api/routines/door-denial-r1');
 assert.equal((await post('/api/approve',{routineRevisionId:'door-denial-r1',contentHash:unlock.contentHash})).status,200);
 const denyResponse=await post('/api/events',{...event,eventId:randomUUID(),routineRevisionId:'door-denial-r1'});assert.equal(denyResponse.status,200);
 const denied=await denyResponse.json();assert.equal(denied.decision.actions[0].reasonCode,'DOOR_UNLOCK_FORBIDDEN');assert.equal(denied.decision.actions[0].actionId,null);
 const replayResponse=await post('/api/events',event);assert.equal(replayResponse.status,200);const replay=await replayResponse.json();assert.equal(replay.replayed,true);assert.deepEqual(replay.decision,original.decision);
 const home=await get('/api/home');assert.equal(home.devices.find(d=>d.deviceId==='front-door').state,'locked');assert.equal(home.devices.find(d=>d.deviceId==='porch-light').state,'on');
 assert.deepEqual(await get('/api/decisions/'+event.eventId),original.decision);
 await writeFile('.local/hosted-evidence.json',JSON.stringify({base,event,original,denied},null,2));
 console.log('PASS hosted approval, real-MCP execution, unlock denial, original-receipt replay and persisted retrieval');
}else if(mode==='recover'){
 const saved=JSON.parse(await readFile('.local/hosted-evidence.json','utf8'));
 assert.equal(base,saved.base);assert.deepEqual(await get('/api/decisions/'+saved.event.eventId),saved.original.decision);
 const response=await post('/api/events',saved.event);assert.equal(response.status,200);const replay=await response.json();assert.equal(replay.replayed,true);assert.deepEqual(replay.decision,saved.original.decision);
 console.log('PASS persisted evidence and original action receipt unchanged after service restart');
}else if(mode==='outage'){
 const event={eventId:randomUUID(),routineRevisionId:'r1',kind:'arrival',occurredAt:'2026-10-21T19:00:00+05:30',source:'simulated'};
 const response=await post('/api/events',event);assert.equal(response.status,503);assert.equal((await response.json()).error,'UNAVAILABLE');
 console.log('PASS hosted MCP outage returns 503 UNAVAILABLE, not a fabricated success');
}else throw new Error('Unknown smoke mode');

const $ = id => document.getElementById(id);
let draft, history = [], csrf, busy = false, available = false, pendingEvent = null;
const reasonText = {
 ARRIVAL_RULE_MATCHED: 'The approved arrival matched the weekday and after-sunset rules.',
 DOOR_UNLOCK_FORBIDDEN: 'Door unlocking is always forbidden. Approval cannot override this rule.',
 APPROVAL_REQUIRED: 'This revision had no valid approval when evaluated.',
 REVISION_SUPERSEDED: 'A newer routine revision superseded this request.',
 TRIGGER_MISMATCH: 'The event did not match the arrival trigger.',
 OUTSIDE_WEEKDAYS: 'The event fell outside the approved weekdays.',
 SUNSET_UNAVAILABLE: 'No trusted sunset fixture was available. The policy refused to guess.',
 NOT_AFTER_SUNSET: 'The event occurred at or before the stored sunset time.'
};
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error',error); }
async function api(path, value) {
 const response = await fetch(path, value === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(value)});
 const data = await response.json();
 if (!response.ok) throw new Error(data.error || 'UNAVAILABLE');
 return data;
}
function controls() {
 $('approve').disabled = busy || !available || !!draft?.approval;
 $('approve').textContent = draft?.approval ? 'Routine approved' : 'Approve routine';
 $('simulate').disabled = busy || !available || !draft?.approval;
 $('simulate').textContent = pendingEvent ? 'Retry arrival' : 'Simulate arrival';
 $('unlock').disabled = busy || !available;
 $('replay').disabled = busy || !available || !history.some(d=>d.routineRevisionId==='r1');
 $('refresh').disabled = busy;
 $('confirm-unlock').disabled = busy;
}
function node(tag, text) { const element=document.createElement(tag);element.textContent=text;return element; }
function detail(decision) {
 const panel=$('evidence');panel.replaceChildren();
 const executed=decision.actions.some(a=>a.executionStatus==='executed');
 panel.append(node('h3',executed?'A light, with a reason.':'A boundary, upheld.'));
 for(const action of decision.actions) {
  panel.append(node('p',reasonText[action.reasonCode] || action.reasonCode),node('code',action.reasonCode));
  panel.append(node('p',`${action.deviceId}: ${action.before} → ${action.after}. ${action.executionStatus==='executed'?'Executed':'Not executed'}.`));
  panel.append(node('p',action.actionId?`Action receipt: ${action.actionId}`:'Action receipt: none — no action executed.'));
 }
 panel.append(node('p',`Event: ${decision.eventId}`),node('p',`Decision: ${decision.decisionId}`),node('p',`Policy: ${decision.policyVersion}`));
 panel.append(node('p',`Simulated event: ${new Date(decision.eventSnapshot.occurredAt).toLocaleString('en-GB',{timeZone:decision.routineSnapshot.timezone})} · ${decision.routineSnapshot.timezone}`));
 panel.append(node('p',decision.approvalSnapshot?`Approved revision ${decision.approvalSnapshot.revisionId} by ${decision.approvalSnapshot.actor}.`:'No approval was recorded for this decision.'));
 if(decision.sunsetSnapshot) panel.append(node('p',`Stored sunset fixture: ${decision.sunsetSnapshot.sunsetAt}`));
 const disclosure=document.createElement('details');disclosure.append(node('summary','Inspect complete persisted evidence'),node('pre',JSON.stringify(decision,null,2)));panel.append(disclosure);
}
function timeline() {
 $('history').replaceChildren(); $('history-count').textContent=`${history.length} saved decision${history.length===1?'':'s'} · latest 50`;
 if(!history.length) $('history').append(node('p','No decisions yet. Approve the routine, then simulate an arrival.'));
 for(const decision of history) {
  const button=document.createElement('button');
  button.append(node('strong',decision.actions.some(a=>a.executionStatus==='executed')?'Executed · porch light on':'Denied · no action executed'),node('span',decision.eventId),node('span',new Date(decision.evaluatedAt).toLocaleString()));
  button.addEventListener('click',()=>run(async()=>{const saved=await api('/api/decisions/'+encodeURIComponent(decision.eventId));detail(saved);document.querySelectorAll('#history button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');notice('Retrieved the original decision from PostgreSQL through MCP.');}));
  $('history').append(button);
 }
}
async function refresh() {
 const [session, routine, home, saved] = await Promise.all([api('/api/session'),api('/api/routines/r1'),api('/api/home'),api('/api/history')]);
 csrf=session.csrfToken;draft=routine;history=saved;available=true;
 $('connection').textContent='● MCP connected';
 $('source').textContent=`“${draft.routine.sourceText}”`;
 $('trigger').textContent=draft.routine.trigger==='arrival'?'You arrive home':draft.routine.trigger;
 $('schedule').textContent=draft.routine.weekdays.map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')+' · '+draft.routine.timezone;
 $('approval-state').textContent=draft.approval?'Approved':'Awaiting approval';
 for(const device of home.devices) {const value=device.state[0].toUpperCase()+device.state.slice(1);$(device.deviceId==='porch-light'?'porch-state':'door-state').textContent=value;}
 $('lamp').classList.toggle('on',home.devices.some(d=>d.deviceId==='porch-light'&&d.state==='on'));
 timeline();controls();
}
async function run(action) {
 if(busy)return;busy=true;controls();notice('Working through MCP. Waiting for a confirmed result…');
 try{await action();}catch(error){available=false;$('connection').textContent='○ Connection needs attention';notice(error.message==='UNAVAILABLE'?'Service unavailable. Displayed evidence may be stale. Refresh to reconnect; no success has been assumed.':`Request failed (${error.message}). Refresh evidence before retrying.`,true);}finally{busy=false;controls();}
}
function eventFor(revision) {return {eventId:crypto.randomUUID(),routineRevisionId:revision,kind:'arrival',occurredAt:'2026-10-21T19:00:00+05:30',source:'simulated'};}
$('approve').addEventListener('click',()=>run(async()=>{await api('/api/approve',{routineRevisionId:draft.routine.revisionId,contentHash:draft.contentHash});await refresh();notice('Approved. Your routine is ready; no device action has run.');}));
$('simulate').addEventListener('click',()=>run(async()=>{pendingEvent??=eventFor(draft.routine.revisionId);const outcome=await api('/api/events',pendingEvent);pendingEvent=null;await refresh();detail(outcome.decision);notice(outcome.replayed?'Retrieved saved result. No duplicate action.':outcome.decision.actions.some(a=>a.executionStatus==='executed')?'Executed. The simulated porch light is on; the front door remains locked.':'Denied. Inspect the saved policy reason below.');}));
$('replay').addEventListener('click',()=>run(async()=>{const previous=history.find(d=>d.routineRevisionId==='r1');const outcome=await api('/api/events',previous.eventSnapshot);await refresh();detail(outcome.decision);notice(outcome.replayed?'Replay verified. No duplicate action. The original decision and receipt were returned.':'Result retrieved. Inspect the saved evidence.');}));
$('refresh').addEventListener('click',()=>run(async()=>{await refresh();notice('Refreshed device state and persisted evidence through MCP.');}));
$('unlock').addEventListener('click',()=>$('unlock-dialog').showModal());
$('cancel-unlock').addEventListener('click',()=>$('unlock-dialog').close());
$('confirm-unlock').addEventListener('click',()=>run(async()=>{
 const request=await api('/api/routines/door-denial-r1');
 await api('/api/approve',{routineRevisionId:request.routine.revisionId,contentHash:request.contentHash});
 const outcome=await api('/api/events',eventFor(request.routine.revisionId));$('unlock-dialog').close();await refresh();detail(outcome.decision);notice('Denied. Door unlocking is forbidden, even with approval. The door remains locked.');
}));
run(async()=>{await refresh();notice(draft.approval?'Your approved routine is ready. All devices and events are simulated.':'Review the draft and safety boundaries, then explicitly approve your routine.');});

const $ = id => document.getElementById(id);
let draft, history = [], csrf, busy = false, available = false, pendingEvent = null, currentDecision = null;
let run = null, selectedIncident = null;
const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], dayOrder = [1,2,3,4,5,6,0];
const fixtureEvent = '2026-10-24T19:00:00+05:30';
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
 $('simulate').textContent = pendingEvent ? 'Retry arrival' : 'Run arrival scenario';
 $('unlock').disabled = busy || !available;
 $('replay').disabled = busy || !available || !history.some(d=>d.routineRevisionId==='r1');
 $('refresh').disabled = busy;
 $('why').disabled = busy || !currentDecision;
 $('confirm-unlock').disabled = busy;
 $('run-preflight').disabled = busy || !available || !draft || !candidateDays().length;
 $('retrieve-run').disabled = busy || !available || !run;
 $('record').disabled = busy || !available || !draft?.approval;
}
function node(tag, text) { const element=document.createElement(tag);element.textContent=text;return element; }
function detail(decision) {
 const panel=$('evidence');panel.replaceChildren();
 const executed=decision.actions.some(a=>a.executionStatus==='executed');
 panel.append(node('p','SAVED DECISION · '+new Date(decision.evaluatedAt).toLocaleString()),node('h3',executed?'The arrival rule allowed the light.':decision.actions.some(a=>a.reasonCode==='DOOR_UNLOCK_FORBIDDEN')?'The safety rule kept the door locked.':'The policy declined this action.'));
 panel.append(node('p',`Event: simulated ${decision.eventSnapshot.kind} · revision ${decision.routineRevisionId}`));
 for(const action of decision.actions) {
  panel.append(node('p',reasonText[action.reasonCode] || action.reasonCode),node('code',action.reasonCode));
  const name=action.deviceId==='porch-light'?'Porch light':'Front door';
  panel.append(node('p',`${name}: ${action.before} → ${action.after}. ${action.executionStatus==='executed'?'Executed and recorded.':'No action executed.'}`));
 }
 panel.append(node('p',`Policy: ${decision.policyVersion}`));
 panel.append(node('p',`Event time: ${new Date(decision.eventSnapshot.occurredAt).toLocaleString('en-GB',{timeZone:decision.routineSnapshot.timezone})} · ${decision.routineSnapshot.timezone}`));
 panel.append(node('p',decision.approvalSnapshot?`Revision ${decision.approvalSnapshot.revisionId} was explicitly approved by ${decision.approvalSnapshot.actor}.`:'No approval was recorded for this decision.'));
 if(decision.sunsetSnapshot) panel.append(node('p',`Sunset evidence: ${new Date(decision.sunsetSnapshot.sunsetAt).toLocaleTimeString('en-GB',{timeZone:decision.sunsetSnapshot.timezone})} · simulated dated fixture.`));
 const disclosure=document.createElement('details');disclosure.append(node('summary','Technical evidence'));
 disclosure.append(node('p',`Event ID: ${decision.eventId}`),node('p',`Decision ID: ${decision.decisionId}`));
 for(const action of decision.actions) disclosure.append(node('p',action.actionId?`Action receipt: ${action.actionId}`:'Action receipt: none — no action executed.'));
 disclosure.append(node('pre',JSON.stringify(decision,null,2)));panel.append(disclosure);
}
function scenario(outcome) {
 currentDecision=outcome.decision;
 $('scenario-state').textContent=outcome.replayed?'Replayed · original receipt reused':outcome.decision.actions.some(a=>a.executionStatus==='executed')?'Executed · porch light on':'Denied · no action executed';
 detail(outcome.decision);
}
function timeline() {
 $('history').replaceChildren(); $('history-count').textContent=`${history.length} saved decision${history.length===1?'':'s'} · latest 50`;
 if(!history.length) $('history').append(node('p','No decisions yet. Approve the routine, then simulate an arrival.'));
 for(const decision of history) {
  const button=document.createElement('button');
  button.append(node('strong',decision.actions.some(a=>a.executionStatus==='executed')?'Executed · porch light on':'Denied · no action executed'),node('span',`Simulated ${decision.eventSnapshot.kind} · revision ${decision.routineRevisionId}`),node('span',new Date(decision.evaluatedAt).toLocaleString()));
  button.addEventListener('click',()=>work(async()=>{const incident=await api('/api/incidents/'+encodeURIComponent(decision.eventId));selectedIncident=decision.eventId;detail(incident.decision);showIncident(incident);document.querySelectorAll('#history button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');notice('Reconstructed the original decision from PostgreSQL through MCP. Shown as the incident above.');}));
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
 timeline();candidateView();
 const target=selectedIncident??history.find(d=>d.routineRevisionId===draft.routine.revisionId&&d.actions.some(a=>a.reasonCode==='OUTSIDE_WEEKDAYS'))?.eventId;
 if(target)showIncident(await api('/api/incidents/'+encodeURIComponent(target)));else showFixture();
 controls();
}
async function work(action) {
 if(busy)return;busy=true;controls();notice('Working through MCP. Waiting for a confirmed result…');
 try{await action();}catch(error){available=false;$('connection').textContent='○ Connection needs attention';notice(error.message==='UNAVAILABLE'?'Service unavailable or waking from sleep. Wait about a minute, then Refresh evidence. Displayed state may be stale; no success is assumed.':`Request failed (${error.message}). Refresh evidence before retrying.`,true);}finally{busy=false;controls();}
}
function eventFor(revision) {return {eventId:crypto.randomUUID(),routineRevisionId:revision,kind:'arrival',occurredAt:'2026-10-21T19:00:00+05:30',source:'simulated'};}
$('approve').addEventListener('click',()=>work(async()=>{await api('/api/approve',{routineRevisionId:draft.routine.revisionId,contentHash:draft.contentHash});await refresh();notice('Approved. Your routine is ready; no device action has run.');}));
$('simulate').addEventListener('click',()=>work(async()=>{pendingEvent??=eventFor(draft.routine.revisionId);const outcome=await api('/api/events',pendingEvent);pendingEvent=null;await refresh();scenario(outcome);notice(outcome.replayed?'Retrieved saved result. No duplicate action.':outcome.decision.actions.some(a=>a.executionStatus==='executed')?'Executed. The simulated porch light is on; the front door remains locked.':'Denied. Inspect the saved policy reason below.');}));
$('replay').addEventListener('click',()=>work(async()=>{const previous=history.find(d=>d.routineRevisionId==='r1');const outcome=await api('/api/events',previous.eventSnapshot);await refresh();scenario(outcome);notice(outcome.replayed?'Replay verified. No duplicate action. The original decision and receipt were returned.':'Result retrieved. Inspect the saved evidence.');}));
$('why').addEventListener('click',()=>work(async()=>{const saved=await api('/api/decisions/'+encodeURIComponent(currentDecision.eventId));detail(saved);$('evidence').scrollIntoView({behavior:'auto',block:'center'});notice('Explanation retrieved from the original persisted decision.');}));
$('refresh').addEventListener('click',()=>work(async()=>{await refresh();notice('Refreshed device state and persisted evidence through MCP.');}));
$('unlock').addEventListener('click',()=>$('unlock-dialog').showModal());
$('cancel-unlock').addEventListener('click',()=>$('unlock-dialog').close());
$('confirm-unlock').addEventListener('click',()=>work(async()=>{
 const request=await api('/api/routines/door-denial-r1');
 await api('/api/approve',{routineRevisionId:request.routine.revisionId,contentHash:request.contentHash});
 const outcome=await api('/api/events',eventFor(request.routine.revisionId));$('unlock-dialog').close();await refresh();scenario(outcome);notice('Denied. Door unlocking is forbidden, even with approval. The door remains locked.');
}));
work(async()=>{await refresh();notice(draft.approval?'Your approved routine is ready. All devices and events are simulated.':'Review the draft and safety boundaries, then explicitly approve your routine.');});
const label=days=>[...days].sort((a,b)=>dayOrder.indexOf(a)-dayOrder.indexOf(b)).map(d=>dayNames[d]).join(', ');
const candidateDays=()=>[...document.querySelectorAll('#day-picker input:checked')].map(i=>Number(i.value));
function chip(text,cls){const span=node('span',text);span.className=cls;return span;}
function cell(...children){const td=document.createElement('td');td.append(...children);return td;}
function candidateView(){
 const base=draft.routine.weekdays;
 if(!$('day-picker').children.length) for(const d of dayOrder){
  const box=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=String(d);
  input.checked=base.includes(d)||d===6;input.addEventListener('change',()=>{candidateView();controls();});box.append(input,node('span',dayNames[d]));$('day-picker').append(box);
 }
 const next=candidateDays();
 for(const box of $('day-picker').children){const d=Number(box.firstChild.value);box.classList.toggle('added',next.includes(d)&&!base.includes(d));box.classList.toggle('removed',!next.includes(d)&&base.includes(d));}
 $('baseline-days').textContent=label(base);$('baseline-label').textContent='· '+label(base);
 $('candidate-days').replaceChildren();
 for(const d of [...new Set([...base,...next])].sort((a,b)=>dayOrder.indexOf(a)-dayOrder.indexOf(b))) $('candidate-days').append(chip((next.includes(d)&&!base.includes(d)?'+ ':!next.includes(d)?'− ':'')+dayNames[d],!next.includes(d)?'day removed':!base.includes(d)?'day added':'day'));
 if($('add-unlock').checked)$('candidate-days').append(chip('+ front-door/unlock','day removed'));
 if(!run) placeholders();
}
function placeholders(){
 const titles=['Approved weekday arrival after sunset','Saturday arrival after sunset','Arrival before sunset','Missing sunset evidence','Unapproved routine','Prohibited door unlock'];
 $('cases').replaceChildren(...titles.map(t=>{const tr=document.createElement('tr');tr.append(cell(node('strong',t)),cell(node('span','—')),cell(node('span','—')),cell(node('span','Not run')),cell(node('span','—')));return tr;}));
}
function verdicts(side){return side.verdicts.map(v=>{const div=document.createElement('div');div.className='verdict '+v.verdict;div.append(node('b',v.verdict.toUpperCase()),node('code',v.reasonCode));if(side.verdicts.length>1)div.append(node('small',v.deviceId+'/'+v.action));return div;});}
function explained(c){const span=node('span',c.explanation+' ');span.append(node('small',c.approvalBasis==='none'?'No approval':'Simulated approval · test only'));return span;}
const changeText={unchanged:'No change',newly_allowed:'Now allowed',newly_denied:'Now denied · regression',reason_changed:'Reason changed'};
function showRun(result,devicesHeld){
 run=result;
 $('cases').replaceChildren(...result.cases.map(c=>{
  const tr=document.createElement('tr');tr.dataset.scenario=c.scenarioId;tr.classList.toggle('changed',c.changed);tr.classList.toggle('violation',c.safetyViolation);
  tr.append(cell(node('strong',c.title),explained(c)),
   cell(...verdicts(c.baseline)),cell(...verdicts(c.candidate)),cell(chip(changeText[c.change],'change '+c.change)),
   cell(chip(c.safetyViolation?'VIOLATED':c.mustDeny?'Must deny · held':'—',c.safetyViolation?'risk bad':c.mustDeny?'risk ok':'risk')));
  return tr;}));
 const s=result.summary;
 $('preflight-summary').replaceChildren(chip(s.verdict==='pass'?'PASS':'FAIL','pill '+s.verdict),node('span',` ${s.changed} of ${s.total} decisions changed · ${s.safetyViolations} safety violations · `+(s.findings.length?s.findings.join(', '):'eligible for explicit approval; not activated')));
 for(const li of document.querySelectorAll('#invariant-list li')){
  const id=li.dataset.case;let held;
  if(id==='side-effects')held=devicesHeld;else{const c=result.cases.find(x=>x.scenarioId===id);held=!!c&&!c.safetyViolation&&c.candidate.outcome==='deny';}
  li.className=held===true?'held':held===false?'broken':'';li.title=held===true?'Held in this run':held===false?'Not held in this run':'Not observed for a retrieved run';
 }
 $('run-id').textContent=`Run ${result.runId} · saved ${new Date(result.createdAt).toLocaleString()} · ${result.policyVersion} · candidate not saved or activated`;
}
function showFixture(){
 $('incident-basis').textContent='Scenario fixture · not recorded';$('incident-basis').className='badge fixture';
 $('incident-heading').textContent='Saturday arrival after sunset';
 $('incident').replaceChildren(node('p','No saved decision in this household explains a Saturday arrival. This is a labelled scenario fixture, not an event that occurred: simulated arrival Saturday 24 October 2026, 19:00 Asia/Kolkata, sunset fixture 17:58.'),
  node('p','Root cause: unverified until the arrival is recorded as a simulated event through MCP.'),
  node('p',draft.approval?'Recording stores a real policy decision in PostgreSQL. It cannot unlock the door.':'Approve the routine below (05) first, so the recorded decision tests the schedule rather than the missing approval.'));
 $('record').hidden=false;
}
function showIncident(incident){
 const d=incident.decision;$('record').hidden=true;
 $('incident-basis').textContent='Recorded · PostgreSQL';$('incident-basis').className='badge recorded';
 const when=new Date(d.eventSnapshot.occurredAt).toLocaleString('en-GB',{timeZone:d.routineSnapshot.timezone,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const executed=incident.actions.some(a=>a.executionStatus==='executed');
 $('incident-heading').textContent=`${when} ${d.eventSnapshot.kind}: ${executed?'action executed':'no action executed'}`;
 const parts=[];
 for(const a of incident.actions){
  const failed=a.checks.find(c=>c.status==='failed');
  const cause=document.createElement('div');cause.className='cause';
  cause.append(node('span',failed?'VERIFIED ROOT CAUSE · stored reason code':'NO FAILED CHECK · every rule passed'),node('strong',failed?failed.check+' — failed':'Arrival rule matched'),node('code',a.reasonCode),node('p',failed?failed.evidence:`Receipt ${a.actionId}`));
  const list=document.createElement('ol');list.className='checks';
  for(const c of a.checks){const detail=c.status==='not_reached'?'not reached':c.evidence;const li=document.createElement('li');li.className=c.status;li.title=detail;li.append(node('b',c.status==='passed'?'✓':c.status==='failed'?'✕':'·'),node('span',c.check),node('small',' — '+detail));list.append(li);}
  parts.push(cause,list,node('p',`${a.deviceId}/${a.action}: ${a.executionStatus==='executed'?'executed · receipt '+a.actionId:'not executed · no receipt'} · decision ${d.decisionId.slice(0,8)} · revision ${d.routineRevisionId} (${d.currentRevision?'current':'superseded'} when evaluated) · ${d.approvalSnapshot?'approved by '+d.approvalSnapshot.actor:'no approval recorded'} · ${d.policyVersion}`));
 }
 $('incident').replaceChildren(...parts);
}
$('add-unlock').addEventListener('change',()=>candidateView());
$('run-preflight').addEventListener('click',()=>work(async()=>{
 const before=await api('/api/home');
 const candidate={weekdays:candidateDays()};
 if($('add-unlock').checked)candidate.actions=[...draft.routine.actions.filter(a=>a.deviceId!=='front-door'),{deviceId:'front-door',action:'unlock'}];
 const result=await api('/api/preflight',{routineRevisionId:draft.routine.revisionId,candidate});
 const after=await api('/api/home');const same=JSON.stringify(before.devices)===JSON.stringify(after.devices);
 showRun(result,same);
 notice(`Preflight ${result.summary.verdict==='pass'?'passed':'failed'}: evaluated by the MCP server and saved to PostgreSQL. No routine was saved or approved; device state ${same?'unchanged':'changed during the run (shared household)'}.`);
}));
$('retrieve-run').addEventListener('click',()=>work(async()=>{const saved=await api('/api/preflight/'+encodeURIComponent(run.runId));showRun(saved,null);notice(`Retrieved saved run ${saved.runId} from PostgreSQL through MCP.`);}));
$('record').addEventListener('click',()=>work(async()=>{
 const outcome=await api('/api/events',{eventId:crypto.randomUUID(),routineRevisionId:draft.routine.revisionId,kind:'arrival',occurredAt:fixtureEvent,source:'simulated'});
 selectedIncident=outcome.decision.eventId;await refresh();notice('Recorded a simulated Saturday arrival. The incident above is reconstructed from the stored decision.');
}));

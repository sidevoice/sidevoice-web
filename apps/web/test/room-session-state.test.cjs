const test=require('node:test'),assert=require('node:assert/strict');
const moduleReady=import('../src/state/room-session-state.js');
function facts(api,patch={}){return {...api.initialSessionFacts(),ws:{},sessionId:'s',roomBinding:{thread_id:'a'},...patch}}
function turn(patch={}){return {session:'s',thread:'a',status:'read',...patch}}

test('A harness report, including idle, overrides every receipt, settled turn and microphone state',async()=>{
 const api=await moduleReady;
 for(const busy of [false,true])for(const userLive of [false,true])for(const botLive of [false,true])for(const settled of [false,true]){
  const s=facts(api,{harness:{a:busy},userLive,botLive,turns:{one:turn({settled})}});
  assert.equal(api.working(s),busy);
 }
});
test('Harness activity belongs to its conversation; another conversation cannot light these dots',async()=>{
 const api=await moduleReady;
 assert.equal(api.working(facts(api,{harness:{b:true}})),false);
 assert.equal(api.working(facts(api,{harness:{a:true,b:false}})),true);
});
test('A reply settles only its own turn, and late receipts cannot reopen it',async()=>{
 const api=await moduleReady;let s=facts(api,{turns:{'s:user-turn:1':turn(),'s:user-turn:2':turn()}});
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:2,reply_revision:1});
 assert.equal(api.working(s),true);
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:2});
 assert.equal(api.working(s),false);
 s.turns=api.recordReceipt(s,'s:user-turn:2','read',100);
 assert.equal(api.working(s),false);
});
test('A reply settles fallback work without a model-authored turn marker',async()=>{
 const api=await moduleReady;const s=facts(api);
 s.turns=api.recordReceipt(s,'s:user-turn:1','read',100);
 assert.equal(api.working(s),true);
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:1});
 assert.equal(api.working(s),false);
});
test('Read means working immediately; delivery means working after the fallback deadline',async()=>{
 const api=await moduleReady;
 for(const status of ['delivered','unconfirmed']){
  const s=facts(api,{now:100});s.turns=api.recordReceipt(s,'one',status,100);
  assert.equal(api.working(s),false);s.now=1599;assert.equal(api.working(s),false);
  s.now=1600;assert.equal(api.working(s),true);
 }
 assert.equal(api.working(facts(api,{turns:{one:turn()}})),true);
});
test('Failed delivery and another browser never count as this conversation working',async()=>{
 const api=await moduleReady;
 for(const patch of [{status:'pending'},{status:'not_sent'},{status:'channel_closed'},{session:'other'},{thread:'b'}])
  assert.equal(api.working(facts(api,{turns:{one:turn(patch)}})),false);
});
test('The person and room speaking are independent of harness work and tab transcription',async()=>{
 const api=await moduleReady;
 const v=api.sessionStatus(facts(api,{harness:{a:true},userLive:true,botLive:true,pendingPhase:'transcribing'}));
 assert.equal(v.speaker,'user');assert.equal(v.conversation,'working');assert.equal(v.tab,'transcribing');
 assert.equal(api.sessionStatus(facts(api,{botLive:true})).conversation,'speaking');
 assert.equal(api.sessionStatus(facts(api)).conversation,'idle');
});
test('A waveform belongs only to the viewed active input, and cancelled input cannot be cancelled again',async()=>{
 const api=await moduleReady;const s=facts(api,{userTurn:{id:'t1',segment:'turn:t1',thread:'a'},pendingPhase:'listening'});
 assert.equal(api.conversationView(s).pendingPhase,'listening');
 s.pendingPhase='transcribing';assert.equal(api.conversationView(s).pendingPhase,'transcribing');
 s.viewedThread='b';assert.equal(api.conversationView(s).pendingPhase,'');assert.equal(api.conversationView(s).pendingCancellable,false);
 s.viewedThread=null;s.cancelledInput=true;assert.equal(api.conversationView(s).pendingPhase,'');assert.equal(api.conversationView(s).pendingCancellable,false);
});
test('Join progress, returning subject and failure text are derived from the same join facts',async()=>{
 const api=await moduleReady;const s=facts(api);
 for(const [step,text] of Object.entries(api.JOIN_STEPS))assert.equal(api.joinView({...s,joinStep:step,joinSubject:'A'}).text,text+(step==='conversation'?'A':''));
 assert.equal(api.joinView({...s,joinStep:'voice',joinProgress:16.7}).text,'Preparando la voz (17 %)');
 assert.deepEqual(api.joinView({...s,joinStep:'room',joinFailure:'No permission'}),{step:'failed',text:'No permission',progress:null,failed:true});
 assert.equal(api.joinView(s),null);
});
test('Two ticks require read; transport delivery and unconfirmed delivery each have one',async()=>{
 const {receiptView}=await moduleReady;
 assert.equal(receiptView('read').symbol,'✓✓');
 for(const status of ['delivered','unconfirmed'])assert.equal(receiptView(status).symbol,'✓');
 for(const status of ['pending','sending'])assert.equal(receiptView(status).symbol,'◷');
 for(const status of ['uncertain','not_sent'])assert.equal(receiptView(status).symbol,'!');
});
test('Playback labels are projections of the reply facts, preserving its full text',async()=>{
 const api=await moduleReady;const row={role:'assistant',segment:'h',thread:'a',text:'All the text',time:1,audio:'queued'};
 const s=facts(api,{history:[row]});
 assert.equal(api.conversationView(s).messages[0].playback,'pending');
 s.karaokeState={segment:'h',from:0,to:3};assert.equal(api.conversationView(s).messages[0].playback,'playing');
 s.karaokeState=null;s.history=[{...row,audio:'playback_finished'}];const message=api.conversationView(s).messages[0];
 assert.equal(message.playback,'complete');assert.equal(message.text,row.text);
});
test('The reply being said carries the part sounding to its bubble, and only that reply plays',async()=>{
 // The runtime keeps where the voice is as the range a bubble reads: one shape from the voice's handle to the view.
 const api=await moduleReady;const row={role:'assistant',segment:'h',thread:'a',text:'All the text',time:1,audio:'heard'};
 const s=facts(api,{history:[row,{role:'assistant',thread:'a',text:'No id yet',time:2}],karaokeState:{segment:'h',from:4,to:7}});
 assert.deepEqual(api.conversationView(s).messages[0].karaoke,{from:4,to:7});
 assert.equal(api.conversationView(s).messages[0].playback,'playing');
 assert.equal(api.conversationView(s).messages[1].karaoke,null,'a row without an id is never the one being said');
 // Between chunks the range closes on what was heard: still the reply being said.
 s.karaokeState={segment:'h',from:7,to:7};assert.deepEqual(api.conversationView(s).messages[0].karaoke,{from:7,to:7});
 s.karaokeState={segment:'other',from:0,to:3};assert.equal(api.conversationView(s).messages[0].karaoke,null);
 s.karaokeState=null;assert.equal(api.conversationView(s).messages[0].playback,'complete');
 assert.equal(api.conversationView(s).messages[1].playback,'complete');
});
test('One store transition publishes one coherent projection, without calls from a handler to render or sound',async()=>{
 const api=await moduleReady;const store=api.createRoomSessionStore(facts(api));const seen=[];store.subscribe(s=>seen.push(s));
 store.batch(()=>{store.facts.harness={a:true};store.facts.userLive=true});
 assert.equal(seen.length,1);assert.equal(seen[0].session.working,true);assert.equal(seen[0].session.speaker,'user');
 store.facts.userLive=false;assert.equal(seen[1].session.speaker,'nobody');
 assert.equal(seen[0].facts.userLive,true,'prior snapshots do not change');
});

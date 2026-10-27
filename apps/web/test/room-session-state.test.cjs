const test=require('node:test'),assert=require('node:assert/strict');
const moduleReady=import('../src/state/room-session-state.js');
// A call on machine m, bound to its thread a: the conversation is m|a, the machine's thread b another one.
function facts(api,patch={}){return {...api.initialSessionFacts(),ws:{},sessionId:'s',callNode:'m',roomBinding:{thread_id:'a'},...patch}}
function turn(patch={}){return {session:'s',thread:'m|a',status:'read',...patch}}
// m|a busy for as long as it takes to show as working.
const lasted=api=>({workingSince:{'m|a':0},now:api.WORKING_SHOWN_AFTER_MS});

test('A harness report, including idle, overrides every receipt, settled turn and microphone state',async()=>{
 const api=await moduleReady;
 for(const busy of [false,true])for(const userLive of [false,true])for(const botLive of [false,true])for(const settled of [false,true]){
  const s=facts(api,{harness:{'m|a':busy},userLive,botLive,turns:{one:turn({settled})}});
  assert.equal(api.busy(s),busy);
 }
});
test('Harness activity belongs to its conversation; another conversation cannot light these dots',async()=>{
 const api=await moduleReady;
 assert.equal(api.busy(facts(api,{harness:{'m|b':true}})),false);
 assert.equal(api.busy(facts(api,{harness:{'m|a':true,'m|b':false}})),true);
});
test('A reply settles only its own turn, and late receipts cannot reopen it',async()=>{
 const api=await moduleReady;let s=facts(api,{turns:{'s:user-turn:1':turn(),'s:user-turn:2':turn()}});
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:2,reply_revision:1});
 assert.equal(api.busy(s),true);
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:2});
 assert.equal(api.busy(s),false);
 s.turns=api.recordReceipt(s,'s:user-turn:2','read',100);
 assert.equal(api.busy(s),false);
});
test('A reply settles fallback work without a model-authored turn marker',async()=>{
 const api=await moduleReady;const s=facts(api);
 s.turns=api.recordReceipt(s,'s:user-turn:1','read',100);
 assert.equal(api.busy(s),true);
 s.turns=api.recordReply(s,{session_id:'s',thread_id:'a',revision:1});
 assert.equal(api.busy(s),false);
});
test('Read means working immediately; delivery means working after the fallback deadline',async()=>{
 const api=await moduleReady;
 for(const status of ['delivered','unconfirmed']){
  const s=facts(api,{now:100});s.turns=api.recordReceipt(s,'one',status,100);
  assert.equal(api.busy(s),false);s.now=1599;assert.equal(api.busy(s),false);
  s.now=1600;assert.equal(api.busy(s),true);
 }
 assert.equal(api.busy(facts(api,{turns:{one:turn()}})),true);
});
test('Failed delivery and another browser never count as this conversation working',async()=>{
 const api=await moduleReady;
 for(const patch of [{status:'pending'},{status:'not_sent'},{status:'channel_closed'},{session:'other'},{thread:'m|b'}])
  assert.equal(api.busy(facts(api,{turns:{one:turn(patch)}})),false);
});
test('Working shows only once the conversation has been busy for 3 s without a break',async()=>{
 const api=await moduleReady;
 assert.equal(api.WORKING_SHOWN_AFTER_MS,3000,'one wait, the decided one');
 // Busy from 10 s on, as the runtime records it (busySince), and the clock read as it moves.
 const s=facts(api,{harness:{'m|a':true},now:10_000});
 assert.equal(api.busy(s),true);
 assert.equal(api.working(s),false,'busy with no start recorded yet is not shown');
 s.workingSince=api.busySince(s,10_000);
 assert.deepEqual(s.workingSince,{'m|a':10_000});
 assert.equal(api.workingDeadline(s),13_000);
 s.now=12_999;assert.equal(api.working(s),false);assert.equal(api.sessionStatus(s).conversation,'idle');
 s.now=13_000;assert.equal(api.working(s),true);assert.equal(api.sessionStatus(s).conversation,'working');
 assert.equal(api.workingDeadline(s),null,'nothing left to wait for');
 // Still busy: the start is kept, not moved on.
 assert.deepEqual(api.busySince(s,20_000),{'m|a':10_000});
 // A break starts the wait again: idle drops the start, and the next busy stretch has its own.
 s.harness={'m|a':false};s.workingSince=api.busySince(s,14_000);
 assert.deepEqual(s.workingSince,{});assert.equal(api.working(s),false);
 s.harness={'m|a':true};s.workingSince=api.busySince(s,14_500);s.now=14_500;
 assert.equal(api.working(s),false);assert.equal(api.workingDeadline(s),17_500);
});
test('Each conversation waits on its own start; out of the call only the harness makes one busy',async()=>{
 const api=await moduleReady;
 const s=facts(api,{harness:{'m|a':true,'m|b':true},now:5_000});
 s.workingSince=api.busySince(s,5_000);
 s.harness={'m|a':true,'m|b':true,'m|c':true};s.workingSince=api.busySince(s,7_000);
 assert.deepEqual(s.workingSince,{'m|a':5_000,'m|b':5_000,'m|c':7_000});
 s.now=8_000;
 assert.deepEqual(['m|a','m|b','m|c'].map(key=>api.working(s,key)),[true,true,false]);
 assert.equal(api.workingDeadline(s),10_000);
 assert.equal(api.participantsView({...s,people:[{node:'m',thread_id:'a',title:'A',available:true}]})[0].working,true);
 assert.deepEqual(api.busySince({...s,ws:null},9_000),{'m|a':5_000,'m|b':5_000,'m|c':7_000},'out of the call the harness still counts');
 const out={...s,ws:null,harness:{},turns:{one:turn()}};
 assert.equal(api.busy(out),false,'out of the call receipts never count');
 assert.deepEqual(api.busySince(out,9_000),{});
});
test('A conversation\'s title is built one way: one line, unquoted, without naming its harness or its model',async()=>{
 const api=await moduleReady;
 const codex={harness:'codex',engine:{model:'gpt-6-luna'}},claude={harness:'claude-code',engine:{model:'claude-opus-5-5'}};
 // What its agent gave, kept as it is when there is nothing to take away.
 assert.equal(api.displayTitle('Sidevoice: supervisión',claude),'Sidevoice: supervisión');
 assert.equal(api.displayTitle('infra · terraform',{harness:'cursor'}),'infra · terraform');
 assert.equal(api.displayTitle('Codex session',codex),'Codex session','a name inside the words stays');
 assert.equal(api.displayTitle('10:30 standup',codex),'10:30 standup');
 // One line, and no quotes around the whole.
 assert.equal(api.displayTitle('  Revisión\nde   la PR #109 ',null),'Revisión de la PR #109');
 assert.equal(api.displayTitle('"Engine #9: backends.json"',claude),'Engine #9: backends.json');
 assert.equal(api.displayTitle('\u201cnotes\u201d',null),'notes');
 assert.equal(api.displayTitle('"Fix" the "bug"',null),'"Fix" the "bug"','quotes inside are its own');
 // A part that only names its harness (its icon says it) or its model (the stage's badge says it) goes.
 assert.equal(api.displayTitle('Codex — sidevoice-desktop (gpt-6-luna)',codex),'sidevoice-desktop');
 assert.equal(api.displayTitle('sidevoice-web (Claude Code)',claude),'sidevoice-web');
 assert.equal(api.displayTitle('Claude Code: review the PR',claude),'review the PR');
 assert.equal(api.displayTitle('Cursor | landing copy | cursor',{harness:'cursor'}),'landing copy');
 assert.equal(api.displayTitle('release - Codex - GPT-6-Luna',codex),'release');
 // Another harness's name is not this one's, and a title that is only the name keeps it.
 assert.equal(api.displayTitle('Codex: port',claude),'Codex: port');
 assert.equal(api.displayTitle('Claude Code',claude),'Claude Code');
 assert.equal(api.displayTitle(undefined,null),'');
});
test('Every surface shows the same title: the rows, the transcript\'s, the desktop card\'s',async()=>{
 const api=await moduleReady;
 const s=facts(api,{roomBinding:{thread_id:'a',title:'Codex: Pagos (gpt-6-luna)'},
  people:[{node:'m',thread_id:'a',title:'Codex: Pagos (gpt-6-luna)',available:true,harness:'codex',engine:{model:'gpt-6-luna'}}]});
 assert.equal(api.participantsView(s)[0].title,'Pagos');
 assert.equal(api.viewedTitle(s),'Pagos');
 assert.equal(api.callCardView(s).title,'Pagos');
 // Before the room lists it, the binding's title, one line.
 const bound=facts(api,{roomBinding:{thread_id:'a',title:' Pagos\n'}});
 assert.equal(api.participantsView(bound)[0].title,'Pagos');
 assert.equal(api.viewedTitle(bound),'Pagos');
});
test('The person and room speaking are independent of harness work and tab transcription',async()=>{
 const api=await moduleReady;
 const v=api.sessionStatus(facts(api,{harness:{'m|a':true},...lasted(api),userLive:true,botLive:true,pendingPhase:'transcribing'}));
 assert.equal(v.speaker,'user');assert.equal(v.conversation,'working');assert.equal(v.tab,'transcribing');
 assert.equal(api.sessionStatus(facts(api,{botLive:true})).conversation,'speaking');
 assert.equal(api.sessionStatus(facts(api)).conversation,'idle');
});
test('A waveform belongs only to the viewed active input, and cancelled input cannot be cancelled again',async()=>{
 const api=await moduleReady;const s=facts(api,{userTurn:{id:'t1',segment:'turn:t1',thread:'m|a'},pendingPhase:'listening'});
 assert.equal(api.conversationView(s).pendingPhase,'listening');
 s.pendingPhase='transcribing';assert.equal(api.conversationView(s).pendingPhase,'transcribing');
 s.viewedThread='m|b';assert.equal(api.conversationView(s).pendingPhase,'');assert.equal(api.conversationView(s).pendingCancellable,false);
 s.viewedThread=null;s.cancelledInput=true;assert.equal(api.conversationView(s).pendingPhase,'');assert.equal(api.conversationView(s).pendingCancellable,false);
});
test('Join progress, returning subject and failure text are derived from the same join facts',async()=>{
 const api=await moduleReady;const s=facts(api);
 // The words are keys here: no translator was given (state/room-store.ts gives the interface's).
 for(const [step,key] of Object.entries(api.JOIN_STEPS))assert.equal(api.joinView({...s,joinStep:step,joinSubject:'A'}).text,key+(step==='conversation'?' {"name":"A"}':''));
 assert.equal(api.joinView({...s,joinStep:'voice',joinProgress:16.7}).text,'session.join.withDetail {"step":"session.join.voice","detail":"17 %"}');
 assert.deepEqual(api.joinView({...s,joinStep:'room',joinFailure:'No permission'}),{step:'failed',text:'No permission',progress:null,failed:true});
 // What was raw about a failure comes with it, for its Details; never in its text.
 assert.deepEqual(api.joinView({...s,joinFailure:'Something went wrong with the machine.',joinFailureDetails:'TypeError\nFailed to fetch'}),
  {step:'failed',text:'Something went wrong with the machine.',progress:null,failed:true,details:'TypeError\nFailed to fetch'});
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
 const api=await moduleReady;const row={role:'assistant',segment:'h',thread:'m|a',text:'All the text',time:1,audio:'queued'};
 const s=facts(api,{history:[row]});
 assert.equal(api.conversationView(s).messages[0].playback,'pending');
 s.karaokeState={segment:'h',from:0,to:3};assert.equal(api.conversationView(s).messages[0].playback,'playing');
 s.karaokeState=null;s.history=[{...row,audio:'playback_finished'}];const message=api.conversationView(s).messages[0];
 assert.equal(message.playback,'complete');assert.equal(message.text,row.text);
});
test('The reply being said carries the part sounding to its bubble, and only that reply plays',async()=>{
 // The runtime keeps where the voice is as the range a bubble reads: one shape from the voice's handle to the view.
 const api=await moduleReady;const row={role:'assistant',segment:'h',thread:'m|a',text:'All the text',time:1,audio:'heard'};
 const s=facts(api,{history:[row,{role:'assistant',thread:'m|a',text:'No id yet',time:2}],karaokeState:{segment:'h',from:4,to:7}});
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
 const api=await moduleReady;const store=api.createRoomSessionStore(facts(api,lasted(api)));const seen=[];store.subscribe(s=>seen.push(s));
 store.batch(()=>{store.facts.harness={'m|a':true};store.facts.userLive=true});
 assert.equal(seen.length,1);assert.equal(seen[0].session.working,true);assert.equal(seen[0].session.speaker,'user');
 store.facts.userLive=false;assert.equal(seen[1].session.speaker,'nobody');
 assert.equal(seen[0].facts.userLive,true,'prior snapshots do not change');
});
test('A projection that did not change is the same object, wherever the data is equal: the room\'s beats and the voice\'s cues draw only what they change',async()=>{
 const api=await moduleReady;
 const person=(thread_id)=>({node:'m',thread_id,title:'T '+thread_id,available:true,reach:{state:'listening'}});
 const history=[{segment:'h',thread:'m|a',role:'assistant',text:'Okay. Then more.',name:'T a',time:1,session:'s',seq:1,audio:'playing'}];
 const store=api.createRoomSessionStore(facts(api,{people:[person('a'),person('b')],history,botLive:true,roomBinding:{thread_id:'a',binding_id:'b1'},machinesReady:true}));
 const first=store.getState(),seen=[];store.subscribe(s=>seen.push(s));
 // The beats: the same binding, the same conversations and activity, each answer a new object.
 store.patch({roomBinding:{...store.facts.roomBinding},machinesAt:5,people:store.facts.people.map(p=>({...p,reach:{...p.reach}})),harness:{...store.facts.harness}});
 const beat=store.getState();
 assert.equal(seen.length,1,'it is still published');
 assert.notEqual(beat.facts,first.facts);
 for(const key of ['session','conversation','participants','join','mic','call','callCard','enginePanel','machines','pairing'])assert.equal(beat[key],first[key],key+' is what it was');
 // A cue moves the words of the one reply: the conversation is new, the rest is not.
 store.patch({karaokeState:{segment:'h',from:0,to:5}});
 const cue=store.getState();
 assert.notEqual(cue.conversation,beat.conversation);assert.deepEqual(cue.conversation.saying.karaoke,{from:0,to:5});
 assert.equal(cue.conversation.messages[0]!==beat.conversation.messages[0],true);
 for(const key of ['session','participants','machines','mic','call','pairing'])assert.equal(cue[key],beat[key],key+' is what it was');
 // A change to one conversation keeps the others\' rows.
 store.patch({people:[{...person('a'),title:'Renamed'},person('b')]});
 const renamed=store.getState();
 assert.notEqual(renamed.participants,cue.participants);assert.equal(renamed.participants[1],cue.participants[1]);assert.equal(renamed.participants[0].title,'Renamed');
 assert.equal(cue.participants[0].title,'T a','earlier snapshots do not change');
});
test('keepEqual keeps what is equal at any depth and never changes what it is given',async()=>{
 const api=await moduleReady;const same=api.keepEqual;
 const a={x:[{y:1},{y:2}],z:{w:'t'},n:null,u:undefined};
 assert.equal(same(a,{x:[{y:1},{y:2}],z:{w:'t'},n:null,u:undefined}),a);
 const b=same(a,{x:[{y:1},{y:3}],z:{w:'t'},n:null,u:undefined});
 assert.notEqual(b,a);assert.equal(b.z,a.z);assert.equal(b.x[0],a.x[0]);assert.deepEqual(b.x,[{y:1},{y:3}]);
 assert.deepEqual(a.x,[{y:1},{y:2}]);
 // A longer, a shorter and a reordered list; a key gone, a key new, a key that is undefined on one side only.
 const list=[{k:1},{k:2}];
 assert.deepEqual(same(list,[{k:1},{k:2},{k:3}]),[{k:1},{k:2},{k:3}]);assert.equal(same(list,[{k:1},{k:2},{k:3}])[0],list[0]);
 assert.deepEqual(same(list,[{k:1}]),[{k:1}]);assert.equal(same(list,[{k:1}])[0],list[0]);
 assert.deepEqual(same(list,[{k:2},{k:1}]),[{k:2},{k:1}]);
 assert.deepEqual(same({p:1,q:2},{p:1}),{p:1});assert.deepEqual(same({p:1},{p:1,q:2}),{p:1,q:2});
 assert.notEqual(same({p:undefined},{q:undefined}),undefined);assert.deepEqual(Object.keys(same({p:undefined},{q:undefined})),['q']);
 // Anything that is not plain data is the same only as the same object.
 const socket=new Map(),later=new Map();
 assert.equal(same({ws:socket},{ws:socket}).ws,socket);assert.equal(same({ws:socket},{ws:later}).ws,later);
 assert.equal(same(1,1),1);assert.equal(same([1],{0:1}) instanceof Array,false);
});

// ----- what a newer room or machine sends (sidevoice-core#112): extra fields, values not known yet, fields left out -----
test('A participant from a newer machine is listed: extra fields ignored, an unknown reach read by availability, capabilities of any shape',async()=>{
 const api=await moduleReady;
 const person=(patch)=>({node:'m',thread_id:'a',title:'A',available:true,future:{x:1},...patch});
 const view=(people)=>api.participantsView(facts(api,{people}));
 // An unknown reach is not "offline": it reads as one the room left unsaid, by whether the conversation is available.
 const [up,down]=view([person({reach:{state:'warming_up',detail:'Loading',eta:3}}),person({thread_id:'b',available:false,reach:{state:'warming_up'}})]);
 assert.equal(up.reach,'listening');assert.equal(up.detail,'Loading');
 assert.equal(down.reach,'offline');
 for(const state of ['listening','holding','offline'])assert.equal(view([person({reach:{state}})])[0].reach,state);
 // A reach without a state, and no reach at all.
 assert.equal(view([person({reach:{detail:'x'}})])[0].reach,'listening');
 assert.equal(view([person({reach:undefined})])[0].reach,'listening');
 // `experimental` of a shape this version does not know marks nothing, and never stops the list.
 for(const experimental of [{deliver:true},'deliver',3,null,undefined]){
  const [row]=view([person({capabilities:{working:'supported',experimental}})]);
  assert.equal(row.activityNote,null,JSON.stringify(experimental));
 }
 assert.match(view([person({capabilities:{working:'supported',experimental:['deliver','teleport']}})])[0].activityNote,/^session.note.experimentalDeliver$/);
 // No capabilities at all: what is not known is said as not known.
 assert.match(view([person({capabilities:undefined})])[0].activityNote,/^session.note.workingUnknown$/);
});
test('A reply audio status not known yet is left unsaid, never taken for finished; no status is a written reply',async()=>{
 const api=await moduleReady;const row={role:'assistant',segment:'h',thread:'m|a',text:'Texto',time:1};
 const playback=(patch)=>api.playbackState({...row,...patch},facts(api));
 assert.equal(playback({audio:'resampling'}),undefined);
 assert.equal(playback({audio:42}),undefined);
 assert.equal(playback({}),'complete');assert.equal(playback({audio:null}),'complete');
 for(const audio of ['playback_finished','heard','unplayed','interrupted','disconnected','failed','text_only'])assert.equal(playback({audio}),'complete',audio);
 for(const audio of ['queued','synthesizing','waiting_for_turn','waiting_for_pause'])assert.equal(playback({audio}),'pending',audio);
 assert.equal(playback({audio:'playing'}),'playing');
 // Nor counted as sounding ahead of another reply, and nothing said under it.
 const s=facts(api,{history:[{...row,audio:'resampling',audio_reason:'gpu_busy'}]});
 const [message]=api.conversationView(s).messages;
 assert.equal(message.playback,undefined);assert.equal(message.audioNote,'');
});
test('A delivery status not known yet has no mark and no words, never the warning of one that failed',async()=>{
 const {receiptView}=await moduleReady;
 for(const status of ['queued_offline','',undefined])assert.deepEqual(receiptView(status),{symbol:'',label:''},String(status));
});
test('A conversation reads offline by its own machine: one that does not answer, or the call\'s own once its drop is shown',async()=>{
 const api=await moduleReady;
 const people=[{node:'m',thread_id:'a',title:'A',available:true,reach:{state:'listening'}},{node:'n',thread_id:'b',title:'B',available:true,reach:{state:'listening'}}];
 const reaches=patch=>api.participantsView(facts(api,{people,...patch})).map(p=>p.reach);
 const ok={m:{reach:'ok'},n:{reach:'ok'}};
 assert.deepEqual(reaches({machineLinks:ok}),['listening','listening']);
 assert.deepEqual(reaches({machineLinks:{...ok,n:{reach:'offline'}}}),['listening','offline'],'only the machine that does not answer');
 // The call's machine proved its address minutes ago, so its link still says ok; its socket is gone.
 const dropped={machineLinks:ok,ws:null,reconnecting:true};
 assert.deepEqual(reaches(dropped),['listening','listening'],'within the grace, nothing is said');
 assert.deepEqual(reaches({...dropped,reconnectShown:true}),['offline','listening'],'past it, the call\'s machine is away and the other is not');
});
test('A call whose machine is away still reads its conversation, and a message that never arrived says why',async()=>{
 const api=await moduleReady;
 api.speakWith(key=>key);
 const row={segment:'queued:1',thread:'m|a',role:'user',text:'Hola',delivery:'pending',time:1};
 const away=facts(api,{ws:null,reconnecting:true,sessionId:null,history:[row]});
 assert.deepEqual(api.conversationView(away).messages.map(m=>m.text),['Hola'],'a call looking for its machine is still a call');
 assert.deepEqual(api.conversationView(facts(api,{ws:null,sessionId:null,history:[row]})).messages,[],'one outside any call reads nothing');
 assert.equal(api.deliveryNote(row),'');
 assert.equal(api.deliveryNote({...row,delivery:'not_sent'}),'session.delivery.notReached');
 assert.equal(api.deliveryNote({...row,delivery:'not_sent',audio_reason:'expired'}),'session.delivery.notReachedExpired');
});

test('A disconnected conversation is never busy or working, whatever its harness or receipts say (sidevoice-core#159, web#367)',async()=>{
 const api=await moduleReady;
 const person=(patch={})=>({node:'m',thread_id:'a',title:'A',available:false,reach:{state:'offline'},...patch});
 const s=facts(api,{people:[person()],harness:{'m|a':true},turns:{one:turn()},...{workingSince:{'m|a':0},now:api.WORKING_SHOWN_AFTER_MS}});
 assert.equal(api.busy(s),false);
 assert.equal(api.working(s),false);
 assert.equal(api.conversationView(s).working,false,'no typing bubble in the transcript');
 assert.equal(api.participantsView(s)[0].working,false,'no Working in the sidebar');
 assert.equal(api.sessionStatus(s).working,false);
 assert.deepEqual(api.busySince(s,5),{},'its busy start is dropped, so it must be busy again, fresh, after it is back');
 // Back and reporting busy again: working, once it has lasted.
 const back=facts(api,{people:[person({available:true,reach:{state:'listening'}})],harness:{'m|a':true},...lasted(api)});
 assert.equal(api.working(back),true);
 assert.equal(api.participantsView(back)[0].working,true);
 // A machine that does not answer leaves its conversations unreachable too.
 const down=facts(api,{people:[person({available:true,reach:{state:'listening'}})],machineLinks:{m:{reach:'offline'}},harness:{'m|a':true},...lasted(api)});
 assert.equal(api.working(down),false);
});

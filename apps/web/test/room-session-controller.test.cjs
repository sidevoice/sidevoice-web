const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
// This device's pairing, as the page keeps it, for every test that does not say otherwise: the machine proved itself
// at the page's own origin a moment ago, so requests go where they always went and carry its token.
const PAIRED={fp:'fp-mac',public_key:'pk',host:'macbook',urls:['http://127.0.0.1:8768'],rv:{url:'https://room.example',node:'mac'},device_id:'dev-1',token:'tok-1',paired_at:1};
function setup({strictDOM=false,paired=true,stored=paired?{in_use:PAIRED.fp,pairings:[PAIRED]}:null,localHost=null,localHostSelected=false,indexedDB=null,outboxScope=null}={}){
 const sourceRoot=__dirname+'/../src'; const uiSource=fs.readdirSync(sourceRoot,{recursive:true}).filter(file=>String(file).endsWith('.tsx')).map(file=>fs.readFileSync(sourceRoot+'/'+file,'utf8')).join('\n');
 class Element{constructor(id){this.id=id;this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.parentElement=this;this.listeners={};this.attributes={}}addEventListener(name,fn){this.listeners[name]=fn}showModal(){this.open=true}close(){this.open=false;this.listeners.close?.()}contains(node){return node===this||this.children.includes(node)}removeAttribute(){}closest(){return null}querySelector(){return null}append(...children){this.children.push(...children)}replaceChildren(...children){this.children=[...children]}remove(){}setAttribute(name,value){this.attributes[name]=value}getAttribute(name){return this.attributes[name]}click(){this.onclick?.()}}
 const elements=new Map(),handlers={},documentHandlers={},observers=[];
 if(strictDOM){for(const match of uiSource.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element(match[1]));for(const id of ['pair-close','pair-title','connection-stats','stats-title','stats-close','language-settings','settings-title','settings-close','stats-recognition','stats-response'])elements.set(id,new Element(id))}
 const saved=stored?{'sidevoice.pairings':JSON.stringify(stored)}:{};if(localHostSelected)saved['sidevoice.local-host-selected']='true';
 const context=vm.createContext({Element,console,Date,JSON,Math,Map,Set,Promise,Uint8Array,TextEncoder,TextDecoder,URL,AbortController,URLSearchParams,crypto:globalThis.crypto,localStorage:{getItem:key=>saved[key]??null,setItem(key,value){saved[key]=value},removeItem(key){delete saved[key]}},btoa:value=>Buffer.from(value,'binary').toString('base64'),sessionStorage:{getItem:()=>null,setItem(){}},document:{getElementById:id=>{if(!elements.has(id)){if(strictDOM)return null;elements.set(id,new Element(id))}return elements.get(id)},body:new Element('body'),createElement:()=>new Element(),addEventListener:(name,fn)=>(documentHandlers[name]??=[]).push(fn)},window:{addEventListener:(name,fn)=>handlers[name]=fn},MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}},fetch:()=>new Promise(()=>{}),setInterval(){},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},WebSocket:{OPEN:1},location:{protocol:'https:',host:'room.example'}});
 if(localHost)context.window.__sidevoiceDesktop={host:{localHost}};
 // The outbox's storage across reloads, and this tab's scope in it.
 if(indexedDB)context.indexedDB=indexedDB;
 if(outboxScope)context.sessionStorage={getItem:key=>key==='sidevoice.outbox-scope'?outboxScope:null,setItem(){}};
 // Each module the controller imports becomes one object in the context, and its import line a destructuring of it;
 // a JSON import is its content. A TypeScript module is transpiled here.
 const modules={'./refusals.js':'Refusals','../state/room-session-state.js':'SessionState','./rendezvous.js':'Rendezvous','./device-pairing.js':'DevicePairing','../services/device-pairing.js':'DevicePairing','./desktop-host.ts':'DesktopHost','../services/desktop-host':'DesktopHost','./system-language.js':'SystemLanguage','../services/system-language.js':'SystemLanguage','../../services/system-language.js':'SystemLanguage','../state/device-name.ts':'DeviceName','./messages/en':'HostMessagesEn','./messages/es':'HostMessagesEs','../../i18n/translator':'Translator','../features/settings/host-i18n.ts':'HostI18n','./outbox.js':'Outbox','./failure-code.js':'FailureCode','./site-storage.js':'SiteStorage','./model-catalogs.js':'ModelCatalogs','./voice-source.ts':'VoiceSource','./voice-module.js':'VoiceModule','./turn-relay.js':'TurnRelay','./voice-room.js':'VoiceRoom','./voice-settings.js':'VoiceSettings'};
 const files={Refusals:sourceRoot+'/services/refusals.js',SessionState:sourceRoot+'/state/room-session-state.js',Rendezvous:sourceRoot+'/services/rendezvous.js',DevicePairing:sourceRoot+'/services/device-pairing.js',DesktopHost:sourceRoot+'/services/desktop-host.ts',SystemLanguage:sourceRoot+'/services/system-language.js',Outbox:sourceRoot+'/services/outbox.js',DeviceName:sourceRoot+'/state/device-name.ts',HostMessagesEn:sourceRoot+'/features/settings/messages/en.ts',HostMessagesEs:sourceRoot+'/features/settings/messages/es.ts',Translator:sourceRoot+'/i18n/translator.ts',HostI18n:sourceRoot+'/features/settings/host-i18n.ts',FailureCode:sourceRoot+'/services/failure-code.js',SiteStorage:sourceRoot+'/services/site-storage.js',ModelCatalogs:sourceRoot+'/services/model-catalogs.js',VoiceSource:sourceRoot+'/services/voice-source.ts',VoiceModule:sourceRoot+'/services/voice-module.js',TurnRelay:sourceRoot+'/services/turn-relay.js',VoiceRoom:sourceRoot+'/services/voice-room.js',VoiceSettings:sourceRoot+'/services/voice-settings.js'};
 const imports=(source,dir)=>source.replace(/^import (\w+) from ['"](.*\.json)['"][^;]*;\n/gm,(_,name,from)=>'const '+name+'='+fs.readFileSync(require('node:path').resolve(dir,from),'utf8')+';\n')
  .replace(/^import \{(.*)\} from ['"](.*)['"];\n/gm,(_,names,from)=>'const {'+names.replace(/ as /g,':')+'}='+modules[from]+';\n');
 // In dependency order: a module may import one listed before it.
 for(const name of new Set(Object.values(modules))){
  let text=fs.readFileSync(files[name],'utf8');
  if(files[name].endsWith('.ts'))text=require('typescript').transpileModule(text,{compilerOptions:{target:99,module:99}}).outputText;
  const dependency=imports(text,require('node:path').dirname(files[name]));
  const exports=[...dependency.matchAll(/^export (?:async function|function|const|class) (\w+)/gm)].map(m=>m[1]);
  vm.runInContext('const '+name+'=(()=>{'+dependency.replace(/^export /gm,'')+';return {'+exports.join(',')+'}})();',context);
 }
 const source=fs.readFileSync(sourceRoot+'/services/room-session-controller.js','utf8');
 const loaded=imports(source,sourceRoot+'/services');
 vm.runInContext('"use strict";\n'+loaded,context);
 for(const name of Object.keys(vm.runInContext('SessionState.initialSessionFacts()',context)))Object.defineProperty(context,name,{get:()=>vm.runInContext('state.'+name,context),set:value=>{context.__fact=value;vm.runInContext('state.'+name+'=__fact',context)},configurable:true});
 if(paired)vm.runInContext("nodeBase='';verified.set('',Date.now());roomStore.patch({node:pairings.inUse,nodeReach:'ok'})",context);
 vm.runInContext("roomBinding={thread_id:'a',title:'A'};sessionId='s'",context);
 // An event dispatched to the document, as one bubbles up from `target`: every listener there hears it.
 const dispatch=(name,event)=>Promise.all((documentHandlers[name]||[]).map(fn=>fn({preventDefault(){},...event})));
 // The page's nodes changed, as React mounting or unmounting a view changes them.
 const mutated=()=>observers.forEach(fn=>fn([]));
 return {context,handlers,Element,elements,saved,dispatch,mutated,run:code=>vm.runInContext(code,context)};
}
test('The runtime never writes into a node React fills itself',()=>{
 // Two owners for the join line cost a blank room: setting textContent removed React's children, and the
 // next render threw NotFoundError trying to replace them. React reads the join from this same store.
 const s=setup({strictDOM:true});
 const join=s.elements.get('join-status');join.textContent='pintado por React';
 s.run("joinStep='room';publishSessionView()");
 assert.equal(join.textContent,'pintado por React','the join line belongs to JoinStatus alone');
 assert.equal(s.run("roomStore.getState().join?.step"),'room','and the same store still says what the step is');
});
test('A page whose interface is gone still runs the call',()=>{
 // React unmounts its whole root when a render throws. The runtime writes into nodes React owns, so
 // after that every one of them is null: the call must survive it, because the audio callbacks run here.
 const s=setup({strictDOM:true});
 s.elements.delete('live');s.elements.delete('join-status');s.elements.delete('engine-badge');
 assert.doesNotThrow(()=>s.run('publishSessionView()'),'a missing interface is not a reason to stop the call');
});
test('The controller publishes serializable snapshots through the React store bridge',()=>{
 const s=setup({strictDOM:true}),snapshots={};
 s.context.window.sidevoiceUI={
  setConversation:value=>snapshots.conversation=value,
  setParticipants:value=>snapshots.participants=value,
  setLanguageModels:value=>snapshots.languageModels=value,
  setBootError:value=>snapshots.bootError=value
 };
 s.run("add('assistant','Hola','voice:1','a');markHistorySeen();people=[{thread_id:'a',title:'Agente',available:true}];rosterSignature=''");
 assert.equal(snapshots.conversation.messages[0].text,'Hola');
 assert.equal(snapshots.conversation.messages[0].thread,'a');
 assert.equal(snapshots.participants[0].threadId,'a');
 assert.equal(snapshots.participants[0].selected,true);
 assert.match(snapshots.participants[0].activityNote,/No sabemos/,'an undeclared capability remains unknown');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,capabilities:{working:'unsupported'}}];rosterSignature=''");
 assert.match(snapshots.participants[0].activityNote,/no informa/,'unsupported is explained explicitly');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,capabilities:{working:'supported'}}];rosterSignature=''");
 assert.equal(snapshots.participants[0].activityNote,null,'supported activity needs no warning');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,capabilities:{working:'supported',deliver:'supported',experimental:['deliver']}}];rosterSignature=''");
 assert.match(snapshots.participants[0].activityNote,/Entrega experimental/,'an experimental delivery is said');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,capabilities:{working:'unsupported',deliver:'supported',sessionIdentity:'supported',experimental:['deliver','sessionIdentity']}}];rosterSignature=''");
 assert.match(snapshots.participants[0].activityNote,/Identificación experimental/,'an experimental identity is said too');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,harness:'cursor',route:'cursor-editor-view'}];rosterSignature=''");
 assert.equal(snapshots.participants[0].harness,'cursor'); assert.equal(snapshots.participants[0].route,'tarjeta (experimental)');
 s.run("people=[{thread_id:'a',title:'Agente',available:true,harness:'cursor'}];rosterSignature=''");
 assert.equal(snapshots.participants[0].route,null,'a room that does not say the route leaves the harness name alone');
 assert.equal(s.run("setRoomError('fallo')"),undefined);
 assert.equal(snapshots.bootError,'fallo');
 assert.equal(s.run("$('messages').children.length"),0,'React owns rendering when the bridge is installed');
});
// What the page holds lives in its own realm; compared by value.
const plain=value=>JSON.parse(JSON.stringify(value));
test('Command D toggles and holding space restores mute on release or loss of focus',()=>{
 const s=setup();const voice=fakeVoice();s.context.__voice=voice;s.run("voice=__voice;ws={}");
 const key=code=>({code,metaKey:code==='KeyD',target:new s.Element(),preventDefault(){}});
 s.handlers.keydown(key('KeyD'));assert.equal(s.run('micEnabled'),false);assert.equal(voice.calls.at(-1)[1],true,'the voice is muted');
 s.handlers.keydown(key('Space'));assert.equal(s.run('micEnabled'),true);
 s.handlers.keyup(key('Space'));assert.equal(s.run('micEnabled'),false);
 s.handlers.keydown(key('Space'));s.handlers.blur();assert.equal(s.run('micEnabled'),false);
 s.handlers.keydown(key('KeyD'));assert.equal(s.run('micEnabled'),true);assert.equal(voice.calls.at(-1)[1],false);
});
test('Keyboard shortcuts ignore typing and auto-repeat',()=>{
 const s=setup();s.run("ws={}");
 const target=new s.Element();target.closest=()=>({});
 s.handlers.keydown({code:'KeyD',metaKey:true,target});assert.equal(s.run('micEnabled'),true);
 s.handlers.keydown({code:'KeyD',metaKey:true,target:new s.Element(),repeat:true,preventDefault(){}});assert.equal(s.run('micEnabled'),true);
});
test('Delivery tick is immediate, follows the matching receipt and does not imply read',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 s.run("relay.sent('t1');voiceTurn({turn_id:'t1',phase:'started',started_at:1});voiceTurn({turn_id:'t1',phase:'finished',text:'Hola',started_at:1,ended_at:2,merged:false,timings:{}})");
 assert.equal(s.run('history[0].delivery'),'pending');
 assert.equal(s.run('history[0].segment'),'s:user-turn:t1','the turn\'s name names the row, as the room does');
 emit('voice-user-turn',{phase:'started',turn_id:'t1',revision:1,thread_id:'a',session_id:'s'});
 emit('voice-input-receipt',{turn_id:'t1',revision:1,thread_id:'other',status:'delivered'});
 assert.equal(s.run('history[0].delivery'),'pending');
 emit('voice-input-receipt',{turn_id:'t1',revision:1,thread_id:'a',status:'pending'});
 assert.equal(s.run('history[0].delivery'),'pending');
 emit('voice-input-receipt',{turn_id:'t1',revision:1,thread_id:'a',status:'delivered'});
 assert.equal(s.run('history[0].delivery'),'delivered');
});
test('A joined empty room selects its only listening conversation automatically',async()=>{
 const s=setup();s.run("roomBinding=null;ws={};people=[{thread_id:'only',available:true,reach:{state:'listening'}}];closedThreads=[];var chosen=null;select=async id=>{chosen=id}");
 assert.equal(await s.run('selectOnlyListeningConversation()'),true);
 assert.equal(s.run('chosen'),'only');
 // With several and none remembered, the first in the list: joining always lands somewhere (2026-09-26).
 s.run("people.unshift({thread_id:'first',available:true,reach:{state:'listening'}});chosen=null");
 assert.equal(await s.run('selectOnlyListeningConversation()'),true);
 assert.equal(s.run('chosen'),'first');
 // With none, the list opens by itself, once per call.
 const opened=[];s.context.Event=class{constructor(type){this.type=type}};s.context.window.dispatchEvent=event=>{opened.push(event.type);return true};
 s.run("people=[];chosen=null;sessionId='call-1'");
 assert.equal(await s.run('selectOnlyListeningConversation()'),false);
 await s.run('selectOnlyListeningConversation()');
 assert.deepEqual(opened,['sidevoice-conversations-open']);
});

test('A receipt arriving before the final bubble is retained instead of disappearing',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 s.run("relay.sent('t2');voiceTurn({turn_id:'t2',phase:'started',started_at:1})");
 emit('voice-user-turn',{phase:'started',turn_id:'t2',revision:2,thread_id:'a',session_id:'s'});
 emit('voice-input-receipt',{turn_id:'t2',history_id:'s:user-turn:t2',revision:2,thread_id:'a',session_id:'s',status:'delivered'});
 s.run("voiceTurn({turn_id:'t2',phase:'finished',text:'Ya llegó',started_at:1,ended_at:2,merged:false,timings:{}})");
 assert.equal(s.run('history[0].delivery'),'delivered');
 assert.equal(s.run('Object.keys(inputReceipts).length'),0);
});
test('A finished turn without a selected conversation is visibly not sent',()=>{
 const s=setup();s.run("roomBinding=null;voiceTurn({turn_id:'t3',phase:'started',started_at:1});voiceTurn({turn_id:'t3',phase:'finished',text:'Sin destino',started_at:1,ended_at:2,merged:false,timings:{}})");
 assert.equal(s.run('history[0].delivery'),'not_sent');
});
test('Space repeats and release suppress native button activation without toggling the mic',()=>{
 const s=setup();s.context.__voice=fakeVoice();s.run("voice=__voice;ws={};micEnabled=false");
 let prevented=0;const event=repeat=>({code:'Space',repeat,target:new s.Element(),preventDefault(){prevented++}});
 s.handlers.keydown(event(false));
 for(let i=0;i<8;i++)s.handlers.keydown(event(true));
 assert.equal(s.run('micEnabled'),true);
 s.handlers.keyup(event(false));assert.equal(s.run('micEnabled'),false);
 assert.equal(prevented,10);
 s.run('micEnabled=true');s.handlers.keydown(event(false));s.handlers.keyup(event(false));
 assert.equal(s.run('micEnabled'),true);
});
test('A delivery receipt never fabricates a typing or working indicator',()=>{
 const s=setup();s.run("add('user','Hola','user-turn:1','a');history[0].delivery='delivered';markHistorySeen()");
 assert.equal(s.run("$('messages').children.some(x=>x.className==='waiting-response')"),false);
});

test('Background history arrives without changing focus and has an unread badge',async()=>{
 const s=setup();s.context.fetch=async()=>({ok:true,json:async()=>({messages:[{id:'old:voice:reply',thread:'b',role:'assistant',text:'Listo B',name:'B',time:1,seq:5,status:'text_only'}]})});
 await s.run('refreshHistory()');
 assert.equal(s.run('targetId()'),'a');assert.equal(s.run("SessionState.unreadCount(state,'b')"),1);
 assert.equal(s.run("history[0].text"),'Listo B');
 s.run("viewedThread='b';markHistorySeen()");
 assert.equal(s.run("SessionState.unreadCount(state,'b')"),0);
 assert.equal(s.run('targetId()'),'a');
 await s.run('refreshHistory()');assert.equal(s.run('history.length'),1);
});

test('A composing message follows received replies and gets its final timestamp on send',()=>{
 const s=setup();
 s.run("history=[{thread:'a',role:'user',segment:'s:user-turn:1',text:'En curso',time:100,draft:true},{thread:'a',role:'assistant',text:'Respuesta recibida',time:200}]");
 assert.equal(s.run("SessionState.orderedHistory(state,'a')[0].role"),'assistant');
 s.run("add('user','Ya terminado','user-turn:1','a',{draft:false,time:300})");
 assert.equal(s.run("history[0].time"),300);
 assert.equal(s.run("SessionState.orderedHistory(state,'a')[0].role"),'assistant');
 assert.equal(s.run("SessionState.orderedHistory(state,'a')[1].text"),'Ya terminado');
});

test('Final messages use send timestamps, even when answering an older turn',()=>{
 const s=setup();
 s.run("history=[{thread:'a',role:'assistant',session:'s',revision:1,time:300,text:'Respuesta tardía'},{thread:'a',role:'user',session:'s',revision:2,time:200,text:'Nuevo mensaje'}]");
 assert.equal(s.run("SessionState.orderedHistory(state,'a')[0].text"),'Nuevo mensaje');
});

test('Text submission freezes its destination and clears only the submitted draft',async()=>{
 const s=setup(),sent=[];s.context.crypto={randomUUID:()=> 'test-message'};
 s.run("ws={};$('text-message').value='Un mensaje escrito';roomBinding.binding_id='binding-a'");
 s.context.fetch=async(path,options)=>{if(options){sent.push(JSON.parse(options.body));s.run("$('text-message').value='Ya escribiendo el siguiente'");return {ok:true,json:async()=>({accepted:true})}}return {ok:true,json:async()=>({messages:[]})}};
 await s.dispatch('submit',{target:s.run("$('text-composer')")});
 assert.equal(sent[0].thread_id,'a');assert.equal(sent[0].text,'Un mensaje escrito');
 assert.equal(s.run("$('text-message').value"),'Ya escribiendo el siguiente');
});

test('A text box mounted after the page loaded sends what is typed in it',async()=>{
 // The call view mounts after the controller runs, as it does after pairing the first machine: no box at first.
 const s=setup({strictDOM:true}),sent=[];s.context.crypto={randomUUID:()=>'late-message'};
 for(const id of ['text-composer','text-message','text-send'])s.elements.delete(id);s.mutated();
 assert.doesNotThrow(()=>s.run("ws={};roomBinding.binding_id='binding-a';updateComposer()"),'no box is nothing to update');
 const form=new s.Element('text-composer'),input=new s.Element('text-message'),send=new s.Element('text-send');
 input.disabled=send.disabled=true;let submitted=0;form.requestSubmit=()=>submitted++;
 s.elements.set('text-composer',form);s.elements.set('text-message',input);s.elements.set('text-send',send);
 s.mutated();
 assert.equal(input.disabled,false,'the new box is brought up to date as it appears, and can send');assert.equal(send.disabled,false);
 input.value='Escrito tras emparejar';
 await s.dispatch('keydown',{target:input,key:'Enter'});
 assert.equal(submitted,1,'Enter in the new box submits it');
 s.context.fetch=async(path,options)=>{if(options){sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({accepted:true})}}return {ok:true,json:async()=>({messages:[]})}};
 await s.dispatch('submit',{target:form});
 assert.equal(sent.length,1);assert.equal(sent[0].text,'Escrito tras emparejar');assert.equal(sent[0].thread_id,'a');
 assert.equal(input.value,'','the sent draft is cleared');
 await s.dispatch('submit',{target:new s.Element()});
 assert.equal(sent.length,1,'another form on the page sends nothing');
});

test('Text entry is unavailable when viewing a different inactive history',()=>{
 const s=setup();s.run("ws={};viewedThread='b';updateComposer()");
 assert.equal(s.run("$('text-send').disabled"),true);
});
test('Microphone preference can be toggled before joining',()=>{
 const s=setup();
 s.run('window.sidevoiceActions.toggleMic()');
 assert.equal(s.run('micEnabled'),false);
 assert.equal(s.run('SessionState.micView(state).label'),'Activar micrófono');
 s.run('window.sidevoiceActions.toggleMic()');
 assert.equal(s.run('micEnabled'),true);
 assert.equal(s.run('SessionState.micView(state).pressed'),false);
});
test('The call socket follows the page scheme and host',()=>{
 const s=setup();assert.equal(s.run('roomSocketUrl()'),'wss://room.example/api/presentation/ws');
});
test('Wake lock is released if hangup wins the pending request',async()=>{
 const s=setup();let grant,requests=0,released=0;
 s.context.navigator={wakeLock:{request:()=>{requests++;return new Promise(resolve=>grant=resolve)}}};
 s.run('ws={}');
 const pending=s.run('keepScreenAwake()');
 await s.run('keepScreenAwake()');
 assert.equal(requests,1);
 s.run('ws=null;releaseScreenWakeLock()');
 grant({release:async()=>{released++},addEventListener(){}});
 await pending;
 assert.equal(released,1);assert.equal(s.run('screenWakeLock'),null);
});
test('The tap that starts the call asks for the lock, before there is a socket',async()=>{
 const s=setup();let requests=0;
 s.context.navigator={wakeLock:{request:async()=>{requests++;return {release:async()=>{},addEventListener(){}}}}};
 s.run('connecting=true');
 await s.run('keepScreenAwake()');
 assert.equal(requests,1,'a lock asked for while connecting keeps the gesture Safari needs');
 assert.equal(s.run('screenLock.state'),'on','the light is a fact; ScreenLock paints it');
});
test('A refused lock shows red and says so, instead of failing silently',async()=>{
 const s=setup();
 s.context.navigator={wakeLock:{request:async()=>{throw Error('NotAllowedError')}}};
 s.run('ws={}');
 await s.run('keepScreenAwake()');
 assert.equal(s.run('screenLock.state'),'off');
 assert.match(s.run('screenLock.note'),/No se pudo/);
});
test('A lock the system takes back is asked for again while the call is up, and not after it ends',async()=>{
 const s=setup();let requests=0,release=null;const scheduled=[];
 s.context.setTimeout=fn=>{scheduled.push(fn);return 0};
 s.context.navigator={wakeLock:{request:async()=>{requests++;return {release:async()=>{},addEventListener:(name,fn)=>{if(name==='release')release=fn}}}}};
 s.run('ws={}');
 await s.run('keepScreenAwake()');
 assert.equal(requests,1);
 release();
 assert.equal(s.run('screenLock.state'),'off');
 assert.equal(scheduled.length,1,'the retry waits rather than spinning');
 await scheduled.pop()();
 assert.equal(requests,2);
 s.run('ws=null');
 release();
 assert.equal(scheduled.length,0,'a call that ended does not keep the screen awake');
});
test('Latency turn storage is bounded',()=>{
 const s=setup();s.context.performance={now:()=>100};
 s.run("for(let r=0;r<150;r++)observeLatencyEvent('voice-user-turn',{phase:'finished',thread_id:'a',revision:r})");
 assert.equal(s.run('latencyTurns.size'),128);
});
test('Settings are reached from the header menu',()=>{
 // The ⋯ menu's Settings entry is the very button the runtime opens the dialog from: one entry, nothing relaying to it.
 const s=setup({strictDOM:true});
 assert.equal(typeof s.elements.get('settings-open').onclick,'function');
});
test('Stats omit missing durations and use first reply per turn, only for selected thread',()=>{
 const s=setup({strictDOM:true});
 s.run(`renderLatencyStats({replies:[
 {thread_id:'a',reply_revision:1,status:'playback_finished',input_ms:{endpoint_silence_ms:2000,recognition_ms:450},server_ms:{input_queued_to_reply_received_ms:4000}},
 {thread_id:'a',reply_revision:1,status:'playback_finished',input_ms:{recognition_ms:250},server_ms:{input_queued_to_reply_received_ms:8000}},
 {thread_id:'a',reply_revision:2,status:'failed',server_ms:{input_queued_to_reply_received_ms:6000}},
 {thread_id:'other',reply_revision:3,server_ms:{input_queued_to_reply_received_ms:100000}}
 ]},'a')`);
 assert.equal(s.run("$('stats-recognition').textContent"),'350 ms');
 assert.equal(s.run("$('stats-response').textContent"),'5.00 s');
 assert.equal(s.run("$('stats-rows').children.length"),3);
 assert.equal(s.run("$('stats-rows').children[0].children.length"),6,'turn, four stages, status');
 assert.equal(s.run("$('stats-rows').children[0].children[1].textContent"),'—');
 assert.equal(s.run("$('stats-rows').children[1].children[5].textContent"),'Escuchada');
 for(const value of ['null','undefined','NaN','Infinity','-1','true',"'10'"])
  assert.equal(s.run('statsDuration('+value+')'),'—');
 assert.equal(s.run('statsDuration(0)'),'0 ms');
});
test('Stats modal polls only while open and rejects results from an earlier opening',async()=>{
 const s=setup({strictDOM:true});let polls=0;const pending=[];
 s.context.setTimeout=()=>1;s.context.clearTimeout=()=>{};
 s.context.fetch=(path,options)=>new Promise(resolve=>{polls++;pending.push({path,options,resolve})});
 const first=s.run('openConnectionStats()');
 assert.equal(polls,2);
 await s.run('refreshConnectionStats()');assert.equal(polls,2);
 s.run("$('connection-stats').close()");
 assert.equal(pending[0].options.signal.aborted,true);
 const second=s.run('openConnectionStats()');assert.equal(polls,4);
 const response=(session,duration)=>({session_id:session,replies:[{thread_id:'a',reply_revision:1,server_ms:{input_queued_to_reply_received_ms:duration}}]});
 pending[2].resolve({ok:true,json:async()=>({call:{id:'s'}})});
 pending[3].resolve({ok:true,json:async()=>response('s',1200)});
 await second;assert.equal(s.run("$('stats-response').textContent"),'1.20 s');
 pending[0].resolve({ok:true,json:async()=>({call:{id:'s'}})});
 pending[1].resolve({ok:true,json:async()=>response('s',99000)});
 await first;assert.equal(s.run("$('stats-response').textContent"),'1.20 s');
 s.run("$('connection-stats').close()");await s.run('refreshConnectionStats()');assert.equal(polls,4);
});
test('Stats handle old servers, network failures and other call sessions without fake data',async()=>{
 for(const mode of ['old','offline','other']){
  const s=setup({strictDOM:true});s.context.setTimeout=()=>1;s.context.clearTimeout=()=>{};
  s.context.fetch=async path=>{
   if(mode==='offline')throw Error('Offline');
   if(path.includes('/latency'))return {ok:mode!=='old',status:mode==='old'?404:200,json:async()=>({session_id:'other',replies:[{thread_id:'a',reply_revision:1,server_ms:{input_queued_to_reply_received_ms:10}}]})};
   return {ok:true,json:async()=>({call:{id:'other'}})};
  };
  await s.run('openConnectionStats()');
  assert.equal(s.run("$('stats-response').textContent"),'—');
  assert.equal(s.run("$('stats-rows').children.length"),0);
  assert.match(s.run("$('stats-status').textContent"),mode==='old'?/reiniciarlo/:mode==='offline'?/reintentará/:/Esperando/);
  s.run("$('connection-stats').close()");
 }
});
/* A pipeline change (who transcribes, in what language, how the turn ends) used to hang up. Now the
 * page opens a second socket while the first one is still carrying the call. */
test('Every room query names the browser asking, so the answer is never another device\'s',async()=>{
 const s=setup(),asked=[];
 s.context.fetch=async path=>{asked.push(path);return {ok:true,json:async()=>({binding:{thread_id:'a',title:'A',binding_id:'b'},room:{clients:2},call:{id:'s'}})}};
 await s.run('refresh()');
 assert.equal(asked[0],'/api/presentation?session_id=s');
 assert.equal(s.run("roomQuery('/api/presentation/latency')"),'/api/presentation/latency?session_id=s');
 // Before joining there is no browser to ask about, and the page asks about the room alone.
 s.run("sessionId=null");
 assert.equal(s.run("roomQuery('/api/presentation')"),'/api/presentation');
});

test('A call with no sign of a person asks, then leaves, and only this browser leaves',()=>{
 const s=setup();
 s.run("state.ws={close(){},readyState:1,send(){}};lastPersonSignal=Date.now()-IDLE_MS+30000;checkIdle()");
 assert.equal(s.run('idleWarned'),true,'a minute before, it asks');
 assert.match(s.run('state.liveNote'),/¿Sigues ahí\?/);
 s.run('personSignal()');
 assert.equal(s.run('idleWarned'),false,'any sign of the person answers it');
 assert.equal(s.run('state.liveNote'),'');
 s.run("state.ws={close(){},readyState:1,send(){}};lastPersonSignal=Date.now()-IDLE_MS-1;checkIdle()");
 assert.equal(s.run('state.ws'),null,'with no answer the browser leaves the call');
 assert.match(s.run('roomStore.getState().facts?.joinFailure??state.joinFailure'),/Saliste de la llamada/);
});
test('The waveform bubble draws the level the voice reports, and nothing without a call',()=>{
 const s=setup();
 assert.equal(s.run('window.sidevoiceAudio.readWaveform()'),null,'no call, nothing to draw');
 s.context.__voice=fakeVoice();s.run('voice=__voice;voiceLevel(0.5);voiceLevel(0.25)');
 const wave=Array.from(s.run('window.sidevoiceAudio.readWaveform()'));
 assert.equal(wave.length,256);
 assert.deepEqual(wave.slice(-2).map(Math.abs),[0.5,0.25],'the newest levels last');
 assert.equal(s.run("$('mic-level-meter').getAttribute('aria-valuenow')"),'25');
});
test('Aggregates summarize with nearest-rank percentiles and never turn a missing value into a zero',()=>{
 const s=setup();
 assert.equal(JSON.stringify(s.run('statsSummary([400,100,300,200])')),JSON.stringify({count:4,mean:250,p50:200,p90:400,max:400}));
 assert.equal(JSON.stringify(s.run('statsSummary([700])')),JSON.stringify({count:1,mean:700,p50:700,p90:700,max:700}));
 // Nearest rank: p50 and p90 are values that were measured, never the midpoint between two of them.
 assert.equal(s.run('statsSummary([10,20,30,40,50,60,70,80,90,100]).p90'),90);
 assert.equal(s.run('statsSummary([10,20,30,40,50,60,70,80,90,100,110]).p90'),100);
 assert.equal(s.run('statsSummary([10,20,30]).p50'),20);
 // Whatever is not a finite, non-negative number is not an observation, so it does not enter the sample.
 assert.equal(JSON.stringify(s.run("statsSummary([null,undefined,NaN,Infinity,-1,'20',true,20])")),JSON.stringify({count:1,mean:20,p50:20,p90:20,max:20}));
 assert.equal(JSON.stringify(s.run('statsSummary([])')),JSON.stringify({count:0,mean:null,p50:null,p90:null,max:null}));
 assert.equal(JSON.stringify(s.run('statsSummary(null)')),JSON.stringify({count:0,mean:null,p50:null,p90:null,max:null}));
 assert.equal(JSON.stringify(s.run('statsSummary([0,0])')),JSON.stringify({count:2,mean:0,p50:0,p90:0,max:0}),'a measured zero is a measurement');
});
test('Aggregates keep one row per stage, named as the last-turn view names them',()=>{
 const s=setup();
 const rows=s.run(`statsAggregate([
 {thread_id:'a',input_ms:{endpoint_silence_ms:600,recognition_ms:400},server_ms:{input_queued_to_reply_received_ms:3000,input_queued_to_read_ms:900}},
 {thread_id:'a',input_ms:{endpoint_silence_ms:1000},server_ms:{input_queued_to_reply_received_ms:9000,delivery_accepted_to_read_ms:100}},
 null
 ]).map(row=>[row.key,row.count,row.mean,row.p50,row.p90,row.max])`);
 assert.equal(rows.length,s.run('LATENCY_STAGES.length'),'every stage keeps its row');
 assert.equal(JSON.stringify(rows[0]),JSON.stringify(['endpoint_silence',2,800,600,1000,1000]));
 assert.equal(JSON.stringify(rows[1]),JSON.stringify(['recognition',1,400,400,400,400]));
 assert.equal(JSON.stringify(rows[2]),JSON.stringify(['transcript_to_delivery',0,null,null,null,null]),'a stage nobody measured stays empty, not zero');
 assert.equal(JSON.stringify(rows[3]),JSON.stringify(['delivery_to_read',2,500,100,900,900]),'the read stage falls back to queued → read, as the last-turn view does');
 assert.equal(JSON.stringify(rows[5]),JSON.stringify(['input_queued_to_reply',2,6000,3000,9000,9000]));
 assert.deepEqual(plain(s.run('LATENCY_STAGES.map(stage=>stage[2])')),['endpoint_silence','recognition','transcript_to_delivery','delivery_to_read','read_to_reply','input_queued_to_reply','reply_to_dispatch'],'only what the room still measures');
 assert.equal(s.run("statsAggregate([]).every(row=>row.count===0&&row.max===null)"),true);
});
test('Copying the aggregates puts a plain-text table on the clipboard and says so',async()=>{
 const s=setup();const copied=[];
 s.context.navigator={clipboard:{writeText:async text=>{copied.push(text)}}};
 s.run("people=[{thread_id:'a',title:'Claude'},{thread_id:'b',title:'Astra'}]");
 s.run(`renderLatencyStats({replies:[
 {thread_id:'a',reply_revision:1,input_ms:{endpoint_silence_ms:600},server_ms:{input_queued_to_reply_received_ms:3000}},
 {thread_id:'b',reply_revision:2,server_ms:{input_queued_to_reply_received_ms:21000}}
 ]},'a')`);
 await s.run('copyLatencyAggregates()');
 assert.equal(copied.length,1);
 const lines=copied[0].split('\n');
 assert.match(lines[0],/no se suman/);
 assert.match(lines[3],/^Tramo +n +Media +p50 +p90 +Máx$/);
 assert.match(lines[5],/^Silencio hasta cerrar el turno +1 +600 ms +600 ms +600 ms +600 ms$/);
 assert.equal(lines[3].length,lines[5].length,'the columns line up so the table reads as a table');
 assert.match(lines[4],/^-+ +-+ +-+ +-+ +-+ +-+$/);
 assert.match(copied[0],/Toda la sesión · 2 respuestas medidas/);
 assert.match(copied[0],/Claude · 1 respuesta medida/);
 assert.match(copied[0],/Astra · 1 respuesta medida/);
 assert.equal(s.run("$('stats-aggregates-copied').textContent"),'Copiado como texto.');
 // A browser that refuses the clipboard says so instead of pretending it copied.
 s.context.navigator={};
 await s.run('copyLatencyAggregates()');
 assert.match(s.run("$('stats-aggregates-copied').textContent"),/No se pudo copiar/);
 s.run('renderLatencyStats(null,null)');
 await s.run('copyLatencyAggregates()');
 assert.equal(copied.length,1,'nothing measured, nothing copied');
 assert.match(s.run("$('stats-aggregates-copied').textContent"),/nada que copiar/);
});

test('Selecting a conversation is this tab\'s own choice: it names the session, is remembered per tab and comes back on reconnect',async()=>{
 const s=setup();const store={};const posted=[];
 s.context.sessionStorage={getItem:k=>store[k]??null,setItem(k,v){store[k]=v},removeItem(k){delete store[k]}};s.context.window.sidevoiceUI={setParticipants(){}};
 s.context.fetch=async(path,init)=>{posted.push([path,init?.body?JSON.parse(init.body):null]);
  if(path.includes('/select'))return {ok:true,json:async()=>({status:'activated',binding:{thread_id:'t-1',title:'Uno',binding_id:'b-1'}})};
  return {ok:true,json:async()=>({binding:{thread_id:'t-1',title:'Uno',binding_id:'b-1'},room:{revision:1},clients:[],call:null})}};
 s.run("sessionId='sess-1';ws={readyState:1};roomBinding=null;people=[{thread_id:'t-1',title:'Uno',available:true,reach:{state:'listening'}},{thread_id:'t-2',title:'Dos',available:true,reach:{state:'listening'}}]");
 await s.run('select')('t-1');
 const select=posted.find(([path])=>path.endsWith('/api/presentation/select'));
 assert.deepEqual(select[1],{thread_id:'t-1',session_id:'sess-1'},'the room is told which browser chose');
 assert.equal(store['sidevoice.selected'],'t-1','remembered for this tab only');
 assert.equal(s.run('rememberedThread')(),'t-1');
 // A new socket for this tab (reload, reconnect) goes back to the same conversation and never picks another.
 posted.length=0;s.run("roomBinding=null;sessionId='sess-2'");
 assert.equal(await s.run('reselectRemembered')(),true);
 assert.deepEqual(posted.find(([path])=>path.endsWith('/api/presentation/select'))[1],{thread_id:'t-1',session_id:'sess-2'});
 // With two conversations listening and nothing remembered, the tab lands on the first (2026-09-26).
 delete store['sidevoice.selected'];posted.length=0;s.run("roomBinding=null");
 assert.equal(await s.run('reselectRemembered')(),false);
 assert.equal(await s.run('selectOnlyListeningConversation')(),true);
 assert.equal(posted.filter(([path])=>path.endsWith('/api/presentation/select')).length,1);
});

test('The stats say which build the page runs and which the room serves, and flag a stale page',()=>{
 const s=setup();
 s.context.window.sidevoiceBuildId='page1';
 s.run("roomInfo={version:'0.3.0',web_build:'page1'}");
 assert.equal(JSON.stringify(s.run('versionFacts')()),JSON.stringify([['Versión de la página','page1'],['Versión que sirve la sala','page1 · al día'],['Servidor','0.3.0']]));
 s.run("roomInfo={version:'0.3.0',web_build:'page2'}");
 assert.equal(s.run('versionFacts')()[1][1],'page2 · hay una versión nueva, recarga');
 s.run("roomInfo=null");
 assert.equal(s.run('versionFacts')()[1][1],'—');
});

/* One indicator from the tap to the room: these two tests are the sequence a person reads, and what
 * takes its place when a step fails. */
async function firstSocket(sockets){for(let attempt=0;attempt<200&&!sockets.length;attempt++)await new Promise(resolve=>setTimeout(resolve,2));return sockets[0]}

/* What the room wrote must reach the person, and a tunnel keeps none of it: the close arrived without
 * the 1013 the room closed with, and the error frame it sent just before never came. */
test('Somebody the room refuses reads the room\'s own reason, not the page\'s guess',async()=>{
 const full=setup({strictDOM:true});
 const room=joining(full,{admission:{admitted:false,reason:'room_is_full',
  message:'The room already has the maximum number of browsers connected.',clients:8,max:8}});
 const joined=room.tap();
 const socket=await firstSocket(room.sockets);
 socket.onerror();socket.onclose({code:1006});   // everything the socket could have said, lost on the way
 await joined;
 assert.equal(full.run('roomStore.getState().join.text'),'La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.',
  'the reason came from the room, asked over a request no proxy rewrites');
 assert.deepEqual(room.voice.calls.at(-1),['stop'],'and the voice the join started is stopped');

 // The frame that does arrive says the same thing, by name: one reason, one sentence.
 const told=setup({strictDOM:true});
 const framed=joining(told);
 const tellJoined=framed.tap();
 const telling=await firstSocket(framed.sockets);
 telling.onmessage({data:JSON.stringify({type:'error',data:{reason:'room_is_full',
  message:'The room already has the maximum number of browsers connected.'}})});
 telling.onclose({code:1006});
 await tellJoined;
 assert.equal(told.run('roomStore.getState().join.text'),'La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.');

 // A room that answers nothing at all is not a room that refused: the page says which it was.
 const gone=setup({strictDOM:true});
 const away=joining(gone,{admission:'unreachable'});
 const awayJoined=away.tap();
 const lost=await firstSocket(away.sockets);
 lost.onerror();lost.onclose({code:1006});
 await awayJoined;
 assert.equal(gone.run('roomStore.getState().join.text'),'No se pudo conectar con la sala.');
});
test('A voice that cannot start says why, and opens no socket',async()=>{
 const s=setup({strictDOM:true});
 const room=joining(s,{start:async()=>{throw Object.assign(Error('denied'),{code:'microphone-denied'})}});
 await room.tap();
 assert.match(s.run('roomStore.getState().join.text'),/micrófono está bloqueado para esta página/);
 assert.equal(room.sockets.length,0);
 const missing=setup({strictDOM:true});
 const none=joining(missing,{voice:null});
 await none.tap();
 assert.match(missing.run('roomStore.getState().join.text'),/aún no está disponible/,'a page with no voice module says so');
});
test('The page answers when the room asks whether anybody is still there',()=>{
 // The room asks because a closed tab behind a tunnel leaves its socket up and its seat taken.
 const s=setup();const answered=[],other=[];
 s.context.sentFrame=value=>answered.push(JSON.parse(value));
 s.context.otherFrame=value=>other.push(JSON.parse(value));
 s.run("sessionId='call-1';ws={readyState:1,send(value){sentFrame(value)}}");
 s.run("message(JSON.stringify({type:'voice-ping',data:{session_id:'call-1'}}))");
 assert.equal(answered.at(-1).type,'voice-pong');
 assert.equal(answered.at(-1).data.session_id,'call-1');
 // A frame that came on another socket is answered on that socket, not on the call's.
 s.run("message(JSON.stringify({type:'voice-ping',data:{session_id:'call-2'}}),{readyState:1,send(value){otherFrame(value)}})");
 assert.equal(other.at(-1).data.session_id,'call-2');
 assert.equal(answered.length,1,'the call\'s socket was not made to answer for the other one');
});

/* The trace is the page's: the room announces a turn, this page opens the span and hands the room
 * its traceparent. These tests drive the same functions the socket does, with a stub in the place
 * the OpenTelemetry SDK takes when a collector is configured — and with none, to prove a room
 * without one costs the call nothing. */
function tracing({installed=true}={}){
 const s=setup(),calls=[],sent=[];
 // The controller measures with performance.now(); the sandbox has no clock of its own.
 let tick=0;s.context.performance={now:()=>(tick+=10)};
 s.context.globalSend=text=>sent.push(JSON.parse(text));
 if(installed)s.context.window.sidevoiceTelemetry={
  startCall:values=>{calls.push(['startCall',values]);return '00-11111111111111111111111111111111-2222222222222222-01'},
  noteSession:id=>calls.push(['noteSession',id]),
  endCall:reason=>calls.push(['endCall',reason]),
  startTurn:(thread,revision)=>{calls.push(['startTurn',thread,revision]);return '00-11111111111111111111111111111111-3333333333333333-01'},
  endTurn:(thread,revision,outcome)=>calls.push(['endTurn',thread,revision,outcome]),
  stage:(thread,revision,stage,ms)=>calls.push(['stage',thread,revision,stage,ms]),
  audioEvent:(kind,values)=>calls.push(['audioEvent',kind,JSON.parse(JSON.stringify(values))])
 };
 s.run("ws={readyState:1,send:text=>globalSend(text)};sessionId='s'");
 return {s,calls,sent};
}
test('A turn the room announces opens a span here and reaches the room as a traceparent',()=>{
 const {s,calls,sent}=tracing();
 s.run("observeLatencyEvent('voice-user-turn',{phase:'started',thread_id:'a',revision:4})");
 assert.deepEqual(calls[0],['startTurn','a',4]);
 assert.equal(sent.length,1);
 assert.equal(sent[0].type,'voice-turn-trace');
 assert.deepEqual([sent[0].data.thread_id,sent[0].data.revision,sent[0].data.session_id],['a',4,'s']);
 assert.match(sent[0].data.traceparent,/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
 // A turn the room takes back is a turn whose span ends here, with why.
 s.run("observeLatencyEvent('voice-user-turn',{phase:'cancelled',thread_id:'a',revision:4,merged:true})");
 assert.deepEqual(calls.at(-1),['endTurn','a',4,'merged']);
});
test('A correlated harness end closes telemetry once even while a newer turn keeps the thread working',()=>{
 const {s,calls}=tracing();
 s.run("observeLatencyEvent('voice-user-turn',{phase:'started',thread_id:'a',revision:4})");
 s.run("state.turns=recordReply(state,{session_id:'s',thread_id:'a',revision:4})");
 const stopped=JSON.stringify(JSON.stringify({type:'voice-conversation',data:{thread_id:'a',working:true,turn_id:'codex-turn',turn_phase:'end',session_id:'s',revision:4}}));
 s.run(`message(${stopped})`);s.run(`message(${stopped})`);
 assert.deepEqual(calls.filter(call=>call[0]==='endTurn'),[['endTurn','a',4,'harness_finished']]);
 assert.equal(s.run('roomStore.getState().session.working'),true);
});

// ----- what the room plays back when this browser comes back -----
// Driving out of a tunnel, the transcript has the text and the driver cannot read it. The page's part
// is naming the sessions it used, saying on the bubble that a reply is a repetition, and stopping.
// ----- this device's pairing with a machine (`device-pairing.js`, `rendezvous.js`) -----
/** A machine as far as the page can tell: a P-256 key, and the answers only the holder of that key can give. */
async function fakeNode(host='macbook'){
 const {subtle}=globalThis.crypto;
 const keys=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const spki=Buffer.from(await subtle.exportKey('spki',keys.publicKey));
 return {host,public_key:spki.toString('base64'),fp:Buffer.from(await subtle.digest('SHA-256',spki)).toString('base64url'),tokens:new Set(),
  sign:async nonce=>Buffer.from(await subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from('sidevoice-node-identity:'+nonce))).toString('base64url')};
}
const pairingOf=(node,extra={})=>({fp:node.fp,public_key:node.public_key,host:node.host,urls:['http://127.0.0.1:8768'],rv:{url:'https://room.example',node:'mac'},device_id:'dev-1',token:'tok-1',paired_at:1,...extra});
/** The network the page sees: which machine answers at which address, what the target and the room say, and every request. */
function network({at={},target=null,roomSays=null,refuse=false}={}){
 const asked=[];
 const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
 const get=async(url,init={})=>{
  const auth=init.headers?.Authorization||null;asked.push({method:init.method||'GET',url,auth,init});
  if(url==='/api/rendezvous')return target?reply(200,target):reply(404,{detail:'Not Found'});
  if(url.startsWith('https://room.example/api/rendezvous?nodes='))return roomSays==null?reply(502,{}):reply(200,{kind:'room',nodes:[{id:'mac',connected:roomSays}]});
  const base=Object.keys(at).find(prefix=>url.startsWith(prefix+'/api/'));
  if(base==null)throw new TypeError('Failed to fetch');
  const node=at[base],path=url.slice(base.length);
  if(path.startsWith('/api/device/identity?nonce='))return reply(200,{fingerprint:node.fp,public_key:node.public_key,host:node.host,signature:await node.sign(decodeURIComponent(path.split('nonce=')[1]))});
  if(path==='/api/device/pair'){const body=JSON.parse(init.body);if(body.secret!=='fresh')return reply(403,{detail:'Código de emparejamiento desconocido, usado o caducado.'});node.tokens.add('tok-new');return reply(200,{device_id:'dev-9',token:'tok-new',node:{fingerprint:node.fp,public_key:node.public_key,host:node.host}})}
  if(refuse||!node.tokens.has(String(auth).replace('Bearer ','')))return reply(401,{detail:'Dispositivo no emparejado con esta máquina.'});
  return reply(200,{binding:null,participants:[],messages:[],room:{revision:0},clients:[],call:null});
 };
 return {get,asked};
}
function codeFor(node,extra={}){
 return 'SV1.'+Buffer.from(JSON.stringify({v:1,fp:node.fp,host:node.host,urls:['http://127.0.0.1:8768'],rv:{url:'https://room.example',node:'mac'},secret:'fresh',exp:Math.floor(Date.now()/1000)+600,...extra})).toString('base64url');
}
function socketsOf(s){
 const sockets=[];
 s.context.WebSocket=class{constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 return sockets;
}
const stored=s=>JSON.parse(s.saved['sidevoice.pairings']||'null');

test('The machine in use is reached at the first of its addresses that proves it is that machine, and the token goes nowhere else',async()=>{
 const node=await fakeNode(),squatter=await fakeNode('squatter');node.tokens.add('tok-1');
 const s=setup({paired:false,stored:{in_use:node.fp,pairings:[pairingOf(node)]}});
 // The loopback URL answers as someone else; the machine is behind its room.
 const net=network({at:{'http://127.0.0.1:8768':squatter,'https://room.example/nodes/mac':node}});s.context.fetch=net.get;
 await s.run('locate({move:true,fresh:true})');
 assert.equal(s.run('nodeBase'),'https://room.example/nodes/mac');
 assert.equal(s.run('state.rendezvous'),'room');
 assert.equal(s.run('roomStore.getState().machines[0].state'),'connected');
 assert.equal(s.run('roomStore.getState().machines[0].reachLabel'),undefined,'normal host rows do not expose the route');
 await s.run('refresh()');
 assert.ok(net.asked.some(r=>r.url==='https://room.example/nodes/mac/api/presentation?session_id=s'&&r.auth==='Bearer tok-1'));
 assert.equal(net.asked.filter(r=>r.url.startsWith('http://127.0.0.1')&&r.auth).length,0,'nothing carrying the token went to the address that could not prove itself');
 // Within a few minutes a proven address is not asked to prove itself again.
 net.asked.length=0;await s.run('locate()');
 assert.equal(net.asked.length,0);
 // Once the machine answers directly, a fresh look prefers it: the contract's order, not the fastest.
 const direct=network({at:{'http://127.0.0.1:8768':node,'https://room.example/nodes/mac':node}});s.context.fetch=direct.get;
 await s.run('locate({move:true,fresh:true})');
 assert.equal(s.run('nodeBase'),'http://127.0.0.1:8768');
 assert.equal(s.run('roomStore.getState().machines[0].state'),'connected');
 assert.equal(s.run('roomStore.getState().machines[0].reachLabel'),undefined,'normal host rows do not expose the route');
});

test('The native local pairing is projected before selection validation and uses only its per-launch proxy',async()=>{
 const local={fp:'fp-local',public_key:'pk-local',host:'MacBook',device_id:'local-device',token:'local-session-secret',urls:['http://127.0.0.1:43127'],rv:null};
 const bridge={state:()=>({state:'running',reachable:true,installed:true,service:'launchd',core:{version:'1.0',api:1}}),subscribe:()=>()=>{},pairing:()=>local};
 const s=setup({paired:false,stored:{in_use:'fp-local',pairings:[PAIRED]},localHost:bridge}),asked=[];
 s.context.fetch=async(url,options={})=>{asked.push([String(url),options]);return {ok:true,status:200,json:async()=>({participants:[],messages:[],binding:null,call:null}),text:async()=>''}};
 await new Promise(resolve=>setTimeout(resolve,10));
 const snapshot=s.run('roomStore.getState()');
 assert.equal(snapshot.facts.pairingInUse,'fp-local');
 assert.equal(snapshot.facts.machinesReady,true);
 assert.equal(snapshot.facts.nodeReach,'ok');
 assert.equal(s.run('nodeBase'),'http://127.0.0.1:43127');
 assert.equal(JSON.stringify(snapshot.machines.map(machine=>[machine.id,machine.local])),JSON.stringify([['local-host',true],[PAIRED.fp,false]]));
 assert.equal(asked.some(([url])=>url.includes('/api/device/identity?nonce=')),false,'native already verified the identity over its local socket');
 assert.ok(asked.every(([url])=>url.startsWith('http://127.0.0.1:43127/')),'the session token stays on the app-owned proxy');
 const saved=JSON.parse(s.saved['sidevoice.pairings']);
 assert.equal(saved.in_use,'fp-local');
 assert.deepEqual(saved.pairings.map(pairing=>pairing.fp),[PAIRED.fp]);
 assert.equal(JSON.stringify(saved).includes('local-session-secret'),false,'the proxy credential never reaches page storage');
});

test('A local row survives reload with no native pairing or stored local fingerprint',async()=>{
 const status={state:'backoff',reachable:false,attempts:3,limit:8};
 const bridge={state:()=>status,subscribe:()=>()=>{},pairing:()=>null};
 const s=setup({paired:false,stored:{in_use:'@sidevoice/local-host',pairings:[PAIRED]},localHost:bridge,localHostSelected:true});
 await new Promise(resolve=>setTimeout(resolve,10));
 const snapshot=s.run('roomStore.getState()'),local=snapshot.machines.find(machine=>machine.local);
 assert.ok(local,'the native failure still projects a local machine row');
 assert.equal(local.id,'local-host');
 assert.equal(local.inUse,true);
 assert.equal(local.selectable,false);
 assert.equal(snapshot.facts.localHostSelected,true);
 assert.equal(snapshot.facts.pairingInUse,'@sidevoice/local-host');
 assert.equal(s.run('nodeBase'),null);
 assert.equal(snapshot.facts.nodeReach,'away');
 assert.equal(JSON.stringify(local).includes('127.0.0.1'),false);
 assert.equal(JSON.stringify(local).includes('local-session-secret'),false);
 const saved=JSON.parse(s.saved['sidevoice.pairings']);
 assert.equal(saved.in_use,'@sidevoice/local-host');
 assert.deepEqual(saved.pairings.map(pairing=>pairing.fp),[PAIRED.fp]);
 assert.equal(s.saved['sidevoice.local-host-selected'],'true');
});

test('A native status event that wins the initial state read still completes machine readiness',async()=>{
 let resolveInitialState,onStatus;
 const bridge={state:()=>new Promise(resolve=>{resolveInitialState=resolve}),subscribe:listener=>{onStatus=listener;return()=>{}},pairing:()=>null};
 const s=setup({paired:false,stored:null,localHost:bridge});
 await Promise.resolve();
 assert.equal(typeof resolveInitialState,'function','the initial native state read is pending');
 onStatus({state:'backoff',reachable:false,attempts:2,limit:8});
 assert.equal(s.run('roomStore.getState().facts.machinesReady'),true,'an accepted native report makes the host view ready immediately');
 resolveInitialState({state:'running',reachable:true});
 await new Promise(resolve=>setTimeout(resolve,10));
 const snapshot=s.run('roomStore.getState()');
 assert.equal(snapshot.facts.machinesReady,true);
 assert.equal(snapshot.facts.localHostStatus.state,'backoff','the older initial result cannot overwrite a newer native report');
 assert.equal(snapshot.machines[0].id,'local-host');
});

test('A lost local pairing clears its per-launch locator and a reachable non-running core restores routing with fresh credentials',async()=>{
 const oldLocal={fp:'fp-local',public_key:'pk-local',host:'MacBook',device_id:'local-device',token:'old-launch-secret',urls:['http://127.0.0.1:43127'],rv:null};
 const nextLocal={...oldLocal,token:'new-launch-secret',urls:['http://127.0.0.1:43218']};
 let status={state:'running',reachable:true,installed:true,service:'launchd'},pairing=oldLocal,onStatus=()=>{},pendingPairing=null;
 const bridge={state:()=>status,subscribe:listener=>{onStatus=listener;return()=>{}},pairing:()=>pendingPairing||pairing};
 const s=setup({paired:false,stored:{in_use:'fp-local',pairings:[]},localHost:bridge});
 const asked=[];
 s.context.fetch=async(url,options={})=>{asked.push([String(url),options]);return{ok:true,status:200,json:async()=>({participants:[],messages:[],binding:null,call:null}),text:async()=>''}};
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(s.run('nodeBase'),'http://127.0.0.1:43127');
 assert.equal(s.run('state.nodeReach'),'ok');

 let resolveStalePairing;
 pendingPairing=new Promise(resolve=>{resolveStalePairing=resolve});
 status={state:'starting',reachable:true,installed:true,service:'launchd'};onStatus(status);
 await Promise.resolve();
 status={state:'stopped-by-person',reachable:false,installed:true,service:'launchd'};pairing=null;pendingPairing=null;onStatus(status);
 resolveStalePairing(oldLocal);
 await new Promise(resolve=>setTimeout(resolve,0));
 let snapshot=s.run('roomStore.getState()');
 assert.equal(s.run('nodeBase'),null,'the per-launch proxy is cleared as soon as reachability is lost');
 assert.equal(snapshot.facts.node,null);
 assert.equal(snapshot.facts.nodeReach,'away');
 assert.equal(snapshot.machines[0].id,'local-host');
 assert.equal(snapshot.machines[0].inUse,true);
 assert.equal(snapshot.machines[0].selectable,false);
 assert.equal(JSON.stringify(snapshot).includes('old-launch-secret'),false);
 assert.equal(JSON.stringify(snapshot).includes('127.0.0.1:43127'),false);
 assert.equal(JSON.stringify(JSON.parse(s.saved['sidevoice.pairings'])).includes('old-launch-secret'),false);

 status={state:'stopped-by-person',reachable:true,installed:true,service:'launchd'};pairing=nextLocal;onStatus(status);
 await new Promise(resolve=>setTimeout(resolve,10));
 snapshot=s.run('roomStore.getState()');
 assert.equal(s.run('nodeBase'),'http://127.0.0.1:43218');
 assert.equal(snapshot.facts.nodeReach,'ok');
 assert.equal(snapshot.machines[0].state,'connected','native reachable remains usable although the service state is not running');
 assert.equal(snapshot.machines[0].selectable,true);
 assert.deepEqual([...s.run('callProtocols()')],['sidevoice','sidevoice.token.new-launch-secret']);
 assert.equal(asked.some(([url])=>url.includes('/api/device/identity?nonce=')),false,'native already verified this local identity');
 const requestsBeforeRecovery=asked.length;
 await s.run("refreshPeople()");
 assert.ok(asked.slice(requestsBeforeRecovery).every(([url,options])=>!options.headers?.Authorization||options.headers.Authorization==='Bearer new-launch-secret'), 'only the current per-launch secret is sent after recovery');
});

test('A device paired with nothing gets explicit pairing on join, not an automatic dialog on load',async()=>{
 const s=setup({paired:false});const sockets=socketsOf(s);const net=network();s.context.fetch=net.get;
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(s.run('roomStore.getState().pairing.open'),false,'the onboarding screen keeps pairing explicit');
 assert.match(s.run('roomStore.getState().join.text'),/no está emparejado con ninguna máquina/);
 await s.run('toggleCall()');
 assert.equal(s.run('roomStore.getState().pairing.open'),true,'joining asks for the code instead');
 assert.equal(s.run('state.connecting'),false);
 assert.equal(sockets.length,0);
 await s.run('refresh()');await s.run('refreshHistory()');await s.run('refreshPeople()');
 assert.deepEqual(net.asked,[],'nothing of a machine was asked');
});

test('A code is redeemed where its machine proves itself, and the page starts talking to it with the new token',async()=>{
 const node=await fakeNode();
 const s=setup({paired:false});const net=network({at:{'http://127.0.0.1:8768':node}});s.context.fetch=net.get;
 s.context.location={protocol:'https:',host:'room.example',origin:'https://room.example'};
 // A code that cannot be used says why, and keeps nothing.
 await assert.rejects(s.run('window.sidevoiceActions.pairDevice')(codeFor(node,{exp:1}),'Mi portátil'),/caducó/);
 await assert.rejects(s.run('window.sidevoiceActions.pairDevice')(codeFor(node,{secret:'used'}),'Mi portátil'),/desconocido, usado o caducado/);
 assert.equal(stored(s),null);
 s.run("openPairing()");
 const answer=await s.run('window.sidevoiceActions.pairDevice')(codeFor(node),'Mi portátil');
 assert.equal(answer.host,'macbook');
 const pair=net.asked.find(r=>r.url==='http://127.0.0.1:8768/api/device/pair'&&JSON.parse(r.init.body).secret==='fresh');
 assert.deepEqual(JSON.parse(pair.init.body),{secret:'fresh',name:'Mi portátil'});
 assert.equal(stored(s).in_use,node.fp);
 assert.equal(stored(s).pairings[0].token,'tok-new','the token is kept on this device');
 assert.doesNotMatch(JSON.stringify(s.run('roomStore.getState().facts.pairings')),/tok-new/,'and never reaches the interface\'s store');
 assert.equal(s.run('roomStore.getState().pairing.open'),false,'the dialog closes');
 assert.equal(s.run('nodeBase'),'http://127.0.0.1:8768','the address that proved itself is the one used');
 assert.equal(s.run('roomStore.getState().machines[0].inUse'),true);
 await s.run('refresh()');
 assert.equal(net.asked.at(-1).auth,'Bearer tok-new');
});

test('Usar changes machine: it hangs up, joins the other machine\'s call, and the choice is kept on this device',async()=>{
 const mac=await fakeNode('macbook'),pc=await fakeNode('linux');
 const s=setup({stored:{in_use:mac.fp,pairings:[pairingOf(mac),pairingOf(pc,{token:'tok-pc',urls:['http://10.0.0.9:8768']})]}});
 s.run(`people=[{thread_id:'a',title:'A',available:true}];ws={readyState:1};var calls=[];disconnect=()=>{calls.push('hang-up');ws=null};toggleCall=async()=>{calls.push('join '+pairings.inUse.slice(0,4))}`);
 s.run(`window.sidevoiceActions.chooseMachine(${JSON.stringify(pc.fp)})`);
 assert.equal(JSON.stringify(s.run('calls')),JSON.stringify(['hang-up','join '+pc.fp.slice(0,4)]),'hung up first, then joined the other one\'s call');
 assert.equal(stored(s).in_use,pc.fp);
 assert.equal(s.run('people.length'),0,'the other machine\'s conversations are not this one\'s');
 assert.equal(s.run('roomBinding'),null);
 assert.equal(s.run('nodeBase'),null,'the other machine proves where it is before anything is asked of it');
 // The one in use, or one this device is not paired with, changes nothing.
 s.run("calls.length=0;ws={readyState:1}");
 s.run(`window.sidevoiceActions.chooseMachine(${JSON.stringify(pc.fp)});window.sidevoiceActions.chooseMachine('gone')`);
 assert.equal(s.run('calls.length'),0);
});

test('Olvidar forgets the machine here at once, and asks it to revoke this device only where it proves itself',async()=>{
 const mac=await fakeNode('macbook'),pc=await fakeNode('linux'),squatter=await fakeNode('squatter');
 const s=setup({stored:{in_use:mac.fp,pairings:[pairingOf(mac),pairingOf(pc,{token:'tok-pc',device_id:'dev-pc',urls:['http://10.0.0.9:8768'],rv:null})]}});
 const net=network({at:{'':mac,'http://10.0.0.9:8768':squatter}});s.context.fetch=net.get;
 // The one in use, at the address that proved itself a moment ago.
 await s.run(`window.sidevoiceActions.forgetMachine(${JSON.stringify(mac.fp)})`);
 const revoke=net.asked.find(r=>r.method==='DELETE');
 assert.equal(revoke.url,'/api/device/devices/dev-1');
 assert.equal(revoke.auth,'Bearer tok-1');
 assert.deepEqual(stored(s).pairings.map(p=>p.fp),[pc.fp]);
 assert.equal(stored(s).in_use,pc.fp,'the one left is the one in use');
 assert.equal(s.run('roomStore.getState().machines.length'),1);
 // The other one's only address answers as somebody else: forgotten here, and its token sent nowhere.
 net.asked.length=0;
 await s.run(`window.sidevoiceActions.forgetMachine(${JSON.stringify(pc.fp)})`);
 assert.equal(net.asked.filter(r=>r.method==='DELETE').length,0);
 assert.equal(net.asked.filter(r=>r.auth==='Bearer tok-pc').length,0);
 assert.deepEqual(stored(s),{in_use:null,pairings:[]});
 assert.equal(s.run('state.nodeReach'),'unpaired');
});

test('A machine the room cannot reach is not a full room: its own sentence, and not a refusal to stop at',async()=>{
 const s=setup();s.context.crypto={randomUUID:()=>'hello-id'};
 const refused=async frame=>{const socket={send(){},close(){}},pending=s.run('openSession')(socket,{});
  if(frame)socket.onmessage({data:JSON.stringify({type:'error',data:frame})});
  socket.onclose({code:1013});return pending.then(()=>null,error=>error)};
 const away=await refused({message:'Esa máquina no está conectada a la sala ahora mismo.',reason:'node_offline'});
 assert.equal(away.message,'Esa máquina no está conectada a la sala ahora mismo.');
 assert.equal(away.refused,false,'a machine restarting may be back at the next attempt');
 const full=await refused(null);
 assert.match(full.message,/máximo de dispositivos/,'the close code alone still means a full room');
 assert.equal(full.refused,true);
});
// ----- a dropped call taken back as it was -----
// The room numbers its frames, parks a dropped call and takes it back on a hello naming the session, its single-use
// token and the last frame handled. Here the room is the test: it answers each hello and replays what it is told to.
const settleSoon=()=>new Promise(resolve=>setTimeout(resolve,5));
// A tab's sessionStorage, which a reload of the same tab finds as it was.
const storageOf=store=>({getItem:key=>key in store?store[key]:null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}});
test('Within the grace a drop is not shown and holds no control; past it, one line, and the voice goes on as it was',async()=>{
 const graces=[];
 const c=await callOnRoom({timers:(fn,ms,...rest)=>ms===30000?(graces.push(fn),0):setTimeout(fn,ms,...rest)});const {s,first,voice}=c;
 assert.equal(s.run('RECONNECT_GRACE_MS'),30000);
 const view=()=>s.run('roomStore.getState()');
 c.drop(first);
 const asked=voice.calls.length;
 await c.until(()=>c.sockets.length===2,'an attempt');
 assert.equal(view().join,null,'no line');
 assert.equal(view().call.busy,false);
 assert.equal(view().call.joined,true,'still a call: the button hangs up');
 assert.equal(view().session.tab,'listening');
 assert.doesNotMatch(view().live,/Reconectando|Entra en la sala/);
 assert.equal(view().mic.disabled,false);
 s.run('window.sidevoiceActions.toggleMic()');
 assert.equal(s.run('micEnabled'),false,'muting works during the grace');
 assert.deepEqual(voice.calls.at(-1),['mute',true]);
 graces.forEach(fn=>fn());
 assert.match(view().join.text,/Reconectando con la sala/);
 assert.equal(view().call.busy,true);
 assert.equal(view().session.tab,'reconnecting');
 assert.equal(view().mic.disabled,false);
 c.sockets.at(-1).onclose({code:1006});
 await c.until(()=>c.sockets.length===3,'another attempt');
 await c.answer({session_id:'s1',resume:{token:'tok-b',seconds:60},resumed:true});
 await c.until(()=>!s.run('state.reconnecting'),'back in the call');
 assert.deepEqual([...new Set(voice.calls.slice(asked).map(([name])=>name))],['mute'],'the voice went on through the drop, told nothing but the mute');
 assert.equal(view().join,null);
 assert.equal(view().call.busy,false);
});
test('A reload takes the call back: the tab keeps the ticket, the next join sends it, and a hang-up forgets it',async()=>{
 const c=await callOnRoom();const {s,first}=c;
 c.push(first,{type:'voice-ping',seq:1,data:{session_id:'s1'}});
 c.push(first,{type:'voice-ping',seq:2,data:{session_id:'s1'}});
 // The page goes away: it parks its call rather than hanging up, and leaves the ticket for the next load.
 first.close=function(code){this.closedWith=code;this.readyState=3};
 s.handlers.beforeunload();
 assert.equal(first.readyState,3);
 assert.equal(first.closedWith,undefined,'not 1000: the room parks the call');
 assert.deepEqual(JSON.parse(c.store['sidevoice.resume']),{session_id:'s1',token:'tok-a',last_seq:2});
 // The next load of the same tab joins with it.
 const next=setup(),{sockets,tap}=joining(next);
 next.context.sessionStorage=storageOf(c.store);next.context.crypto={randomUUID:()=>'hello-id'};
 const joined=tap();
 const socket=await firstSocket(sockets);socket.readyState=1;socket.onopen();
 assert.deepEqual(plain(JSON.parse(socket.sent[0]).data.resume),{session_id:'s1',token:'tok-a',last_seq:2});
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'s1',resume:{token:'tok-b',seconds:60},resumed:true}})});
 await joined;
 assert.equal(next.run('sessionId'),'s1','the same session, taken back');
 // What the page had handled before the reload is not handled again.
 socket.onmessage({data:JSON.stringify({type:'voice-ping',seq:2,data:{session_id:'s1'}})});
 socket.onmessage({data:JSON.stringify({type:'voice-ping',seq:3,data:{session_id:'s1'}})});
 assert.equal(socket.sent.filter(m=>typeof m==='string'&&JSON.parse(m).type==='voice-pong').length,1);
 assert.equal(JSON.parse(c.store['sidevoice.resume']).token,'tok-b','the rotated token is what is kept');
 next.run('window.sidevoiceActions.toggleCall()');
 assert.equal(c.store['sidevoice.resume'],undefined,'a hang-up forgets it');
});

// ----- the call's voice: the VoiceHost the page drives, here a fake that records what it was asked -----
function fakeVoice({start=async()=>{},setSettings=async()=>{}}={}){
 const on={},calls=[],said=[];
 const sub=name=>listener=>{(on[name]||=new Set()).add(listener);return ()=>on[name].delete(listener)};
 // What the voice is asked to say: a handle the test steps through (`step`), as the voice's own goes.
 const say=(text,options)=>{
  calls.push(['say',text,options]);const listeners=new Set();
  const handle={id:'say-'+(said.length+1),text,options,cancelled:false,
   cancel(){handle.cancelled=true;calls.push(['cancel',handle.id])},
   onEvent(listener){listeners.add(listener)},step(event){for(const listener of listeners)listener(event)}};
  said.push(handle);return handle;
 };
 return {calls,said,emit:(name,value)=>{for(const listener of on[name]||[])listener(value)},
  setSettings:async settings=>{calls.push(['setSettings',settings]);await setSettings(settings)},start:async()=>{calls.push(['start']);await start()},stop:async()=>{calls.push(['stop'])},
  say,mute:muted=>calls.push(['mute',muted]),cancelInput:()=>calls.push(['cancelInput']),
  onTurn:sub('turn'),onState:sub('state'),onLevel:sub('level'),onError:sub('error')};
}
// The desktop app's engine as the page reads it (`host.engine`): its catalogues, and the keys it keeps per provider.
function fakeEngine(catalogs){
 const calls=[],keys={};
 return {calls,catalogs:async()=>catalogs.map(catalog=>catalog.id==='local'||keys[catalog.id]?catalog:{...catalog,status:{stale:false,reason:{code:'credential-missing',params:{}}},models:[]}),
  setCredential:async(provider,key)=>{calls.push(['setCredential',provider,key]);if(key)keys[provider]=true;else delete keys[provider]},hasCredential:async provider=>!!keys[provider]};
}
// The desktop app's place for the voice is where the page finds it: `null` is a page with no voice at all.
function withVoice(s,voice,engine){const desktop=s.context.window.__sidevoiceDesktop||{};s.context.window.__sidevoiceDesktop={...desktop,host:{...desktop.host,...(voice?{voice}:{}),...(engine?{engine}:{})}};return voice}
function joining(s,{admission={admitted:true,reason:null,message:null,clients:1,max:8},start,voice=fakeVoice({start})}={}){
 const sockets=socketsOf(s);
 s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.context.fetch=async path=>{if(admission==='unreachable'&&path.includes('/admission'))throw Error('Failed to fetch');return {ok:true,json:async()=>
  path.includes('/admission')?admission
  :path.includes('/participants')?{participants:[{thread_id:'t-1',title:'Astra',available:true,reach:{state:'listening'}}]}
  :{binding:null,room:{revision:0},clients:[],call:null,participants:[]}}};
 withVoice(s,voice);
 s.run("keepScreenAwake=()=>{};people=[{thread_id:'t-1',title:'Astra',available:true,reach:{state:'listening'}}]");
 return {sockets,voice,tap:()=>s.run('toggleCall')()};
}
async function callOnRoom({timers=null,indexedDB=null,outboxScope=null}={}){
 const s=setup({indexedDB,outboxScope});const sockets=socketsOf(s);let ids=0;
 s.context.crypto={randomUUID:()=>'id-'+(++ids)};
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});
 const store={'sidevoice.selected':'a'};s.context.sessionStorage=storageOf(store);
 if(timers)s.context.setTimeout=timers;
 const voice=withVoice(s,fakeVoice());
 s.context.fetch=async()=>({ok:true,status:200,json:async()=>({binding:{thread_id:'a',title:'A',binding_id:'b'},room:{revision:0},clients:[],call:null,participants:[],messages:[]})});
 s.run("RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);keepScreenAwake=()=>{};roomBinding={thread_id:'a',title:'A',binding_id:'b'}");
 const frames=socket=>socket.sent.filter(m=>typeof m==='string').map(m=>JSON.parse(m));
 const until=async(check,what)=>{for(let i=0;i<500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,2))}assert.fail('never: '+what)};
 // The room answers the newest socket's hello.
 const answer=async data=>{const socket=sockets.at(-1);socket.readyState=1;socket.onopen();const hello=JSON.parse(socket.sent[0]);
  socket.onmessage({data:JSON.stringify({type:'voice-session',data})});await settleSoon();return {socket,hello}};
 const push=(socket,frame)=>socket.onmessage({data:JSON.stringify(frame)});
 const drop=socket=>{socket.readyState=3;socket.onclose({code:1006})};
 const joined=s.run('toggleCall')();
 await until(()=>sockets.length===1,'the call socket');
 const {socket,hello}=await answer({session_id:'s1',resume:{token:'tok-a',seconds:60},resumed:false});await joined;
 return {s,sockets,voice,store,frames,answer,push,drop,until,first:socket,firstHello:hello};
}
// What the page sent the room, of one type, without what every frame carries.
const sentOf=(c,socket,type)=>c.frames(socket).filter(m=>m.type===type).map(m=>m.data);
// The voice's turn events, as it reports them.
const started=(turn_id,at=1)=>({turn_id,phase:'started',started_at:at});
const finished=(turn_id,text)=>({turn_id,phase:'finished',text,started_at:1,ended_at:2,merged:false,timings:{audio_ms:900,endpoint_silence_ms:400,recognition_ms:600}});
// The message the page sent for a turn's phase.
const turnSent=(c,socket,turn_id,phase)=>sentOf(c,socket,'voice-user-turn').filter(d=>d.turn_id===turn_id&&d.phase===phase);

test('A call subscribes to its voice, chooses, starts it, and only then joins the room with the hello the room takes',async()=>{
 const c=await callOnRoom();const {voice,firstHello}=c;
 assert.deepEqual(voice.calls.map(([name])=>name).slice(0,3),['setSettings','start','mute']);
 assert.deepEqual(plain(voice.calls[0][1]),plain(c.s.run('voiceSettings')),'the settings this device keeps');
 assert.equal(firstHello.type,'client-ready');
 assert.deepEqual(Object.keys(firstHello.data).sort(),['conversation','ui_language']);
 assert.equal(firstHello.data.conversation,'a');
 assert.equal(c.s.run('sessionId'),'s1');
 c.s.run('window.sidevoiceActions.toggleCall()');
 assert.deepEqual(voice.calls.at(-1),['stop'],'a hang-up stops the voice');
});
test('A turn is said by its name in messages of the page\'s own, and its end follows its start without waiting for the room\'s answer',async()=>{
 const c=await callOnRoom();const {voice,first,s}=c;
 voice.emit('turn',started('u1',1000));
 voice.emit('turn',finished('u1','Hola'));
 const turns=sentOf(c,first,'voice-user-turn');
 assert.deepEqual(plain(turns.map(d=>[d.phase,d.turn_id,d.offline,d.session_id])),[['started','u1',null,'s1'],['finished','u1',null,'s1']],'one socket keeps them in order');
 assert.ok(turns[0].client_msg_id&&turns[0].client_msg_id!==turns[1].client_msg_id,'each a message of its own');
 assert.equal(turns[0].started_at,1000);
 assert.deepEqual(plain(turns[1].timings_ms),{audio_ms:900,endpoint_silence_ms:400,recognition_ms:600},'the voice\'s timings under the room\'s name');
 assert.equal('timings' in turns[1],false);
 assert.deepEqual([turns[1].text,turns[1].ended_at,turns[1].merged],['Hola',2,false]);
 assert.equal(s.run('history.at(-1).text'),'Hola');
 assert.equal(s.run('history.at(-1).delivery'),'pending');
 assert.equal(s.run('history.at(-1).segment'),'s1:user-turn:u1');
 const asked=voice.calls.length;
 c.push(first,{type:'voice-user-turn',data:{session_id:'s1',phase:'started',turn_id:'u1',revision:7,thread_id:'a'}});
 assert.equal(voice.calls.length,asked,'the room\'s answer is the page\'s: the voice is told nothing');
 for(const turn of turns)c.push(first,{type:'voice-ack',data:{client_msg_id:turn.client_msg_id}});
 assert.equal(s.run('outbox.list().length'),0,'acknowledged, forgotten');
});
test('Words said while the room was away go as their own offline message; a start the room refused does too',async()=>{
 const c=await callOnRoom();const {s,voice,first}=c;
 c.drop(first);
 voice.emit('turn',started('u2'));
 voice.emit('turn',finished('u2','Sin sala'));
 await c.until(()=>c.sockets.length===2,'an attempt');
 const {socket}=await c.answer({session_id:'s2',resume:{token:'new'},resumed:false});
 await c.until(()=>sentOf(c,socket,'voice-user-turn').length===1,'the words, once the new session holds');
 assert.deepEqual(plain(sentOf(c,socket,'voice-user-turn').map(d=>[d.phase,d.turn_id,d.offline,d.session_id])),[['finished','u2',true,'s2']],'its start was the old session\'s');
 voice.emit('turn',started('u3'));
 c.push(socket,{type:'error',data:{key:'room.no_conversation',client_msg_id:turnSent(c,socket,'u3','started')[0].client_msg_id}});
 voice.emit('turn',finished('u3','Rechazado'));
 assert.equal(turnSent(c,socket,'u3','finished')[0].offline,true);
 voice.emit('turn',started('u4'));
 c.push(socket,{type:'error',data:{key:'room.no_conversation',client_msg_id:turnSent(c,socket,'u4','started')[0].client_msg_id}});
 voice.emit('turn',{turn_id:'u4',phase:'cancelled',merged:false});
 assert.equal(turnSent(c,socket,'u4','cancelled').length,0,'a cancelled turn the room never took is nothing to say');
 s.run('disconnect()');
});
test('A reply is written at once and said by the voice; its handle lights the row and tells the room how it went',async()=>{
 const c=await callOnRoom();const {voice,first,s}=c;
 const reply={session_id:'s1',utterance_id:'r-1',revision:3,reply_revision:1,thread_id:'a',history_id:'h-1',text:'Buenos días',language:'es'};
 c.push(first,{type:'voice-reply',data:reply});
 assert.equal(s.run('history.at(-1).role'),'assistant');
 assert.equal(s.run('history.at(-1).text'),'Buenos días');
 assert.deepEqual(plain(voice.calls.at(-1)),['say','Buenos días',{language:'es'}]);
 const handle=voice.said[0];
 handle.step({type:'playing'});
 assert.deepEqual(plain(sentOf(c,first,'voice-playback').map(d=>[d.utterance_id,d.status,d.session_id])),[['r-1','playing','s1']]);
 assert.deepEqual(plain(s.run('karaokeState')),{segment:'h-1',from:0,to:0},'from its start the reply is being said');
 handle.step({type:'progress',sounding:[0,6],heard_chars:0});
 assert.deepEqual(plain(s.run('karaokeState')),{segment:'h-1',from:0,to:6});
 // Between its chunks nothing sounds: the reply is still being said, lit up to what was heard.
 handle.step({type:'progress',sounding:null,heard_chars:6});
 assert.deepEqual(plain(s.run('karaokeState')),{segment:'h-1',from:6,to:6});
 assert.equal(s.run("SessionState.conversationView(state).messages.at(-1).playback"),'playing');
 handle.step({type:'done',outcome:{status:'heard'}});
 assert.deepEqual(plain(sentOf(c,first,'voice-playback').at(-1)),{utterance_id:'r-1',status:'heard',heard_chars:11,session_id:'s1',client_msg_id:sentOf(c,first,'voice-playback').at(-1).client_msg_id});
 assert.equal(s.run('karaokeState'),null);
 c.push(first,{type:'voice-reply',data:{...reply,utterance_id:'r-2',session_id:'other'}});
 assert.equal(voice.said.length,1,'another session\'s reply is not said here');
 s.run('disconnect()');
});

test('The room\'s withdrawals cancel what it names, and each reply\'s end goes to the room in its words',async()=>{
 const c=await callOnRoom();const {voice,first,s}=c;
 const reply=(id,text)=>c.push(first,{type:'voice-reply',data:{session_id:'s1',utterance_id:id,revision:3,reply_revision:1,thread_id:'a',history_id:'h-'+id,text}});
 for(const id of ['r-1','r-2','r-3','r-4','r-5'])reply(id,'Hola mundo');
 const [one,two,three,four,five]=voice.said;
 one.step({type:'playing'});
 c.push(first,{type:'voice-reply-withdrawn',data:{session_id:'s1',utterance_ids:['r-2','gone'],reason:'newer_turn'}});
 assert.deepEqual([one.cancelled,two.cancelled],[false,true],'only what it names; an id this page no longer holds is ignored');
 two.step({type:'done',outcome:{status:'not-played',reason:'cancelled'}});
 c.push(first,{type:'voice-reply-withdrawn',data:{session_id:'s1',utterance_ids:['r-1'],reason:'focus_changed'}});
 one.step({type:'done',outcome:{status:'heard-up-to',heard_chars:4,reason:'cancelled'}});
 three.step({type:'done',outcome:{status:'heard-up-to',heard_chars:2,reason:'barge-in'}});
 four.step({type:'done',outcome:{status:'not-played',reason:'barge-in'}});
 five.step({type:'done',outcome:{status:'not-played',reason:'failed',code:'credential-missing'}});
 const ends=sentOf(c,first,'voice-playback').filter(d=>d.status!=='playing').map(d=>[d.utterance_id,d.status,d.reason,d.heard_chars]);
 assert.deepEqual(plain(ends),[
  ['r-2','unplayed','newer_turn',0],
  ['r-1','interrupted','focus_changed',4],
  ['r-3','interrupted','user_interrupted',2],
  ['r-4','unplayed','newer_turn',0],
  ['r-5','failed',null,0],
 ]);
 c.push(first,{type:'voice-reply-withdrawn',data:{session_id:'other',utterance_ids:['r-6'],reason:'newer_turn'}});
 s.run('disconnect()');
});
test('Settings send only the interface language to the room',async()=>{
 const s=setup();const sent=[];s.context.__send=text=>sent.push(JSON.parse(text));
 s.run("ws={readyState:1,send:text=>__send(text)};sessionId='s'");
 await s.run("$('ui-language').value='en';saveSettings()");
 assert.deepEqual(sent.filter(m=>m.type==='voice-settings').map(m=>Object.keys(m.data).sort()),[['session_id','ui_language']]);
});

// ----- the voice's settings and the providers' keys: kept on this device, checked by the voice, never sent to the room -----
const build=(id,extra={})=>({id,backend:'sherpa-onnx',precision:'int8',downloadBytes:1,memoryMb:1,available:true,reasons:[],installed:true,...extra});
const CATALOGS=[
 {id:'local',name:null,status:{stale:false},models:[
  {id:'whisper-base',family:'whisper',capabilities:['stt'],languages:['es','en'],voices:[],installed:true,builds:[build('whisper-base/int8')]},
  {id:'kokoro-82m-v1.0',family:'kokoro',capabilities:['tts'],languages:['es'],voices:[{id:'ef_dora',languages:['es']}],speed:{min:0.5,max:2},installed:true,builds:[build('kokoro/int8')]},
 ]},
 {id:'openai',name:'OpenAI',status:{stale:false},models:[{id:'gpt-4o-transcribe',capabilities:['stt'],languages:[],voices:[]}]},
 {id:'elevenlabs',name:'ElevenLabs',status:{stale:false},models:[{id:'eleven_flash_v2_5',capabilities:['tts'],languages:[],voices:[]}]},
];
function settingsPage(options){
 const s=setup({strictDOM:true});const engine=fakeEngine(CATALOGS);const voice=withVoice(s,fakeVoice(options),engine);
 const asked=[];s.context.fetch=async(url,init={})=>{asked.push({url,init});return {ok:true,status:200,json:async()=>({})}};
 s.context.localStorage.setItem('sidevoice.settings','{}');
 return {s,voice,engine,asked};
}
test('Opening the settings reads the engine\'s catalogues and which providers have a key',async()=>{
 const {s,engine}=settingsPage();
 await engine.setCredential('openai','sk-1');
 s.run("$('settings-open').onclick()");await settleSoon();
 const facts=s.run('roomStore.getState().facts');
 assert.equal(facts.voiceCatalogue.state,'ready');
 assert.deepEqual(plain(facts.voiceCatalogue.catalogs.map(c=>[c.id,c.models.map(m=>m.id)])),[['local',['whisper-base','kokoro-82m-v1.0']],['openai',['gpt-4o-transcribe']],['elevenlabs',[]]]);
 assert.deepEqual(plain(facts.providerKeys),{openai:true,elevenlabs:false},'one key per remote catalogue');
 assert.deepEqual(plain(facts.voiceDraft),plain(facts.voiceSettings),'the pane starts from what is kept');
});
test('Saved voice settings are checked by the voice, kept on this device, and the next call starts with them',async()=>{
 const {s,voice,engine,asked}=settingsPage();
 await engine.setCredential('openai','sk-1');
 s.run("$('settings-open').onclick()");await settleSoon();
 s.run("window.sidevoiceActions.editVoice({stt:{catalog:'openai'},patience:'calm'})");
 assert.deepEqual(plain(s.run('voiceDraft.stt')),{catalog:'openai',model:'gpt-4o-transcribe',language:s.run('voiceSettings.stt.language')},'another source takes its first model');
 await s.run("saveSettings()");
 assert.deepEqual(plain(voice.calls.find(([name])=>name==='setSettings')[1]),plain(s.run('voiceDraft')));
 const kept=JSON.parse(s.run("localStorage.getItem('sidevoice.voice-settings')"));
 assert.deepEqual([kept.stt.catalog,kept.stt.model,kept.patience],['openai','gpt-4o-transcribe','calm']);
 assert.equal(s.run('voiceSettings.stt.model'),'gpt-4o-transcribe');
 assert.equal(asked.some(({init})=>String(init.body||'').includes('gpt-4o-transcribe')),false,'the room is not told');
});
test('Settings the voice refuses are not kept, and the reason is said with the provider\'s own words',async()=>{
 const {s}=settingsPage({setSettings:async()=>{throw Object.assign(Error('no'),{code:'credential-missing',detail:'invalid_api_key'})}});
 s.run("$('settings-open').onclick()");await settleSoon();
 const before=plain(s.run('voiceSettings'));
 s.run("window.sidevoiceActions.editVoice({tts:{catalog:'elevenlabs',model:'eleven_flash_v2_5'}})");
 s.run("$('language-form').onsubmit({preventDefault(){}})");await settleSoon();
 assert.match(s.run("$('settings-error').textContent"),/Falta la clave del proveedor.*invalid_api_key/);
 assert.deepEqual(plain(s.run('voiceSettings')),before);
 assert.equal(s.run("localStorage.getItem('sidevoice.voice-settings')"),null);
});
test('A provider key goes to the engine\'s host and nowhere else, and its catalogue is read again with it',async()=>{
 const {s,voice,engine,asked}=settingsPage();
 await s.run("window.sidevoiceActions.saveProviderKey('elevenlabs','xi-secret')");
 assert.deepEqual(engine.calls,[['setCredential','elevenlabs','xi-secret']]);
 assert.equal(voice.calls.length,0,'the voice keeps no keys');
 assert.equal(s.run('providerKeys.elevenlabs'),true);
 assert.deepEqual(plain(s.run("voiceCatalogue.catalogs.find(c=>c.id==='elevenlabs').models.map(m=>m.id)")),['eleven_flash_v2_5']);
 assert.equal(JSON.stringify(asked).includes('xi-secret'),false,'no request carries it');
 assert.equal(JSON.stringify(s.saved).includes('xi-secret'),false,'the page keeps no copy of its own');
 await s.run("window.sidevoiceActions.saveProviderKey('elevenlabs',null)");
 assert.equal(s.run('providerKeys.elevenlabs'),false);
});
test('An app that does not give the page its catalogues yet says so, and still keeps the settings',async()=>{
 const s=setup({strictDOM:true});withVoice(s,fakeVoice());s.context.localStorage.setItem('sidevoice.settings','{}');
 s.run("$('settings-open').onclick()");await settleSoon();
 assert.equal(s.run('voiceCatalogue.state'),'failed');
 assert.match(s.run('voiceCatalogue.error'),/lista de modelos/);
});
test('A page with no voice keeps its settings unchecked and says why it cannot keep a key',async()=>{
 const s=setup({strictDOM:true});s.context.localStorage.setItem('sidevoice.settings','{}');
 s.run("$('settings-open').onclick()");await settleSoon();
 assert.equal(s.run('voiceCatalogue.state'),'failed');
 assert.match(s.run('voiceCatalogue.error'),/aún no está disponible/);
 s.run("window.sidevoiceActions.editVoice({patience:'fast'})");
 await s.run('saveSettings()');
 assert.equal(JSON.parse(s.run("localStorage.getItem('sidevoice.voice-settings')")).patience,'fast');
 await assert.rejects(s.run("window.sidevoiceActions.saveProviderKey('openai','sk-1')"),/aún no está disponible/);
});

// ----- the independent review of #60/#61 (briefs/reviews/2026-10-09-web-60-61.md): each of its probes, the right way round -----
test('A resumed session sends at once what waited while the room was away',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 c.push(c.first,{type:'voice-reply',data:{session_id:'s1',utterance_id:'r-1',revision:1,reply_revision:1,thread_id:'a',history_id:'h',text:'twelve chars'}});
 c.drop(c.first);
 voice.emit('turn',started('away'));
 voice.emit('turn',finished('away','offline words'));
 voice.said[0].step({type:'done',outcome:{status:'heard'}});
 await c.until(()=>c.sockets.length===2,'reconnect socket');
 const {socket}=await c.answer({session_id:'s1',resume:{token:'new'},resumed:true});
 await c.until(()=>!s.run('state.reconnecting'),'resumed');await settleSoon();
 const sent=c.frames(socket).filter(f=>['voice-user-turn','voice-playback'].includes(f.type));
 assert.deepEqual(plain(sent.map(f=>[f.type,f.data.phase??f.data.status,f.data.offline])),[['voice-user-turn','started',null],['voice-user-turn','finished',null],['voice-playback','heard',null]],'no later voice event needed; the same session takes the turn as it is');
 for(const frame of sent)c.push(socket,{type:'voice-ack',data:{client_msg_id:frame.data.client_msg_id}});
 assert.equal(s.run('outbox.size'),0);
 s.run('disconnect()');
});
test('A refusal after its acknowledgement still finds the start it refuses, and nothing behind it waits',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 voice.emit('turn',started('turn'));
 const id=turnSent(c,c.first,'turn','started')[0].client_msg_id;
 // The room acknowledges a message before it answers or refuses it.
 c.push(c.first,{type:'voice-ack',data:{client_msg_id:id}});
 c.push(c.first,{type:'error',data:{client_msg_id:id,key:'room.browser_absent'}});
 voice.emit('turn',finished('turn','words'));
 assert.equal(turnSent(c,c.first,'turn','finished')[0].offline,true,'its words go as said while away');
 s.run('disconnect()');
});
test('A start sent again is only acknowledged by the room, and nothing waits for an answer it will not send',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 voice.emit('turn',started('a'));
 const id=turnSent(c,c.first,'a','started')[0].client_msg_id;
 // The same start again on the same session (after a resume or a reload, say): the room only acknowledges a repeat.
 s.context.__id=id;s.run("outbox.get(__id).sentOn=null;flushOutbox()");
 assert.equal(turnSent(c,c.first,'a','started').filter(d=>d.client_msg_id===id).length,2);
 c.push(c.first,{type:'voice-ack',data:{client_msg_id:id}});
 voice.emit('turn',finished('a','first'));
 assert.deepEqual([turnSent(c,c.first,'a','finished')[0]?.offline],[undefined],'its end goes as it is, named, with no answer');
 s.run('disconnect()');
});

test('Messages a reload kept go once the outbox has them back, though the call flushed before',async()=>{
 let release=()=>{};
 const kept={id:'kept-1',scope:'tab-1',kind:'playback',session_id:'s1',node:PAIRED.fp,created:1,order:1,
  payload:{type:'voice-playback',data:{client_msg_id:'kept-1',utterance_id:'u',status:'heard',heard_chars:3,at:1}}};
 const store={put(){},delete(){},getAll(){const request={};release=()=>{request.result=[kept];request.onsuccess?.()};return request}};
 const db={createObjectStore(){},transaction:()=>({objectStore:()=>store})};
 const indexedDB={open(){const request={};setTimeout(()=>{request.result=db;request.onsuccess?.()},0);return request}};
 const c=await callOnRoom({indexedDB,outboxScope:'tab-1'});
 assert.equal(sentOf(c,c.first,'voice-playback').length,0,'not back yet');
 release();await settleSoon();
 assert.deepEqual(sentOf(c,c.first,'voice-playback').map(d=>d.client_msg_id),['kept-1'],'sent as it came back');
 c.s.run('disconnect()');
});

test('An in-use fingerprint no pairing knows does not select the local host by itself',()=>{
 const bridge={state:()=>({state:'running',reachable:true,installed:true,service:'launchd'}),subscribe:()=>()=>{},pairing:()=>null};
 const s=setup({paired:false,stored:{in_use:'obsolete-fingerprint',pairings:[]},localHost:bridge});
 assert.equal(s.run('localHostSelected'),false,'only the page\'s own selection selects it');
});
test('A hang-up while the settings are taken never starts the microphone, and one while starting stops it',async()=>{
 const s=setup();let release;
 const pending=new Promise(resolve=>{release=resolve});
 const voice=fakeVoice({setSettings:()=>pending});const c=joining(s,{voice});
 const joined=c.tap();await settleSoon();
 s.run('disconnect()');release();await joined;
 assert.deepEqual(voice.calls.filter(([name])=>['start','stop'].includes(name)).map(([name])=>name),['stop']);
 assert.equal(c.sockets.length,0);
 const late=setup();let started;
 const starting=new Promise(resolve=>{started=resolve});
 const slow=fakeVoice({start:()=>starting});const d=joining(late,{voice:slow});
 const joining2=d.tap();await settleSoon();
 late.run('disconnect()');started();await joining2;
 assert.deepEqual(slow.calls.filter(([name])=>['start','stop'].includes(name)).map(([name])=>name),['start','stop','stop'],'the hang-up, then what the join started');
 assert.equal(d.sockets.length,0);
});
test('A voice failure is said and logged',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 const said=[];s.context.window.sidevoiceUI=new Proxy({},{get:(_,name)=>name==='setBootError'?value=>said.push(value):()=>{}});
 voice.emit('error',{code:'credential-missing'});
 assert.match(said.at(-1)||'',/Falta la clave del proveedor/);
 assert.deepEqual(plain(c.frames(c.first).filter(m=>m.type==='voice-client-error').map(m=>[m.data.kind,m.data.message])),[['voice','credential-missing']]);
 s.run('disconnect()');
});
test('A move to another conversation leaves its replies to the room, which withdraws them; the call keeps listening',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 c.push(c.first,{type:'voice-reply',data:{session_id:'s1',utterance_id:'old-reply',revision:1,reply_revision:1,thread_id:'a',history_id:'row',text:'old conversation'}});
 const before=voice.calls.length;
 s.context.fetch=async()=>({ok:true,json:async()=>({binding:{thread_id:'b',binding_id:'new'},room:{revision:0},participants:[],messages:[]})});
 await s.run("select('b')");await settleSoon();
 assert.equal(s.run('targetId()'),'b');
 assert.deepEqual(voice.calls.slice(before).map(([name])=>name).filter(name=>name!=='mute'),[],'not stopped: what is stale is the room\'s to say');
 c.push(c.first,{type:'voice-reply-withdrawn',data:{session_id:'s1',utterance_ids:['old-reply'],reason:'focus_changed'}});
 assert.equal(voice.said[0].cancelled,true);
 voice.said[0].step({type:'done',outcome:{status:'not-played',reason:'cancelled'}});
 const report=sentOf(c,c.first,'voice-playback').at(-1);
 assert.deepEqual([report.utterance_id,report.status,report.reason],['old-reply','unplayed','focus_changed']);
 s.run('disconnect()');
});
test('Words said while away take the room\'s row id, so history shows them once with their receipt',async()=>{
 const c=await callOnRoom();const {s,voice}=c;
 voice.emit('turn',started('off'));
 c.push(c.first,{type:'error',data:{key:'room.no_conversation',client_msg_id:turnSent(c,c.first,'off','started')[0].client_msg_id}});
 voice.emit('turn',finished('off','offline words'));
 assert.equal(s.run("state.history.find(r=>r.text==='offline words').segment"),'s1:user-turn:off','the room names the row by the turn');
 s.context.fetch=async()=>({ok:true,json:async()=>({messages:[{id:'s1:user-turn:off',session:'s1',revision:0,thread:'a',role:'user',text:'offline words',status:'delivered'}]})});
 await s.run('refreshHistory()');
 assert.equal(s.run("state.history.filter(r=>r.text==='offline words').length"),1);
 assert.equal(s.run("state.history.find(r=>r.text==='offline words').delivery"),'delivered');
 s.run('disconnect()');
});
test('Nothing goes on a new socket before the room answers its hello, and then it goes to the new session',async()=>{
 const c=await callOnRoom();const {s,voice}=c;c.drop(c.first);
 await c.until(()=>c.sockets.length===2,'reconnect socket');
 const socket=c.sockets.at(-1);socket.readyState=1;socket.onopen();
 voice.emit('turn',started('hello'));
 voice.emit('turn',finished('hello','during hello'));
 assert.equal(sentOf(c,socket,'voice-user-turn').length,0,'held until the session is known');
 c.push(socket,{type:'voice-session',data:{session_id:'s2',resume:{token:'new'},resumed:false}});
 await c.until(()=>!s.run('state.reconnecting'),'new session');
 await c.until(()=>sentOf(c,socket,'voice-user-turn').length===1,'sent once the new session holds');
 assert.deepEqual(plain(sentOf(c,socket,'voice-user-turn').map(d=>[d.phase,d.session_id,d.offline])),[['finished','s2',true]]);
 s.run('disconnect()');
});
test('A start of a replaced session is not sent again: its words go as said while away',()=>{
 const s=setup();
 s.run("var __sent=[];ws={readyState:1,session:'s',send(m){__sent.push(JSON.parse(m))}};voiceTurn({turn_id:'a',phase:'started',started_at:1});voiceTurn({turn_id:'a',phase:'finished',text:'words',started_at:1,ended_at:2,merged:false,timings:{}});__sent.length=0;sessionId='new';relay.reset();ws={readyState:1,session:'new',send(m){__sent.push(JSON.parse(m))}};flushOutbox()");
 assert.deepEqual(plain(s.run("__sent.map(m=>[m.data.phase,m.data.offline,m.data.session_id])")),[['finished',true,'new']]);
 assert.equal(s.run("outbox.list().some(entry=>entry.payload.data.phase==='started')"),false);
});

test('A turn the room has no room for yet keeps its words and starts again, as a new message, when another turn ends',async()=>{
 const c=await callOnRoom();const {voice,first,s}=c;
 voice.emit('turn',started('open'));
 voice.emit('turn',started('u9'));
 const refused=turnSent(c,first,'u9','started')[0].client_msg_id;
 c.push(first,{type:'voice-ack',data:{client_msg_id:refused}});
 c.push(first,{type:'error',data:{key:'room.turns_full',message:'Too many turns',client_msg_id:refused}});
 voice.emit('turn',finished('u9','Otra vez'));
 assert.equal(turnSent(c,first,'u9','finished').length,0,'held, words and all');
 assert.equal(s.run('outbox.list().some(entry=>entry.payload.data.text==="Otra vez")'),true);
 // Another turn ends: after its end, the held turn starts again under a message of its own, and its words follow.
 voice.emit('turn',finished('open','Primera'));
 const order=sentOf(c,first,'voice-user-turn').map(d=>[d.turn_id,d.phase,d.offline]);
 assert.deepEqual(plain(order.slice(-3)),[['open','finished',null],['u9','started',null],['u9','finished',null]]);
 const again=turnSent(c,first,'u9','started').at(-1).client_msg_id;
 assert.notEqual(again,refused,'the room takes each message once: a new one');
 s.run('disconnect()');
});

test('A held turn refused again keeps its words, and starts again at the next end',async()=>{
 const c=await callOnRoom();const {voice,first,s}=c;
 for(const id of ['a','b','held'])voice.emit('turn',started(id));
 const full=id=>c.push(first,{type:'error',data:{key:'room.turns_full',client_msg_id:id}});
 full(turnSent(c,first,'held','started')[0].client_msg_id);
 voice.emit('turn',finished('held','Espera'));
 voice.emit('turn',finished('a','A'));
 // Started again after `a`, its words right behind: the room has no room yet, and refuses both.
 assert.equal(turnSent(c,first,'held','finished').length,1);
 full(turnSent(c,first,'held','started').at(-1).client_msg_id);
 c.push(first,{type:'error',data:{key:'room.input_ended',client_msg_id:turnSent(c,first,'held','finished')[0].client_msg_id}});
 assert.equal(turnSent(c,first,'held','finished').length,1,'its words kept again, held');
 voice.emit('turn',{turn_id:'b',phase:'cancelled',merged:false});
 assert.equal(turnSent(c,first,'held','started').length,3,'started again after the next end');
 const words=turnSent(c,first,'held','finished');
 assert.deepEqual(plain(words.map(d=>[d.text,d.offline])),[['Espera',null],['Espera',null]]);
 assert.notEqual(words[0].client_msg_id,words[1].client_msg_id);
 s.run('disconnect()');
});

// ----- a browser that blocks site data, and a page served as a static site -----
test('A browser\'s own refusal is said in words, by its name: never its legacy number',()=>{
 const s=setup({strictDOM:true});
 // A DOMException carries a numeric code (18 for a SecurityError): that is never what the person reads.
 const security={name:'SecurityError',code:18,message:'The operation is insecure.'};
 assert.match(s.run('voiceErrorText')(security),/blocking site data for this page/);
 assert.match(s.run('voiceErrorText')({code:'storage-blocked'}),/blocking site data for this page/);
 const denied=s.run('voiceErrorText')({name:'NotAllowedError',code:0});
 assert.match(denied,/NotAllowedError/);assert.doesNotMatch(denied,/\(\d+\)/);
 assert.doesNotMatch(s.run('voiceErrorText')({name:'InvalidStateError',code:11}),/\b11\b/);
 // The engine's own codes keep their sentence, and a provider's words follow.
 assert.match(s.run('voiceErrorText')({code:'credential-missing',detail:'invalid_api_key'}),/Falta la clave del proveedor.*invalid_api_key/);
});
test('A static site asks its own origin nothing; a page with a room in front of it still does',async()=>{
 const s=setup({strictDOM:true}),asked=[];
 s.context.fetch=async url=>{asked.push(url);return {ok:false,status:404,json:async()=>({})}};
 s.context.window.__SIDEVOICE_TARGET__=null;
 assert.equal(await s.run('describeTarget()'),null);
 assert.deepEqual(asked,[],'no /api/rendezvous to a server that has none');
 delete s.context.window.__SIDEVOICE_TARGET__;
 await s.run('describeTarget()');
 assert.deepEqual(asked,['/api/rendezvous'],'with no word from whoever serves it, the origin is asked as before');
});
test('Storage the browser refuses is found once at start and said on top',async()=>{
 const s=setup({strictDOM:true});
 assert.equal(s.run('roomStore.getState().facts.storageBlocked'),false,'a browser that keeps site data');
 const probe=await s.run('probeSiteStorage')({localStorage:()=>{throw {name:'SecurityError',code:18}},indexedDB:null,storage:null});
 assert.deepEqual(plain(probe),{blocked:true,refused:[{store:'localStorage',code:'SecurityError'}]});
});

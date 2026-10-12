const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
/* The runtime under call model B, the voice switch (VARIANTS `call-model` "b"; briefs/CALL-MODEL-B-SPEC.md), loaded the
 * way room-session-controller.test.cjs loads it — each module it imports one object in a context of its own — but with
 * the variant chosen in this device's storage and a tab's storage that keeps what is written. What it sends the room
 * for B is contract gaps #32–#36 (briefs/CONTRACT-GAPS-75.md). */
const PAIRED={fp:'fp-mac',public_key:'pk',host:'macbook',urls:['http://127.0.0.1:8768'],rv:{url:'https://room.example',node:'mac'},device_id:'dev-1',token:'tok-1',paired_at:1};
const sourceRoot=path.join(__dirname,'../src');
const MODULES={'./device-name-rules.js':'DeviceNameRules','../services/device-name-rules.js':'DeviceNameRules','./refusals.js':'Refusals','../state/room-session-state.js':'SessionState','./rendezvous.js':'Rendezvous','./device-pairing.js':'DevicePairing','../services/device-pairing.js':'DevicePairing','./desktop-host.ts':'DesktopHost','../services/desktop-host':'DesktopHost','./system-language.js':'SystemLanguage','../services/system-language.js':'SystemLanguage','../../services/system-language.js':'SystemLanguage','../state/device-name.ts':'DeviceName','./messages/en':'HostMessagesEn','./messages/es':'HostMessagesEs','../../i18n/translator':'Translator','../features/settings/host-i18n.ts':'HostI18n','./outbox.js':'Outbox','./host-agents.ts':'HostAgents','./failure-code.js':'FailureCode','./site-storage.js':'SiteStorage','./voice-trial.js':'VoiceTrial','./model-catalogs.js':'ModelCatalogs','./voice-source.ts':'VoiceSource','./voice-module.js':'VoiceModule','./turn-relay.js':'TurnRelay','./voice-room.js':'VoiceRoom','./voice-settings.js':'VoiceSettings','./call-preferences.ts':'CallPreferences','./model-housekeeping.js':'ModelHousekeeping','../features/settings/error-message.ts':'ErrorMessage','../../services/failure-code.js':'FailureCode','./host-i18n':'HostI18n'};
const FILES={Refusals:'services/refusals.js',SessionState:'state/room-session-state.js',Rendezvous:'services/rendezvous.js',DevicePairing:'services/device-pairing.js',DesktopHost:'services/desktop-host.ts',SystemLanguage:'services/system-language.js',Outbox:'services/outbox.js',HostAgents:'services/host-agents.ts',DeviceName:'state/device-name.ts',HostMessagesEn:'features/settings/messages/en.ts',HostMessagesEs:'features/settings/messages/es.ts',Translator:'i18n/translator.ts',HostI18n:'features/settings/host-i18n.ts',FailureCode:'services/failure-code.js',SiteStorage:'services/site-storage.js',VoiceTrial:'services/voice-trial.js',ModelCatalogs:'services/model-catalogs.js',VoiceSource:'services/voice-source.ts',VoiceModule:'services/voice-module.js',TurnRelay:'services/turn-relay.js',VoiceRoom:'services/voice-room.js',VoiceSettings:'services/voice-settings.js',CallPreferences:'services/call-preferences.ts',ModelHousekeeping:'services/model-housekeeping.js',DeviceNameRules:'services/device-name-rules.js',ErrorMessage:'features/settings/error-message.ts'};
const imports=(source,dir)=>source.replace(/^import (\w+) from ['"](.*\.json)['"][^;]*;\n/gm,(_,name,from)=>'const '+name+'='+fs.readFileSync(path.resolve(dir,from),'utf8')+';\n')
 .replace(/^import \{(.*)\} from ['"](.*)['"];\n/gm,(_,names,from)=>'const {'+names.replace(/ as /g,':')+'}='+MODULES[from]+';\n');
const storageOf=store=>({getItem:key=>key in store?store[key]:null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}});

/** The runtime loaded on a page that chose call model B, its tab's storage `tab`, paired with one machine that proved
 *  itself at the page's own origin; no session yet. */
function setup({tab={'sidevoice.selected':'fp-mac|a'},variant='b'}={}){
 class Element{constructor(id){this.id=id;this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.parentElement=this;this.listeners={};this.attributes={}}addEventListener(name,fn){this.listeners[name]=fn}showModal(){this.open=true}close(){this.open=false}contains(node){return node===this}removeAttribute(){}closest(){return null}querySelector(){return null}append(){}replaceChildren(){}remove(){}setAttribute(name,value){this.attributes[name]=value}getAttribute(name){return this.attributes[name]}click(){this.onclick?.()}}
 const elements=new Map(),documentHandlers={},sockets=[],requests=[];
 const saved={'sidevoice.pairings':JSON.stringify({pairings:[PAIRED]}),'sidevoice.variants':JSON.stringify({'call-model':variant})};
 const room={binding:{thread_id:'a',title:'A',binding_id:'b1'},participants:[
  {thread_id:'a',title:'A',available:true,reach:{state:'listening'}},{thread_id:'b',title:'B',available:true,reach:{state:'holding'}}],answers:{}};
 const fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({url:String(url),method:options.method||'GET',body});
  const at=String(url);
  if(at.includes('/api/presentation/leave'))room.binding=null;
  const answer=at.includes('/participants')?{participants:room.participants}:at.includes('/history')?{messages:[]}
   :at.includes('/api/presentation/hear')?room.answers.hear??{status:'asked'}:at.includes('/api/presentation/leave')?{status:'activated',binding:{thread_id:'',title:null,binding_id:'b9'}}
   :{binding:room.binding,room:{revision:0},clients:[],call:null};
  return {ok:true,status:200,json:async()=>answer};
 };
 class WebSocket{constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(code){this.readyState=3;this.closed=code}}
 WebSocket.OPEN=1;
 const context=vm.createContext({Element,console,Date,JSON,Math,Map,Set,Promise,Uint8Array,TextEncoder,TextDecoder,URL,AbortController,URLSearchParams,crypto:globalThis.crypto,
  localStorage:storageOf(saved),sessionStorage:storageOf(tab),btoa:value=>Buffer.from(value,'binary').toString('base64'),
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)},body:new Element('body'),createElement:()=>new Element(),addEventListener:(name,fn)=>(documentHandlers[name]??=[]).push(fn)},
  // The machines asked as the page loads never answer here: the one paired has already proved itself (below).
  window:{addEventListener(){}},MutationObserver:class{observe(){}},fetch:()=>new Promise(()=>{}),setInterval(){},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},WebSocket,location:{protocol:'https:',host:'room.example',reload(){}}});
 for(const name of new Set(Object.values(MODULES))){
  let text=fs.readFileSync(path.join(sourceRoot,FILES[name]),'utf8');
  if(FILES[name].endsWith('.ts'))text=require('typescript').transpileModule(text,{compilerOptions:{target:99,module:99}}).outputText;
  const dependency=imports(text,path.dirname(path.join(sourceRoot,FILES[name])));
  const exported=[...dependency.matchAll(/^export (?:async function|function|const|class) (\w+)/gm)].map(m=>m[1]);
  vm.runInContext('const '+name+'=(()=>{'+dependency.replace(/^export /gm,'')+';return {'+exported.join(',')+'}})();',context);
 }
 vm.runInContext('"use strict";\n'+imports(fs.readFileSync(path.join(sourceRoot,'services/room-session-controller.js'),'utf8'),path.join(sourceRoot,'services')),context);
 const run=code=>vm.runInContext(code,context);
 context.fetch=fetch;
 run("verified.set('',Date.now());{const link=linkOf('fp-mac');link.base='';link.reach='ok';link.via='node';publishLinks()};keepScreenAwake=()=>{};people=[{node:'fp-mac',thread_id:'a',title:'A',available:true,reach:{state:'listening'}},{node:'fp-mac',thread_id:'b',title:'B',available:true,reach:{state:'holding'}}]");
 return {context,run,sockets,requests,room,tab,saved,facts:()=>run('roomStore.getState().facts')};
}
/** The page's voice (as `host.voice` gives it): what it was asked, and its reports, fired by the test. */
function fakeVoice(){
 const on={},calls=[],said=[];
 const sub=name=>listener=>{(on[name]||=new Set()).add(listener);return ()=>on[name].delete(listener)};
 const say=(text,options)=>{calls.push(['say',text]);const listeners=new Set();
  const handle={text,cancelled:false,cancel(){handle.cancelled=true;calls.push(['cancel',text])},onEvent(listener){listeners.add(listener)},step(event){for(const listener of listeners)listener(event)}};
  said.push(handle);return handle};
 return {calls,said,emit:(name,value)=>{for(const listener of on[name]||[])listener(value)},
  setSettings:async()=>{calls.push(['setSettings'])},start:async()=>{calls.push(['start'])},stop:async()=>{calls.push(['stop'])},
  say,mute:muted=>calls.push(['mute',muted]),cancelInput:()=>calls.push(['cancelInput']),
  onTurn:sub('turn'),onState:sub('state'),onLevel:sub('level'),onError:sub('error')};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
const until=async(check,what)=>{for(let i=0;i<500;i++){if(check())return;await settle()}assert.fail('never: '+what)};
const frames=(socket,type)=>socket.sent.map(m=>JSON.parse(m)).filter(m=>m.type===type).map(m=>m.data);
/** The room session opened on load, its hello answered: B's page always has one. */
async function opened(s,voice=fakeVoice()){
 s.context.window.__sidevoiceDesktop={host:{voice}};
 const opening=s.run('openRoom')();
 await until(()=>s.sockets.length===1,'the room socket');
 const socket=s.sockets[0];socket.readyState=1;socket.onopen();
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'s1',resume:{token:'t',seconds:60},resumed:false}})});
 await opening;await settle();
 return {socket,voice,hello:JSON.parse(socket.sent[0]).data,push:frame=>socket.onmessage({data:JSON.stringify(frame)})};
}

test('the room opens as the page loads, without voice: its hello says speech is off, and that only "Hear it" asks for a note',async()=>{
 const s=setup();const {hello}=await opened(s);
 assert.deepEqual(hello.speech,{on:false,reason:'voice_off'});
 assert.equal(hello.notes,'on-request');
 assert.equal(hello.conversation,'a','on the conversation this tab was on');
 assert.equal(s.facts().sessionId,'s1');
 assert.equal(s.facts().voiceOn,false);
 assert.equal(s.facts().joinStep,null,'no join line: the room opens by itself');
 // Call model A says nothing of the kind.
 assert.deepEqual(Object.keys(setup({variant:'a'}).run('switchHello()')),[]);
});

test('the voice switch starts and stops the voice alone, the room staying; the room is told whether speech is heard here',async()=>{
 const s=setup();const {socket,voice}=await opened(s);
 await s.run('window.sidevoiceActions.setVoice(true)');
 assert.deepEqual(voice.calls.map(([name])=>name).slice(0,2),['setSettings','start']);
 assert.equal(s.facts().voiceOn,true);
 assert.equal(s.tab['sidevoice.voice-on'],'1','a reload will say it turned off');
 assert.deepEqual(frames(socket,'voice-speech').at(-1),{session_id:'s1',on:true});
 await s.run('window.sidevoiceActions.setVoice(false)');
 assert.equal(voice.calls.at(-1)[0],'stop');
 assert.equal(s.facts().voiceOn,false);
 assert.equal(s.facts().voiceOffReason,null,'turned off by the person: no note');
 assert.deepEqual(frames(socket,'voice-speech').at(-1),{session_id:'s1',on:false,reason:'voice_off'});
 assert.equal(socket.closed,undefined,'the room stays open');
 assert.equal(s.facts().sessionId,'s1');
 // The call's own toggle (the desktop app asks it) is the switch here.
 await s.run('window.sidevoiceActions.toggleCall()');
 assert.equal(s.facts().voiceOn,true);
});

test('Mute agents stops what plays, its end told unheard for that reason; a reply that comes while muted is reported unheard at once',async()=>{
 const s=setup();const {socket,voice,push}=await opened(s);
 await s.run('window.sidevoiceActions.setVoice(true)');
 push({type:'voice-reply',data:{session_id:'s1',utterance_id:'u1',revision:1,thread_id:'a',history_id:'s1:voice:u1',text:'Done.'}});
 assert.equal(voice.said.length,1);
 s.run('window.sidevoiceActions.setAgentsMuted(true)');
 assert.equal(voice.said[0].cancelled,true);
 assert.deepEqual(frames(socket,'voice-speech').at(-1),{session_id:'s1',on:false,reason:'agents_muted'});
 voice.said[0].step({type:'done',outcome:{status:'not-played',reason:'cancelled'}});
 const ended=frames(socket,'voice-playback').at(-1);
 assert.deepEqual([ended.utterance_id,ended.status,ended.reason],['u1','unplayed','agents_muted']);
 push({type:'voice-reply',data:{session_id:'s1',utterance_id:'u2',revision:1,thread_id:'a',history_id:'s1:voice:u2',text:'More.'}});
 assert.equal(voice.said.length,1,'not said');
 const held=frames(socket,'voice-playback').at(-1);
 assert.deepEqual([held.utterance_id,held.status,held.reason],['u2','unplayed','agents_muted']);
 assert.equal(s.facts().history.some(r=>r.text==='More.'),true,'written all the same');
 assert.equal(s.tab['sidevoice.agents-muted'],'person','kept for the tab');
 s.run('window.sidevoiceActions.setAgentsMuted(false)');
 assert.deepEqual(frames(socket,'voice-speech').at(-1),{session_id:'s1',on:true});
});

test('the voice turns itself off when the microphone goes or is blocked, saying why; a speaker that goes mutes the agents',async()=>{
 const s=setup();const {voice}=await opened(s);
 await s.run('window.sidevoiceActions.setVoice(true)');
 voice.emit('error',{code:'microphone-lost'});await settle();
 assert.deepEqual([s.facts().voiceOn,s.facts().voiceOffReason],[false,'micLost']);
 await s.run('window.sidevoiceActions.setVoice(true)');
 assert.equal(s.facts().voiceOffReason,null,'the note goes when it is on again');
 voice.emit('error',{code:'microphone-denied'});await settle();
 assert.equal(s.facts().voiceOffReason,'micBlocked');
 // Contract gap #37 (G8): the system default's output going away, as a chosen one does.
 s.run("audioDevicesChanged({inputs:[],outputs:[],input:null,output:null,outputSelectable:true,defaultLost:{output:true}})");
 assert.deepEqual([s.facts().agentsMuted,s.facts().agentsMutedBy],[true,'output-lost']);
 await s.run('window.sidevoiceActions.setVoice(true)');
 s.run("audioDevicesChanged({inputs:[],outputs:[],input:null,output:null,outputSelectable:true,lost:{input:'mic-headset'}})");await settle();
 assert.deepEqual([s.facts().voiceOn,s.facts().voiceOffReason],[false,'micLost'],'a chosen microphone that goes never becomes the default silently');
});

test('a voice that cannot start says why in its note, and the room stays',async()=>{
 const s=setup();const voice=fakeVoice();voice.start=async()=>{throw Object.assign(Error('denied'),{code:'microphone-denied'})};
 const {socket}=await opened(s,voice);
 await s.run('window.sidevoiceActions.setVoice(true)');
 assert.deepEqual([s.facts().voiceOn,s.facts().voiceStarting,s.facts().voiceOffReason],[false,false,'micBlocked']);
 assert.equal(socket.closed,undefined);
});

test('nobody using the voice: warned a minute before, then it turns off, the room left open',async()=>{
 const s=setup();const {socket}=await opened(s);
 await s.run('window.sidevoiceActions.setVoice(true)');
 s.run('lastPersonSignal=Date.now()-IDLE_MS+30000;checkIdle()');
 assert.equal(s.facts().voiceIdleWarning,true);
 s.run('window.sidevoiceActions.keepVoiceOn()');
 assert.equal(s.facts().voiceIdleWarning,false,'"Keep voice on" is a sign of the person');
 s.run('lastPersonSignal=Date.now()-IDLE_MS-1;checkIdle()');await settle();
 assert.deepEqual([s.facts().voiceOn,s.facts().voiceOffReason],[false,'idle']);
 assert.equal(socket.closed,undefined);
});

test('a conversation that cannot hear is the active one all the same: the last one stops hearing, nothing falls back',async()=>{
 const s=setup();await opened(s);
 s.run("window.sidevoiceActions.selectParticipant('fp-mac|b')");await settle();
 const left=s.requests.find(r=>r.url.includes('/api/presentation/leave'));
 assert.deepEqual(left.body,{session_id:'s1',binding_id:'b1'});
 assert.equal(s.facts().roomBinding,null);
 assert.equal(s.facts().viewedThread,'fp-mac|b','still the active one');
 assert.equal(s.tab['sidevoice.selected'],'fp-mac|b');
 assert.equal(s.requests.some(r=>r.url.includes('/api/presentation/select')),false,'never another conversation in its place');
});

test('"Hear it" turns the voice on, unmutes the agents and asks the room; the reply starting answers it',async()=>{
 const s=setup();const {voice,push}=await opened(s);
 s.run('window.sidevoiceActions.setAgentsMuted(true)');
 await s.run("window.sidevoiceActions.hearIt('fp-mac|a')");
 assert.equal(s.facts().voiceOn,true);
 assert.equal(s.facts().agentsMuted,false);
 const asked=s.requests.find(r=>r.url.includes('/api/presentation/hear'));
 assert.deepEqual(asked.body,{session_id:'s1',thread_id:'a'});
 assert.deepEqual(JSON.parse(JSON.stringify(s.facts().hearing)),{thread:'fp-mac|a',state:'asking'});
 push({type:'voice-reply',data:{session_id:'s1',utterance_id:'u3',revision:1,thread_id:'a',history_id:'s1:voice:u3',text:'Here is what you missed.'}});
 voice.said[0].step({type:'playing'});
 assert.equal(s.facts().hearing,null);
 // Nothing to hear: no asking.
 s.room.answers.hear={status:'nothing'};
 await s.run("window.sidevoiceActions.hearIt('fp-mac|a')");
 assert.equal(s.facts().hearing,null);
});

test('a reload turns the voice off and says so; the agents\' mute is the tab\'s',()=>{
 const s=setup({tab:{'sidevoice.selected':'fp-mac|a','sidevoice.voice-on':'1','sidevoice.agents-muted':'output-lost'}});
 assert.equal(s.facts().voiceOffReason,'reloaded');
 assert.deepEqual([s.facts().agentsMuted,s.facts().agentsMutedBy],[true,'output-lost']);
 assert.equal(s.tab['sidevoice.voice-on'],undefined);
});

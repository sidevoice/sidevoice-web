const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
// This device's pairing, as the page keeps it, for every test that does not say otherwise: the machine proved itself
// at the page's own origin a moment ago, so requests go where they always went and carry its token.
const PAIRED={fp:'fp-mac',public_key:'pk',host:'macbook',urls:['http://127.0.0.1:8768'],rv:{url:'https://room.example',node:'mac'},device_id:'dev-1',token:'tok-1',paired_at:1};
function setup({strictDOM=false,paired=true,stored=paired?{in_use:PAIRED.fp,pairings:[PAIRED]}:null,localHost=null,localHostSelected=false}={}){
 const sourceRoot=__dirname+'/../src'; const uiSource=fs.readdirSync(sourceRoot,{recursive:true}).filter(file=>String(file).endsWith('.tsx')).map(file=>fs.readFileSync(sourceRoot+'/'+file,'utf8')).join('\n');
 class Element{constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.parentElement=this;this.listeners={};this.attributes={}}addEventListener(name,fn){this.listeners[name]=fn}showModal(){this.open=true}close(){this.open=false;this.listeners.close?.()}contains(node){return node===this||this.children.includes(node)}removeAttribute(){}closest(){return null}querySelector(){return null}append(...children){this.children.push(...children)}replaceChildren(...children){this.children=[...children]}remove(){}setAttribute(name,value){this.attributes[name]=value}getAttribute(name){return this.attributes[name]}click(){this.onclick?.()}}
 const elements=new Map(),handlers={};
 if(strictDOM){for(const match of uiSource.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element());for(const id of ['pair-close','pair-title','connection-stats','stats-title','stats-close','language-settings','settings-title','settings-close','stats-endpoint','stats-response','stats-synthesis','stats-playout','default-model-info','stt-model-info'])elements.set(id,new Element())}
 const saved=stored?{'sidevoice.pairings':JSON.stringify(stored)}:{};if(localHostSelected)saved['sidevoice.local-host-selected']='true';
 const dispatched=[];
 const context=vm.createContext({Element,CustomEvent,console,Date,JSON,Math,Map,Set,Promise,Uint8Array,TextEncoder,TextDecoder,URL,AbortController,URLSearchParams,crypto:globalThis.crypto,localStorage:{getItem:key=>saved[key]??null,setItem(key,value){saved[key]=value},removeItem(key){delete saved[key]}},btoa:value=>Buffer.from(value,'binary').toString('base64'),sessionStorage:{getItem:()=>null,setItem(){}},document:{getElementById:id=>{if(!elements.has(id)){if(strictDOM)return null;elements.set(id,new Element())}return elements.get(id)},createElement:()=>new Element(),addEventListener(){}},window:{addEventListener:(name,fn)=>handlers[name]=fn,dispatchEvent:event=>{dispatched.push(event);return true},roomTranscription:{capabilities:async()=>({webgpu:false,wasm:true,models:['onnx-community/whisper-tiny','onnx-community/whisper-base']}),prepare:async({model})=>({model,device:'wasm'}),start(){},stop(){},ingest(){}}},fetch:()=>new Promise(()=>{}),setInterval(){},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){},WebSocket:{OPEN:1},location:{protocol:'https:',host:'room.example'}});
 if(localHost)context.window.__sidevoiceDesktop={host:{localHost}};
 // Each module the controller imports becomes one object in the context, and its import line a destructuring of it;
 // a JSON import is its content. The resolver is TypeScript (packages/browser-audio/offers.ts), transpiled here.
 const modules={'../../../../packages/browser-audio/refusals.js':'Refusals','../../../../packages/browser-audio/model-check.js':'ModelCheck','../../../../packages/browser-audio/page-models.js':'PageModels','../state/stage-settings.js':'StageSettings','../state/stage-scope.js':'StageScope','./stage-settings.js':'StageSettings','./downloads-view.js':'DownloadsView','../state/room-session-state.js':'SessionState','./rendezvous.js':'Rendezvous','./webrtc-mic.js':'WebrtcMic','./device-pairing.js':'DevicePairing','../services/device-pairing.js':'DevicePairing','./desktop-host.ts':'DesktopHost','../services/desktop-host':'DesktopHost','./system-language.js':'SystemLanguage','../services/system-language.js':'SystemLanguage','../../services/system-language.js':'SystemLanguage','../state/device-name.ts':'DeviceName','./messages/en':'HostMessagesEn','./messages/es':'HostMessagesEs','../features/settings/host-i18n.ts':'HostI18n','../../../../packages/browser-audio/offers':'Offers','./downloads.js':'Downloads','./load-and-verify.js':'LoadAndVerify','./stage-selection.js':'StageSelection','./host-agents.ts':'HostAgents','./transcription-trial.ts':'TranscriptionTrial'};
 const audio=sourceRoot+'/../../../packages/browser-audio/';
 const files={Refusals:audio+'refusals.js',ModelCheck:audio+'model-check.js',PageModels:audio+'page-models.js',StageSettings:sourceRoot+'/state/stage-settings.js',StageScope:sourceRoot+'/state/stage-scope.js',DownloadsView:sourceRoot+'/state/downloads-view.js',Downloads:sourceRoot+'/services/downloads.js',SessionState:sourceRoot+'/state/room-session-state.js',Rendezvous:sourceRoot+'/services/rendezvous.js',WebrtcMic:sourceRoot+'/services/webrtc-mic.js',DevicePairing:sourceRoot+'/services/device-pairing.js',DesktopHost:sourceRoot+'/services/desktop-host.ts',SystemLanguage:sourceRoot+'/services/system-language.js',Offers:audio+'offers.ts',LoadAndVerify:sourceRoot+'/services/load-and-verify.js',StageSelection:sourceRoot+'/services/stage-selection.js',HostAgents:sourceRoot+'/services/host-agents.ts',TranscriptionTrial:sourceRoot+'/services/transcription-trial.ts',DeviceName:sourceRoot+'/state/device-name.ts',HostMessagesEn:sourceRoot+'/features/settings/messages/en.ts',HostMessagesEs:sourceRoot+'/features/settings/messages/es.ts',HostI18n:sourceRoot+'/features/settings/host-i18n.ts'};
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
 return {context,handlers,Element,elements,saved,dispatched,run:code=>vm.runInContext(code,context)};
}
test('The runtime never writes into a node React fills itself',()=>{
 // Two owners for the join line cost a blank room: setting textContent removed React's children, and the
 // next render threw NotFoundError trying to replace them. React reads the join from this same store.
 const s=setup({strictDOM:true});
 const join=s.elements.get('join-status');join.textContent='pintado por React';
 s.run("joinStep='room';publishSessionView()");
 assert.equal(join.textContent,'pintado por React','the join line belongs to JoinStatus alone');
 assert.equal(s.run("joinView(state)?.step"),'room','and the same store still says what the step is');
});
test('The microphones and speakers of this device are a fact, and choosing one is an action',async()=>{
 const s=setup({strictDOM:true});
 s.context.navigator={mediaDevices:{enumerateDevices:async()=>[
  {kind:'audioinput',deviceId:'mic-1',label:'Micro del coche'},
  {kind:'audioinput',deviceId:'mic-2',label:''},
  {kind:'audiooutput',deviceId:'speaker-1',label:'Altavoz del coche'}]}};
 s.context.window.roomVoice={supportsOutputSelection:true,unlock:async()=>{},setOutputDevice:async()=>{}};
 await s.run('refreshAudioDevices()');
 const devices=s.run('audioDevices');
 assert.equal(JSON.stringify(devices.inputs.map(d=>d.label)),JSON.stringify(['Predeterminado del sistema','Micro del coche','Micrófono 2']),
  'a device with no name is still offered, numbered');
 assert.equal(JSON.stringify(devices.outputs.map(d=>d.id)),JSON.stringify(['default','speaker-1']));
 assert.equal(devices.outputAvailable,true);
 assert.match(s.run('deviceNote'),/tras conceder permiso/);
 assert.equal(s.run("$('input-device').children.length"),0,'React renders the list; the runtime does not touch the node');
 // Choosing the output goes through the engine and is remembered.
 await s.run("window.sidevoiceActions.selectAudioDevice('output','speaker-1')");
 assert.equal(s.run('audioDevices').outputId,'speaker-1');
 assert.equal(s.run('audioDevices').busy,false);
 assert.match(s.run('deviceNote'),/Salida de audio seleccionada/);
 // One that fails says why and goes back to what was working.
 s.context.window.roomVoice.setOutputDevice=async()=>{throw Error('El navegador rechazó la salida')};
 await s.run("window.sidevoiceActions.selectAudioDevice('output','speaker-2')");
 assert.equal(s.run('deviceNote'),'El navegador rechazó la salida');
 assert.equal(s.run('audioDevices').outputId,'speaker-1','the selection returns to the one that works');
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
// The machine's integrations as it lists them to any paired device: one row per provider, never a key.
const OPENAI=(extra={})=>({id:'openai',label:'OpenAI',capabilities:['transcription'],configured:false,source:null,hint:null,environment:'VOICE_STT_API_KEY',...extra});
const ELEVEN=(extra={})=>({id:'elevenlabs',label:'ElevenLabs',capabilities:['voice'],configured:false,source:null,hint:null,environment:'VOICE_ELEVENLABS_API_KEY',...extra});
const LISTING=(...providers)=>({providers});
// What the page holds lives in its own realm; compared by value.
const plain=value=>JSON.parse(JSON.stringify(value));
// ----- the stages (sidevoice/sidevoice-core#21): place → model → options, derived by the store from what this device measured -----
const PAGE_CAPS={webgpu:true,webgpuFp16:true,wasm:true};
const stage=(place,model,options={},build=null)=>({place,model,options,build});
const STT=(model='whisper-tiny',options={language:'es',context:''})=>stage('device',model,options);
const TTS=(options={voice:{},speed:1})=>stage('device','kokoro-82m-v1.0',options);
async function measured(s,caps=PAGE_CAPS){s.context.__caps=caps;s.run('window.roomTranscription=Object.assign(window.roomTranscription||{},{capabilities:async()=>__caps})');await s.run('measureDevice(true)')}
const stageView=(s,task)=>plain(s.run('roomStore.getState().stages.'+task));
// Choosing a place, a model or a build checks it before it takes effect (sidevoice/sidevoice-core#21). Where a test is about what the
// panes show and save, every check passes at once, with nothing to download.
function passing(s){s.run("consentFor=async()=>null;verifyStage=async()=>({ok:true,step:'done',passes:[],latency_ms:1,slow:false})")}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0))};
function listed(s,listing){s.run(`roomStore.patch({integrations:${JSON.stringify(listing)},integrationsStatus:'ready'})`)}
function openaiPane(s,listing){listed(s,listing);s.run(`roomStore.patch({voicePreferences:{stt:${JSON.stringify(stage('openai','gpt-4o-mini-transcribe',{language:'es',context:''}))}}})`)}
test('The React component tree initializes without inventing missing DOM elements',()=>{
 const s=setup({strictDOM:true});
 assert.equal(s.run("$('missing-element')"),null);
 assert.equal(s.run("typeof $('settings-machines').onclick"),'function','machine settings have a section in the shell');
 for(const action of ['toggleCall','toggleMic','cancelInput','typeIntegrationKey','checkIntegrationKey','clearIntegrationKey','openIntegration','chooseStagePlace','chooseStageModel','setStageOption','chooseStageBuild','transcriptionTrial','previewVoice','prepareVoice','retryIntegrations'])
 assert.equal(s.run("typeof window.sidevoiceActions."+action),'function','React calls '+action+', it does not reach into the DOM');
 for(const id of ['pane-machines','settings-machines','pane-voice','pane-transcription'])
  assert.ok(s.run("$('"+id+"')"),id);
 for(const id of ['stt-provider','tts-provider','stt-device','tts-device','stt-key','elevenlabs-key'])
  assert.equal(s.run("$('"+id+"')"),null,'the panes are the store\'s, and a pane does not authenticate: '+id);
});
test('An STT stage edit or selected pairing change discards an active transcription trial',async()=>{
 const s=setup({strictDOM:true});s.context.cancelledTrials=0;
 await measured(s);
 s.run("roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT())+"}})");
 s.run("activeTranscriptionTrials.add({hostFp:'fp-mac',handle:{cancel:()=>cancelledTrials++}});window.sidevoiceActions.setStageOption('stt','language','fr')");
 assert.equal(s.context.cancelledTrials,1,'a changed transcription option cancels capture or inference');
 s.context.cancelledTrials=0;
 const second={...PAIRED,fp:'fp-nuc',host:'nuc',token:'tok-2',urls:['http://127.0.0.1:8876']};
 s.context.__second=second;
 s.run("pairings={inUse:'fp-mac',list:[pairings.list[0],__second]};activeTranscriptionTrials.add({hostFp:'fp-mac',handle:{cancel:()=>cancelledTrials++}});window.sidevoiceActions.chooseMachine('fp-nuc')");
 assert.equal(s.context.cancelledTrials,1,'changing the selected pairing cancels a trial before it can use another host');
});
test('Each integration shows its key masked, what it serves, and where the key came from',()=>{
 const s=setup({strictDOM:true});
 s.run(`integrations=${JSON.stringify(LISTING(OPENAI({configured:true,source:'environment',hint:'…9f2a'}),ELEVEN({configured:true,source:'stored',hint:'…test'})))}`);
 const [openai,eleven]=s.run('roomStore.getState().integrations.rows');
 assert.equal(eleven.placeholder,'•••••••• …test','every provider shows the same four digits, in the field');
 assert.equal(eleven.note,'','and the line below says nothing when there is nothing to say');
 assert.equal(eleven.canClear,true);
 assert.equal(eleven.uses,'Voz');
 assert.equal(openai.placeholder,'•••••••• …9f2a');
 assert.match(openai.note,/entorno de la máquina \(VOICE_STT_API_KEY\)/,'a key it cannot remove is explained');
 assert.equal(openai.canClear,false);
 assert.equal(openai.uses,'Transcripción');
 s.run(`integrations=${JSON.stringify(LISTING(OPENAI()))}`);
 const [none]=s.run('roomStore.getState().integrations.rows');
 assert.equal(none.placeholder,'Sin clave','an empty field says so where the key would go');
 assert.equal(none.canClear,false);
});
test('A WASM-only page offers the three models it can run; WebGPU with f16 offers all five, and never a native build',async()=>{
 const s=setup({strictDOM:true});
 await measured(s,{webgpu:false,webgpuFp16:false,wasm:true});
 assert.deepEqual(plain(s.run('deviceCapabilities')),{runs:'page',has:['wasm']});
 assert.deepEqual(stageView(s,'stt').models.map(m=>m.id),['whisper-tiny','whisper-base']);
 assert.deepEqual(stageView(s,'tts').models.map(m=>m.id),['kokoro-82m-v1.0']);
 await measured(s,PAGE_CAPS);
 assert.deepEqual(stageView(s,'stt').models.map(m=>m.id),['whisper-tiny','whisper-base','whisper-small','whisper-large-v3-turbo']);
 assert.ok(plain(s.run('deviceOffers')).every(offer=>offer.engine==='transformers-js'),'a page runs page engines only');
 assert.deepEqual(stageView(s,'stt').places.map(p=>[p.id,p.label]),[['device','Este dispositivo']]);
 assert.equal(stageView(s,'stt').where,'page','only a page says it runs in the browser');
});
test('Inside the desktop app only the native engine\'s report counts: no page build, no WebGPU, and what is on disk says so',async()=>{
 const s=setup({strictDOM:true});let asked=0;
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{
  capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>[{model:'whisper-small',engine:'sherpa-onnx'}]}}};
 s.run('roomStore.patch({inApp:true})');
 s.context.window.roomTranscription={capabilities:async()=>{asked++;return PAGE_CAPS}};
 await s.run('measureDevice(true)');
 assert.equal(asked,0,'the page\'s own engines are not even asked');
 const offers=plain(s.run('deviceOffers'));
 assert.deepEqual(offers.map(o=>o.model),['whisper-tiny','whisper-base','whisper-small','whisper-large-v3-turbo','kokoro-82m-v1.0']);
 assert.ok(offers.every(o=>o.engine==='sherpa-onnx'&&[o,...o.alternatives].every(c=>!['webgpu','wasm'].includes(c.accelerator))));
 const stt=stageView(s,'stt');
 assert.equal(stt.where,'app');
 assert.match(stt.models.find(m=>m.id==='whisper-small').detail,/descargado/);
 assert.doesNotMatch(stt.models.find(m=>m.id==='whisper-tiny').detail,/descargado/);
 assert.equal(stt.advanced.choices[0].label,'Automático (sherpa-onnx · CPU)');
 assert.ok(!JSON.stringify(stageView(s,'tts')).match(/navegador|WebGPU|WASM/),'no page words in the app');
});
test('A place change makes the model list follow; a model change makes the options follow its family',async()=>{
 const s=setup({strictDOM:true});
 await measured(s);
 listed(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}),ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.run("roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT())+"}})");
 s.context.fetch=async()=>({ok:true,json:async()=>({models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}],error:null})});
 passing(s);
 assert.deepEqual(stageView(s,'stt').places.map(p=>p.id),['device','openai']);
 await s.run("window.sidevoiceActions.chooseStagePlace('stt','openai')");
 await settle();
 let stt=stageView(s,'stt');
 assert.equal(stt.place,'openai');
 assert.deepEqual(stt.models.map(m=>m.id),['gpt-4o-transcribe'],'the provider\'s own list');
 assert.equal(stt.advanced,null,'a provider has no build to choose');
 assert.deepEqual(stt.options.map(o=>o.id),['language','context'],'the provider\'s option schema');
 s.run("window.sidevoiceActions.chooseStagePlace('stt','device')");await settle();
 assert.equal(stageView(s,'stt').model,'whisper-tiny','back on this device, its first offer');
 s.run("window.sidevoiceActions.setStageOption('stt','language','fr')");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-small')");await settle();
 stt=stageView(s,'stt');
 assert.equal(stt.model,'whisper-small');
 assert.equal(stt.options.find(o=>o.id==='language').value,'fr','a value the new model still takes is kept');
 const tts=stageView(s,'tts');
 assert.deepEqual(tts.options.map(o=>[o.id,o.kind]),[['voice','voice'],['speed','range']],'Kokoro\'s family: a voice per language and a speed');
 assert.deepEqual(tts.options[0].rows.find(r=>r.language==='es').choices.map(c=>c.value),['','ef_dora','em_alex','em_santa']);
 s.run("window.sidevoiceActions.setStageOption('tts','voice','em_alex','es')");
 assert.deepEqual(plain(s.run('stageDraft.tts.options.voice')),{es:'em_alex'});
 s.run("window.sidevoiceActions.chooseStageBuild('stt','transformers-js/wasm')");
 assert.equal(stageView(s,'stt').advanced.value,'auto','a build this model cannot run here is not kept');
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-tiny')");await settle();
 s.run("window.sidevoiceActions.chooseStageBuild('stt','transformers-js/wasm')");await settle();
 assert.equal(stageView(s,'stt').advanced.value,'transformers-js/wasm');
});

// ----- a key checks itself where it is typed, and its models arrive with it -----
test('A pasted OpenAI key is checked on leaving the field and brings its models into Transcripción',async()=>{
 const s=setup({strictDOM:true});const calls=[];
 s.context.fetch=async(path,options)=>{
  calls.push([options?.method||'GET',path,options?.body]);
  if(path.includes('/integrations/openai'))return {ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}))};
  if(path.includes('/transcription/models'))return {ok:true,json:async()=>({models:[{id:'gpt-4o-transcribe',label:'GPT-4o'},{id:'gpt-4o-mini-transcribe',label:'GPT-4o mini'}],error:null})};
  throw Error('unexpected request: '+path);
 };
 await measured(s);openaiPane(s,LISTING(OPENAI()));
 assert.deepEqual(stageView(s,'stt').places.map(p=>[p.id,p.state]),[['device','ready'],['openai','missing']],'a provider with no key is greyed out, not gone');
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','sk-nueva')");
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.deepEqual(calls.map(call=>call[0]),['PUT','GET'],'the key is sent once, and its models asked for once');
 assert.match(calls[0][1],/\/api\/presentation\/integrations\/openai$/);
 assert.equal(calls[0][2],JSON.stringify({key:'sk-nueva'}));
 assert.match(calls[1][1],/transcription\/models\?provider=openai/);
 const stt=stageView(s,'stt');
 assert.deepEqual(stt.places.map(p=>[p.id,p.state]),[['device','ready'],['openai','ready']],'the places follow the listing by themselves');
 assert.deepEqual(stt.models.map(m=>m.id),['gpt-4o-transcribe','gpt-4o-mini-transcribe'],'the list fills in place, with no save and no reopen');
 assert.equal(stt.model,'gpt-4o-mini-transcribe','the model already chosen stays chosen while it is still offered');
 const [row]=s.run('roomStore.getState().integrations.rows');
 assert.equal(row.note,'Clave verificada · Modelos actualizados');
 assert.equal(row.draft,'','a verified key is stored, so it leaves the field');
 assert.match(row.placeholder,/…k3y9/,'and shows itself masked, like any stored key');
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.equal(calls.length,2,'leaving an empty field asks the machine for nothing');
 await s.run('settleIntegrationKeys()');
 assert.equal(calls.length,2,'and saving sends no key again: the verified one is already stored');
});
test('A pause while typing checks the key without waiting for the field to be left',async()=>{
 const s=setup({strictDOM:true});const calls=[];let pause=null;
 s.context.setTimeout=fn=>{pause=fn;return 1};s.context.clearTimeout=()=>{pause=null};
 s.context.fetch=async(path,options)=>{
  calls.push([options?.method||'GET',path]);
  if(path.includes('/integrations/openai'))return {ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}))};
  return {ok:true,json:async()=>({models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}],error:null})};
 };
 openaiPane(s,LISTING(OPENAI()));
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','sk-nueva')");
 assert.equal(calls.length,0,'nothing travels while the key is still being typed');
 pause();await s.run('keyChecks.openai.chain');
 assert.deepEqual(calls.map(call=>call[0]),['PUT','GET']);
 assert.equal(s.run("remoteModels['openai:stt'].models.length"),1);
});
test('A key typed for one machine is never sent to another, and the first machine\'s answers are dropped (F13)',async()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 const calls=[];let pause=null,answer;
 s.context.setTimeout=fn=>{pause=fn;return 1};s.context.clearTimeout=()=>{pause=null};
 s.context.fetch=(path,options)=>{calls.push([options?.method||'GET',path,options?.headers?.Authorization]);return new Promise(resolve=>{answer=resolve})};
 openaiPane(s,LISTING(OPENAI()));
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','SYNTHETIC_KEY_FOR_A')");
 const listing=s.run('loadIntegrations()');   // machine A's listing, still on its way
 s.run("keepPairings(usingPairing(pairings,'fp-nuc'));nodeBase='https://b.example'");
 assert.equal(s.run('integrationsStatus'),'idle','another machine: nothing of the first one is kept');
 assert.deepEqual(plain(s.run('integrationDrafts')),{},'what was typed for it is gone');
 assert.equal(s.run('integrations'),null);
 pause?.();await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(!calls.some(call=>call[0]==='PUT'),'the old pause does not send the key anywhere');
 answer({ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…aaaa'}))});await listing;
 assert.equal(s.run('integrations'),null,'and machine A\'s late listing does not land on machine B');
 s.run("$('language-settings').open=true;settleBase({base:'https://b.example',via:'node'},'ok',pairingInUse(pairings))");
 const reread=calls.filter(call=>call[1].includes('/api/presentation/integrations'));
 assert.deepEqual(reread.at(-1).slice(1),['https://b.example/api/presentation/integrations','Bearer tok-b'],'the settings open on B read B\'s listing, with B\'s token');
});
test('The stages are each machine\'s own: switching machine switches them, drafts included, and saving on one leaves the other\'s (R04)',async()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 const A_STT=stage('openai','model-of-a',{language:'es',context:'Proyecto A'});
 s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{stt:A_STT}});
 await measured(s);
 s.run("ws=null;roomStore.patch({voicePreferences:{ui_language:'es',...storedPreferences()}})");
 assert.equal(stageView(s,'stt').model,'model-of-a');
 s.run("roomStore.patch({integrationsStatus:'ready'});window.sidevoiceActions.setStageOption('stt','context','sin guardar')");
 s.run("keepPairings(usingPairing(pairings,'fp-nuc'))");
 assert.equal(s.run('stageDraft'),null,'the unsaved draft of A does not follow to B');
 assert.equal(s.run('voicePreferences.stt'),undefined,'B has no stages of its own yet');
 assert.equal(s.run('storedPreferences().stt'),undefined);
 assert.equal(stageView(s,'stt').place,'device','B starts from this device\'s best offer');
 s.run("$('language-settings').close=()=>{}");
 await s.run('saveSettings()');
 const stages=JSON.parse(s.saved['sidevoice.stages']);
 assert.deepEqual(stages.hosts[PAIRED.fp].stt,A_STT,'saving on B leaves A\'s stages as they were');
 assert.equal(stages.hosts['fp-nuc'].stt.place,'device');
 s.run("keepPairings(usingPairing(pairings,'fp-mac'))");
 assert.equal(s.run('voicePreferences.stt.model'),'model-of-a','and back on A, A\'s are there');
});
test('Legacy general stages fill missing tasks for every host already paired at migration',()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 const generalStt=stage('openai','gpt-4o-transcribe',{language:'es'}),generalTts=stage('elevenlabs','eleven_v3',{voice:{es:'v1'},speed:1});
 const hostTts=stage('elevenlabs','eleven_flash_v2_5',{voice:{es:'v2'},speed:.9});
 s.saved['sidevoice.settings']=JSON.stringify({ui_language:'en',stt:generalStt,tts:generalTts});
 s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{tts:hostTts}});
 assert.equal(s.run('storedPreferences().stt.model'),'gpt-4o-transcribe');
 const scope=JSON.parse(s.saved['sidevoice.stages']);
 assert.deepEqual(Object.keys(scope).sort(),['default','hosts'],'legacy storage is rewritten in the approved shape');
 assert.deepEqual(scope.default,{},'general settings are consumed by the paired-host snapshot');
 assert.deepEqual(scope.hosts[PAIRED.fp],{stt:generalStt,tts:hostTts},'host A receives missing defaults but keeps its TTS override');
 assert.deepEqual(scope.hosts[B.fp],{stt:generalStt,tts:generalTts},'host B receives the general STT and TTS it did not override');
 assert.deepEqual(JSON.parse(s.saved['sidevoice.settings']),{ui_language:'en'},'migration clears only the legacy stage fields');
 assert.equal(s.saved['sidevoice.stages.legacy-defaults-migrated'],'true','the legacy migration is frozen after it is saved');
 s.run("keepPairings(usingPairing(pairings,'fp-nuc'))");
 assert.equal(s.run('storedStages(pairings.inUse).stt.model'),'gpt-4o-transcribe','B reads its migrated transcription stage');
 assert.equal(s.run('storedStages(pairings.inUse).tts.model'),'eleven_v3','B reads its migrated voice stage');
 const C={...PAIRED,fp:'fp-server',host:'server',urls:['https://c.example'],token:'tok-c'};
 s.context.__laterHost=C;
 s.run('keepPairings(withPairing(pairings,__laterHost))');
 assert.equal(Object.keys(s.run('storedStages(pairings.inUse)')).length,0,'a host paired after migration receives no legacy defaults');
 s.run("keepPairings(usingPairing(pairings,'fp-mac'))");
 assert.equal(s.run('storedStages(pairings.inUse).stt.model'),'gpt-4o-transcribe','host A keeps the migrated transcription stage');
 assert.equal(s.run('storedStages(pairings.inUse).tts.model'),'eleven_flash_v2_5','host A keeps its TTS override');
});
test('Before a machine is paired, stage choices stay in the device default scope',()=>{
 const s=setup({strictDOM:true,paired:false,stored:null});
 const general=stage('openai','gpt-4o-transcribe',{language:'en'});
 s.saved['sidevoice.settings']=JSON.stringify({ui_language:'en',stt:general});
 assert.equal(s.run('storedPreferences().stt.model'),'gpt-4o-transcribe');
 const scope=JSON.parse(s.saved['sidevoice.stages']);
 assert.deepEqual(scope.default,{stt:general});
 assert.deepEqual(scope.hosts,{});
 s.context.__pairingProjection={inUse:PAIRED.fp,list:[PAIRED]};
 s.run('pairings=__pairingProjection');
 assert.equal(s.run('storedStages(pairings.inUse).stt.model'),'gpt-4o-transcribe','the first host adopts the no-machine default');
 s.context.__pairingProjection={inUse:'fp-nuc',list:[PAIRED,{...PAIRED,fp:'fp-nuc'}]};
 s.run('pairings=__pairingProjection');
 assert.equal(s.run('storedStages(pairings.inUse).stt'),undefined,'a later host starts empty');
});
test('A key verified on one machine does not label the next machine\'s row, however late its lists arrive (R04)',async()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 let releaseModels;
 s.context.fetch=async(path,options)=>{
  if(options?.method==='PUT')return {ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}))};
  if(path.includes('/transcription/models')){await new Promise(resolve=>{releaseModels=resolve});return {ok:true,json:async()=>({models:[{id:'m'}]})}}
  return new Promise(()=>{});
 };
 openaiPane(s,LISTING(OPENAI()));
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','sk-a')");
 const checking=s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 for(let i=0;i<50&&!releaseModels;i++)await new Promise(resolve=>setTimeout(resolve,1));
 s.run("keepPairings(usingPairing(pairings,'fp-nuc'))");
 releaseModels();await checking;
 assert.deepEqual(plain(s.run('integrationChecks')),{},'nothing was verified on B, so B\'s row says nothing');
});
test('A device that runs no model gets no made-up provider stage: the pane asks for a place, and joining stops at "configure" (R06)',async()=>{
 const s=setup({strictDOM:true});
 const WINDOWS={runs:'native',os:'windows',arch:'x86_64',has:['cpu'],memory_mb:null};
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>WINDOWS,installed:async()=>[]}}};
 await s.run('measureDevice(true)');
 assert.deepEqual(plain(s.run('deviceOffers')),[],'no native package for this platform');
 s.context.fetch=async()=>({ok:true,json:async()=>({ui_language:'es'})});
 await assert.rejects(()=>s.run('callPreferences()'),/Elige dónde transcribir: este dispositivo no puede ejecutar ningún modelo\. Configúralo en Configuración\./);
 listed(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}),ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.run("roomStore.patch({voicePreferences:{}})");
 const stt=stageView(s,'stt');
 assert.deepEqual([stt.unconfigured,stt.place,stt.model],[true,'','']);
 assert.deepEqual(stt.places.map(p=>p.id),['openai'],'the places there are, and no device');
 // A saved provider stage with its model (and, for the voice, its voice) is what a call is built from.
 s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{stt:stage('openai','gpt-4o-transcribe',{language:'es'}),tts:stage('elevenlabs','eleven_v3',{voice:{es:'v1'},speed:1})}});
 const p=plain(await s.run('callPreferences()'));
 assert.deepEqual([p.stt.place,p.stt.model,p.tts.place,p.tts.options.voice],['openai','gpt-4o-transcribe','elevenlabs',{es:'v1'}]);
});
test('Joining on a device that runs nothing, with nothing configured, opens no socket and says what to do (R06)',async()=>{
 const s=setup({strictDOM:true});const sockets=[];
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>({runs:'native',os:'windows',arch:'x86_64',has:['cpu']}),installed:async()=>[]}}};
 s.context.WebSocket=class{constructor(){sockets.push(this)}};
 s.context.fetch=async()=>({ok:true,json:async()=>({ui_language:'es'})});
 s.context.window.roomVoice={unlock:async()=>{},prepare:async()=>{},cancel(){}};
 s.context.window.roomTranscription={stop(){}};
 await s.run('toggleCall()');
 assert.equal(sockets.length,0);
 assert.match(s.run('joinView(state).text'),/Elige dónde transcribir/);
 assert.equal(s.run('joinView(state).failed'),true);
});
test('A key the provider refuses leaves the previous one in place and says so',async()=>{
 const s=setup({strictDOM:true});const calls=[];
 s.context.fetch=async path=>{calls.push(path);return {ok:false,json:async()=>({detail:'OpenAI rejected the key.'})}};
 openaiPane(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…vieja'})));
 s.run("patchRemote('openai:stt',{models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}],error:''});window.sidevoiceActions.typeIntegrationKey('openai','sk-mala')");
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.equal(calls.length,1,'a refused key is not followed by a request for models');
 const row=()=>s.run('roomStore.getState().integrations.rows')[0];
 assert.equal(row().note,'Clave rechazada · OpenAI rejected the key. · La clave anterior sigue en uso');
 assert.equal(row().status,'refused');
 assert.equal(row().draft,'sk-mala','what was typed stays, to be corrected instead of retyped');
 assert.match(row().placeholder,/…vieja/,'and the key that was working is still the installed one');
 assert.deepEqual(stageView(s,'stt').models.map(m=>m.id),['gpt-4o-transcribe','gpt-4o-mini-transcribe'],'the models of the key that works are untouched, and the saved one is still there');
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.equal(calls.length,1,'leaving the field again does not send a key already refused');
 await assert.rejects(()=>s.run('settleIntegrationKeys()'),/Clave rechazada/,'saving does not close over a key the provider refused');
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','')");
 assert.equal(row().note,'','emptying the field takes the complaint away with it');
 await s.run('settleIntegrationKeys()');
});
test('A key field the browser filled in on its own never blocks saving (iPhone, 2026-09-26)',async()=>{
 const s=setup({strictDOM:true});const calls=[];
 s.context.fetch=async path=>{calls.push(path);return {ok:false,json:async()=>({detail:'OpenAI rejected the key.'})}};
 s.run(`integrations=${JSON.stringify(LISTING(OPENAI({configured:true,source:'stored',hint:'…buena'})))};forgetKeyChecks()`);
 await s.run('settleIntegrationKeys()');
 assert.equal(calls.length,0,'nobody typed it, so nobody asked for it to be installed');
});
test('A key with nothing stored behind it says that nothing is saved',async()=>{
 const s=setup({strictDOM:true});
 s.context.fetch=async()=>({ok:false,json:async()=>({detail:'The key is empty.'})});
 openaiPane(s,LISTING(OPENAI()));
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','sk-mala')");
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.equal(s.run('roomStore.getState().integrations.rows')[0].note,'Clave rechazada · The key is empty. · No hay ninguna clave guardada');
});
test('A verified ElevenLabs key lights up its place in Voz and brings its models and voices, with no save',async()=>{
 const s=setup({strictDOM:true});const calls=[];
 s.context.fetch=async(path,options)=>{
  calls.push([options?.method||'GET',path]);
  if(path.includes('/integrations/elevenlabs'))return {ok:true,json:async()=>LISTING(ELEVEN({configured:true,source:'stored',hint:'…11ab'}))};
  if(path.includes('/voice-catalog'))return {ok:true,json:async()=>({providers:{elevenlabs:{models:[{id:'eleven_flash_v2_5',label:'Eleven Flash v2.5'},{id:'eleven_v3',label:'Eleven v3'}],voices:[{id:'v1',label:'Nube',languages:['es']}]}}})};
  throw Error('unexpected request: '+path);
 };
 await measured(s);listed(s,LISTING(ELEVEN()));
 assert.deepEqual(stageView(s,'tts').places.map(p=>[p.id,p.state]),[['device','ready'],['elevenlabs','missing']]);
 s.run("window.sidevoiceActions.typeIntegrationKey('elevenlabs','eleven-nueva')");
 await s.run("window.sidevoiceActions.checkIntegrationKey('elevenlabs')");
 assert.deepEqual(calls.map(call=>call[0]),['PUT','GET'],'the key is sent once, and the catalogue asked for once');
 assert.match(calls[1][1],/voice-catalog/);
 passing(s);
 s.run("window.sidevoiceActions.chooseStagePlace('tts','elevenlabs')");await settle();
 const tts=stageView(s,'tts');
 assert.deepEqual(tts.models.map(m=>m.id),['eleven_flash_v2_5','eleven_v3'],'its models fill the list in place');
 const es=tts.options[0].rows.find(r=>r.language==='es');
 assert.deepEqual(es.choices.map(c=>[c.value,!!c.other]),[['',false],['v1',false]],'the account\'s voices, its own language first');
 assert.equal(tts.options[1].max,1.2,'and the provider\'s own speed range');
 const [row]=s.run('roomStore.getState().integrations.rows');
 assert.equal(row.note,'Clave verificada · Voces actualizadas');
 assert.equal(row.draft,'');
});
test('A provider\'s "Automática" voice is the voice the preview speaks, and it is saved with the stage (R02)',async()=>{
 const s=setup({strictDOM:true});const stored=[],spoken=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 s.context.AbortController=AbortController;
 s.context.fetch=async()=>({ok:true,json:async()=>({audio_base64:'SUQz'})});
 s.context.window.roomVoice={unlock:async()=>{},cancel(){},playEncoded:async()=>{}};
 await measured(s);listed(s,LISTING(ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.run("$('preview-audio').pause=()=>{};ws=null;roomStore.patch({voicePreferences:{}});patchRemote('elevenlabs:tts',{models:[{id:'eleven_v3',label:'Eleven v3'}],voices:[{id:'voice-1',label:'Nube',languages:['en']}]})");
 passing(s);
 s.run("window.sidevoiceActions.chooseStagePlace('tts','elevenlabs')");await settle();
 const row=stageView(s,'tts').options[0].rows.find(r=>r.language==='en');
 assert.deepEqual([row.value,row.choices[0].label],['','Automática · Nube'],'the automatic choice says which voice it is');
 const origFetch=s.context.fetch;s.context.fetch=async(path,options)=>{spoken.push(JSON.parse(options.body));return origFetch()};
 await s.run("previewVoice('en')");
 assert.equal(spoken[0].voice,'voice-1');
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 const {tts}=stored.find(([key])=>key==='sidevoice.stages')[1].hosts[PAIRED.fp];
 assert.equal(tts.options.voice.en,'voice-1','the call speaks the voice the preview spoke: the node has no automatic of its own');
});
test('A provider\'s voice stage with no voice to choose from is not saved (R02)',async()=>{
 const s=setup({strictDOM:true});const stored=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 await measured(s);listed(s,LISTING(ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.run("ws=null;roomStore.patch({voicePreferences:{}});patchRemote('elevenlabs:tts',{models:[{id:'eleven_v3',label:'Eleven v3'}],voices:[]})");
 s.run("window.sidevoiceActions.chooseStagePlace('tts','elevenlabs')");
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 assert.equal(s.run("$('settings-error').textContent"),'Elige una voz de ElevenLabs.');
 assert.equal(stored.length,0,'nothing is saved that the call could not speak');
});
test('Removing a key acts at once, greys the place out, and takes what was typed with it (F16)',async()=>{
 const s=setup({strictDOM:true});const calls=[];let release;
 s.context.fetch=async(path,options)=>{
  calls.push([options?.method||'GET',path]);
  if(options?.method==='PUT'){await new Promise(resolve=>{release=resolve});return {ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…nuev'}))}}
  return {ok:true,json:async()=>LISTING(OPENAI())};
 };
 await measured(s);openaiPane(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'})));
 s.run("patchRemote('openai:stt',{models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}],error:''})");
 s.run("window.sidevoiceActions.typeIntegrationKey('openai','sk-nueva')");
 const checking=s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 await new Promise(resolve=>setTimeout(resolve,0));
 const clearing=s.run("window.sidevoiceActions.clearIntegrationKey('openai')");
 assert.equal(s.run('integrationDrafts.openai'),'','the key being typed goes with the one removed');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(calls.map(c=>c[0]),['PUT'],'the removal waits for the check this page still has in flight');
 release();await checking;await clearing;
 assert.deepEqual(calls.map(c=>c[0]),['PUT','GET','DELETE'],'and then goes, last: nothing of this page can undo it');
 assert.equal(stageView(s,'stt').places.find(p=>p.id==='openai').state,'missing');
 assert.equal(s.run("remoteModels['openai:stt']"),undefined,'the models of a key that is gone go with it');
 await s.run("window.sidevoiceActions.checkIntegrationKey('openai')");
 assert.equal(calls.length,3,'and a later blur has nothing to send');
});
test('"Configurar" opens the in-use machine\'s Integrations tab at the provider row',()=>{
 const s=setup({strictDOM:true});
 s.run(`integrations=${JSON.stringify(LISTING(OPENAI(),ELEVEN()))}`);
 s.run("settingsSection('voice');window.sidevoiceActions.openIntegration('elevenlabs')");
 assert.equal(s.run("$('pane-machines').hidden"),false);
 assert.equal(s.run("$('pane-voice').hidden"),true);
 assert.equal(s.run("$('settings-machines').getAttribute('aria-pressed')"),'true');
 const route=s.dispatched.filter(event=>event.type==='sidevoice:open-host-settings').at(-1);
 assert.equal(route.detail.tab,'integrations');
 assert.equal(route.detail.fp,PAIRED.fp);
 assert.deepEqual(plain(s.run('roomStore.getState().integrations.rows').map(row=>[row.id,row.focused])),[['openai',false],['elevenlabs',true]]);
 s.run("settingsSection('general')");
 assert.equal(s.run('integrationFocus'),null,'leaving the section lets the row go');
});
function settingsFetch({integrations=async()=>({ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}),ELEVEN())})}={}){
 const calls=[];
 const fetch=async path=>{
  calls.push(path);
  if(path.includes('/integrations'))return integrations();
  if(path.includes('/transcription/models'))return {ok:true,json:async()=>({models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}]})};
  if(path.includes('/voice-catalog'))return {ok:true,json:async()=>({providers:{elevenlabs:{models:[],voices:[]}}})};
  return {ok:true,json:async()=>({ui_language:'es',audio_grace_seconds:1,replay_on_return_seconds:120,turn_patience:'normal',stt:{place:'device',model:'whisper-tiny',options:{},build:null}})};
 };
 return {fetch,calls};
}
test('Opening Settings reads the integrations and each opening asks a provider\'s models again, so a saved OpenAI stays chosen',async()=>{
 const s=setup({strictDOM:true});
 s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{stt:stage('openai','gpt-4o-transcribe',{language:'es',context:''})}});
 s.run("window.roomTranscription={capabilities:async()=>({webgpu:false,wasm:true})};window.roomI18n={setLanguage(){}}");
 const {fetch,calls}=settingsFetch();s.context.fetch=fetch;
 s.run('window.sidevoiceActions.openSettings()');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(stageView(s,'stt').place,'openai');
 assert.deepEqual(stageView(s,'stt').models.map(m=>m.id),['gpt-4o-transcribe']);
 assert.equal(s.run("$('settings-error').textContent"),'');
 s.run('window.sidevoiceActions.openSettings()');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls.filter(path=>path.includes('/transcription/models')).length,2,'a fresh list on every opening');
});
test('Settings opens on device preferences and Machines stays navigable while host languages never resolve',async()=>{
 const s=setup({strictDOM:true});
 s.saved['sidevoice.settings']=JSON.stringify({ui_language:'en',audio_grace_seconds:2});
 s.run("window.roomI18n={setLanguage(){}}");
 s.context.fetch=path=>path==='/api/presentation/languages'?new Promise(()=>{}):new Promise(()=>{});

 // Do not await the click: a host is allowed to leave its preference response pending indefinitely.
 s.run('window.sidevoiceActions.openSettings()');
 assert.equal(!!s.run("$('language-settings').open"),true,'the click opens the actual dialog before waiting for the host');
 assert.equal(s.run("$('ui-language').value"),'en','the dialog first uses this device\'s saved preference');
 s.run("$('settings-machines').click()");
 assert.equal(s.run("$('pane-machines').hidden"),false,'the Machines pane responds while the host request is pending');
 assert.equal(s.run("$('pane-general').hidden"),true);
});
test('Late host preferences fill the saved host stage but preserve edits made after Settings opened',async()=>{
 const s=setup({strictDOM:true});
 const A_STT=stage('openai','model-of-a',{language:'es',context:'host A'});
 s.saved['sidevoice.settings']=JSON.stringify({ui_language:'en',audio_grace_seconds:2});
 s.saved['sidevoice.stages']=JSON.stringify({default:{},hosts:{[PAIRED.fp]:{stt:A_STT}}});
 s.run("window.roomI18n={setLanguage(){}}");
 let release;const pending=new Promise(resolve=>{release=resolve});
 s.context.fetch=path=>path==='/api/presentation/languages'?pending:new Promise(()=>{});

 s.run('window.sidevoiceActions.openSettings()');
 assert.equal(s.run("$('ui-language').value"),'en','opening does not wait for host preferences');
 assert.equal(s.run("$('audio-grace-seconds').value"),'2');
 s.run("$('audio-grace-seconds').value='7'");
 const draft=stage('device','whisper-base',{language:'en',context:'typed while loading'});
 s.context.__draft=draft;s.run('roomStore.patch({stageDraft:{stt:__draft,tts:null}})');
 release({ok:true,json:async()=>({ui_language:'es',audio_grace_seconds:9,replay_on_return_seconds:45})});
 await settle();

 assert.equal(s.run("$('audio-grace-seconds').value"),'7','a value edited while the request was pending stays in the form');
 assert.equal(s.run('voicePreferences.stt.model'),'model-of-a','the in-use host keeps its saved stage');
 assert.equal(JSON.stringify(s.run('stageDraft.stt')),JSON.stringify(draft),'the user\'s unsaved stage draft survives the response');
 assert.equal(s.run('settingsPreferences.status'),'ready');
});
test('Switching machines cancels the open Settings preference request before its host answer arrives',async()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 const B_STT=stage('device','whisper-base',{language:'en',context:'host B'});
 s.saved['sidevoice.stages']=JSON.stringify({default:{},hosts:{[PAIRED.fp]:{stt:stage('openai','model-of-a')},[B.fp]:{stt:B_STT}}});
 s.run("window.roomI18n={setLanguage(){}}");
 const releases=[];
 s.context.fetch=path=>String(path).endsWith('/api/presentation/languages')?new Promise(resolve=>releases.push(resolve)):new Promise(()=>{});

 s.run('window.sidevoiceActions.openSettings()');
 const oldRequest=s.run('settingsPreferences.request');
 s.run("keepPairings(usingPairing(pairings,'fp-nuc'))");
 s.run("settleBase(null,'',pairingInUse(pairings))");
 s.run("settleBase({base:'https://b.example',via:'node'},'ok',pairingInUse(pairings))");
 const switched=s.run('settingsPreferences');
 assert.equal(switched.host,B.fp);
 assert.equal(switched.status,'loading','the selected host starts its own read when its address is proved');
 assert.ok(switched.request>oldRequest,'host selection invalidates the previous request epoch');
 assert.equal(releases.length,2,'one request for A was dropped and a new one was sent to B');
 s.run("$('audio-grace-seconds').value='6'");
 releases[0]({ok:true,json:async()=>({ui_language:'es',audio_grace_seconds:9,replay_on_return_seconds:33})});
 await settle();

 const after=s.run('settingsPreferences');
 assert.equal(after.host,B.fp,'the previous host cannot claim the new selection');
 assert.equal(after.status,'loading','the previous host response cannot change the current request state');
 assert.equal(s.run("$('audio-grace-seconds').value"),'6','editing B while it loads is protected from A\'s late answer');
 releases[1]({ok:true,json:async()=>({ui_language:'fr',audio_grace_seconds:5,replay_on_return_seconds:55})});
 await settle();
 assert.equal(s.run('settingsPreferences.status'),'ready');
 assert.equal(s.run("$('audio-grace-seconds').value"),'6','the new host response preserves an edit made after switching');
 assert.equal(s.run("$('replay-on-return-seconds').value"),'55','B\'s defaults fill fields the user did not edit');
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-base','the newly selected host keeps its own saved stage');
});
test('Switching a loaded Settings form reseeds device values, then fills the selected host defaults',async()=>{
 const B={...PAIRED,fp:'fp-nuc',host:'nuc',urls:['https://b.example'],token:'tok-b'};
 const s=setup({strictDOM:true,stored:{in_use:PAIRED.fp,pairings:[PAIRED,B]}});
 s.saved['sidevoice.settings']=JSON.stringify({ui_language:'en'});
 s.run("window.roomI18n={setLanguage(){}}");
 const releases=[];
 s.context.fetch=path=>String(path).endsWith('/api/presentation/languages')?new Promise(resolve=>releases.push(resolve)):new Promise(()=>{});

 s.run('window.sidevoiceActions.openSettings()');
 releases[0]({ok:true,json:async()=>({ui_language:'es',audio_grace_seconds:9,replay_on_return_seconds:33})});
 await settle();
 assert.deepEqual([s.run("$('audio-grace-seconds').value"),s.run("$('replay-on-return-seconds').value")],['9','33'],'host A fills its defaults');

 s.run("keepPairings(usingPairing(pairings,'fp-nuc'))");
 s.run("settleBase(null,'',pairingInUse(pairings))");
 assert.deepEqual([s.run("$('audio-grace-seconds').value"),s.run("$('replay-on-return-seconds').value")],['1','120'],'switching clears A\'s server defaults back to this device\'s safe values');
 s.run("settleBase({base:'https://b.example',via:'node'},'ok',pairingInUse(pairings))");
 assert.equal(releases.length,2,'the selected host is read after its new base is ready');
 releases[1]({ok:true,json:async()=>({ui_language:'fr',audio_grace_seconds:5,replay_on_return_seconds:55})});
 await settle();

 assert.deepEqual([s.run("$('audio-grace-seconds').value"),s.run("$('replay-on-return-seconds').value")],['5','55'],'the new host, not A, fills the visible form');
 assert.equal(s.run('settingsPreferences.host'),B.fp);
});
test('A listing the machine could not give keeps the saved provider, locks the choice, and can be asked again (F18)',async()=>{
 const s=setup({strictDOM:true});
 s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{stt:stage('openai','gpt-4o-transcribe',{language:'es',context:''})}});
 s.run("window.roomTranscription={capabilities:async()=>({webgpu:false,wasm:true})};window.roomI18n={setLanguage(){}}");
 let fail=true;
 const {fetch}=settingsFetch({integrations:async()=>fail?{ok:false,status:502,json:async()=>({detail:'La máquina no respondió'})}:{ok:true,json:async()=>LISTING(OPENAI({configured:true,source:'stored',hint:'…k3y9'}))}});
 s.context.fetch=fetch;
 s.run('window.sidevoiceActions.openSettings()');await settle();
 let stt=stageView(s,'stt');
 assert.equal(stt.integrations,'failed');
 assert.equal(stt.place,'openai','an outage is not evidence the provider is gone');
 assert.deepEqual(stt.places.map(p=>[p.id,p.state]),[['device','ready'],['openai','unknown']]);
 assert.equal(stt.editable,false,'what depends on the listing waits for it');
 s.run("$('language-settings').close=()=>{}");
 await s.run('saveSettings()');
 assert.equal(JSON.parse(s.saved['sidevoice.stages']).hosts[PAIRED.fp].stt.place,'openai','saving something else keeps the saved provider');
 fail=false;
 await s.run('window.sidevoiceActions.retryIntegrations()');
 stt=stageView(s,'stt');
 assert.equal(stt.integrations,'ready');assert.equal(stt.editable,true);
 assert.equal(stt.places.find(p=>p.id==='openai').state,'ready');
});
test('Every paired device sees every provider the machine lists: keyed ones ready, unkeyed ones greyed with Configurar',async()=>{
 const s=setup({strictDOM:true});
 await measured(s);
 listed(s,LISTING(OPENAI(),ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 assert.deepEqual(stageView(s,'stt').places.map(p=>[p.id,p.state]),[['device','ready'],['openai','missing']],'no owner and no guest: nobody is shown less');
 assert.deepEqual(stageView(s,'tts').places.map(p=>[p.id,p.state]),[['device','ready'],['elevenlabs','ready']]);
 assert.equal('owner' in s.run('roomStore.getState().integrations'),false);
 listed(s,LISTING(ELEVEN()));
 assert.deepEqual(stageView(s,'stt').places.map(p=>p.id),['device'],'a provider the machine does not list at all is one it cannot call');
});
test('A saved provider model the account\'s list does not name is kept and shown, not replaced (R05)',()=>{
 const s=setup({strictDOM:true});
 openaiPane(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…test'})));
 s.run("roomStore.patch({voicePreferences:{stt:"+JSON.stringify(stage('openai','future-model',{}))+"}});patchRemote('openai:stt',{models:[{id:'gpt-4o-transcribe',label:'GPT-4o'}],error:''})");
 const stt=stageView(s,'stt');
 assert.equal(stt.model,'future-model','a provider ships models before we list them');
 assert.deepEqual(stt.models.map(m=>m.id),['gpt-4o-transcribe','future-model']);
});
test('A provider model list that failed to load leaves the saved model, and saving keeps it (R05)',async()=>{
 const s=setup({strictDOM:true});const stored=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 s.context.fetch=async()=>({ok:true,json:async()=>({provider:'openai',configured:true,models:[],error:'OpenAI answered 503 when loading the models.'})});
 await measured(s);openaiPane(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…test'})));
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(stage('openai','future-model',{language:'es'}))+"}})");
 await s.run("loadRemote('openai','stt',true)");
 const stt=stageView(s,'stt');
 assert.deepEqual([stt.model,stt.modelsError,stt.modelsLoading],['future-model','OpenAI answered 503 when loading the models.',false]);
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 assert.equal(stored.find(([key])=>key==='sidevoice.stages')[1].hosts[PAIRED.fp].stt.model,'future-model','an outage is not a new choice');
});
test('A new provider choice takes the first listed model, and one with an empty list is not saved (R05)',async()=>{
 const s=setup({strictDOM:true});const stored=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 await measured(s);listed(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…test'})));
 passing(s);
 s.run("ws=null;roomStore.patch({voicePreferences:{}});patchRemote('openai:stt',{models:[{id:'gpt-4o-transcribe'}],error:''});window.sidevoiceActions.chooseStagePlace('stt','openai')");await settle();
 assert.equal(stageView(s,'stt').model,'gpt-4o-transcribe');
 s.run("window.sidevoiceActions.chooseStagePlace('stt','device')");await settle();
 s.run("patchRemote('openai:stt',{models:[],error:''});window.sidevoiceActions.chooseStagePlace('stt','openai')");await settle();
 assert.equal(stageView(s,'stt').model,'','an account that lists no model gives a new choice none');
 // What passed its check was stored when it took effect; the choice with no model is refused, and stores nothing.
 const before=stored.length;
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 assert.equal(s.run("$('settings-error').textContent"),'Elige un modelo de OpenAI.');
 assert.equal(stored.length,before);
});
test('A provider\'s list still loading never masquerades as a one-option catalogue',()=>{
 const s=setup({strictDOM:true});
 openaiPane(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…test'})));
 s.run("patchRemote('openai:stt',{})");
 const stt=stageView(s,'stt');
 assert.equal(stt.modelsLoading,true);
 assert.equal(stt.model,'gpt-4o-mini-transcribe','the saved one is kept while the list is not in');
});
test('Joining with ElevenLabs reaches microphone capture without loading Kokoro',async()=>{
 for(const place of ['elevenlabs','device']){
  const s=setup({strictDOM:true});let prepared=0,captured=0,unlocked=false;
  s.saved['sidevoice.stages']=JSON.stringify({[PAIRED.fp]:{stt:stage('openai','gpt-4o-transcribe',{}),tts:place==='device'?TTS():stage('elevenlabs','eleven_flash_v2_5',{voice:{es:'v1'},speed:1})}});
  s.context.fetch=async()=>{assert.equal(unlocked,true,'audio unlock must precede network I/O');return {ok:true,json:async()=>({ui_language:'es'})}};
  s.context.window.roomVoice={unlock:async()=>{unlocked=true},prepare:async()=>{prepared++},cancel(){}};
  s.context.window.roomTranscription={capabilities:async()=>({webgpu:false,wasm:true}),stop(){}};
  s.context.navigator={mediaDevices:{getUserMedia:async()=>{captured++;throw Error('Microphone test boundary')}}};
  await s.run('toggleCall()');
  assert.equal(captured,1,place);
  assert.equal(prepared,place==='device'?1:0,place);
  // The failure is a fact in the store; JoinStatus is the one that paints it.
  assert.match(s.run('joinView(state).text'),/No se pudo abrir el micrófono: Microphone test boundary/,place);
  assert.equal(s.run('joinView(state).failed'),true);
  assert.equal(s.run('connecting'),false);
 }
});
test('A queued assistant reply never hides the active user speech bubble',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'started',revision:1,thread_id:'a'});
 assert.equal(s.run('roomStore.getState().conversation.pendingPhase'),'listening');
 emit('bot-output',{text:'Respuesta pendiente',spoken:false,segment_id:'queued'});
 assert.equal(s.run('roomStore.getState().conversation.pendingPhase'),'listening');
 assert.equal(s.run('roomStore.getState().conversation.pendingPhase'),'listening');
});
test('TTS announcement/completion is one row; intentional repetitions remain separate',()=>{
 const s=setup();
 const emit=(spoken,id)=>s.run(`message(${JSON.stringify(JSON.stringify({type:'bot-output',data:{text:'Hola',spoken,segment_id:id,aggregated_by:'sentence'}}))})`);
 emit(false,1);emit(true,2);assert.equal(s.run('history.length'),1);
 emit(false,3);emit(true,4);assert.equal(s.run('history.length'),2);
});
test('Command D toggles and holding space restores mute on release or loss of focus',()=>{
 const s=setup();s.run("var track={enabled:true};stream={getAudioTracks:()=>[track]};ws={}");
 const key=code=>({code,metaKey:code==='KeyD',target:new s.Element(),preventDefault(){}});
 s.handlers.keydown(key('KeyD'));assert.equal(s.run('track.enabled'),false);
 s.handlers.keydown(key('Space'));assert.equal(s.run('track.enabled'),true);
 s.handlers.keyup(key('Space'));assert.equal(s.run('track.enabled'),false);
 s.handlers.keydown(key('Space'));s.handlers.blur();assert.equal(s.run('track.enabled'),false);
 s.handlers.keydown(key('KeyD'));assert.equal(s.run('track.enabled'),true);
});
test('Keyboard shortcuts ignore typing and auto-repeat',()=>{
 const s=setup();s.run("var track={enabled:true};stream={getAudioTracks:()=>[track]};ws={}");
 const target=new s.Element();target.closest=()=>({});
 s.handlers.keydown({code:'KeyD',metaKey:true,target});assert.equal(s.run('track.enabled'),true);
 s.handlers.keydown({code:'KeyD',metaKey:true,target:new s.Element(),repeat:true,preventDefault(){}});assert.equal(s.run('track.enabled'),true);
});
test('Pauses keep transcription fragments in one actual turn; the next turn stays separate',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'started',revision:1,thread_id:'a'});
 emit('user-transcription',{final:true,text:'Tengo una idea.'});
 emit('user-stopped-speaking',{});emit('user-started-speaking',{});
 emit('user-transcription',{final:true,text:'Y otra cosa.'});
 assert.equal(s.run('history.length'),1);
 assert.equal(s.run('history[0].text'),'Tengo una idea. Y otra cosa.');
 emit('voice-user-turn',{phase:'finished',revision:1,thread_id:'a',text:'Tengo una idea. Y otra cosa.'});
 emit('voice-user-turn',{phase:'started',revision:2,thread_id:'a'});
 emit('user-transcription',{final:true,text:'Otro turno.'});
 assert.equal(s.run('history.length'),2);
 emit('voice-user-turn',{phase:'finished',revision:3,thread_id:'other',text:'Ajeno'});
 assert.equal(s.run('history.length'),3);
 assert.equal(s.run('history[2].thread'),'other');
 assert.equal(s.run("history.filter(x=>x.thread===historyThreadId()).length"),2);
});
test('The transcribed draft remains cancellable until the user turn finishes',()=>{
 const s=setup(),snapshots={};
 s.context.window.sidevoiceUI={setConversation:value=>snapshots.conversation=value};
 const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'started',revision:4,thread_id:'a'});
 emit('user-transcription',{final:true,text:'Una frase todavía abierta'});
 assert.equal(snapshots.conversation.pendingText,'');
 assert.equal(snapshots.conversation.messages[0].cancellable,true);
 emit('voice-user-turn',{phase:'finished',revision:4,thread_id:'a',text:'Una frase todavía abierta'});
 assert.equal(snapshots.conversation.messages[0].cancellable,false);
});
test('A late final transcription cannot duplicate an already finished user turn',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'started',revision:1,thread_id:'a'});
 emit('voice-user-turn',{phase:'finished',revision:1,thread_id:'a',text:'Una sola burbuja'});
 emit('user-transcription',{final:true,text:'Una sola burbuja'});
 assert.equal(s.run('history.length'),1);
 assert.equal(s.run("history[0].segment"),'s:user-turn:1');
 assert.equal(s.run("history[0].text"),'Una sola burbuja');
});
test('Delivery tick is immediate, follows the matching receipt and does not imply read',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'finished',revision:1,thread_id:'a',text:'Hola'});
 assert.equal(s.run('history[0].delivery'),'pending');
 emit('voice-input-receipt',{revision:1,thread_id:'other',status:'delivered'});
 assert.equal(s.run('history[0].delivery'),'pending');
 emit('voice-input-receipt',{revision:1,thread_id:'a',status:'pending'});
 assert.equal(s.run('history[0].delivery'),'pending');
 emit('voice-input-receipt',{revision:1,thread_id:'a',status:'delivered'});
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
 emit('voice-input-receipt',{revision:2,thread_id:'a',session_id:'s',status:'delivered'});
 emit('voice-user-turn',{phase:'finished',revision:2,thread_id:'a',session_id:'s',text:'Ya llegó'});
 assert.equal(s.run('history[0].delivery'),'delivered');
 assert.equal(s.run('Object.keys(inputReceipts).length'),0);
});
test('A finished turn without a selected conversation is visibly not sent',()=>{
 const s=setup();const emit=(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`);
 emit('voice-user-turn',{phase:'finished',revision:3,thread_id:null,text:'Sin destino'});
 assert.equal(s.run('history[0].delivery'),'not_sent');
});

test('Space repeats and release suppress native button activation without toggling the mic',()=>{
 const s=setup();s.run("var track={enabled:false};stream={getAudioTracks:()=>[track]};ws={}");
 let prevented=0;const event=repeat=>({code:'Space',repeat,target:new s.Element(),preventDefault(){prevented++}});
 s.handlers.keydown(event(false));
 for(let i=0;i<8;i++)s.handlers.keydown(event(true));
 assert.equal(s.run('track.enabled'),true);
 s.handlers.keyup(event(false));assert.equal(s.run('track.enabled'),false);
 assert.equal(prevented,10);
 s.run('track.enabled=true');s.handlers.keydown(event(false));s.handlers.keyup(event(false));
 assert.equal(s.run('track.enabled'),true);
});

test('Preview resolves the voice and speed the pane shows, saved or not',async()=>{
 const s=setup();await measured(s);const spoken=[];
 s.context.AbortController=AbortController;
 s.context.window.roomVoice={unlock:async()=>{},cancel(){},speak:async options=>{spoken.push(options)}};
 s.run("$('preview-audio').pause=()=>{};roomStore.patch({voicePreferences:{tts:"+JSON.stringify(TTS({voice:{},speed:1.5}))+"}})");
 await s.run("previewVoice('en')");
 assert.deepEqual([spoken[0].voice,spoken[0].speed,spoken[0].model,spoken[0].engine],['af_heart',1.5,'kokoro-82m-v1.0','transformers-js'],'with no voice chosen, the model\'s first for the language');
 s.run("window.sidevoiceActions.setStageOption('tts','voice','af_bella','en');window.sidevoiceActions.setStageOption('tts','speed',0.85)");
 await s.run("previewVoice('en')");
 assert.deepEqual([spoken[1].voice,spoken[1].speed],['af_bella',0.85],'the draft, before any save');
 assert.equal(s.run('previewNote'),'Prueba terminada');
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

test('The UI distinguishes audio suppression reasons without inferring unknown ones',()=>{
 const s=setup();
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'newer_turn'})"),'Sin audio · Empezaste otra intervención');
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'focus_changed'})"),'Sin audio · No estabas en esta conversación · Se repite al volver');
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'session_changed'})"),'Sin audio · No estabas en la llamada · Se repite al volver','a reply nobody heard says what the room will do, not what a socket did');
 assert.equal(s.run("audioNote({audio:'text_only'})"),'Sin audio · Motivo no registrado');
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'call_ended',time:1000},0,{seconds:120,now:60000})"),'Sin audio · No estabas en la llamada · Se repite al volver');
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'call_ended',time:1000},0,{seconds:120,now:200000})"),'Sin audio · No estabas en la llamada','past the window it promises nothing');
 assert.equal(s.run("audioNote({audio:'text_only',audio_reason:'focus_changed',time:1000},0,{seconds:0,now:2000})"),'Sin audio · No estabas en esta conversación','nor when this device turned repetition off');
 assert.equal(s.run("audioNote({audio:'failed',audio_reason:'unconfirmed'})"),'Audio sin confirmar · Este dispositivo no dijo si llegó a sonar','a reply the room stopped waiting for does not claim it failed to play');
});

test('A reply held behind another reply says so, not that the person is talking',()=>{
 const s=setup();
 assert.equal(s.run("audioNote({audio:'waiting_for_turn',audio_reason:'user_speaking'})"),'Audio pendiente · Esperando a que termines de hablar');
 assert.equal(s.run("audioNote({audio:'queued',audio_reason:'previous_reply'},1)"),'Audio pendiente · Esperando a que termine la respuesta anterior');
 assert.equal(s.run("audioNote({audio:'queued',audio_reason:'previous_reply'},3)"),'Audio pendiente · Hay 3 respuestas antes');
 assert.equal(s.run("audioNote({audio:'queued'})"),'','a reply about to be dispatched is not described as waiting');
});

test('Microphone meter measures level and peak independently and clears when muted',()=>{
 const s=setup();
 assert.equal(s.run('measureMic([0,0,0],true).value'),0);
 assert.equal(s.run('measureMic([.1,-.1],true).state'),'normal');
 assert.equal(s.run('measureMic([.85,0],true).state'),'high');
 assert.equal(s.run('measureMic([.99,0],true).state'),'clip');
 assert.equal(s.run('measureMic([.99,0],false).value'),0);
 assert.equal(s.run('measureMic([.99,0],false).state'),'quiet');
});

test('Cancelling unplayed synthesis reports it as unplayed rather than interrupted audio',()=>{
 const s=setup(),requests=[];
 s.context.fetch=async(path,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({})}};
 s.run("window.roomVoice={cancel(){}};activeSpeech={session_id:'s',revision:1,utterance_id:'u'};history=[{segment:'s:voice:u',thread:'a',role:'assistant',time:1,text:'Preparando'}];cancelBrowserSpeech()");
 assert.equal(requests[0].status,'cancelled_unplayed');
 assert.equal(s.run('history[0].interrupted'),false);
 s.run("activeSpeech={session_id:'s',revision:1,utterance_id:'v',started:true};cancelBrowserSpeech()");
 assert.equal(requests[1].status,'cancelled_playing');
});

test('Text submission freezes its destination and clears only the submitted draft',async()=>{
 const s=setup(),sent=[];s.context.crypto={randomUUID:()=> 'test-message'};
 s.run("ws={};$('text-message').value='Un mensaje escrito';roomBinding.binding_id='binding-a'");
 s.context.fetch=async(path,options)=>{if(options){sent.push(JSON.parse(options.body));s.run("$('text-message').value='Ya escribiendo el siguiente'");return {ok:true,json:async()=>({accepted:true})}}return {ok:true,json:async()=>({messages:[]})}};
 await s.run("$('text-composer').onsubmit({preventDefault(){}})");
 assert.equal(sent[0].thread_id,'a');assert.equal(sent[0].text,'Un mensaje escrito');
 assert.equal(s.run("$('text-message').value"),'Ya escribiendo el siguiente');
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
test('Hangup releases media and cancels an in-flight connection without clearing history',()=>{
 const s=setup();
 s.run(`
 var stopped=0,closed=0;
 window.roomVoice={cancel(){}};
 ws={close(){closed++}};
 stream={getTracks:()=>[{stop(){stopped++}}]};
 connecting=true;history=[{text:'keep'}];
 disconnect();
 `);
 assert.equal(s.run('stopped'),1);
 assert.equal(s.run('closed'),1);
 assert.equal(s.run('ws'),null);
 assert.equal(s.run('stream'),null);
 assert.equal(s.run('connecting'),false);
 assert.equal(s.run('connectEpoch'),1);
 assert.equal(s.run('history.length'),1);
});
test('Cancelled draft disappears and late transcription is ignored until the next turn',()=>{
 const s=setup(),emit=(data)=>s.run(`message(${JSON.stringify(JSON.stringify(data))})`);
 emit({type:'voice-user-turn',data:{phase:'started',revision:1,thread_id:'a'}});
 emit({type:'user-transcription',data:{final:true,text:'discard'}});
 emit({type:'voice-user-turn',data:{phase:'cancelled',revision:1,thread_id:'a'}});
 emit({type:'user-transcription',data:{final:true,text:'late'}});
 assert.equal(s.run('history.length'),0);
 emit({type:'voice-user-turn',data:{phase:'started',revision:2,thread_id:'a'}});
 emit({type:'user-transcription',data:{final:true,text:'keep'}});
 assert.equal(s.run('history[0].text'),'keep');
});
test('The room speaks first: the page adopts its call id and treats anything earlier as a room event',async()=>{
 const s=setup();s.context.crypto={randomUUID:()=>'ready-1'};
 const socket={sent:[],send(data){this.sent.push(data)}};
 const session=s.run('openSession')(socket);
 socket.onopen();assert.equal(JSON.parse(socket.sent[0]).type,'client-ready');
 socket.onmessage({data:JSON.stringify({type:'user-started-speaking',data:{}})});
 assert.equal(s.run('userLive'),true);
 socket.onmessage({data:JSON.stringify({type:'voice-preparation',data:{kind:'transcription',phase:'loading',title:'Preparando transcripción',text:'Descargando o cargando Whisper large-v3 en Sidevoice…'}})});
 assert.equal(s.run("$('voice-loading').open"),true);
 assert.equal(s.run("$('loading-title').textContent"),'Preparando transcripción');
 assert.match(s.run("$('loading-detail').textContent"),/large-v3/);
 socket.onmessage({data:JSON.stringify({type:'voice-preparation',data:{kind:'transcription',phase:'ready'}})});
 assert.equal(s.run("$('voice-loading').open"),false);
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'call-1',sample_rate:16000,channels:1}})});
 assert.deepEqual(await session,{session_id:'call-1',sample_rate:16000,channels:1});
 // A close that says nothing: the page asks the room, and a room that would have admitted it says
 // nothing more than that the connection was refused.
 s.context.fetch=async()=>({ok:true,json:async()=>({admitted:true,reason:null,message:null,clients:1,max:8})});
 const refused={send(){}};const rejection=s.run('openSession')(refused);refused.onclose();
 await assert.rejects(rejection,{message:'La sala rechazó la conexión'});
});
test('The call socket follows the page scheme and host',()=>{
 const s=setup();assert.equal(s.run('roomSocketUrl()'),'wss://room.example/api/presentation/ws');
});
test('Cloud speech receipts track actual playout completion',async()=>{
 const s=setup(),receipts=[];let finish;
 s.context.fetch=async(path,options)=>{receipts.push(JSON.parse(options.body));return {ok:true,json:async()=>({})}};
 s.context.window.roomVoice={cancel(){},playEncoded(data,status,onPlaying){assert.equal(data.audio_base64,'SUQz');onPlaying();return new Promise(resolve=>finish=resolve)}};
 const playing=s.run("receiveServerSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'cloud',text:'Hola',audio_base64:'SUQz'})");
 assert.equal(s.run('botLive'),true);assert.deepEqual(receipts.map(r=>r.status),['playing']);
 finish();await playing;
 assert.equal(s.run('botLive'),false);assert.deepEqual(receipts.map(r=>r.status),['playing','playback_finished']);
});
test('Cloud preview stays active and leaves the microphone enabled until audio ends',async()=>{
 const s=setup();let finish;s.context.AbortController=AbortController;
 s.context.fetch=async()=>({ok:true,json:async()=>({audio_base64:'SUQz'})});
 s.context.window.roomVoice={unlock:async()=>{},cancel(){},playEncoded(){return new Promise(resolve=>finish=resolve)}};
 s.run("$('preview-audio').pause=()=>{};var track={enabled:true};stream={getAudioTracks:()=>[track]};roomStore.patch({voicePreferences:{tts:"+JSON.stringify(stage('elevenlabs','eleven_v3',{voice:{es:'custom'},speed:1}))+"}})");
 const preview=s.run("previewVoice('es')");
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.run('track.enabled'),true);assert.equal(s.run('previewJob!==null'),true);
 finish();await preview;
 assert.equal(s.run('track.enabled'),true);assert.equal(s.run('previewJob'),null);
 assert.equal(s.run('previewNote'),'Prueba terminada');
});

test('AEC includes local playback when supported and keeps capture enabled',async()=>{
 const s=setup();let constraints,applied;
 const track={enabled:true,getCapabilities:()=>({echoCancellation:[true,false,'all']}),applyConstraints:async value=>{applied=value}};
 s.context.navigator={mediaDevices:{getUserMedia:async value=>{constraints=value;return {getAudioTracks:()=>[track]}}}};
 s.run("inputDeviceId='car-mic'");
 await s.run('acquireMicrophone()');
 assert.equal(constraints.audio.echoCancellation,true);
 assert.equal(constraints.audio.deviceId.exact,'car-mic');
 assert.equal(applied.echoCancellation.exact,'all');
 assert.equal(track.enabled,true);
 track.applyConstraints=async()=>{throw Error('Mode unavailable')};
 await s.run('acquireMicrophone()');
 assert.equal(track.enabled,true,'fallback retains the already acquired AEC stream');
});
test('Local and ElevenLabs responses preserve open mic and voice interruption',async()=>{
 for(const cloud of [false,true]){
  const s=setup();let playing,finish,cancelled=0;
  s.context.fetch=async()=>({ok:true,json:async()=>({})});
  const speech=(_options,_status,onPlaying)=>{playing=onPlaying;return new Promise(resolve=>finish=resolve)};
  s.context.window.roomVoice={speak:speech,playEncoded:speech,cancel(){cancelled++}};
  s.run("var track={enabled:true};stream={getAudioTracks:()=>[track]};ws={}");
  const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'u',text:'Hola'},"+cloud+")");
  playing();
  assert.equal(s.run('track.enabled'),true);
  s.run('message(JSON.stringify({type:"user-started-speaking"}))');
  assert.equal(cancelled,1);assert.equal(s.run('activeSpeech'),null);
  finish();await pending;
 }
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
test('Failed and cancelled microphone changes preserve or release the right stream',async()=>{
 const s=setup();let resolve,stopped=0;
 s.run("ws={};captureNode={};stream={getAudioTracks:()=>[{enabled:true}]}");
 s.context.navigator={mediaDevices:{getUserMedia:async()=>{throw Error('Permission denied')}}};
 await assert.rejects(s.run("replaceMicrophone('other')"),/Permission denied/);
 assert.equal(s.run('inputDeviceId'),'default');assert.ok(s.run('stream'));
 s.context.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
 const pending=s.run("replaceMicrophone('other')");
 s.run('ws=null;connectEpoch++');
 resolve({getAudioTracks:()=>[{}],getTracks:()=>[{stop(){stopped++}}]});
 await pending;assert.equal(stopped,1);assert.equal(s.run('inputDeviceId'),'default');
});
test('A saved speed outside the provider\'s range is brought into it, not refused',()=>{
 const s=setup();
 listed(s,LISTING(ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.run("roomStore.patch({voicePreferences:{tts:"+JSON.stringify(stage('elevenlabs','eleven_v3',{voice:{},speed:1.5}))+"}})");
 assert.equal(stageView(s,'tts').options.find(o=>o.id==='speed').value,1.2);
 s.run("roomStore.patch({voicePreferences:{tts:"+JSON.stringify(TTS({voice:{},speed:1.5}))+"}})");
 assert.equal(stageView(s,'tts').options.find(o=>o.id==='speed').value,1.5,'Kokoro keeps its wider range');
});
test('Capture shares the playback context, streams PCM to the room, and hangup only disconnects the microphone graph',async()=>{
 const s=setup();let closed=0,sentFrames=0,nodeOptions;
 const source={connect(){},disconnect(){}};
 const context={state:'running',createAnalyser:()=>({getFloatTimeDomainData(data){data.fill(0)},disconnect(){}}),createMediaStreamSource:()=>source,audioWorklet:{addModule:async()=>{}},close:async()=>{closed++}};
 s.context.window.roomVoice={context};
 s.context.AudioWorkletNode=class{constructor(_context,_name,options){nodeOptions=options;this.port={}}connect(){}disconnect(){}};
 s.run("stream={getAudioTracks:()=>[{enabled:true}]};ws={readyState:1,send(){}}");
 s.run('ws').send=frame=>{if(typeof frame==='string'||frame?.byteLength!==640)throw Error('the room expects raw PCM frames');sentFrames++};
 s.run('startMeter(16000)');
 assert.equal(s.run('audioContext'),context);
 await s.run('startCapture(ws,{sample_rate:16000})');
 const node=s.run('captureNode');
 node.port.onmessage({data:new ArrayBuffer(640)});
 assert.equal(sentFrames,1);assert.equal(nodeOptions.processorOptions.sampleRate,16000);
 s.run('stopMeter()');
 node.port.onmessage({data:new ArrayBuffer(640)});
 assert.equal(sentFrames,1);assert.equal(closed,0);
});

test('Latency uses browser monotonic durations and original reply revision',()=>{
 const s=setup();let now=100;s.context.performance={now:()=>now};
 s.run("observeLatencyEvent('voice-user-turn',{phase:'started',thread_id:'a',revision:1})");
 now=200;s.run("observeLatencyEvent('user-stopped-speaking',{})");
 now=2700;s.run("observeLatencyEvent('voice-user-turn',{phase:'finished',thread_id:'a',revision:1})");
 now=4000;
 const metrics=s.run("browserLatency({thread_id:'a',revision:2,reply_revision:1},3900)");
 assert.equal(metrics.audio_received_to_playback_scheduled_ms,100);
 assert.equal(metrics.turn_finished_event_to_playback_scheduled_ms,1300);
 assert.equal(metrics.vad_stop_event_to_turn_finished_event_ms,2500);
 assert.equal(s.run("browserLatency({thread_id:'other',revision:1},3900).turn_finished_event_to_playback_scheduled_ms"),undefined);
 s.run("sessionId='new-session'");
 assert.equal(s.run("browserLatency({thread_id:'a',revision:1},3900).turn_finished_event_to_playback_scheduled_ms"),undefined);
});
test('Latency turn storage is bounded and absent clocks produce no fake zeros',()=>{
 const s=setup();assert.equal(Object.keys(s.run("browserLatency({thread_id:'a',revision:1},0)")).length,0);
 s.context.performance={now:()=>100};
 s.run("for(let r=0;r<150;r++)observeLatencyEvent('voice-user-turn',{phase:'finished',thread_id:'a',revision:r})");
 assert.equal(s.run('latencyTurns.size'),128);
});
test('Playing receipts carry only measured browser durations without delaying playback',async()=>{
 const s=setup();let now=100,playing,finish;const receipts=[];
 s.context.performance={now:()=>now};
 s.context.fetch=async(path,opts)=>{receipts.push(JSON.parse(opts.body));return {ok:true,json:async()=>({})}};
 s.context.window.roomVoice={cancel(){},playEncoded:(_d,_status,onPlaying)=>{playing=onPlaying;return new Promise(r=>finish=r)}};
 const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'u',text:'Hola'},true)");
 now=175;playing();finish();await pending;
 const receipt=receipts.find(r=>r.status==='playing');
 assert.equal(receipt.timings_ms.audio_received_to_playback_scheduled_ms,75);
 assert.equal(receipts.find(r=>r.status==='playback_finished').timings_ms,undefined);
});

test('Assistant text moves from pending to playing to complete with browser playout',async()=>{
 const s=setup();let playing,finish;
 s.context.fetch=async()=>({ok:true,json:async()=>({})});
 s.context.window.roomVoice={cancel(){},speak:(_d,_status,onPlaying)=>{playing=onPlaying;return new Promise(resolve=>finish=resolve)}};
 const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'u',text:'Hola mundo'})");
 assert.equal(s.run("roomStore.getState().conversation.messages[0].playback"),'pending');
 playing();
 assert.equal(s.run("roomStore.getState().conversation.messages[0].playback"),'playing');
 finish();await pending;
 assert.equal(s.run("roomStore.getState().conversation.messages[0].playback"),'complete');
});
test('Karaoke preserves full text, survives history redraw and clears when interrupted',()=>{
 const s=setup();
 s.run("var speech={session_id:'s',utterance_id:'u'};activeSpeech=speech;add('assistant','Hola <mundo>','voice:u','a');updateKaraoke(speech,{from:5,to:12,mode:'word'})");
 let saved=s.run('roomStore.getState().conversation.messages[0]');
 assert.equal(saved.text,'Hola <mundo>');
 assert.equal(saved.karaoke.to,12);
 s.run('markHistorySeen()');
 assert.equal(s.run('roomStore.getState().conversation.messages[0].karaoke.to'),12);
 s.run("window.roomVoice={cancel(){}};cancelBrowserSpeech()");
 assert.equal(s.run('karaokeState'),null);
 s.run("updateKaraoke(speech,{from:0,to:4,mode:'word'})");
 assert.equal(s.run('karaokeState'),null);
 assert.equal(s.run('history[0].text'),'Hola <mundo>');
});

test('Meet split control opens devices independently of mute and exposes settings',()=>{
 const s=setup({strictDOM:true});s.run("$('audio-device-panel').hidden=true");
 s.run("$('audio-devices').click()");
 assert.equal(s.run("$('audio-device-panel').hidden"),false);
 assert.equal(s.run("$('audio-devices').getAttribute('aria-expanded')"),'true');
 assert.equal(s.run('micEnabled'),true);
 s.run("$('audio-devices').click()");
 assert.equal(s.run("$('audio-device-panel').hidden"),true);
 // Settings are reached from the call menu. The device panel is the two pickers and a refresh, and
 // nothing else: a second way in, one row below the first, only made choosing a microphone slower.
 assert.equal(s.run("!!$('audio-settings-open')"),false);
 s.run("var settingsOpened=0;window.sidevoiceActions={openSettings(){settingsOpened++}};$('call-settings-open').click()");
 assert.equal(s.run('settingsOpened'),1);
});
test('Stats omit missing durations and use first reply per turn, only for selected thread',()=>{
 const s=setup({strictDOM:true});
 s.run(`renderLatencyStats({replies:[
 {thread_id:'a',reply_revision:1,status:'completed',input_ms:{speech_end_to_transcript_ms:2490,endpoint_silence_ms:2000,recognition_ms:450},server_ms:{input_queued_to_reply_received_ms:4000},provider_ms:{request_to_complete_ms:300},browser_ms:{audio_received_to_playback_scheduled_ms:50}},
 {thread_id:'a',reply_revision:1,status:'completed',server_ms:{input_queued_to_reply_received_ms:8000},provider_ms:{request_to_complete_ms:500}},
 {thread_id:'a',reply_revision:2,status:'failed',server_ms:{input_queued_to_reply_received_ms:6000}},
 {thread_id:'other',reply_revision:3,server_ms:{input_queued_to_reply_received_ms:100000}}
 ]},'a')`);
 assert.equal(s.run("$('stats-endpoint').textContent"),'2.49 s');
 assert.equal(s.run("$('stats-response').textContent"),'5.00 s');
 assert.equal(s.run("$('stats-synthesis').textContent"),'400 ms');
 assert.equal(s.run("$('stats-playout').textContent"),'50 ms');
 assert.equal(s.run("$('stats-rows').children.length"),3);
 assert.equal(s.run("$('stats-rows').children[0].children[6].textContent"),'—');
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
test('Stats renders device and session values as text and does not mislabel HTTP as audio latency',()=>{
 const s=setup({strictDOM:true});
 s.run(`ws={readyState:1};stream={getAudioTracks:()=>[{label:'<img onerror=boom>',readyState:'live',enabled:true,getSettings:()=>({echoCancellation:true,noiseSuppression:false,sampleRate:48000})}]};renderConnectionStats({call:{id:'s',transcription:{place:'device',model:'whisper-large-v3-turbo',engine:'sherpa-onnx',accelerator:'wasm',fallback_from:'webgpu'},mic:{frames:20,bytes:1024,last_gap_ms:20,max_gap_ms:610,gaps_over_250ms:2}}},36)`);
 const values=s.run("$('stats-connection').children.map(n=>n.textContent)");
 assert.ok(values.includes('<img onerror=boom>'));assert.ok(values.includes('Consulta al servidor (HTTP)'));
 assert.ok(values.includes('36 ms'));assert.ok(values.includes('48000 Hz'));assert.ok(values.includes('610 ms'));assert.ok(values.includes('2'));assert.ok(values.includes('Misma sesión'));
 assert.ok(values.includes('device · whisper-large-v3-turbo'));assert.ok(values.includes('Servidor y este dispositivo'),'no browser in the app\'s statistics (R10)');assert.ok(values.includes('sherpa-onnx'));assert.ok(values.includes('wasm · antes webgpu'));
});

test('A voice this device failed to speak is said as this device\'s, in the app as in a page (R10)',async()=>{
 const s=setup();const errors=[];
 s.context.window.sidevoiceUI={setBootError:value=>errors.push(value)};
 s.context.fetch=async()=>({ok:true,json:async()=>({})});
 s.context.window.roomVoice={cancel(){},speak:async()=>{throw Error('el motor no cargó')}};
 s.run("roomStore.patch({inApp:true,voicePreferences:{tts:"+JSON.stringify(TTS())+"}})");
 await s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'u',text:'Hola',voice:'ef_dora',speed:1})");
 assert.equal(errors.at(-1),'Voz de este dispositivo: el motor no cargó');
});
test('A refusal the machine gives with a key is said by that key, the same way the app\'s native refusals are (D06)',async()=>{
 const s=setup();
 s.context.fetch=async()=>({ok:false,status:409,json:async()=>({detail:{key:'integration_superseded',message:'This key was replaced or removed while it was being checked, so it was not saved.'}})});
 await assert.rejects(()=>s.run("api('/api/presentation/integrations/openai',{method:'PUT'})"),/La clave se cambió o se quitó mientras se comprobaba/);
 assert.equal(s.run("sayRefusal({key:'voice_missing',provider:'elevenlabs',message:'Choose a voice for ElevenLabs before connecting.'})"),'Elige una voz de ElevenLabs antes de conectar.');
 assert.equal(s.run("sayRefusal({key:'unknown_to_this_page',message:'Said in English.'})"),'Said in English.');
});
test('Changing only the local Whisper model swaps it on the socket the call already has',async()=>{
 const s=setup({strictDOM:true});
 s.run(`
  var actions=[];
  ws={readyState:1,sent:[],send(value){this.sent.push(JSON.parse(value))}};
  sessionId='call-1';connectEpoch=7;
  window.roomTranscription={
   capabilities:async()=>({webgpu:true,webgpuFp16:true,wasm:true}),
   stop(options){actions.push(['stop',options.cancelTurn])},
   prepare:async options=>{actions.push(['prepare',options.model,options.accelerator]);return {model:options.model,engine:options.engine,accelerator:options.accelerator}},
   start(options){actions.push(['start',options.language])}
  };
 `);
 // The room never runs this model, so its pipeline does not change: no second socket, no reconnection.
 const previous={stt:STT('whisper-tiny'),tts:TTS()};
 const next={stt:STT('whisper-small'),tts:TTS()};
 assert.equal(await s.run('applyTranscriptionSettings('+JSON.stringify(previous)+','+JSON.stringify(next)+')'),'local');
 assert.equal(JSON.stringify(s.run('actions')),JSON.stringify([['stop',true],['prepare','whisper-small','webgpu'],['start','es']]));
 assert.equal(s.run('ws.sent[0].type'),'voice-stt-ready');
 assert.deepEqual([s.run('ws.sent[0].data.model'),s.run('ws.sent[0].data.engine'),s.run('ws.sent[0].data.accelerator')],['whisper-small','transformers-js','webgpu']);
 assert.equal(s.run('ws.sent[0].data.session_id'),'call-1');
 assert.equal(await s.run('applyTranscriptionSettings('+JSON.stringify(next)+','+JSON.stringify(next)+')'),false);
 assert.equal(s.run('actions.length'),3);
 // What the room does own is a new pipeline every time, and the local model alone never is.
 assert.equal(s.run('pipelineSettingsChanged('+JSON.stringify(previous)+','+JSON.stringify(next)+')'),false);
 for(const change of [{stt:stage('openai','gpt-4o-transcribe',{language:'es',context:''})},{stt:STT('whisper-tiny',{language:'auto',context:''})},{stt:STT('whisper-tiny',{language:'es',context:'Sidevoice'})},{turn_patience:'calm'}])
  assert.equal(s.run('pipelineSettingsChanged('+JSON.stringify(previous)+','+JSON.stringify({...previous,...change})+')'),true,JSON.stringify(change));
 // Voices, speed and grace travel live over the socket: they must never open a second one.
 for(const change of [{tts:stage('elevenlabs','eleven_flash_v2_5',{voice:{},speed:1})},{tts:TTS({voice:{es:'em_alex'},speed:1.2})},{audio_grace_seconds:4}]){
  assert.equal(s.run('pipelineSettingsChanged('+JSON.stringify(previous)+','+JSON.stringify({...previous,...change})+')'),false,JSON.stringify(change));
  assert.equal(await s.run('applyTranscriptionSettings('+JSON.stringify(previous)+','+JSON.stringify({...previous,...change})+')'),false);
 }
 assert.equal(s.run('actions.length'),3,'nothing was prepared or restarted for a voice change');
});
/* A pipeline change (who transcribes, in what language, how the turn ends) used to hang up. Now the
 * page opens a second socket while the first one is still carrying the call. */
function switching(){
 const s=setup();const sockets=[],errors=[];
 s.context.WebSocket=class{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];this.closed=false;sockets.push(this)}
  send(value){this.sent.push(value)}
  close(){this.closed=true;this.readyState=3;this.onclose?.({code:1000})}
 };
 s.context.WebSocket.OPEN=1;
 // The join line is where a swap says which step it is on, and where its failure lands.
 const status=[];
 s.context.window.sidevoiceUI=new Proxy({},{get:(target,name)=>name==='setJoinStatus'?value=>status.push(value):()=>{}});
 s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async()=>({ok:true,json:async()=>({binding:null,room:{revision:0},clients:[],call:null,participants:[]})});
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.run(`
  var prepared=[],started=[],stopped=0;
  startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},context:{state:'running'}};
  window.roomTranscription={
   capabilities:async()=>({webgpu:false,wasm:true}),
   prepare:async options=>{prepared.push(options.model);return {model:options.model,engine:options.engine,accelerator:options.accelerator}},
   start(options){started.push(options.language)},stop(){stopped++}
  };
  stream={getAudioTracks:()=>[{enabled:true}]};
  ws=new WebSocket('wss://room.example/old');ws.readyState=1;sessionId='old-session';
 `);
 return {s,sockets,old:sockets[0],status};
}
const OLD_SETTINGS={stt:STT('whisper-tiny'),tts:TTS(),turn_end_mode:'smart_turn'};
function apply(s,next){s.run('voicePreferences='+JSON.stringify(next));return s.run('applyTranscriptionSettings('+JSON.stringify(OLD_SETTINGS)+','+JSON.stringify(next)+')')}

test('Changing the transcription provider swaps sessions without ending the call',async()=>{
 const {s,sockets,old,status}=switching();
 const pending=apply(s,{...OLD_SETTINGS,stt:stage('openai','gpt-4o-transcribe',{language:'es',context:''})});
 await new Promise(resolve=>setTimeout(resolve,5));
 // While the room has not answered, the call is still the old one: same socket, same session, mic untouched.
 assert.equal(sockets.length,2,'a second socket is opened');
 assert.equal(s.run('ws'),old);
 assert.equal(old.closed,false);
 assert.equal(s.run('sessionId'),'old-session');
 assert.match(status.at(-1).text,/Cambiando de transcripción/);
 assert.equal(s.run('prepared.length'),0,'OpenAI transcribes in the room: nothing is loaded here');
 const next=sockets[1];next.readyState=1;next.onopen();
 const hello=JSON.parse(next.sent[0]);
 assert.equal(hello.data.conversation,'t-1','the tab keeps the conversation it had chosen');
 assert.equal(hello.data.settings.stt.place,'openai','the new hello carries the new settings');
 next.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 assert.equal(await pending,'switched');
 assert.equal(status.at(-1),null,'the line goes away once the new session is up');
 assert.equal(s.run('ws'),next);
 assert.equal(s.run('sessionId'),'new-session');
 assert.equal(old.closed,true,'the old socket is closed once the new session exists');
 assert.equal(old.onclose,null,'and its close is not read as the room going away');
 assert.equal(s.run('stream')!==null,true,'the microphone stream was kept');
 assert.equal(s.run('stopped')>0,true,'the local runtime stops when the room takes over transcription');
 assert.equal(s.run('switchingSession'),false);
});

test('Changing how patient the room is rebuilds the pipeline the same way, loading the local model before the swap',async()=>{
 const {s,sockets,old,status}=switching();
 const pending=apply(s,{...OLD_SETTINGS,turn_patience:'calm'});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(s.run('JSON.stringify(prepared)'),'["whisper-tiny"]','the runtime is ready before the socket is swapped');
 assert.match(status.at(-1).text,/micrófono/);
 assert.equal(s.run('ws'),old,'the call runs on the old pipeline while the new one is prepared');
 const next=sockets[1];next.readyState=1;next.onopen();
 assert.equal(JSON.parse(next.sent[0]).data.settings.turn_patience,'calm');
 next.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 assert.equal(await pending,'switched');
 assert.equal(s.run('ws'),next);
 assert.equal(s.run('JSON.stringify(started)'),'["es"]','the browser transcribes again, on the new socket');
});

test('A room that refuses the new session leaves the call exactly as it was, and says why',async()=>{
 const {s,sockets,old,status}=switching();
 const pending=apply(s,{...OLD_SETTINGS,stt:stage('openai','gpt-4o-transcribe',{language:'es',context:''})});
 await new Promise(resolve=>setTimeout(resolve,5));
 const next=sockets[1];next.readyState=1;next.onopen();
 next.onmessage({data:JSON.stringify({type:'error',data:{message:'OpenAI necesita una clave de API antes de conectar.'}})});
 next.close();
 assert.equal(await pending,false);
 assert.equal(s.run('ws'),old,'the call never left the socket it was on');
 assert.equal(old.closed,false);
 assert.equal(s.run('sessionId'),'old-session');
 assert.equal(status.at(-1).failed,true);
 assert.match(status.at(-1).text,/No se pudo aplicar el cambio: OpenAI necesita una clave de API/);
 assert.match(status.at(-1).text,/sigue con los ajustes anteriores/);
 assert.equal(s.run('switchingSession'),false);
});

test('Cancelling the preparation abandons the swap and not the call',async()=>{
 const {s,sockets,old}=switching();
 s.run("window.roomTranscription.prepare=()=>new Promise(()=>{})");
 const pending=apply(s,{...OLD_SETTINGS,stt:STT('whisper-tiny',{language:'auto',context:''})});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(s.run('switchingSession'),true);
 s.run('cancelPreparation()');
 assert.equal(s.run('switchingSession'),false);
 assert.equal(s.run('ws'),old,'the call stays up');
 assert.equal(old.closed,false);
 assert.equal(sockets.length,1,'the swap never got as far as a second socket');
 assert.equal(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('pending'),5))]),'pending');
});

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

test('A late or session-less refresh does not cancel the reply the room is replaying on return',async()=>{
 const s=setup(),answers=[];
 s.context.fetch=async path=>new Promise(resolve=>answers.push({path,resolve}));
 const answer=(i,body)=>answers[i].resolve({ok:true,json:async()=>body});
 s.run("sessionId=null");
 const early=s.run('refresh()');                       // asked before the page had joined: about nobody
 s.run("sessionId='s'");
 const current=s.run('refresh()');
 answer(1,{binding:{thread_id:'a',title:'A',binding_id:'b2'},call:{id:'s'}});await current;
 s.run("activeSpeech={session_id:'s',thread_id:'a',utterance_id:'u:replay:s',revision:1,replay:true}");
 answer(0,{binding:null});await early;
 assert.equal(s.run("roomBinding.binding_id"),'b2','the older answer is not applied over the newer one');
 assert.equal(s.run("activeSpeech&&activeSpeech.utterance_id"),'u:replay:s','and the replay keeps playing');
 // A new binding on the same conversation is a rejoin: it does not cut what is playing either.
 const rejoin=s.run('refresh()');
 answer(2,{binding:{thread_id:'a',title:'A',binding_id:'b3'},call:{id:'s'}});await rejoin;
 assert.equal(s.run("activeSpeech&&activeSpeech.utterance_id"),'u:replay:s');
 // Moving to another conversation still does.
 const moved=s.run('refresh()');
 answer(3,{binding:{thread_id:'other',title:'O',binding_id:'b4'},call:{id:'s'}});await moved;
 assert.equal(s.run("activeSpeech"),null);
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
test('What was being said when the room went away is sent again with the gap, and what was confirmed is not',()=>{
 const s=setup();
 s.run("captureRate=16000;openSpokenTurn(3);holdSpokenAudio(new Int16Array([1200,-1500,900]).buffer)");
 assert.equal(s.run('unconfirmed.samples'),3);
 s.run('armGapBuffer(16000)');
 assert.equal(s.run('gap.samples'),3,'the open turn is the head of the gap');
 assert.equal(s.run('unconfirmed.samples'),0);
 s.run('disarmGapBuffer()');
 // Confirmed before the drop: nothing to send again.
 s.run("openSpokenTurn(4);holdSpokenAudio(new Int16Array([1200,1300]).buffer);confirmSpokenTurn(4);armGapBuffer(16000)");
 assert.equal(s.run('gap.samples'),0);
 // Nothing is held while no turn is open.
 s.run("disarmGapBuffer();holdSpokenAudio(new Int16Array([5,6]).buffer)");
 assert.equal(s.run('unconfirmed.samples'),0);
});
test('A reply this page already played to the end is not played again when the room offers it after a drop (sidevoice/sidevoice-web#4)',async()=>{
 const s=setup(),posted=[];
 s.context.fetch=async(path,options)=>{posted.push([path,options?.body&&JSON.parse(options.body)]);return {ok:true,json:async()=>({})}};
 s.run("sessionId='s';roomBinding={thread_id:'a',binding_id:'b'};playedToEnd.add('s:voice:u1');window.roomVoice={playEncoded:async()=>{throw Error('must not play')}}");
 await s.run("receiveServerSpeech({session_id:'s',thread_id:'a',utterance_id:'u1:replay:s',history_id:'s:voice:u1',revision:1,replay:true,text:'Hola'})");
 const receipt=posted.find(([path])=>path.includes('browser-receipt'));
 assert.equal(receipt[1].status,'playback_finished','the room is told it was heard, instead of it sounding twice');
 assert.equal(receipt[1].utterance_id,'u1:replay:s');
});

test('A repetition asked for from the bubble plays even a reply this page already heard',async()=>{
 const s=setup();let played=0;
 s.context.fetch=async()=>({ok:true,json:async()=>({})});
 s.run("sessionId='s';roomBinding={thread_id:'a',binding_id:'b'};playedToEnd.add('s:voice:u1')");
 s.context.window.roomVoice={playEncoded:async(d,a,start)=>{played++;start?.()},cancel(){}};
 await s.run("receiveServerSpeech({session_id:'s',thread_id:'a',utterance_id:'u1:again:x',history_id:'s:voice:u1',revision:1,replay:true,requested:true,text:'Hola'})");
 assert.equal(played,1);
});

test('A reply the room addressed to another browser is not played by this one',async()=>{
 const s=setup(),posts=[];
 s.context.fetch=async(path,options)=>{if(options)posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({messages:[]})}};
 s.run("played=[];window.roomVoice={speak(d){played.push('kokoro:'+d.session_id);return Promise.resolve()},playEncoded(d){played.push('shared:'+d.audio_base64);return Promise.resolve()},cancel(){}}");
 const speech=(type,extra)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data:{session_id:'s',revision:1,utterance_id:'u',thread_id:'a',text:'Hola',...extra}}))})`);
 speech('voice-speech',{session_id:'otro-navegador'});
 await s.run('Promise.resolve()');
 assert.equal(s.run("played.join('|')"),'');
 // Its own copy of the same shared reply is played, and the paid audio needs no second request.
 speech('voice-speech',{});
 await s.run('Promise.resolve()');
 speech('voice-speech-audio',{utterance_id:'v',revision:2,audio_base64:'YQ=='});
 await s.run('Promise.resolve()');
 assert.equal(s.run("played.join('|')"),'kokoro:s|shared:YQ==');
});

test('A shared reply keeps one bubble when live delivery and history name different browsers',async()=>{
 const s=setup();
 s.context.window.roomVoice={speak(){return new Promise(()=>{})},cancel(){}};
 s.context.fetch=async path=>({ok:true,json:async()=>path.startsWith('/api/presentation/history')?{messages:[{
  id:'mobile:voice:shared',thread:'a',role:'assistant',text:'Respuesta compartida',name:'A',
  session:'mobile',revision:1,time:1,seq:1,status:'playing'
 }]}:{}});
 s.run("receiveBrowserSpeech({session_id:'s',revision:1,utterance_id:'shared',history_id:'mobile:voice:shared',thread_id:'a',text:'Respuesta compartida'})");
 assert.equal(s.run('history.length'),1,'the live event creates the bubble');
 await s.run('refreshHistory()');
 assert.equal(s.run('history.length'),1,'history reconciles with that same bubble');
 assert.equal(s.run('history[0].segment'),'mobile:voice:shared');
 s.run("history.push({...history[0],segment:'s:voice:shared',session:'s'})");
 assert.equal(s.run('history.length'),2,'an old tab may already contain both aliases');
 await s.run('refreshHistory()');
 assert.equal(s.run('history.length'),1,'refresh removes the pre-fix alias');
});

test('Stopping playback reports it for this browser and keeps the shared message',()=>{
 const s=setup(),posts=[];
 s.context.fetch=async(path,options)=>{posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({})}};
 s.run("window.roomVoice={cancel(){}};history=[{segment:'s:voice:u',thread:'a',role:'assistant',time:1,text:'Respuesta compartida'}];activeSpeech={session_id:'s',revision:1,utterance_id:'u',started:true};cancelBrowserSpeech()");
 assert.equal(posts[0].status,'cancelled_playing');
 assert.equal(posts[0].session_id,'s');
 // The text belongs to the room: this browser marks it interrupted for itself, never removes it.
 assert.equal(s.run('history.length'),1);
 assert.equal(s.run('history[0].text'),'Respuesta compartida');
 assert.equal(s.run('history[0].interrupted'),true);
});

test('The engine badge says what this call uses, in a few words',()=>{
 const s=setup();
 assert.equal(s.run("engineBadgeText({stt:{place:'openai',model:'gpt-4o-transcribe'},turn_end_mode:'smart_turn'},null)"),'OpenAI · gpt-4o-transcribe · smart-turn');
 assert.equal(s.run("engineBadgeText({stt:{place:'device',model:'whisper-base'},turn_end_mode:'timer',user_speech_timeout:2.5},{model:'whisper-base',engine:'transformers-js',accelerator:'wasm'})"),'Whisper base · CPU · silencio 2,5 s');
 assert.equal(s.run("engineBadgeText({stt:{place:'device',model:'whisper-tiny'},turn_end_mode:'smart_turn'},{model:'whisper-tiny',engine:'transformers-js',accelerator:'wasm',fallback_from:'webgpu'})"),'Whisper tiny · CPU (GPU falló) · smart-turn');
 s.run("roomStore.patch({engineReady:true,voicePreferences:{stt:{place:'openai',model:'x'}}})");
 assert.ok(s.run('SessionState.engineView(state).text'),'an engine that is ready has something to say');
 s.run("state.engineReady=false");
 assert.equal(s.run('SessionState.engineView(state).text'),'','and one that is not says nothing, which is what hides it');
});

test('One bubble per turn: bars while listening, slower while transcribing, kept through a merge, replaced by the text',()=>{
 const s=setup();const views=[];
 s.context.window.sidevoiceUI={setConversation:v=>views.push(v),setParticipants(){},setLanguageModels(){},setBootError(){}};
 s.run("roomBinding={thread_id:'a',title:'A'};sessionId='s';window.roomVoice={cancel(){}}");
 const emit=(type,data)=>s.run('message('+JSON.stringify(JSON.stringify({type,data}))+')');
 emit('voice-user-turn',{phase:'started',revision:1,thread_id:'a'});
 assert.equal(views.at(-1).pendingPhase,'listening');assert.equal(views.at(-1).pendingText,'');
 emit('user-stopped-speaking',{});assert.equal(views.at(-1).pendingPhase,'transcribing');
 emit('voice-user-turn',{phase:'started',revision:2,thread_id:'a'});assert.equal(views.at(-1).pendingPhase,'listening');
 emit('voice-user-turn',{phase:'cancelled',revision:1,thread_id:'a',text:'Pero bueno,',merged:true});
 assert.equal(views.at(-1).pendingPhase,'listening','a merged turn keeps the bubble open');
 emit('voice-user-turn',{phase:'finished',revision:2,thread_id:'a',text:'Pero bueno, sigo.'});
 assert.equal(views.at(-1).pendingPhase,'');assert.equal(views.at(-1).messages.at(-1).text,'Pero bueno, sigo.');
 emit('voice-user-turn',{phase:'started',revision:3,thread_id:'a'});emit('voice-user-turn',{phase:'cancelled',revision:3,thread_id:'a',text:''});
 assert.equal(views.at(-1).pendingPhase,'','a real cancel closes the bubble');
});

test('The waveform bubble reads the meter\'s own analyser and never opens a second audio graph',()=>{
 const s=setup();
 assert.equal(s.run('window.sidevoiceAudio.readWaveform()'),null,'no call, nothing to draw');
 s.run("analyser={fftSize:8,reads:0,getFloatTimeDomainData(target){this.reads++;for(let i=0;i<target.length;i++)target[i]=(i+1)/10}}");
 const first=s.run('window.sidevoiceAudio.readWaveform()');
 assert.equal(first.length,8,'the buffer follows the analyser it reads from');
 assert.deepEqual(Array.from(first).map(v=>Math.round(v*10)),[1,2,3,4,5,6,7,8]);
 assert.equal(s.run('window.sidevoiceAudio.readWaveform()===window.sidevoiceAudio.readWaveform()'),true,'one buffer, reused: a frame allocates nothing');
 assert.equal(s.run('analyser.reads'),3);
 assert.equal(s.run('audioContext'),null,'reading the waveform opens no audio context of its own');
 s.run('analyser=null');
 assert.equal(s.run('window.sidevoiceAudio.readWaveform()'),null,'a closed meter stops feeding the bubble');
});

test('The stages view lists the last turn in order with bars scaled to the longest stage',()=>{
 const s=setup();
 s.run("renderLatencyStages({reply_revision:4,input_ms:{endpoint_silence_ms:610,recognition_ms:900,transcript_to_delivery_ms:12},server_ms:{input_queued_to_reply_received_ms:9000},browser_ms:{audio_received_to_playback_scheduled_ms:40}})");
 const items=s.run("$('stats-stages').children.map(li=>[li.children[0].textContent,!!li.children[1].hidden,li.children[1].style.width||'',li.children[2].textContent])");
 assert.equal(JSON.stringify(items[0]),JSON.stringify(['Silencio hasta cerrar el turno',false,'7%','610 ms']));
 assert.equal(JSON.stringify(items[2]),JSON.stringify(['Whisper en este dispositivo',true,'','—']));
 assert.equal(JSON.stringify(items[6]),JSON.stringify(['Agente: entrega → primera respuesta',false,'100%','9.00 s']));
 assert.equal(JSON.stringify(items[4]),JSON.stringify(['Entregado → leído por la conversación',true,'','—']));
 assert.match(s.run("$('stats-stages-note').textContent"),/Turno 4/);
 // A harness that never acknowledges delivery (Claude Code's inbox) still yields a read mark: the stage falls back to queued → read.
 s.run("renderLatencyStages({reply_revision:5,server_ms:{input_queued_to_read_ms:5800,read_to_reply_received_ms:4200,input_queued_to_reply_received_ms:10000}})");
 const read=s.run("$('stats-stages').children.map(li=>[li.children[0].textContent,li.children[2].textContent])");
 assert.equal(JSON.stringify(read[4]),JSON.stringify(['Entregado → leído por la conversación','5.80 s']));
 assert.equal(JSON.stringify(read[5]),JSON.stringify(['Leído → primera respuesta','4.20 s']));
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
 {thread_id:'a',input_ms:{endpoint_silence_ms:600,recognition_ms:400},server_ms:{input_queued_to_reply_received_ms:3000,input_queued_to_read_ms:900},provider_ms:{request_to_complete_ms:200}},
 {thread_id:'a',input_ms:{endpoint_silence_ms:1000},server_ms:{input_queued_to_reply_received_ms:9000,delivery_accepted_to_read_ms:100}},
 null
 ]).map(row=>[row.key,row.count,row.mean,row.p50,row.p90,row.max])`);
 assert.equal(rows.length,s.run('LATENCY_STAGES.length'),'every stage keeps its row');
 assert.equal(JSON.stringify(rows[0]),JSON.stringify(['endpoint_silence',2,800,600,1000,1000]));
 assert.equal(JSON.stringify(rows[1]),JSON.stringify(['recognition',1,400,400,400,400]));
 assert.equal(JSON.stringify(rows[2]),JSON.stringify(['request_to_transcript',0,null,null,null,null]),'a stage nobody measured stays empty, not zero');
 assert.equal(JSON.stringify(rows[4]),JSON.stringify(['delivery_to_read',2,500,100,900,900]),'the read stage falls back to queued → read, as the last-turn view does');
 assert.equal(JSON.stringify(rows[6]),JSON.stringify(['input_queued_to_reply',2,6000,3000,9000,9000]));
 assert.equal(s.run("statsAggregate([]).every(row=>row.count===0&&row.max===null)"),true);
});
test('The aggregates section covers the whole session and splits per conversation only when there was more than one',()=>{
 const s=setup();
 const snapshot=`{replies:[
 {thread_id:'a',reply_revision:1,input_ms:{endpoint_silence_ms:600},server_ms:{input_queued_to_reply_received_ms:3000}},
 {thread_id:'a',reply_revision:2,input_ms:{endpoint_silence_ms:1000},server_ms:{input_queued_to_reply_received_ms:9000}},
 {thread_id:'b',reply_revision:3,server_ms:{input_queued_to_reply_received_ms:21000}}
 ]}`;
 s.run("people=[{thread_id:'a',title:'Claude'},{thread_id:'b',title:'Astra'}]");
 s.run('renderLatencyStats('+snapshot+",'a')");
 const captions=s.run("$('stats-aggregates').children.map(wrap=>wrap.children[0].children[0].textContent)");
 assert.equal(JSON.stringify(captions),JSON.stringify(['Toda la sesión · 3 respuestas medidas','Claude · 2 respuestas medidas','Astra · 1 respuesta medida']));
 const header=s.run("$('stats-aggregates').children[0].children[0].children[1].children[0].children.map(cell=>cell.textContent)");
 assert.equal(JSON.stringify(header),JSON.stringify(['Tramo','n','Media','p50','p90','Máx']));
 const session=s.run("$('stats-aggregates').children[0].children[0].children[2].children.map(row=>row.children.map(cell=>cell.textContent))");
 assert.equal(session.length,s.run('LATENCY_STAGES.length'));
 assert.equal(JSON.stringify(session[0]),JSON.stringify(['Silencio hasta cerrar el turno','2','800 ms','600 ms','1.00 s','1.00 s']));
 assert.equal(JSON.stringify(session[6]),JSON.stringify(['Agente: entrega → primera respuesta','3','11.00 s','9.00 s','21.00 s','21.00 s']),'the session table counts every conversation, not the selected one');
 assert.equal(JSON.stringify(session[2]),JSON.stringify(['Whisper en este dispositivo','—','—','—','—','—']),'what nobody measured stays a dash');
 assert.match(s.run("$('stats-aggregates-note').textContent"),/no se deben sumar/);
 assert.equal(s.run("$('stats-aggregates-copy').disabled"),false);
 // One conversation, one table.
 s.run("renderLatencyStats({replies:[{thread_id:'a',reply_revision:1,server_ms:{input_queued_to_reply_received_ms:3000}}]},'a')");
 assert.equal(s.run("$('stats-aggregates').children.length"),1);
 // No call, nothing measured: no invented rows and nothing to copy.
 s.run('renderLatencyStats(null,null)');
 assert.equal(s.run("$('stats-aggregates').children.length"),0);
 assert.match(s.run("$('stats-aggregates-note').textContent"),/Aún no hay respuestas medidas/);
 assert.equal(s.run("$('stats-aggregates-copy').disabled"),true);
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

test('When the room goes away the call stays up: the socket is reopened by itself with the same hello and the mic survives',async()=>{
 const s=setup();const sockets=[];
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 const joinLine=[];s.context.window.sidevoiceUI=new Proxy({},{get:(_,name)=>value=>{if(name==='setJoinStatus')joinLine.push(value?value.text:null)}});s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async()=>({ok:true,json:async()=>({binding:null,room:{revision:0},clients:[],call:null,participants:[]})});
 s.run("RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};window.roomVoice={unlock:async()=>{},cancel(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};stream={getAudioTracks:()=>[{enabled:true}]};sessionId='old-session';ws={readyState:1}");
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 const epoch=s.run('connectEpoch');
 // The room restarts: the socket closes with a code that is not a refusal.
 const pending=s.run('lostConnection')({code:1006},epoch,{browserStt:false,sttRuntime:null});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(sockets.length,1,'a new socket is opened after the first delay');
 assert.deepEqual(joinLine,[null,'Reconectando con la sala…'],'the reconnection uses the join line, not the transcript status');
 const socket=sockets[0];socket.readyState=1;socket.onopen();
 const hello=JSON.parse(socket.sent[0]);
 assert.equal(hello.type,'client-ready');assert.equal(hello.data.conversation,'t-1','the remembered conversation travels in the hello');
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1,room:{version:'x',web_build:'y'}}})});
 await pending;
 assert.equal(s.run('sessionId'),'new-session');
 assert.equal(s.run('ws'),socket);
 assert.equal(s.run('stream')!==null,true,'the microphone stream was kept');
 assert.equal(s.run('reconnecting'),false);
 assert.equal(joinLine.at(-1),null,'and the line goes away once the room answers again');
 // A refusal is final: no retry, the call ends.
 let ended=false;s.run("disconnect=()=>{ws=null;globalThis.__ended=true}");
 await s.run('lostConnection')({code:1013},s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 assert.equal(s.run('globalThis.__ended'),true);
 assert.equal(sockets.length,1);
});

test('The engine badge carries the audio output health: recovering on a stall, failed on a refusal, clean once something plays',()=>{
 const s=setup();
 s.run("roomStore.patch({engineReady:true,voicePreferences:{stt:{place:'openai',model:'gpt-4o'}}})");
 assert.equal(s.run('SessionState.engineView(state).text'),'OpenAI · gpt-4o · smart-turn');
 s.run("noteOutputHealth('stall')");
 assert.equal(s.run('SessionState.engineView(state).text'),'OpenAI · gpt-4o · smart-turn · audio ↻');
 assert.equal(s.run('SessionState.engineView(state).output'),'recovering');
 s.run("noteOutputHealth('complete')");
 assert.equal(s.run('SessionState.engineView(state).text'),'OpenAI · gpt-4o · smart-turn');
 s.run("noteOutputHealth('attach-refused')");
 assert.equal(s.run('SessionState.engineView(state).text'),'OpenAI · gpt-4o · smart-turn · audio ✕');
 s.run("noteOutputHealth('cancel')");
 assert.equal(s.run('SessionState.engineView(state).output'),'failed','a cancel says nothing about health');
 s.run("noteOutputHealth('play-encoded')");
 assert.equal(s.run('SessionState.engineView(state).output'),'ok');
});

test('The echo light says whether the page can expect its own voice to be cancelled: mic AEC on and voice through the media element',()=>{
 const s=setup();
 const settings={echoCancellation:true};
 s.run("ws={readyState:1}");
 s.context.window.roomVoice={health:()=>({output:'element',element:{paused:false}})};
 s.context.__settings=settings;
 s.run("stream={getAudioTracks:()=>[{enabled:true,getSettings:()=>globalThis.__settings}]}");
 const echo=()=>s.run('SessionState.capabilityPanel(state)').find(row=>row.id==='echo');
 s.run('showEchoCover')();
 assert.equal(echo().state,'ok');
 s.context.window.roomVoice={health:()=>({output:'context',element:null})};
 s.run('showEchoCover')();
 assert.equal(echo().state,'warn');
 assert.match(echo().note,/elemento de audio/);
 settings.echoCancellation=false;
 s.run('showEchoCover')();
 assert.equal(echo().state,'fail');
 s.run("ws=null");s.run('showEchoCover')();
 assert.equal(echo(),undefined,'no call, no light');
});

/* One indicator from the tap to the room: these two tests are the sequence a person reads, and what
 * takes its place when a step fails. */
function joining(s,{preferences={},capabilities={webgpu:false,wasm:true},prepareVoice,prepareWhisper,getUserMedia,admission={admitted:true,reason:null,message:null,clients:1,max:8}}={}){
 const published=[],sockets=[],track={enabled:true,stop(){},getSettings:()=>({echoCancellation:true}),applyConstraints:async()=>{}};
 s.context.window.sidevoiceUI=new Proxy({},{get:(_,name)=>value=>{if(name==='setJoinStatus')published.push(value?value.text:null)}});
 s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 s.context.fetch=async path=>{if(admission==='unreachable'&&path.includes('/admission'))throw Error('Failed to fetch');return {ok:true,json:async()=>
  path.includes('/admission')?admission
  :path.includes('/languages')?{ui_language:'es',...preferences}
  :path.includes('/participants')?{participants:[{thread_id:'t-1',title:'Astra',available:true,reach:{state:'listening'}}]}
  :{binding:null,room:{revision:0},clients:[],call:null,participants:[]}}};
 s.context.window.roomVoice={unlock:async()=>{},cancel(){},prepare:prepareVoice||(async()=>{s.handlers['voice-preparation']({detail:{phase:'loading',progress:42}})})};
 s.context.window.roomTranscription={capabilities:async()=>capabilities,start(){},stop(){},
  prepare:prepareWhisper||(async({model})=>{s.handlers['voice-preparation']({detail:{kind:'transcription',phase:'loading',progress:17}});return {model,engine:'transformers-js',accelerator:'wasm'}})};
 s.context.navigator={mediaDevices:{getUserMedia:getUserMedia||(async()=>({getAudioTracks:()=>[track],getTracks:()=>[track]}))}};
 s.run("startMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};people=[{thread_id:'t-1',title:'Astra',available:true,reach:{state:'listening'}}]");
 return {published,sockets,tap:()=>s.run('toggleCall')()};
}
async function firstSocket(sockets){for(let attempt=0;attempt<200&&!sockets.length;attempt++)await new Promise(resolve=>setTimeout(resolve,2));return sockets[0]}

test('The join names each step it is on, from the tap until the conversation is back',async()=>{
 const s=setup({strictDOM:true}),{published,sockets,tap}=joining(s);
 const joined=tap();
 const socket=await firstSocket(sockets);
 socket.readyState=1;socket.onopen();
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'call-1',sample_rate:16000,channels:1}})});
 await joined;
 assert.deepEqual(published,[
  null, 'Preparando audio',
  'Cargando Whisper','Cargando Whisper (17 %)',
  'Cargando el modelo de voz','Cargando el modelo de voz (42 %)',
  'Pidiendo el micrófono',
  'Entrando en la sala',
  'Volviendo a Astra',
  null
 ]);
});

test('A step that fails leaves its reason, and what to do, where the step was',async()=>{
 const denied=setup({strictDOM:true});
 const mic=joining(denied,{getUserMedia:async()=>{const error=Error('Permission denied');error.name='NotAllowedError';throw error}});
 await mic.tap();
 assert.equal(mic.published.at(-1),'El micrófono está bloqueado para esta página. Dale permiso en el navegador y vuelve a pulsar para entrar.');
 assert.equal(denied.run('connecting'),false);

 const device=setup({strictDOM:true});
 const model=joining(device,{prepareWhisper:async()=>{throw Error('WebGPU no disponible')}});
 await model.tap();
 assert.match(model.published.at(-1),/El modelo no se pudo cargar en este dispositivo \(WebGPU no disponible\)/);
 assert.match(model.published.at(-1),/Configuración/);

 const full=setup({strictDOM:true});
 const room=joining(full);
 const joined=room.tap();
 const socket=await firstSocket(room.sockets);
 socket.onclose({code:1013});
 await joined;
 assert.equal(room.published.at(-1),'La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.');
});

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
 assert.equal(room.published.at(-1),'La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.',
  'the reason came from the room, asked over a request no proxy rewrites');

 // The frame that does arrive says the same thing, by name: one reason, one sentence.
 const told=setup({strictDOM:true});
 const framed=joining(told);
 const tellJoined=framed.tap();
 const telling=await firstSocket(framed.sockets);
 telling.onmessage({data:JSON.stringify({type:'error',data:{reason:'room_is_full',
  message:'The room already has the maximum number of browsers connected.'}})});
 telling.onclose({code:1006});
 await tellJoined;
 assert.equal(framed.published.at(-1),'La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.');

 // A room that answers nothing at all is not a room that refused: the page says which it was.
 const gone=setup({strictDOM:true});
 const away=joining(gone,{admission:'unreachable'});
 const awayJoined=away.tap();
 const lost=await firstSocket(away.sockets);
 lost.onerror();lost.onclose({code:1006});
 await awayJoined;
 assert.equal(away.published.at(-1),'No se pudo conectar con la sala.');
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
 // A transcription swap leaves this page holding two sockets; the answer goes back on the one that asked.
 s.run("message(JSON.stringify({type:'voice-ping',data:{session_id:'call-2'}}),{readyState:1,send(value){otherFrame(value)}})");
 assert.equal(other.at(-1).data.session_id,'call-2');
 assert.equal(answered.length,1,'the call\'s socket was not made to answer for the other one');
});

// ----- the ambient bed while the conversation works on this browser's turn -----
function presenceSetup(preferences="{presence_sound:'on'}"){
 const s=setup(),calls=[],timers=new Map();let serial=0;
 s.context.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id};
 s.context.clearTimeout=id=>timers.delete(id);
 s.context.fetch=async()=>({ok:true,json:async()=>({})});
 s.context.window.roomVoice={cancel(){},chime(kind){calls.push(['chime',kind]);return true},startPresence(options){calls.push(['start',options.reason,options.volume]);return true},stopPresence(reason){calls.push(['stop',reason]);return true}};
 s.context.window.sidevoiceUI={setParticipants(){},setBootError(){},setConversation(view){s.context.__view=view},setJoinStatus(){},setRoomState(){},setCall(){}};
 s.run("ws={readyState:1,close(){}};voicePreferences="+preferences);
 return {...s,calls,timers,
  emit:(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`),
  flush(){for(const [id,timer] of [...timers]){timers.delete(id);timer.fn()}}};
}
const OWN_TURN={revision:1,thread_id:'a',session_id:'s'};
test('A browser that cannot transcribe refuses at once instead of being waited for',()=>{
 // Ninety seconds of silence and then a timeout is not an answer (2026-09-20, a phone whose Whisper
 // never loaded: every turn cost a minute and a half and said nothing).
 const s=setup();const sent=[];
 s.run("sessionId='call-1';ws={readyState:1,send(value){sentFrame(value)}}");
 s.context.sentFrame=value=>sent.push(JSON.parse(value));
 s.context.window.roomTranscription=undefined;
 s.run("message(JSON.stringify({type:'voice-transcribe',data:{session_id:'call-1',request_id:'r-1'}}))");
 assert.equal(sent.at(-1).type,'voice-transcript-error');
 assert.equal(sent.at(-1).data.request_id,'r-1');
 assert.match(sent.at(-1).data.error,/no tiene lista la transcripción/);
 // One that throws is reported with its own reason rather than swallowed.
 s.context.window.roomTranscription={transcribe(){throw Error('WebGPU se cayó')}};
 s.run("message(JSON.stringify({type:'voice-transcribe',data:{session_id:'call-1',request_id:'r-2'}}))");
 assert.equal(sent.at(-1).data.error,'WebGPU se cayó');
});

test('A control the person never saw does not decide anything',async()=>{
 // A field that is hidden, or not filled yet, reads back empty. Reading that as a choice turned a saved OpenAI
 // transcription into the browser's, silently (2026-09-20). The stages are the store's, and are saved as shown.
 const s=setup();const stored=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 s.run("ws=null;roomStore.patch({integrationsStatus:'ready',voicePreferences:{stt:"+JSON.stringify(stage('openai','gpt-4o-transcribe',{language:'es',context:''}))+",tts:"+JSON.stringify(stage('elevenlabs','eleven_flash_v2_5',{voice:{es:'v1'},speed:1}))+",turn_patience:'calm'}})");
 s.run("$('turn-patience').value=''");
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 const saved=stored.find(([key])=>key==='sidevoice.stages')[1].hosts[PAIRED.fp];
 assert.equal(saved.stt.place,'openai','a provider whose listing is not in is not a switch to this device');
 assert.equal(saved.stt.model,'gpt-4o-transcribe');
 assert.equal(saved.tts.model,'eleven_flash_v2_5');
 assert.equal(stored.find(([key])=>key==='sidevoice.settings')[1].turn_patience,'calm');
});
test('Saving the settings form stores every device setting, the ambient bed among them, and only today\'s shape',async()=>{
 const s=setup();const stored=[];
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 await measured(s,{webgpu:false,wasm:true});
 s.run("ws=null;roomStore.patch({voicePreferences:{stt_provider:'openai',tts_execution:'browser',spanish_voice:'em_alex'}})");
 for(const [id,value] of [['ui-language','es'],['audio-grace-seconds','2'],['presence-sound','on'],['locked-call','on'],['replay-on-return-seconds','300'],['turn-patience','fast']])
  s.run(`$('${id}').value=${JSON.stringify(value)}`);
 await s.run("$('language-form').onsubmit({preventDefault(){}})");
 assert.ok(!s.run("$('settings-error').textContent"),'the form reached the end without throwing');
 assert.match(s.run("liveNote"),/Preferencias guardadas/,"the notice is a fact; the live region renders it");
 const saved=stored.find(([key])=>key==='sidevoice.settings')?.[1];
 assert.ok(saved,'something was stored at all');
 assert.deepEqual(Object.keys(saved).sort(),['audio_grace_seconds','locked_call','presence_sound','replay_on_return_seconds','turn_patience','ui_language'],
  'old fields are dropped, not translated (F11)');
 const stages=stored.find(([key])=>key==='sidevoice.stages')[1].hosts[PAIRED.fp];
 assert.deepEqual(stages.stt,{place:'device',model:'whisper-tiny',options:{language:s.run('speechLanguage')},build:null},'with nothing chosen, this device\'s best offer');
 assert.equal(stages.tts.model,'kokoro-82m-v1.0');
 assert.equal(saved.presence_sound,'on');
 assert.equal(saved.replay_on_return_seconds,300,'how far back to repeat is this device\'s, and a number');
});
// ----- what the microphone kept hearing while the socket was down -----
// 20 ms frames of 16 kHz PCM, the shape the capture worklet posts to the page.
const GAP_FRAMES=`makeFrames=peaks=>peaks.map(peak=>{const frame=new Int16Array(320);for(let i=0;i<320;i++)frame[i]=Math.round(peak*32767*(i%2?1:-1));return frame.buffer});
 feed=peaks=>{for(const buffer of makeFrames(peaks))bufferGapAudio(buffer)};
 decode=messages=>{const parts=messages.map(m=>atob(JSON.parse(m).data.audio_base64));const bytes=new Uint8Array(parts.reduce((total,part)=>total+part.length,0));let at=0;for(const part of parts){for(let i=0;i<part.length;i++)bytes[at++]=part.charCodeAt(i)}return new Int16Array(bytes.buffer)};`;
function gapSetup(){
 const s=setup();
 s.context.atob=value=>Buffer.from(value,'base64').toString('binary');
 s.run(GAP_FRAMES);
 return s;
}
test('The gap buffer keeps what was said, bounded, and sends silence as nothing at all',()=>{
 const s=gapSetup();
 // Nothing is kept while the call is up: the buffer only exists between a lost socket and the next one.
 s.run("feed([0.5,0.5])");
 assert.equal(s.run('gap.samples'),0,'audio is only buffered once a reconnection is under way');
 s.run("armGapBuffer(16000);feed([0,0,0.5,0.5,0,0])");
 assert.equal(s.run('gap.samples'),6*320);
 const speech=s.run('gapSpeech()');
 assert.equal(speech.truncated,false);
 assert.equal(speech.samples.length,6*320,'the 250 ms margin covers this whole recording');
 // A gap that held only room noise is not a message: the page sends nothing rather than an empty turn.
 s.run("armGapBuffer(16000);feed([0,0.005,0,0.01])");
 assert.equal(s.run('gapSpeech()'),null);
 assert.equal(s.run("sendGapAudio({readyState:1,send(){throw Error('nothing to send')}})"),0);
 assert.equal(s.run('gap.armed'),false,'and the buffer is let go either way');
});
test('A gap longer than the buffer drops the oldest audio and says the message was cut',()=>{
 const s=gapSetup();
 s.run("armGapBuffer(16000);feed(Array(GAP_BUFFER_SECONDS*50+200).fill(0.5))");
 assert.equal(s.run('gap.samples'),s.run('GAP_BUFFER_SECONDS*16000'),'the buffer is bounded at the declared seconds');
 assert.equal(s.run('gap.dropped'),true);
 assert.equal(s.run('gapSpeech().truncated'),true,'the oldest audio was already speech: how much came before is unknowable');
 // Speech that starts after the buffer had room to spare lost nothing, even though older audio fell out.
 s.run("armGapBuffer(16000);feed(Array(GAP_BUFFER_SECONDS*50+200).fill(0));feed([0.5,0.5])");
 assert.equal(s.run('gap.dropped'),true);
 assert.equal(s.run('gapSpeech().truncated'),false);
});
test('The catch-up travels as text slices naming the audio, never as microphone frames',()=>{
 const s=gapSetup();
 s.run("armGapBuffer(16000);feed(Array(2000).fill(0.5))");
 const started=s.run('gap.startedAt'),sent=[];
 const socket={readyState:1,send:value=>sent.push(value)};
 const slices=s.run('sendGapAudio')(socket);
 assert.equal(sent.length,slices);
 assert.ok(slices>1,'a long gap is split so no frame limit between here and the room can drop it');
 const messages=sent.map(value=>JSON.parse(value));
 assert.deepEqual([...new Set(messages.map(m=>m.type))],['voice-catchup']);
 assert.deepEqual(messages.map(m=>m.data.seq),messages.map((_,index)=>index));
 assert.deepEqual(messages.map(m=>m.data.final),messages.map((_,index)=>index===messages.length-1));
 assert.equal(messages[0].data.session_id,'s');
 assert.equal(messages[0].data.sample_rate,16000);
 assert.equal(messages[0].data.truncated,true);
 assert.equal(messages[0].data.started_at,started,'the room is told when this was spoken, by this browser\'s clock');
 assert.ok(sent.every(value=>typeof value==='string'),'binary frames are microphone audio and this is not');
 s.context.__sent=sent;
 assert.equal(s.run('decode(__sent).length'),s.run('GAP_BUFFER_SECONDS*16000'),'every sample reaches the room once');
 assert.equal(s.run('gap.armed'),false,'the page forgets the recording once it has handed it over');
});
test('A socket that is not up again keeps nobody waiting and loses no memory',()=>{
 const s=gapSetup();
 s.run("armGapBuffer(16000);feed([0.5,0.5])");
 assert.equal(s.run('sendGapAudio')({readyState:3,send(){assert.fail('a closed socket is not sent to')}}),0);
 assert.equal(s.run('gap.samples'),0);
});
test('A room that stays away is tried again for as long as it takes, and only a refusal ends the call',async()=>{
 const s=setup();const sockets=[];
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async()=>{throw Error('offline')};
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.run(`RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);
  startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},signal(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};
  voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};stream={getAudioTracks:()=>[{enabled:true}],getTracks:()=>[]};sessionId='old-session';ws={readyState:1}`);
 const pending=s.run('lostConnection')({code:1006},s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
 // A tunnel: every attempt finds nobody. The old page gave up after six.
 for(let round=0;round<10;round++){
  await settle();
  const socket=sockets.at(-1);if(socket&&!socket.failed){socket.failed=true;socket.onclose?.({code:1006})}
 }
 await settle();
 assert.ok(sockets.length>8,'still trying after '+sockets.length+' attempts');
 assert.equal(s.run('state.reconnecting'),true);
 // The room answers and refuses this browser: that one is final.
 const last=sockets.at(-1);last.failed=true;last.onclose?.({code:1013});
 await pending;
 assert.equal(s.run('state.reconnecting'),false);
});
test('While the room is away the microphone keeps being captured, and the new session is handed what it said',async()=>{
 const s=setup();const sockets=[];
 s.context.atob=value=>Buffer.from(value,'base64').toString('binary');
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async()=>({ok:true,json:async()=>({binding:null,room:{revision:0},clients:[],call:null,participants:[]})});
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.run(`RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);
  var meterStops=0;startMeter=()=>{};stopMeter=()=>{meterStops++};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};
  voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};stream={getAudioTracks:()=>[{enabled:true}]};sessionId='old-session';ws={readyState:1};
  ${GAP_FRAMES}`);
 const pending=s.run('lostConnection')({code:1006},s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 assert.equal(s.run('meterStops'),0,'losing the socket never stops the capture: the microphone was not paused');
 assert.equal(s.run('gap.armed'),true);
 // The person keeps talking while the page is retrying.
 s.run("feed(Array(60).fill(0.4))");
 await new Promise(resolve=>setTimeout(resolve,5));
 const socket=sockets[0];socket.readyState=1;socket.onopen();
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 await pending;
 const catchup=socket.sent.map(value=>JSON.parse(value)).filter(m=>m.type==='voice-catchup');
 assert.ok(catchup.length,'what was said during the gap reaches the session that came back');
 assert.equal(catchup[0].data.session_id,'new-session','it is this browser\'s new call that carries it');
 assert.equal(catchup.at(-1).data.final,true);
 assert.equal(s.run('gap.armed'),false);
 assert.equal(s.run('stream')!==null,true,'and the microphone stream is still the same one');
});
test('A message the room recovered from the gap gets its own bubble, and takes nothing from the turn in hand',()=>{
 const s=setup();const shown=[];
 s.context.window.sidevoiceUI=new Proxy({},{get:(_,name)=>value=>{if(name==='setConversation')shown.push(value)}});
 s.run("roomBinding={thread_id:'a',title:'A'};sessionId='s';userTurn={key:'user-turn:4',text:'',thread:'a'};pendingPhase='listening'");
 s.run("message(JSON.stringify({type:'voice-catchup-turn',data:{session_id:'s',history_id:'s:user-catchup:1',thread_id:'a',text:'lo que dije sin sala',offline:'buffered',time:1758290000000}}))");
 const bubble=shown.at(-1).messages.find(m=>m.segment==='s:user-catchup:1');
 assert.equal(bubble.text,'lo que dije sin sala');
 assert.equal(bubble.time,1758290000000,'it is placed when it was spoken, not when the room caught up');
 assert.equal(bubble.offlineNote,'','arriving whole is not news; how it got here is not the reader\'s business');
 assert.equal(bubble.delivery,'pending');
 assert.equal(s.run('pendingPhase'),'listening','the turn that is open right now is untouched');
 assert.equal(s.run('userTurn')!==null,true);
 // A truncated one says what was lost instead of shortening the sentence in silence.
 assert.equal(s.run("offlineNote({role:'user',offline:'truncated'})"),'Solo se guardaron los últimos 30 s');
 assert.equal(s.run("offlineNote({role:'assistant',offline:'truncated'})"),'','only what this browser said can have been cut by the gap');
 assert.equal(s.run("offlineNote({role:'user'})"),'');
 // Another browser's catch-up is not this one's.
 s.run("message(JSON.stringify({type:'voice-catchup-turn',data:{session_id:'other',history_id:'other:user-catchup:1',thread_id:'a',text:'no es mío'}}))");
 assert.equal(shown.at(-1).messages.some(m=>m.text==='no es mío'),false);
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
test('The playback preparation this page measures becomes the stage of the same name',()=>{
 const {s,calls}=tracing();
 const durations=s.run("browserLatency({thread_id:'a',reply_revision:4,utterance_id:'u'},0)");
 assert.ok(durations.audio_received_to_playback_scheduled_ms>0,'the existing measurement is unchanged');
 const stage=calls.find(call=>call[0]==='stage');
 assert.deepEqual(stage.slice(0,4),['stage','a',4,'audio_received_to_playback']);
 assert.equal(stage[4],durations.audio_received_to_playback_scheduled_ms,'one measurement, said twice');
});
test('The audio output report goes to the room and to the trace, and the room report is unchanged',()=>{
 const {s,calls,sent}=tracing();
 s.context.window.roomVoice={health:()=>({output:'element',context:'running',stalls:2})};
 s.run("reportAudioHealth('stall')");
 assert.deepEqual(calls.at(-1),['audioEvent','stall',
  {'sidevoice.audio_output':'element','sidevoice.audio_context':'running','sidevoice.stalls':2}]);
 assert.equal(sent[0].type,'voice-audio-health');
 assert.deepEqual(Object.entries(sent[0].data.health),[['output','element'],['context','running'],['stalls',2]]);
});
test('With no telemetry installed the call behaves exactly as it did',()=>{
 const {s,sent}=tracing({installed:false});
 s.context.window.roomVoice={health:()=>({output:'element'})};
 s.run("observeLatencyEvent('voice-user-turn',{phase:'started',thread_id:'a',revision:1})");
 // Nothing to open a span with means nothing to tell the room about: no extra frame, no failure.
 assert.deepEqual(sent.map(frame=>frame.type),[]);
 s.run("reportAudioHealth('stall')");
 assert.deepEqual(sent.map(frame=>frame.type),['voice-audio-health']);
 assert.ok(s.run("browserLatency({thread_id:'a',reply_revision:1},0)").audio_received_to_playback_scheduled_ms>0);
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
function replaySetup(){
 const s=setup(),view={};
 s.context.window.sidevoiceUI={setParticipants(){},setBootError(){},setJoinStatus(){},setConversation(value){view.current=value}};
 s.context.window.roomVoice={cancel(){},unlock:async()=>{},startPresence(){return true},stopPresence(){return true}};
 s.context.fetch=async()=>({ok:true,json:async()=>({})});
 s.run(`ws={readyState:1,close(){}};roomBinding={thread_id:'a',title:'A'};sessionId='s';
  add('assistant','La primera',null,'a',{history_id:'old:voice:1'});
  add('assistant','La segunda',null,'a',{history_id:'old:voice:2'});
  add('assistant','La tercera',null,'a',{history_id:'old:voice:3'})`);
 return {...s,view,
  note:id=>view.current.messages.find(message=>message.segment===id)?.replayNote,
  emit:(type,data)=>s.run(`message(${JSON.stringify(JSON.stringify({type,data}))})`)};
}
test('The bubbles say a reply is being repeated, and say when the room no longer has its audio',()=>{
 const s=replaySetup();
 s.emit('voice-replay',{session_id:'s',thread_id:'a',
  replies:[{utterance_id:'1:replay:s',history_id:'old:voice:1'},{utterance_id:'2:replay:s',history_id:'old:voice:2'}],
  skipped:[{history_id:'old:voice:3',reason:'audio_gone'}]});
 assert.equal(s.note('old:voice:1'),'Repitiendo lo que no oíste');
 assert.equal(s.note('old:voice:2'),'Repitiendo lo que no oíste');
 assert.equal(s.note('old:voice:3'),'No se pudo repetir · la sala ya no tiene ese audio',
  'a render the room dropped is said, never invented');
 // Another browser's catch-up marks nothing here.
 s.emit('voice-replay',{session_id:'other',thread_id:'a',replies:[{history_id:'old:voice:1'}],skipped:[]});
 assert.equal(s.note('old:voice:1'),'Repitiendo lo que no oíste');
});
test('A repetition is played like any reply, oldest first, and the bubble follows what really happened',async()=>{
 const s=replaySetup();
 s.emit('voice-replay',{session_id:'s',thread_id:'a',
  replies:[{utterance_id:'1:replay:s',history_id:'old:voice:1'}],skipped:[]});
 let started,finish;
 s.context.window.roomVoice.speak=(d,status,onPlaying)=>{started=onPlaying;return new Promise(resolve=>finish=resolve)};
 const playing=s.run(`receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:0,utterance_id:'1:replay:s',
  history_id:'old:voice:1',text:'La primera',replay:true})`);
 started();
 assert.equal(s.note('old:voice:1'),'Repitiendo lo que no oíste');
 finish();await playing;
 assert.equal(s.note('old:voice:1'),'Repetido al volver','once it has sounded the bubble says so');
 // A reply that is not a repetition never claims to be one.
 assert.equal(s.run("replayNote({role:'assistant',segment:'old:voice:2'})"),'');
 assert.equal(s.run("replayNote({role:'user',segment:'old:voice:1'})"),'');
});
test('A new turn cancels the catch-up, and no bubble claims a repetition that never sounded',()=>{
 const s=replaySetup();
 s.emit('voice-replay',{session_id:'s',thread_id:'a',
  replies:[{utterance_id:'1:replay:s',history_id:'old:voice:1'},{utterance_id:'2:replay:s',history_id:'old:voice:2'}],
  skipped:[{history_id:'old:voice:3',reason:'audio_gone'}]});
 s.emit('voice-user-turn',{session_id:'s',thread_id:'a',revision:1,phase:'started'});
 assert.equal(s.note('old:voice:1'),'Repetición cancelada');
 assert.equal(s.note('old:voice:2'),'Repetición cancelada');
 assert.equal(s.note('old:voice:3'),'No se pudo repetir · la sala ya no tiene ese audio',
  'one the room never offered is not something the turn cancelled');
 // The room cancelling this browser's audio ends it just the same.
 const cancelled=replaySetup();
 cancelled.emit('voice-replay',{session_id:'s',thread_id:'a',replies:[{history_id:'old:voice:1'}],skipped:[]});
 cancelled.emit('voice-cancel',{session_id:'s',revision:1});
 assert.equal(cancelled.note('old:voice:1'),'Repetición cancelada');
});
test('The tab names the sessions it has used, so the room can answer what this browser never heard',async()=>{
 const s=setup();const sockets=[],store={};
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async()=>({ok:true,json:async()=>({binding:null,room:{revision:0},clients:[],call:null,participants:[]})});
 s.context.sessionStorage={getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=value},removeItem:key=>{delete store[key]}};
 s.run(`startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};
  voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};stream={getAudioTracks:()=>[{enabled:true}]}`);
 for(const id of ['first-session','second-session']){
  const joining=s.run('joinRoom')(s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
  const socket=sockets.at(-1);socket.readyState=1;socket.onopen();
  const hello=JSON.parse(socket.sent[0]).data;
  assert.deepEqual(hello.sessions,id==='first-session'?[]:['first-session'],
   'the hello carries the ids this tab used before, and only those');
  socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:id,sample_rate:16000,channels:1}})});
  await joining;
 }
 assert.deepEqual(JSON.parse(store['sidevoice.sessions']),['first-session','second-session']);
 assert.deepEqual(s.run('rememberedSessions')(),['first-session','second-session']);
 // Bounded, and never poisoned by whatever happens to be in storage.
 s.run("for(let i=0;i<20;i++)rememberSession('id-'+i)");
 assert.equal(s.run('rememberedSessions')().length,s.run('REMEMBERED_SESSIONS'));
 store['sidevoice.sessions']='no es json';
 assert.equal(s.run('rememberedSessions')().length,0,'storage that is not a list of ids is no list of ids');
});

test('A cancelled playback cannot be revived by a late playing callback or completion',async()=>{
 const s=presenceSetup();let onPlaying,finish;
 s.context.window.roomVoice.speak=(_d,_status,playing)=>{onPlaying=playing;return new Promise(resolve=>finish=resolve)};
 s.emit('voice-conversation',{thread_id:'a',working:true});
 const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'late',text:'Late'})");
 s.emit('user-started-speaking',{});
 onPlaying();finish();await pending;
 assert.equal(s.run('activeSpeech'),null);
 assert.equal(s.run('botLive'),false);
 assert.equal(s.run('roomStore.getState().session.speaker'),'user');
 assert.equal(s.run('roomStore.getState().session.working'),true);
 assert.equal(s.run('roomStore.getState().session.bed'),false);
});
test('Progress speech failure releases its output and the bed returns automatically',async()=>{
 const s=presenceSetup();let onPlaying,fail;
 s.emit('voice-conversation',{thread_id:'a',working:true});
 s.context.window.roomVoice.speak=(_d,_status,playing)=>{onPlaying=playing;return new Promise((resolve,reject)=>fail=reject)};
 const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'fail',text:'Progress'})");
 onPlaying();fail(Error('device refused'));await pending;
 assert.equal(s.run('activeSpeech'),null);
 assert.equal(s.run('roomStore.getState().session.bed'),true);
 assert.deepEqual(s.calls.at(-1),['start','working_quiet',.1]);
});
test('Ambient effects stop before speech, survive synchronous output reports, and resume once',async()=>{
 const s=presenceSetup();let played,finish,starts=0;
 s.context.window.roomVoice.startPresence=()=>{starts++;s.run('showEchoCover()');return true};
 s.emit('voice-conversation',{thread_id:'a',working:true});
 assert.equal(starts,1,'an output report during start cannot start the bed recursively');
 s.context.window.roomVoice.speak=(_d,_status,onPlaying)=>{played=onPlaying;assert.equal(s.run('bedPlaying'),false);return new Promise(resolve=>finish=resolve)};
 const pending=s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'u',text:'Progress'})");
 played();finish();await pending;
 assert.equal(starts,2);
 assert.equal(s.run('roomStore.getState().session.bed'),true);
});
test('A stale audio epoch still settles the reply it carries without playing it',async()=>{
 const s=presenceSetup();let played=false;s.context.window.roomVoice.speak=()=>{played=true};
 s.run("roomRevision=3;state.turns={'s:user-turn:1':{session:'s',thread:'a',status:'read'},'s:user-turn:3':{session:'s',thread:'a',status:'read'}}");
 await s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:1,utterance_id:'late-final',text:'Done'})");
 assert.equal(played,false);assert.equal(s.run("state.turns['s:user-turn:1'].settled"),true);
 assert.equal(s.run('roomStore.getState().session.working'),true);
});
test('An audio cancellation in silence cannot contradict harness work or suppress the bed',()=>{
 const s=presenceSetup();s.emit('voice-conversation',{thread_id:'a',working:true});
 s.emit('voice-cancel',{session_id:'s',revision:1});
 assert.equal(s.run('roomStore.getState().session.bed'),true);
 assert.equal(s.calls.filter(c=>c[0]==='start').length,1);
 s.emit('voice-conversation',{thread_id:'a',working:false});
 s.emit('voice-input-receipt',{...OWN_TURN,status:'read'});
 assert.equal(s.run('roomStore.getState().session.working'),false);
});
test('Typed-message receipts keep their bubble ID and replies settle fallback state',async()=>{
 const s=presenceSetup();
 s.run("add('user','Typed input',null,'a',{history_id:'s:user-text:message-id',session:'s',revision:7,delivery:'pending'})");
 s.emit('voice-input-receipt',{session_id:'s',thread_id:'a',revision:7,history_id:'s:user-text:message-id',status:'read'});
 assert.equal(s.run('roomStore.getState().session.working'),true);
 assert.equal(s.run('roomStore.getState().conversation.messages[0].delivery'),'read');
 s.context.window.roomVoice.speak=async()=>{};
 await s.run("receiveBrowserSpeech({session_id:'s',thread_id:'a',revision:7,reply_revision:7,utterance_id:'typed-reply',text:'Done'})");
 assert.equal(s.run('roomStore.getState().session.working'),false);
 s.emit('voice-input-receipt',{session_id:'s',thread_id:'a',revision:7,history_id:'s:user-text:message-id',status:'read'});
 assert.equal(s.run('roomStore.getState().session.working'),false,'a repeated receipt cannot reopen a settled turn');
});

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

test('Every request to the machine carries this device\'s token; the call socket carries it as a subprotocol',async()=>{
 const s=setup();const asked=[];
 s.context.fetch=async(url,init={})=>{asked.push([url,init]);return {ok:true,status:200,json:async()=>({binding:null,participants:[],messages:[]})}};
 await s.run('refresh()');await s.run('refreshHistory()');
 await s.run("post('/api/presentation/rtc/offer',{session_id:'s',sdp:'v=0',type:'offer'})");
 assert.ok(asked.length>=3);
 for(const [url,init] of asked)assert.equal(init.headers.Authorization,'Bearer tok-1',url);
 for(const [url,init] of asked)assert.equal(init.redirect,'error',url+': a redirect never carries the token on');
 assert.equal(asked.at(-1)[1].headers['Content-Type'],'application/json','a request\'s own headers are kept');
 // An error report outlives the page like a beacon did, and — unlike a beacon — carries the token.
 s.run("reportClientError({kind:'uncaught',message:'boom'})");await new Promise(resolve=>setTimeout(resolve,0));
 const report=asked.at(-1);
 assert.equal(report[0],'/api/presentation/client-error');
 assert.equal(report[1].keepalive,true);
 assert.equal(report[1].headers.Authorization,'Bearer tok-1');
 // Browsers cannot set headers on a socket: the token is the second subprotocol.
 const sockets=socketsOf(s);s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.setTimeout=()=>0;s.context.clearTimeout=()=>{};   // the join's own patience is not what this test is about
 void s.run('joinRoom')(s.run('connectEpoch'),{browserStt:false,sttRuntime:null}).catch(()=>{});
 assert.equal(sockets[0].url,'wss://room.example/api/presentation/ws');
 assert.deepEqual([...sockets[0].protocols],['sidevoice','sidevoice.token.tok-1']);
});

test('the Agents API proves the paired host before sending its device token',async()=>{
 const node=await fakeNode(),pairing=pairingOf(node);
 node.tokens.add(pairing.token);
 const s=setup({stored:{in_use:node.fp,pairings:[pairing]}}),net=network({at:{'http://127.0.0.1:8768':node}}),agentRequests=[];
 s.context.fetch=async(url,init={})=>{
  if(url.includes('/api/host/agents')){
   agentRequests.push({url,init});
   return {ok:true,status:200,json:async()=>({agents:[],scanned_at:1})};
  }
  return net.get(url,init);
 };
 await s.run(`window.sidevoiceActions.loadHostAgents(${JSON.stringify(node.fp)},{rescan:true})`);

 const identity=net.asked.find(request=>request.url.startsWith('http://127.0.0.1:8768/api/device/identity?nonce='));
 assert.ok(identity,'the host identity is checked before the listing request');
 assert.equal(identity.auth,null,'identity proof does not expose a device token');
 assert.equal(agentRequests.length,1);
 assert.equal(agentRequests[0].url,'http://127.0.0.1:8768/api/host/agents?rescan=1');
 assert.equal(agentRequests[0].init.headers.Authorization,'Bearer tok-1');
 assert.equal(agentRequests[0].init.redirect,'error');
 assert.equal(s.run(`roomStore.getState().facts.hostAgents[${JSON.stringify(node.fp)}].status`),'ready');
});

test('the Agents API accepts and reuses a proved same-origin empty base',async()=>{
 const node=await fakeNode(),pairing=pairingOf(node);node.tokens.add(pairing.token);
 const s=setup({stored:{in_use:node.fp,pairings:[pairing]}}),net=network({at:{'':node,'http://127.0.0.1:8768':node},target:{kind:'node',fingerprint:node.fp}}),agentRequests=[];
 s.context.location.origin='http://127.0.0.1:8768';
 s.context.fetch=async(url,init={})=>{
  if(String(url).startsWith('/api/host/agents')){
   agentRequests.push({url:String(url),init});
   return {ok:true,status:200,json:async()=>({agents:[],scanned_at:1})};
  }
  return net.get(String(url),init);
 };
 await s.run('locate({move:true,fresh:true})');
 assert.equal(s.run(`hostAgentBases.get(${JSON.stringify(node.fp)})`),'','rendezvous identifies the page origin as the paired host');
 const identityProofs=net.asked.filter(request=>request.url.includes('/api/device/identity?nonce=')).length;

 await s.run(`window.sidevoiceActions.loadHostAgents(${JSON.stringify(node.fp)},{rescan:true})`);
 await s.run(`window.sidevoiceActions.loadHostAgents(${JSON.stringify(node.fp)},{rescan:true})`);

 assert.equal(agentRequests.length,2,'each scan reaches the node through its authenticated same-origin API');
 assert.deepEqual(agentRequests.map(request=>request.url),['/api/host/agents?rescan=1','/api/host/agents?rescan=1']);
 assert.ok(agentRequests.every(request=>request.init.headers.Authorization==='Bearer tok-1'));
 const identities=net.asked.filter(request=>request.url.includes('/api/device/identity?nonce='));
 assert.equal(identities.length,identityProofs,'both scans reuse the previously proved empty base');
 assert.ok(identities.every(request=>request.auth===null),'identity proof remains unauthenticated');
 assert.equal(s.run(`roomStore.getState().facts.hostAgents[${JSON.stringify(node.fp)}].status`),'ready');
});

test('forgetting a host during identity proof prevents the pending Agents request from sending its token',async()=>{
 const node=await fakeNode(),pairing=pairingOf(node);node.tokens.add(pairing.token);
 const s=setup({stored:{in_use:null,pairings:[pairing]}}),net=network({at:{'http://127.0.0.1:8768':node}}),agentRequests=[];
 let releaseProof,signalProof;
 const proofStarted=new Promise(resolve=>{signalProof=resolve}),proofGate=new Promise(resolve=>{releaseProof=resolve});
 let delayed=false;
 s.context.fetch=async(url,init={})=>{
  const text=String(url);
  if(text.startsWith('http://127.0.0.1:8768/api/device/identity?nonce=')&&!delayed){delayed=true;signalProof();await proofGate}
  if(text.includes('/api/host/agents'))agentRequests.push({url:text,init});
  return net.get(url,init);
 };
 const loading=s.run(`window.sidevoiceActions.loadHostAgents(${JSON.stringify(node.fp)})`);
 await proofStarted;
 await s.run(`window.sidevoiceActions.forgetMachine(${JSON.stringify(node.fp)})`);
 releaseProof();
 await loading;
 assert.deepEqual(agentRequests,[],'the host can be forgotten while the unauthenticated proof is pending');
 assert.deepEqual(stored(s).pairings,[]);
});

test('the gear handoff stores one host or leaves a multi-host choice in R3 Machines',()=>{
 const s=setup({strictDOM:true});
 s.run(`window.sidevoiceActions.openAgentSettings(${JSON.stringify(PAIRED.fp)})`);
 assert.equal(s.run("$('settings-machines').getAttribute('aria-pressed')"),'true');
 assert.equal(JSON.stringify(s.run('roomStore.getState().facts.settingsAgentRequest')),
  JSON.stringify({fp:PAIRED.fp,id:1}),'one pending host is passed to the machine selection route');

 s.run('window.sidevoiceActions.openAgentSettings(null)');
 assert.equal(s.run("$('settings-machines').getAttribute('aria-pressed')"),'true');
 assert.equal(JSON.stringify(s.run('roomStore.getState().facts.settingsAgentRequest')),
  JSON.stringify({fp:null,id:2}),'multiple pending hosts leave selection to the marked Machines list');
});

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
 assert.equal(asked.some(([url])=>url.startsWith('http://127.0.0.1:43127/')&&url.includes('/api/device/identity?nonce=')),false,'native already verified the local identity over its peer-checked socket');
 assert.ok(asked.every(([url,options])=>!options.headers?.Authorization||url.startsWith('http://127.0.0.1:43127/')),'the session token stays on the app-owned proxy; other paired hosts may receive unauthenticated identity probes');
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

test('With nothing proving itself the page says why, and joins nothing: not connected to the room, or not answering',async()=>{
 const node=await fakeNode();
 const s=setup({paired:false,stored:{in_use:node.fp,pairings:[pairingOf(node)]}});const sockets=socketsOf(s);
 s.context.window.roomVoice={unlock:async()=>{},cancel(){}};
 const net=network({roomSays:false});s.context.fetch=net.get;
 await s.run('locate({move:true,fresh:true})');
 assert.equal(s.run('nodeBase'),null);
 assert.match(s.run('joinView(state).text'),/«macbook» no está conectada a la sala ahora mismo/);
 assert.equal(s.run('joinView(state).note'),true);
 assert.ok(net.asked.some(r=>r.url==='https://room.example/api/rendezvous?nodes=mac'),'the room is asked about this machine, by the id the code gave');
 await s.run('toggleCall()');
 assert.equal(sockets.length,0,'no call socket without an address that proved itself');
 assert.equal(s.run('joinView(state).failed'),true);
 assert.match(s.run('joinView(state).text'),/no está conectada a la sala/);
 assert.equal(net.asked.filter(r=>r.auth).length,0,'and no token left the page');
 s.context.fetch=network({roomSays:null}).get;await s.run('locate({move:true,fresh:true})');
 s.run("joinFailure=''");
 assert.match(s.run('reachNote(state)'),/No se llega a «macbook» ni directamente ni a través de la sala/);
 // Settings opens on Máquinas with its own host row; it does not put an error in the settings form.
 s.run('window.sidevoiceActions.openSettings()');
 assert.equal(s.run("$('pane-machines').hidden"),false);
 assert.equal(s.run("$('settings-error').textContent"),'');
 // The machine answering takes the note, and a failed join, away by themselves.
 s.run("failJoin(reachFailure=reachNote(state))");
 node.tokens.add('tok-1');s.context.fetch=network({at:{'https://room.example/nodes/mac':node}}).get;
 await s.run('locate()');
 assert.equal(s.run('nodeBase'),'https://room.example/nodes/mac');
 assert.equal(s.run('joinView(state)'),null);
});

test('A device paired with nothing gets explicit pairing on join, not an automatic dialog on load',async()=>{
 const s=setup({paired:false});const sockets=socketsOf(s);const net=network();s.context.fetch=net.get;
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(s.run('roomStore.getState().pairing.open'),false,'the onboarding screen keeps pairing explicit');
 assert.match(s.run('joinView(state).text'),/no está emparejado con ninguna máquina/);
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

test('A machine that no longer knows this device (401) ends the call, says so, and asks for a new code',async()=>{
 const node=await fakeNode();
 const s=setup({stored:{in_use:node.fp,pairings:[pairingOf(node)]}});
 s.context.fetch=network({at:{'':node},refuse:true}).get;
 s.context.window.roomVoice={cancel(){}};
 s.run("ws={readyState:1,close(){}};var hungUp=0;const hangUp=disconnect;disconnect=()=>{hungUp++;hangUp()}");
 await assert.rejects(s.run("api('/api/presentation/languages')"),/ya no reconoce este dispositivo/);
 assert.equal(s.run('hungUp'),1,'the call ends: the machine will not take anything more from it');
 assert.equal(s.run('nodeBase'),null);
 assert.equal(s.run('state.nodeReach'),'revoked');
 assert.equal(stored(s).pairings[0].revoked,true,'kept, saying so, until paired again or forgotten');
 assert.equal(s.run('roomStore.getState().machines[0].state'),'revoked');
 assert.equal(s.run('roomStore.getState().pairing.open'),true);
 assert.match(s.run('roomStore.getState().pairing.note'),/«macbook» ya no reconoce este dispositivo.*código nuevo/);
 assert.equal(s.run('joinView(state).failed'),true);
 // Joining again asks for the code; nothing is sent with a token the machine refused.
 const sockets=socketsOf(s);s.run("window.sidevoiceActions.closePairing()");
 await s.run('toggleCall()');
 assert.equal(s.run('roomStore.getState().pairing.open'),true);
 assert.equal(sockets.length,0);
});

test('A call socket the machine accepts and then closes with 4401 is the same answer: no reconnection, a new code',async()=>{
 // Before the session: the join fails for good.
 const s=setup();const sockets=socketsOf(s);s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.window.roomVoice={cancel(){}};
 const joining=s.run('joinRoom')(s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 sockets[0].readyState=1;sockets[0].onopen();sockets[0].onclose({code:4401,reason:'Dispositivo no emparejado con esta máquina.'});
 const refusal=await joining.then(()=>null,error=>error);
 assert.equal(refusal.refused,true,'a refusal a reconnection must not insist on');
 assert.match(refusal.message,/ya no reconoce este dispositivo/);
 assert.equal(stored(s).pairings[0].revoked,true);
 assert.equal(s.run('roomStore.getState().pairing.open'),true);
 // During a call: the socket is not reopened.
 const t=setup();const again=socketsOf(t);
 t.run(`RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);window.roomVoice={unlock:async()=>{},cancel(){},signal(){}};window.roomTranscription={stop(){},start(){}};
  stream={getAudioTracks:()=>[{enabled:true}],getTracks:()=>[]};sessionId='call-1';ws=null`);
 await t.run('lostConnection')({code:4401},t.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(again.length,0,'no reconnection');
 assert.equal(t.run('state.reconnecting'),false);
 assert.match(t.run('joinView(state).text'),/ya no reconoce este dispositivo/);
 assert.equal(t.run('joinView(state).failed'),true);
 assert.equal(t.run('roomStore.getState().pairing.open'),true);
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
 s.run(`roomStore.patch({hostAgents:{[${JSON.stringify(mac.fp)}]:{status:'ready',value:{agents:[{id:'codex',present:true,registration:'not-connected',actionable:true}],scanned_at:1},error:null,busy:{},actionErrors:{}}}})`);
 // The one in use, at the address that proved itself a moment ago.
 await s.run(`window.sidevoiceActions.forgetMachine(${JSON.stringify(mac.fp)})`);
 const revoke=net.asked.find(r=>r.method==='DELETE');
 assert.equal(revoke.url,'/api/device/devices/dev-1');
 assert.equal(revoke.auth,'Bearer tok-1');
 assert.deepEqual(stored(s).pairings.map(p=>p.fp),[pc.fp]);
 assert.equal(stored(s).in_use,pc.fp,'the one left is the one in use');
 assert.equal(s.run('roomStore.getState().machines.length'),1);
 assert.equal(s.run(`roomStore.getState().facts.hostAgents[${JSON.stringify(mac.fp)}]`),undefined,'forgetting a host clears its connector state');
 // The other one's only address answers as somebody else: forgotten here, and its token sent nowhere.
 net.asked.length=0;
 await s.run(`window.sidevoiceActions.forgetMachine(${JSON.stringify(pc.fp)})`);
 assert.equal(net.asked.filter(r=>r.method==='DELETE').length,0);
 assert.equal(net.asked.filter(r=>r.auth==='Bearer tok-pc').length,0);
 assert.deepEqual(stored(s),{in_use:null,pairings:[]});
 assert.equal(s.run('state.nodeReach'),'unpaired');
});

test('A reconnection comes back to the same machine by whichever of its addresses answers, and keeps its words for it',async()=>{
 const node=await fakeNode();node.tokens.add('tok-1');
 const s=setup({stored:{in_use:node.fp,pairings:[pairingOf(node)]}});const sockets=socketsOf(s);
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});s.context.crypto={randomUUID:()=>'hello-id',subtle:globalThis.crypto.subtle,getRandomValues:bytes=>globalThis.crypto.getRandomValues(bytes)};
 s.context.atob=value=>Buffer.from(value,'base64').toString('binary');
 s.context.sessionStorage={getItem:()=>'t-1',setItem(){},removeItem(){}};
 s.run(`RECONNECT_DELAYS_MS.splice(0,RECONNECT_DELAYS_MS.length,1,1);startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},signal(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};
  voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};stream={getAudioTracks:()=>[{enabled:true}]};sessionId='old-session';ws={readyState:1};
  nodeBase='http://127.0.0.1:8768';verified.set(nodeBase,Date.now());${GAP_FRAMES}`);
 // The laptop left the network: its direct address is gone, its room still reaches it.
 s.context.fetch=network({at:{'https://room.example/nodes/mac':node}}).get;
 const pending=s.run('lostConnection')({code:1006},s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 s.run("feed(Array(60).fill(0.4))");
 for(let attempt=0;attempt<200&&!(sockets.length&&sockets.at(-1).url.includes('/nodes/'));attempt++){
  await new Promise(resolve=>setTimeout(resolve,2));
  const socket=sockets.at(-1);if(socket&&!socket.failed&&!socket.url.includes('/nodes/')){socket.failed=true;socket.onclose?.({code:1006})}
 }
 const socket=sockets.at(-1);
 assert.equal(socket.url,'wss://room.example/nodes/mac/api/presentation/ws','the first attempt tried where it was; the next, where the machine proved itself');
 assert.deepEqual([...socket.protocols],['sidevoice','sidevoice.token.tok-1']);
 socket.readyState=1;socket.onopen();
 socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 await pending;
 assert.ok(socket.sent.map(value=>JSON.parse(value)).filter(m=>m.type==='voice-catchup').length>0,'the same machine: what was said meanwhile reaches it');
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
// ----- the microphone over WebRTC (`webrtc-mic.js`) -----
// Neither this harness nor this pod has WebRTC: the peer connection below is a fake that records what the page
// asked of it and moves when the test says so. A real browser, a real node and a real network are not covered.
class FakePeer{
 constructor(config){this.config=config;this.connectionState='new';this.iceGatheringState='new';this.closed=false;this.transceivers=[];FakePeer.all.push(this)}
 addTransceiver(track,init){const transceiver={track,init,sender:{replaceTrack:async()=>{}}};this.transceivers.push(transceiver);return transceiver}
 async createOffer(){return {type:'offer',sdp:'v=0 offer'}}
 async setLocalDescription(description){this.localDescription={...description}}
 async setRemoteDescription(description){this.remote=description}
 close(){this.closed=true;this.connectionState='closed'}
 gather(){this.iceGatheringState='complete';this.onicegatheringstatechange?.()}
 move(connectionState){this.connectionState=connectionState;this.onconnectionstatechange?.()}
}
function webrtcCall({search='',rtc={enabled:true,ice_servers:[{urls:['stun:stun.example:3478']}]}}={}){
 const s=setup();const sockets=[],requests=[];FakePeer.all=[];
 s.context.RTCPeerConnection=FakePeer;
 s.context.location={protocol:'https:',host:'room.example',search};
 s.context.WebSocket=class{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this)}send(m){this.sent.push(m)}close(){this.readyState=3}};
 s.context.WebSocket.OPEN=1;
 s.context.window.sidevoiceUI=new Proxy({},{get:()=>()=>{}});s.context.crypto={randomUUID:()=>'hello-id'};
 s.context.fetch=async(path,init)=>{requests.push([path,init?.body?JSON.parse(init.body):null]);return {ok:true,status:200,json:async()=>
  path.endsWith('/rtc/config')?rtc:path.endsWith('/rtc/offer')?{sdp:'v=0 answer',type:'answer'}:{binding:null,room:{revision:0},clients:[],call:null,participants:[]}}};
 const track={enabled:true,stop(){}};
 s.run(`startMeter=()=>{};stopMeter=()=>{};startCapture=async()=>{};keepScreenAwake=()=>{};
  window.roomVoice={unlock:async()=>{},cancel(){},context:{state:'running'}};window.roomTranscription={stop(){},start(){}};
  voicePreferences={stt:{place:'openai',model:'gpt-4o-transcribe'}};rendezvous='room';node='mac';nodeBase='/nodes/mac'`);
 s.context.__track=track;s.run("stream={getAudioTracks:()=>[globalThis.__track],getTracks:()=>[globalThis.__track]}");
 const join=async(id,context={})=>{
  const joining=s.run('joinRoom')(s.run('connectEpoch'),{browserStt:false,sttRuntime:null,...context});
  const socket=sockets.at(-1);socket.readyState=1;socket.onopen();
  socket.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:id,sample_rate:16000,channels:1}})});
  await joining;await new Promise(resolve=>setTimeout(resolve,0));
  return socket;
 };
 // What the socket carried: the microphone's PCM frames, and the path the node was told.
 const frames=socket=>socket.sent.filter(m=>typeof m!=='string').length;
 const media=socket=>socket.sent.filter(m=>typeof m==='string').map(m=>JSON.parse(m)).filter(m=>m.type==='voice-media').map(m=>m.data);
 const speak=socket=>s.run('sendMicFrame')(socket,new ArrayBuffer(640));
 return {s,sockets,requests,track,join,frames,media,speak,settle:()=>new Promise(resolve=>setTimeout(resolve,0))};
}
test('With a session, the microphone is offered to the machine; the socket stops carrying it only once WebRTC is connected',async()=>{
 const {s,requests,track,join,frames,media,speak,settle}=webrtcCall();
 const socket=await join('call-1');
 assert.equal(requests[0][0],'/nodes/mac/api/presentation/rtc/config','asked of the node, through the room');
 const peer=FakePeer.all[0];
 assert.equal(JSON.stringify(peer.config),JSON.stringify({iceServers:[{urls:['stun:stun.example:3478']}]}));
 assert.equal(peer.transceivers[0].track,track,'the track the call already captures, not a second microphone');
 assert.equal(peer.transceivers[0].init.direction,'sendonly');
 speak(socket);
 assert.equal(frames(socket),1,'while it negotiates, the socket is the microphone');
 peer.gather();await settle();
 const offer=requests.find(([path])=>path.endsWith('/rtc/offer'));
 assert.equal(offer[0],'/nodes/mac/api/presentation/rtc/offer');
 assert.equal(JSON.stringify(offer[1]),JSON.stringify({session_id:'call-1',sdp:'v=0 offer',type:'offer'}));
 assert.equal(JSON.stringify(peer.remote),JSON.stringify({type:'answer',sdp:'v=0 answer'}));
 assert.equal(media(socket).length,0,'answered is not connected: the node has not been told anything yet');
 speak(socket);assert.equal(frames(socket),2);
 peer.move('connected');
 assert.equal(JSON.stringify(media(socket)),JSON.stringify([{session_id:'call-1',path:'webrtc'}]));
 speak(socket);speak(socket);
 assert.equal(frames(socket),2,'no PCM on the socket while WebRTC carries the microphone');
 assert.equal(s.run('micPathFact()'),'WebRTC');
 // It fails: the node is told, and the socket carries the microphone again.
 peer.move('failed');
 assert.equal(JSON.stringify(media(socket).map(m=>m.path)),JSON.stringify(['webrtc','socket']));
 speak(socket);assert.equal(frames(socket),3);
 assert.equal(peer.closed,true);
 assert.equal(s.run('micPathFact()'),'Socket (relé) · la conexión WebRTC falló');
 // And everything else on the socket is what it always was: the hello went first, untouched.
 assert.equal(JSON.parse(socket.sent[0]).type,'client-ready');
});
test('A new session closes the old connection and negotiates again for itself; hanging up closes it',async()=>{
 const {s,requests,join,media,settle}=webrtcCall();
 const first=await join('call-1');
 FakePeer.all[0].gather();await settle();FakePeer.all[0].move('connected');
 // The settings swap: a second socket, and the first one let go once the room has answered.
 const second=await join('call-2',{keepCurrent:true});
 assert.equal(FakePeer.all[0].closed,true,'the old connection belonged to the old session');
 assert.equal(JSON.stringify(media(first).map(m=>m.path)),JSON.stringify(['webrtc']),'and nothing is announced on a socket being let go');
 assert.equal(FakePeer.all.length,2);
 FakePeer.all[1].gather();await settle();
 const offers=requests.filter(([path])=>path.endsWith('/rtc/offer')).map(([,body])=>body.session_id);
 assert.equal(JSON.stringify(offers),JSON.stringify(['call-1','call-2']));
 FakePeer.all[1].move('connected');
 assert.equal(JSON.stringify(media(second)),JSON.stringify([{session_id:'call-2',path:'webrtc'}]));
 // A dropped socket: the connection goes with the session it belonged to.
 s.run('lostConnection')({code:1008},s.run('connectEpoch'),{browserStt:false,sttRuntime:null});
 assert.equal(FakePeer.all[1].closed,true);
 assert.equal(s.run('micLink'),null);
 // Hanging up closes whatever the next call had (the hang-up above let the microphone go; a new call opens it again).
 s.run("stream={getAudioTracks:()=>[globalThis.__track],getTracks:()=>[globalThis.__track]}");
 await join('call-3');
 assert.equal(FakePeer.all.length,3);
 s.run('disconnect()');
 assert.equal(FakePeer.all[2].closed,true);
});
test('Switched off on this device, or by the machine, the microphone stays on the socket and the statistics say why',async()=>{
 for(const [options,why] of [[{search:'?webrtc=0'},'WebRTC desactivado en este dispositivo'],[{rtc:{enabled:false,ice_servers:[]}},'la máquina tiene WebRTC desactivado']]){
  const {s,requests,join,frames,media,speak}=webrtcCall(options);
  const socket=await join('call-1');
  speak(socket);
  assert.equal(frames(socket),1);
  assert.equal(media(socket).length,0);
  assert.equal(FakePeer.all.length,0,'no peer connection at all');
  assert.equal(requests.some(([path])=>path.endsWith('/rtc/offer')),false);
  assert.equal(s.run('micPathFact()'),'Socket (relé) · '+why);
 }
 const stored=webrtcCall();stored.s.context.localStorage={getItem:key=>key==='sidevoice.webrtc'?'off':null,setItem(){},removeItem(){}};
 await stored.join('call-1');
 assert.equal(FakePeer.all.length,0,'localStorage sidevoice.webrtc=off keeps the socket too');
});
test('A native build goes to the app\'s engine, a page build to the page\'s worker, by the offer and nothing else',async()=>{
 const s=setup({strictDOM:true});
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:8192}),installed:async()=>[]}}};
 await s.run('measureDevice(true)');
 assert.deepEqual(plain(s.run("ttsRequest("+JSON.stringify(TTS())+")")),{model:'kokoro-82m-v1.0',engine:'sherpa-onnx',accelerator:'cpu',native:true});
 passing(s);
 s.run("window.sidevoiceActions.chooseStageBuild('tts','sherpa-onnx/coreml')");await settle();
 assert.equal(plain(s.run("ttsRequest(paneStage('tts'))")).accelerator,'coreml','Avanzado overrides the accelerator');
 s.context.window.__sidevoiceDesktop=undefined;
 await measured(s,PAGE_CAPS);
 assert.deepEqual(plain(s.run("ttsRequest("+JSON.stringify(TTS())+")")),{model:'kokoro-82m-v1.0',engine:'transformers-js',accelerator:'webgpu',native:false,fallback:'wasm'});
});test('When the desktop app answers the headset buttons, the page does not answer them too',()=>{
 const s=setup({strictDOM:true});
 const registered=[];
 s.context.navigator={mediaSession:{setActionHandler:(action,handler)=>registered.push([action,!!handler]),metadata:null}};
 s.context.MediaMetadata=class{constructor(value){Object.assign(this,value)}};
 s.run("applyLockScreen(true)");
 assert.ok(registered.some(([action,on])=>action==='pause'&&on),'a page on its own takes the buttons');
 registered.length=0;
 s.context.window.__sidevoiceDesktop={host:{mediaKeys:'native'}};
 s.run("applyLockScreen(true)");
 assert.equal(registered.length,0,'with the app answering them, one click must not toggle the microphone twice');
});
test('A page whose WebGPU failed to load Whisper falls back to WASM once and stops offering WebGPU',async()=>{
 const s=setup();const saved={};
 s.context.localStorage={getItem:key=>saved[key]??null,setItem:(key,value)=>{saved[key]=value},removeItem(key){delete saved[key]}};
 await measured(s,PAGE_CAPS);
 const tried=[];
 s.run("window.roomTranscription.prepare=async options=>{__tried.push(options.accelerator);if(options.accelerator==='webgpu')throw Error('GPU lost');return {model:options.model,engine:options.engine,accelerator:options.accelerator}}");
 s.context.__tried=tried;
 const runtime=plain(await s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})"));
 assert.deepEqual(tried,['webgpu','wasm']);
 assert.equal(runtime.sttRuntime.accelerator,'wasm');
 assert.equal(runtime.sttRuntime.fallback_from,'webgpu');
 assert.equal(saved['sidevoice.webgpu-failed'],'1');
 await s.run('measuring');
 assert.deepEqual(plain(s.run('deviceCapabilities.has')),['wasm'],'this device no longer has WebGPU as far as the offers go');
 assert.ok(!stageView(s,'stt').models.some(m=>m.id==='whisper-small'));
});
test('A model download that failed on WebGPU falls back once and leaves the GPU offered; a GPU failure sets it aside until retried (R11)',async()=>{
 const s=setup();const saved={};
 s.context.localStorage={getItem:key=>saved[key]??null,setItem:(key,value)=>{saved[key]=value},removeItem(key){delete saved[key]}};
 await measured(s,PAGE_CAPS);
 let failure;
 s.context.__failure=()=>failure;
 s.run("window.roomTranscription.prepare=async options=>{if(options.accelerator==='webgpu')throw __failure();return {model:options.model,engine:options.engine,accelerator:options.accelerator}}");
 const count=()=>stageView(s,'stt').models.length;
 for(const error of [Error('Failed to fetch model download'),Error('Could not locate file: "https://huggingface.co/…/encoder_model.onnx"')]){
  failure=error;
  const runtime=plain(await s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})"));
  assert.equal(runtime.sttRuntime.accelerator,'wasm','the call still goes on, on the CPU');
  assert.equal(saved['sidevoice.webgpu-failed'],undefined,error.message+' says nothing about the GPU');
 }
 await s.run('measureDevice(true)');
 assert.equal(count(),4,'every GPU model is still offered');
 failure=Error('WebGPU device lost: no adapter for this shader');
 await s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})");
 assert.equal(saved['sidevoice.webgpu-failed'],'1');
 await s.run('measuring');
 assert.equal(count(),2,'a GPU that failed is set aside');
 assert.equal(s.run('roomStore.getState().voiceTools.gpuSetAside'),true,'and the pane offers to try it again');
 await s.run('window.sidevoiceActions.retryGpu()');
 assert.equal(count(),4,'tried again, its models are back');
 assert.equal(s.run('roomStore.getState().voiceTools.gpuSetAside'),false);
});
test('A person who never chose gets their system language, English when it is none of ours, and a saved choice wins',async()=>{
 const s=setup();
 // The room's defaults are English: a node cannot know the person's system. Its stages are not this device's.
 s.context.fetch=async()=>({ok:true,json:async()=>({ui_language:'en',stt:{place:'device',model:'whisper-large-v3-turbo',options:{},build:null}})});
 await measured(s,{webgpu:false,wasm:true});
 const speech=languages=>{s.context.navigator={languages};s.run('roomStore.patch({speechLanguage:systemLanguage(SPEECH_LANGUAGES)})')};
 s.context.navigator={languages:['de-DE','fr-FR']};speech(['de-DE','fr-FR']);
 let p=await s.run('callPreferences()');
 assert.deepEqual([p.ui_language,p.stt.model,p.stt.options.language],['en','whisper-tiny','fr']);
 s.context.navigator={languages:['es-ES']};speech(['es-ES']);
 p=await s.run('callPreferences()');
 assert.deepEqual([p.ui_language,p.stt.options.language],['es','es']);
 speech(['de-DE']);s.context.navigator={languages:['de-DE']};
 p=await s.run('callPreferences()');
 assert.deepEqual([p.ui_language,p.stt.options.language],['en','en']);
 s.context.navigator={languages:['es-ES']};
 s.context.localStorage={getItem:key=>key==='sidevoice.settings'?JSON.stringify({ui_language:'en'}):key==='sidevoice.stages'?JSON.stringify({[PAIRED.fp]:{stt:STT('whisper-base',{language:'auto'})}}):null,setItem(){},removeItem(){}};
 p=await s.run('callPreferences()');
 assert.deepEqual([p.ui_language,p.stt.model,p.stt.options.language],['en','whisper-base','auto']);
});
/* Select = load and verify (sidevoice/sidevoice-core#21), through the real check (load-and-verify.js, the core's Spanish clip) against the
 * desktop app's bridge and a checked worker that answer as told. */
function selecting({installed=[{model:'whisper-tiny',engine:'sherpa-onnx'},{model:'whisper-base',engine:'sherpa-onnx'}],load,heard}={}){
 const s=setup({strictDOM:true}),log=[];
 const clip=fs.readFileSync(__dirname+'/../../../packages/browser-audio/checks/stt-es.wav');
 const expected=JSON.parse(fs.readFileSync(__dirname+'/../../../packages/browser-audio/checks/checks.json','utf8')).stt.clips.es.text;
 s.context.fetch=async url=>{if(String(url).includes('/voice-browser/checks/'))return {ok:true,arrayBuffer:async()=>clip.buffer.slice(clip.byteOffset,clip.byteOffset+clip.byteLength)};throw Error('unexpected '+url)};
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{
  capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>installed,memory:async()=>({total_mb:16384,available_mb:9000}),
  unload:async(model,engine)=>{log.push(['unload',model,engine])}}}};
 const worker={posted:[],postMessage(message){this.posted.push(message);const reply=data=>setTimeout(()=>this.onmessage?.({data:{id:message.id,...data}}),0);
   if(message.type==='load')reply(load||{type:'ready',runtime:{model:message.model,engine:message.engine,accelerator:message.accelerator,load_ms:321}});
   if(message.type==='transcribe')reply({type:'result',result:{text:heard??expected}})},
  terminate(){log.push(['terminate'])}};
 s.context.window.roomTranscription={capabilities:async()=>({}),candidate:native=>{log.push(['candidate',native]);return worker},
  adopt:(adopted,runtime)=>{log.push(['adopt',adopted===worker,runtime.model])},stop(){}};
 return {s,log,worker};
}
test('Selecting a model checks it apart, puts it in place of the one in use, and only then unloads that one',async()=>{
 const {s,log,worker}=selecting();
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");
 await settle();await settle();
 assert.deepEqual(worker.posted.map(m=>m.type),['load','transcribe','transcribe'],'loaded, then two passes');
 assert.equal(worker.posted[1].language,'es');
 assert.deepEqual(log,[['candidate',true],['adopt',true,'whisper-base'],['unload','whisper-tiny','sherpa-onnx']],'the previous model goes only after the swap');
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-base');
 assert.equal(JSON.parse(s.saved['sidevoice.stages']).hosts[PAIRED.fp].stt.model,'whisper-base','stored once it passed');
 const check=plain(s.run('stageChecks.stt'));
 assert.equal(check.phase,'done');
 assert.equal(check.result.load_ms,321,'the app\'s own load time');
 const diagnostics=plain(s.run('stageDiagnostics.stt'));
 assert.deepEqual([diagnostics.ok,diagnostics.build.engine,diagnostics.memory.available_mb,diagnostics.passes.length],[true,'sherpa-onnx',9000,2]);
});
test('A model that fails to load never becomes the setting: the one in use stays, loaded, and the step is named',async()=>{
 const {s,log}=selecting({load:{type:'error',error:'whisper-base needs 2500 MB',step:'load',reason:{key:'model_needs_memory',needed_mb:2500,memory_mb:2048,message:'needs memory'}}});
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");
 await settle();
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
 assert.equal(s.saved['sidevoice.stages'],undefined,'nothing stored');
 assert.ok(!log.some(([kind])=>kind==='adopt'||kind==='unload'),'nothing swapped, nothing unloaded: the candidate never loaded');
 const view=stageView(s,'stt');
 assert.equal(view.model,'whisper-tiny','the pane is back on the model in use');
 assert.deepEqual([view.check.phase,view.check.step,view.check.cause,view.check.previous],['failed','Carga','No hay memoria suficiente para este modelo.','Whisper tiny']);
});
test('A transcription that is not what the clip says fails the check; the candidate is let go',async()=>{
 const {s,log}=selecting({heard:'Subtítulos realizados por la comunidad de Amara.org'});
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");
 await settle();
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
 assert.deepEqual(plain(s.run('stageChecks.stt.step')),'check');
 assert.ok(log.some(([kind])=>kind==='terminate'),'its worker is let go');
 assert.deepEqual(log.filter(([kind])=>kind==='unload'),[['unload','whisper-base','sherpa-onnx']],'and the model it loaded, which nothing uses');
});
test('A model not on disk asks first, with the model and its engine package in the size; declining loads nothing',async()=>{
 const {s,log}=selecting({installed:[]});
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");
 await settle();
 const catalog=JSON.parse(fs.readFileSync(__dirname+'/../../../packages/browser-audio/models.json','utf8'));
 const model=catalog.models.find(m=>m.id==='whisper-base').builds.find(b=>b.engine==='sherpa-onnx').download.size;
 const engine=catalog.engines.find(e=>e.id==='sherpa-onnx').packages[0].download.size;
 assert.deepEqual(plain(s.run('stageChecks.stt')).size,model+engine);
 assert.equal(stageView(s,'stt').check.phase,'consent');
 s.run("window.sidevoiceActions.decideStage('stt',false)");
 await settle();
 assert.equal(s.run('stageChecks.stt'),null);
 assert.deepEqual(log,[],'nothing downloaded, nothing loaded');
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
});
test('A slow model is shown with its latency and takes effect only if the person says so',async()=>{
 const {s}=selecting();
 let at=0;s.context.performance={now:()=>(at+=2600)};
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");
 await settle();
 const view=stageView(s,'stt');
 assert.deepEqual([view.check.phase,view.check.latency],['slow','2,60 s']);
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny','not yet');
 s.run("window.sidevoiceActions.decideStage('stt',true)");
 await settle();
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-base');
});

/* Taking effect in a call is part of the selection. A native Whisper tiny call; OpenAI selected and its
 * check passed; the room then refuses, accepts, or the person cancels the new session. */
async function handover(){
 const {s,sockets,old}=switching(),unloads=[];
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>[{model:'whisper-tiny',engine:'sherpa-onnx'}],unload:async(...args)=>{unloads.push(args);return null}}}};
 await s.run('measureDevice(true)');
 listed(s,LISTING(OPENAI({configured:true,source:'stored',hint:'…test'})));
 s.run("voicePreferences="+JSON.stringify(OLD_SETTINGS)+";patchRemote('openai:stt',{models:[{id:'whisper-1'}],error:''})");
 passing(s);
 await s.run("window.sidevoiceActions.chooseStagePlace('stt','openai')");
 await settle();
 return {s,sockets,old,unloads,next:sockets[1]};
}
test('A mid-call change the room refuses is not activated: nothing stored, the previous model stays loaded, the step and reason are said (R01)',async()=>{
 const {s,old,unloads,next}=await handover();
 assert.ok(next,'the change asks the room for a new session');
 assert.equal(plain(s.run('stageChecks.stt')).progress.step,'apply','taking effect is a step of the selection');
 next.readyState=1;next.onopen();
 next.onmessage({data:JSON.stringify({type:'error',data:{message:'OpenAI necesita una clave de API antes de conectar.'}})});
 next.close();
 await settle();
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
 assert.equal(s.saved['sidevoice.stages'],undefined,'nothing stored');
 assert.deepEqual(unloads,[],'the model the call still uses stays loaded');
 assert.equal(s.run('ws'),old);
 const check=plain(s.run('stageChecks.stt'));
 assert.deepEqual([check.phase,check.step,check.reason.key],['failed','apply','switch_refused']);
 assert.match(check.reason.detail,/OpenAI necesita una clave de API/);
 assert.match(stageView(s,'stt').check.cause,/La llamada no aceptó el cambio: OpenAI necesita una clave de API/);
});
test('A mid-call change the room accepts is stored, and only then is the previous native model let go — that instance only (R01, R05)',async()=>{
 const {s,unloads,next}=await handover();
 next.readyState=1;next.onopen();
 next.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 await settle();
 assert.equal(s.run('sessionId'),'new-session');
 assert.equal(s.run('voicePreferences.stt.place'),'openai');
 assert.equal(JSON.parse(s.saved['sidevoice.stages']).hosts[PAIRED.fp].stt.model,'whisper-1');
 assert.deepEqual(unloads,[['whisper-tiny','sherpa-onnx','cpu']]);
 assert.equal(plain(s.run('stageChecks.stt')).phase,'done');
});
test('Cancelling a change while the room is still answering leaves the call, the setting and the model as they were (R01)',async()=>{
 const {s,old,unloads}=await handover();
 s.run("window.sidevoiceActions.cancelStage('stt')");
 await settle();
 assert.equal(s.run('switchingSession'),false);
 assert.equal(s.run('ws'),old);
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
 assert.equal(s.saved['sidevoice.stages'],undefined);
 assert.deepEqual(unloads,[]);
 assert.equal(s.run('stageChecks.stt'),null);
});

/* A provider chosen before its account's voices were listed stays a draft; when the voices come and Save
 * is pressed, the choice is still selected — checked — and stored only if the check passes. */
async function deferredVoices(outcome){
 const s=setup({strictDOM:true});const stored=[];let checks=0;
 s.context.localStorage={getItem:()=>null,setItem:(key,value)=>stored.push([key,JSON.parse(value)]),removeItem(){}};
 await measured(s);listed(s,LISTING(ELEVEN({configured:true,source:'stored',hint:'…11ab'})));
 s.context.__outcome=outcome;s.context.__checked=()=>checks++;
 s.run("consentFor=async()=>null;verifyStage=async()=>{__checked();return __outcome}");
 s.run("ws=null;roomStore.patch({voicePreferences:{tts:"+JSON.stringify(TTS())+"}});patchRemote('elevenlabs:tts',{models:[{id:'eleven_v3',label:'Eleven v3'}],voices:[]})");
 await s.run("window.sidevoiceActions.chooseStagePlace('tts','elevenlabs')");await settle();
 assert.equal(checks,0,'no voice yet: only a draft');
 assert.equal(s.run('stageDraft.tts.place'),'elevenlabs');
 s.run("patchRemote('elevenlabs:tts',{models:[{id:'eleven_v3',label:'Eleven v3'}],voices:[{id:'v1',label:'Nube',languages:['es']}]})");
 await s.run("$('language-form').onsubmit({preventDefault(){}})");await settle();
 return {s,stored,checks:()=>checks};
}
const storedTts=stored=>stored.filter(([key])=>key==='sidevoice.stages').map(([,value])=>value.hosts[PAIRED.fp]?.tts?.place);
test('A provider draft completed later is checked when saved, and a check that fails stores nothing (R02)',async()=>{
 const {s,stored,checks}=await deferredVoices({ok:false,step:'key',reason:{key:'provider_key_refused',provider:'elevenlabs',message:'refused'},passes:[]});
 assert.equal(checks(),1,'saving selects it: the check runs');
 assert.equal(s.run('voicePreferences.tts.place'),'device');
 assert.ok(!storedTts(stored).includes('elevenlabs'),'the provider is never stored');
 assert.deepEqual(plain(s.run('stageChecks.tts')).step,'key');
 assert.match(s.run("$('settings-error').textContent"),/se comprueba antes de usarse/);
});
test('A provider draft completed later and passing its check is stored by the selection, not by the save (R02)',async()=>{
 const {s,stored,checks}=await deferredVoices({ok:true,step:'done',passes:[],latency_ms:300,slow:false});
 assert.equal(checks(),1);
 assert.equal(s.run('voicePreferences.tts.place'),'elevenlabs');
 assert.equal(storedTts(stored).at(-1),'elevenlabs');
 assert.equal(JSON.parse(JSON.stringify(stored.filter(([key])=>key==='sidevoice.stages').at(-1)[1].hosts[PAIRED.fp].tts.options.voice)).es,'v1','stored with the voice it names');
});
test('Saving an option of the model already in use stores it without a check',async()=>{
 const s=setup({strictDOM:true});let checks=0;
 await measured(s);
 s.context.__checked=()=>checks++;s.run("verifyStage=async()=>{__checked();return {ok:true,passes:[]}}");
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+",tts:"+JSON.stringify(TTS())+"}})");
 s.run("window.sidevoiceActions.setStageOption('stt','language','fr')");
 await s.run("$('language-form').onsubmit({preventDefault(){}})");await settle();
 assert.equal(checks,0);
 assert.equal(s.run('voicePreferences.stt.options.language'),'fr');
});

/* The app keeps one instance per accelerator, so the page lets go of exactly the one it no longer needs. */
async function acceleratorSwap(heard){
 const {s,log,worker}=selecting({heard});
 const unloads=[];s.context.window.__sidevoiceDesktop.host.nativeEngine.unload=async(...args)=>{unloads.push(args);return null};
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageBuild('stt','sherpa-onnx/coreml')");
 await settle();await settle();
 return {s,unloads,worker};
}
test('A Core ML candidate of the CPU model in use that fails its check releases its own instance only (R05)',async()=>{
 const {s,unloads,worker}=await acceleratorSwap('Subtítulos realizados por la comunidad de Amara.org');
 assert.equal(worker.posted[0].accelerator,'coreml');
 assert.equal(plain(s.run('stageChecks.stt')).phase,'failed');
 assert.deepEqual(unloads,[['whisper-tiny','sherpa-onnx','coreml']],'the CPU instance the call uses stays');
});
test('Switching the model in use from CPU to Core ML releases the CPU instance, and only it (R05)',async()=>{
 const {s,unloads}=await acceleratorSwap();
 assert.equal(plain(s.run('stageChecks.stt')).phase,'done');
 assert.deepEqual(plain(s.run('voicePreferences.stt.build')),{engine:'sherpa-onnx',accelerator:'coreml'});
 assert.deepEqual(unloads,[['whisper-tiny','sherpa-onnx','cpu']]);
});

/* The room's downloads (sidevoice/sidevoice-core#21): a selection's download is listed in the room with its bytes and
 * the app's own speed, and Cancelar there stops it — in the app through the bridge's cancel(job). The real native
 * worker, over sidevoice-desktop#3's bridge. */
const NATIVE_WORKER=require('esbuild').buildSync({entryPoints:[__dirname+'/../../../packages/browser-audio/native-worker.js'],bundle:true,format:'iife',write:false}).outputFiles[0].text;
async function nativeDownload(){
 const s=setup({strictDOM:true}),calls=[];let reject;
 const engine={capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu','coreml'],memory_mb:16384}),
  installed:async()=>[{model:'whisper-tiny',engine:'sherpa-onnx'}],loaded:async()=>[],memory:async()=>null,
  install(model,name,progress){calls.push(['install',model]);const running=new Promise((_,no)=>{reject=no});running.job='install-9';
   setTimeout(()=>progress({job:'install-9',model,engine:name,done:8e6,total:216e6,bytes_per_s:4e6}),0);return running},
  cancel:async job=>{calls.push(['cancel',job]);reject({key:'install_cancelled',message:'The download was cancelled.'});return true},
  load:async(...args)=>{calls.push(['load',...args]);return {load_ms:1}},unload:async(...args)=>{calls.push(['unload',...args]);return null}};
 s.context.window.__sidevoiceDesktop=s.context.__sidevoiceDesktop={host:{nativeEngine:engine}};
 if(!s.context.setTimeout)s.context.setTimeout=setTimeout;
 vm.runInContext(NATIVE_WORKER,s.context);
 s.run("window.roomTranscription={capabilities:async()=>({}),candidate:native=>sidevoiceNativeWorkers.transcription(),adopt(){},stop(){}}");
 await s.run('measureDevice(true)');
 s.run("ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");await settle();
 s.run("window.sidevoiceActions.decideStage('stt',true)");await settle();
 return {s,calls};
}
test('A native download a selection starts is in the room with its bytes and the app\'s speed, and Cancelar there cancels the app\'s job',async()=>{
 const {s,calls}=await nativeDownload();
 const [item]=plain(s.run('state.downloads'));
 assert.deepEqual([item.kind,item.state,item.label,item.done,item.total,item.bytes_per_s],['native','running','Whisper base',8e6,216e6,4e6]);
 assert.equal(plain(s.run('roomStore.getState().downloads')).rows[0].speed,'4,0 MB/s');
 s.run("window.sidevoiceActions.cancelDownload("+JSON.stringify(item.id)+")");await settle();
 assert.deepEqual(calls,[['install','whisper-base'],['cancel','install-9']],'cancelled in the app, and never loaded');
 assert.equal(plain(s.run('state.downloads'))[0].state,'cancelled');
 assert.equal(s.run('stageChecks.stt'),null,'the selection is over');
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
});
test('Cancelar in the settings pane cancels the same download, and the room says so',async()=>{
 const {s,calls}=await nativeDownload();
 s.run("window.sidevoiceActions.cancelStage('stt')");await settle();
 assert.deepEqual(calls.at(-1),['cancel','install-9']);
 assert.equal(plain(s.run('state.downloads'))[0].state,'cancelled');
});
test('A page download a selection starts is listed too, and Cancelar there lets its worker go',async()=>{
 const s=setup({strictDOM:true});let terminated=0;
 await measured(s,{webgpu:false,webgpuFp16:false,wasm:true});
 s.context.__page={posted:[],postMessage(message){this.posted.push(message);if(message.type==='load')setTimeout(()=>this.onmessage?.({data:{id:message.id,type:'progress',progress:{status:'progress',file:'onnx/encoder_model_quantized.onnx',loaded:12e6,total:30e6}}}),0)},terminate(){terminated++}};
 s.run("window.roomTranscription.candidate=()=>__page;ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");await settle();
 s.run("window.sidevoiceActions.decideStage('stt',true)");await settle();
 const [item]=plain(s.run('state.downloads'));
 assert.deepEqual([item.kind,item.state,item.done],['page','running',12e6]);
 assert.equal(item.total,79664191,'the catalogue\'s size until the files say more');
 s.run("window.sidevoiceActions.cancelDownload("+JSON.stringify(item.id)+")");await settle();
 assert.equal(terminated,1);
 assert.equal(plain(s.run('state.downloads'))[0].state,'cancelled');
});
test('A download a call starts while connecting is listed, and cancelling it abandons the load and the join',async()=>{
 const s=setup({strictDOM:true});let abandoned=0,progress;
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu'],memory_mb:16384}),installed:async()=>[]}}};
 await s.run('measureDevice(true)');
 s.context.__hold=value=>{progress=value};s.context.__abandoned=()=>abandoned++;
 s.run("window.roomTranscription={prepare:(options,onProgress)=>{__hold(onProgress);return new Promise(()=>{})},abandon:()=>__abandoned(),stop(){}}");
 s.run("prepareLocalWhisper({model:'whisper-base',engine:'sherpa-onnx',accelerator:'cpu'})");await settle();
 progress({status:'progress',job:'install-2',loaded:5e6,total:216e6,bytes_per_s:3e6,file:'whisper-base'});
 const [item]=plain(s.run('state.downloads'));
 assert.deepEqual([item.task,item.kind,item.done,item.bytes_per_s],['stt','native',5e6,3e6]);
 s.run("window.sidevoiceActions.cancelDownload("+JSON.stringify(item.id)+")");
 assert.equal(abandoned,1);
 assert.equal(plain(s.run('state.downloads'))[0].state,'cancelled');
});

/* Review N01: a cancel is the end of a preparation, never a reason to try the other accelerator. */
test('Cancelling a call\'s WebGPU download from the room ends the preparation: no WASM copy is started (N01)',async()=>{
 const s=setup();const saved={};
 s.context.localStorage={getItem:key=>saved[key]??null,setItem:(key,value)=>{saved[key]=value},removeItem(key){delete saved[key]}};
 await measured(s,PAGE_CAPS);
 const calls=[];let reject,progress;
 s.context.__prepare=(options,onProgress)=>{calls.push(options.accelerator);progress=onProgress;return new Promise((_,no)=>{reject=no})};
 s.run("window.roomTranscription.prepare=(options,onProgress)=>__prepare(options,onProgress);window.roomTranscription.abandon=()=>{}");
 const preparing=s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})");preparing.catch(()=>{});
 await settle();
 progress({status:'progress',file:'onnx/encoder_model_fp32.onnx',loaded:1e6,total:2e8});
 const [row]=plain(s.run('state.downloads'));
 s.run("window.sidevoiceActions.cancelDownload("+JSON.stringify(row.id)+")");
 reject(Object.assign(Error('Transcripción cancelada'),{name:'AbortError'}));
 await assert.rejects(preparing,{name:'AbortError'});
 await settle();
 assert.deepEqual(calls,['webgpu'],'nothing else is downloaded');
 assert.deepEqual(plain(s.run('state.downloads')).map(item=>item.state),['cancelled']);
 assert.equal(saved['sidevoice.webgpu-failed'],undefined,'and a cancel says nothing about the GPU');
});
test('A keyed cancel from the desktop app ends the preparation the same way, and a join that is gone tries nothing else (N01)',async()=>{
 const s=setup();
 await measured(s,PAGE_CAPS);
 const calls=[];
 s.context.__prepare=options=>{calls.push(options.accelerator);return Promise.reject(Object.assign(Error('Descarga cancelada.'),{reason:{key:'install_cancelled',message:'x'}}))};
 s.run("window.roomTranscription.prepare=options=>__prepare(options)");
 await assert.rejects(s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})"),error=>error.reason?.key==='install_cancelled');
 assert.deepEqual(calls,['webgpu']);
 calls.length=0;
 s.context.__prepare=options=>{calls.push(options.accelerator);s.run('connectEpoch++');return Promise.reject(Error('GPU device lost'))};
 await assert.rejects(s.run("prepareTranscription({stt:"+JSON.stringify(STT('whisper-base'))+"})"),/GPU device lost/);
 assert.deepEqual(calls,['webgpu'],'the join that owned it is gone: no second attempt');
});

/* A Cancel that lands after the room admitted the new session — while the page is still
 * finishing the switch (here: audio unlock held open) — is past the commit point: the change completes, stored,
 * and the previous model is let go, consistently. */
test('A cancel after the room admitted the new session does not half-undo it: the change finishes and is stored (R01)',async()=>{
 const {s,old,unloads,next}=await handover();
 let unlock;s.context.__held=resolve=>{unlock=resolve};
 s.run("window.roomVoice.unlock=()=>new Promise(resolve=>__held(resolve))");
 next.readyState=1;next.onopen();
 next.onmessage({data:JSON.stringify({type:'voice-session',data:{session_id:'new-session',sample_rate:16000,channels:1}})});
 await settle();
 assert.equal(typeof unlock,'function','the switch is past hello, waiting on the audio unlock');
 assert.equal(old.closed,true,'the call is already on the new session');
 s.run("window.sidevoiceActions.cancelStage('stt')");
 unlock();
 await settle();
 assert.equal(s.run('sessionId'),'new-session');
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-1');
 assert.equal(s.run('enginePreferences.stt.model'),'whisper-1');
 assert.equal(JSON.parse(s.saved['sidevoice.stages']).hosts[PAIRED.fp].stt.model,'whisper-1','stored: the active choice and the stored one agree');
 assert.deepEqual(unloads,[['whisper-tiny','sherpa-onnx','cpu']],'the model the old session used is let go');
 assert.equal(plain(s.run('stageChecks.stt')).phase,'done');
});
test('A cancel before the room answered still aborts the new session and changes nothing (R01)',async()=>{
 const {s,old,unloads,next}=await handover();
 s.run("window.sidevoiceActions.cancelStage('stt')");
 await settle();
 assert.equal(next.closed,true,'the opening socket is closed');
 assert.equal(s.run('ws'),old);
 assert.equal(s.run('voicePreferences.stt.model'),'whisper-tiny');
 assert.equal(s.saved['sidevoice.stages'],undefined);
 assert.deepEqual(unloads,[]);
});

/* Review N02: a configuration file that finished says nothing about the weights still to come. */
test('A finished config file does not end the room\'s download: it stays running, with its Cancelar, which still works (N02)',async()=>{
 const s=setup({strictDOM:true});let terminated=0;
 await measured(s,{webgpu:false,webgpuFp16:false,wasm:true});
 s.context.__page={posted:[],postMessage(message){this.posted.push(message);if(message.type!=='load')return;
   const send=progress=>setTimeout(()=>this.onmessage?.({data:{id:message.id,type:'progress',progress}}),0);
   send({status:'progress',file:'config.json',loaded:100,total:100});send({status:'done',file:'config.json'});
   send({status:'progress',file:'onnx/encoder_model_quantized.onnx',loaded:1024,total:30e6})},terminate(){terminated++}};
 s.run("window.roomTranscription.candidate=()=>__page;ws=null;roomStore.patch({voicePreferences:{stt:"+JSON.stringify(STT('whisper-tiny'))+"}})");
 s.run("window.sidevoiceActions.chooseStageModel('stt','whisper-base')");await settle();
 s.run("window.sidevoiceActions.decideStage('stt',true)");await settle();
 const [item]=plain(s.run('state.downloads'));
 assert.deepEqual([item.state,item.done],['running',1124]);
 const view=plain(s.run('roomStore.getState().downloads'));
 assert.deepEqual([view.running,view.rows[0].status,view.rows[0].cancellable],[1,'Descargando',true]);
 assert.equal(plain(s.run('stageChecks.stt')).progress.step,'download');
 assert.equal(s.run("downloads.cancel("+JSON.stringify(item.id)+")"),true);
 await settle();
 assert.equal(terminated,1,'the weights stop downloading');
});

/* Review N03: a cancel is an end, not a failure, wherever it comes from. */
test('A voice download the desktop app cancelled while a call connects is said cancelled, not failed (N03)',async()=>{
 const s=setup({strictDOM:true});
 s.context.window.__sidevoiceDesktop={host:{nativeEngine:{capabilities:async()=>({runs:'native',os:'macos',arch:'aarch64',has:['cpu'],memory_mb:16384}),installed:async()=>[]}}};
 await s.run('measureDevice(true)');
 s.context.__reject=null;
 s.run("window.roomVoice={prepare:(options,status,onProgress)=>new Promise((_,no)=>{__reject=no}),abandon(){},cancel(){}}");
 const loading=s.run("trackedLoad('tts',ttsRequest("+JSON.stringify(TTS())+"),progress=>window.roomVoice.prepare({},()=>{},progress),()=>{})");loading.catch(()=>{});
 await settle();
 s.context.__reject(Object.assign(Error('Descarga cancelada.'),{step:'download',reason:{key:'install_cancelled',message:'x'}}));
 await assert.rejects(loading);
 assert.deepEqual(plain(s.run('state.downloads')).map(item=>[item.state,item.error]),[['cancelled','']]);
});

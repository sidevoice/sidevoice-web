import {createRoomSessionStore,speechSegment,recordReceipt,recordReply,RECONNECT_GRACE_MS,NO_MACHINE,reachNote} from '../state/room-session-state.js';
import {pageTarget,routeUrl,callSocketUrl,isNodePath,askTarget,askRoomNode} from './rendezvous.js';
import {readPairingState,projectPairings,writePairings,withPairing,withoutPairing,usingPairing,revokedPairing,pairingInUse,pairingSummary,candidateBases,firstProven,redeemPairingCode,VERIFIED_FOR_MS} from './device-pairing.js';
import {localHostBridge,normalizeLocalHostPairing,localHostLocator} from './desktop-host.ts';
import {currentDeviceName} from '../state/device-name.ts';
import {hostTranslator} from '../features/settings/host-i18n.ts';
import {systemLanguage,systemPreferences,SPEECH_LANGUAGES} from './system-language.js';
import {createOutbox} from './outbox.js';
import {openVoice} from './voice-module.js';
import {readVoiceSettings,writeVoiceSettings,editVoiceSettings,defaultVoiceSettings,PROVIDERS} from './voice-settings.js';
import {createTurnRelay} from './turn-relay.js';
import {refusalText as sayRefusal} from './refusals.js';
const roomStore=window.sidevoiceUI?.store||createRoomSessionStore();
const state=roomStore.facts;
// What this browser speaks in a call: the language of its system, among those the voice handles.
roomStore.patch({speechLanguage:systemLanguage(SPEECH_LANGUAGES),inApp:!!window.__sidevoiceDesktop?.host?.voice});
// Browser room orchestration. Loaded once after React mounts the stable UI shell.
const $=id=>document.getElementById(id);
function setRoomError(message){const value=message||null;if(window.sidevoiceUI)window.sidevoiceUI.setBootError(value);else $("error").textContent=value||""}
/* One quiet line from the tap until this browser is in the room, naming the step the join is on.
 * It reuses the events that already existed — the voice starting, the room's hello, the conversation this tab goes
 * back to — and measures nothing of its own. A step that fails leaves its reason, and what to do about it, in the
 * same place. */
function joinStatus(step,{detail='',progress=null,subject=''}={}){roomStore.patch({joinStep:step,joinFailure:'',joinDetail:detail?String(detail).slice(0,80):'',joinProgress:progress==null?null:Number(progress),joinSubject:subject})}
function clearJoinStatus(){roomStore.patch({joinStep:null,joinFailure:'',joinDetail:'',joinProgress:null,joinSubject:'',liveNote:''})}
function failJoin(text){roomStore.patch({joinStep:null,joinFailure:text||'',joinDetail:'',joinProgress:null,joinSubject:''})}
// What this tab already calls the conversation it is going back to; the room is not asked again for a title.
function conversationTitle(id){return state.people.find(p=>p.thread_id===id)?.title||state.history.find(r=>r.thread===id)?.name||'tu conversación'}
/* The failures the person can do something about, by the voice's code. Any other code is quoted as it is, because
 * inventing a remedy for it would be worse than quoting it. */
const VOICE_FAILURES={
 'microphone-denied':()=>state.inApp?'El micrófono está bloqueado para Sidevoice. Dale permiso en los ajustes del sistema y vuelve a pulsar para entrar.'
  :'El micrófono está bloqueado para esta página. Dale permiso en el navegador y vuelve a pulsar para entrar.',
 'microphone-unavailable':()=>'No se pudo usar el micrófono. Conéctalo o elige otro en el sistema, y vuelve a entrar.',
 'speaker-unavailable':()=>'No se pudo usar el altavoz. Conéctalo o elige otro en el sistema, y vuelve a entrar.',
 'audio-device-unavailable':()=>'Falta el dispositivo de audio de la llamada. Conéctalo y vuelve a entrar.',
 'audio-device-failed':()=>'El dispositivo de audio de la llamada falló. Conéctalo de nuevo y vuelve a entrar.',
 'voice-module-unavailable':()=>'La voz de la llamada aún no está disponible en esta versión de la página.',
 'build-unfit':()=>'Esa compilación no se puede ejecutar en este dispositivo. Elige otra o deja la automática.',
 'end-of-turn-unavailable':()=>'El fin de turno inteligente aún no está disponible: el turno termina con el silencio.',
 'credential-missing':()=>'Falta la clave del proveedor. Añádela en Configuración → Proveedores.',
 'model-unknown':()=>'Ese modelo no está en el catálogo de la voz.',
 'model-unfit':()=>'Ese modelo no se puede ejecutar en este dispositivo. Elige otro.',
};
// What failed in the call's voice, as the person reads it: a known code in words, any other one as it is.
function voiceErrorText(error){const code=String(error?.code||'');return VOICE_FAILURES[code]?.()||'La voz de la llamada falló'+(code?' ('+code+')':'')+'.'}
function joinFailureText(step,error){
 if(step==='voice')return voiceErrorText(error);
 const message=String(error?.message||error||'');
 return message+(/[.!?…]$/.test(message)?'':'.');
}

// The room holds several browsers at once, so every question this page asks the
// room carries its own session: the answer is about this browser and no other.
function roomQuery(path){return state.sessionId?path+(path.includes('?')?'&':'?')+'session_id='+encodeURIComponent(state.sessionId):path}
/* Where each request goes (`rendezvous.js`, `device-pairing.js`): a conversation's, the call and this
 * device's own pairing to the node this device is paired with; telemetry to the target. The node base is an
 * address that proved — with the key pinned when pairing — that it is that node. Until one has there is none,
 * null, and nothing of a node is asked: every such request carries this device's token. */
const target=pageTarget();
let nodeBase=null;
// This device's pairings: several, one in use, kept across tabs and reloads. The tokens stay in here and in
// storage; the store the interface reads gets everything else.
function pageStorage(){try{return localStorage}catch{return null}}
const pairingStorage=pageStorage(),storedPairingState=readPairingState(pairingStorage);
let localPairing=null;
// Keep the stored `in_use` pointer until the bridge has supplied its local projection. It can name that
// projection, so validating against only browser pairings here would silently switch machines on app launch.
let pairings={inUse:storedPairingState.inUse,list:storedPairingState.list};
const desktopLocalHost=localHostBridge();
const LOCAL_HOST_SELECTION_KEY='sidevoice.local-host-selected',LOCAL_HOST_SELECTION_ID='@sidevoice/local-host';
function readLocalHostSelected(){try{return pairingStorage?.getItem(LOCAL_HOST_SELECTION_KEY)==='true'}catch{return false}}
function saveLocalHostSelected(){try{if(localHostSelected)pairingStorage?.setItem(LOCAL_HOST_SELECTION_KEY,'true');else pairingStorage?.removeItem(LOCAL_HOST_SELECTION_KEY)}catch{}}
// Older versions stored the native fingerprint as the in-use pointer but intentionally did not store its
// per-launch credentials. If it matches no browser pairing, retain the local selection while native reconnects.
let localHostSelected=!!desktopLocalHost&&(readLocalHostSelected()||!!storedPairingState.inUse&&!storedPairingState.list.some(p=>p.fp===storedPairingState.inUse));
roomStore.patch({localHostAvailable:!!desktopLocalHost,localHostSelected});
function publishPairings(){roomStore.patch({pairings:pairings.list.map(pairingSummary),pairingInUse:pairings.inUse,localHostSelected,machinesAt:Date.now()})}
function persistPairingProjection(){if(pairingStorage)writePairings(pairingStorage,pairings);saveLocalHostSelected();publishPairings()}
function keepPairings(next){
 const keepUnavailableLocal=localHostSelected&&!localPairing&&next.inUse===pairings.inUse;
 const projected=projectPairings(next,localPairing);
 if(keepUnavailableLocal)projected.inUse=pairings.inUse;
 const moved=projected.inUse!==pairings.inUse;
 localHostSelected=localPairing?projected.inUse===localPairing.fp:localHostSelected&&projected.inUse===pairings.inUse;
 pairings=projected;storedPairingState.inUse=projected.inUse;storedPairingState.list=projected.list.filter(p=>!p.local);
 persistPairingProjection()
}
function setLocalPairing(value){
 const next=normalizeLocalHostPairing(value),duplicates=next?storedPairingState.list.filter(p=>p.fp===next.fp):[];
 const previousLocal=localPairing,previous=pairings,wasSelected=localHostSelected||!!previousLocal&&previous.inUse===previousLocal.fp;
 localPairing=next;
 if(next){localHostSelected=wasSelected||storedPairingState.inUse===next.fp;if(localHostSelected)storedPairingState.inUse=next.fp}
 else if(state.localHostStatus?.state==='absent'){
  localHostSelected=false;
  if(wasSelected)storedPairingState.inUse=null;
 }
 else if(wasSelected){localHostSelected=true;storedPairingState.inUse=previousLocal?.fp||previous.inUse||LOCAL_HOST_SELECTION_ID}
 const projected=projectPairings(storedPairingState,localPairing);
 if(localHostSelected&&!localPairing)projected.inUse=storedPairingState.inUse||previous.inUse||LOCAL_HOST_SELECTION_ID;
 const moved=projected.inUse!==previous.inUse;
 storedPairingState.list=projected.list.filter(p=>!p.local);
 pairings=projected;
 storedPairingState.inUse=projected.inUse;
 persistPairingProjection();
 // An unreachable report invalidates the app-owned per-launch proxy immediately. Never keep its URL or
 // session secret around to be reused after native starts a new core.
 if(wasSelected&&!next)settleBase(null,'away',null);
 else if(next&&localHostSelected)void locate({move:true,fresh:true});
 // A stale code pairing for the same fingerprint is removed from storage, then revoked at an address which
 // proves itself as that host. The app-owned local pairing always remains the one in the machine list.
 for(const pairing of duplicates)void revokePairingCopy(pairing);
}
async function revokePairingCopy(pairing){
 try{const place=await firstProven(candidateBases(pairing,{target,about:targetAbout,origin:location.origin}),pairing,{get:fetch});
  if(place)await fetch(place.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token))}catch{}
}
function setLocalHostStatus(status){
 if(!status||typeof status!=='object'||typeof status.state!=='string')return;
 roomStore.patch({localHostStatus:status});
}
let localHostEpoch=0;
function setRemoteHostStatus(fp,status){
 roomStore.patch({remoteHostStatus:{...state.remoteHostStatus,[fp]:{state:status,checkedAt:Date.now()}}});
}
async function refreshLocalHost(){
 if(!desktopLocalHost){
  pairings=projectPairings(storedPairingState,null);storedPairingState.inUse=pairings.inUse;storedPairingState.list=pairings.list;
  roomStore.patch({machinesReady:true,localHostStatus:{state:'absent'}});publishPairings();return
 }
 const epoch=++localHostEpoch;
 const status=await Promise.resolve().then(()=>desktopLocalHost.state()).catch(()=>({state:'failed',failure:{key:'start.failed'}}));
 if(epoch!==localHostEpoch)return;
 setLocalHostStatus(status);
 if(status.reachable!==true){setLocalPairing(null);roomStore.patch({machinesReady:true});return}
 const pairing=await Promise.resolve().then(()=>desktopLocalHost.pairing()).catch(()=>null);
 if(epoch!==localHostEpoch)return;
 setLocalPairing(pairing);roomStore.patch({machinesReady:true});
}
if(desktopLocalHost){
 try{desktopLocalHost.subscribe(status=>{
  const epoch=++localHostEpoch;
  setLocalHostStatus(status);
  roomStore.patch({machinesReady:true});
  if(status.reachable!==true){setLocalPairing(null);return}
  void Promise.resolve().then(()=>desktopLocalHost.pairing()).then(pairing=>{
   if(epoch===localHostEpoch){setLocalPairing(pairing);roomStore.patch({machinesReady:true})}
  }).catch(()=>{if(epoch===localHostEpoch){setLocalPairing(null);roomStore.patch({machinesReady:true})}});
 })}catch{}
}
function routed(path){const url=routeUrl(path,target,nodeBase);if(url==null)throw Error(reachNote(state)||NO_MACHINE);return url}
// A request with the token is never redirected: the node base proved itself, wherever a redirect points did not.
function withToken(options,token){return {...options,redirect:'error',headers:{...(options?.headers||{}),Authorization:'Bearer '+token}}}
// Every request to the node carries the token of the pairing in use; one the node refuses means that pairing is
// gone. An address that stops answering is looked at again on the next beat, in case another one answers.
const request=async(path,options)=>{
 const url=routed(path);if(!isNodePath(path))return fetch(url,options);
 const pairing=pairingInUse(pairings),base=nodeBase;if(!pairing)throw Error(NO_MACHINE);
 let response;
 try{response=await fetch(url,withToken(options,pairing.token))}catch(error){doubted=base;throw error}
 if(response.status===401)pairingRefused(pairing.fp);
 return response;
};
// Which conversation this tab talks to is this tab's own state: the room routes, it never chooses for anyone.
const SELECTED_KEY='sidevoice.selected';
function rememberedThread(){try{return sessionStorage.getItem(SELECTED_KEY)||null}catch{return null}}
function rememberThread(id){try{if(id)sessionStorage.setItem(SELECTED_KEY,id);else sessionStorage.removeItem(SELECTED_KEY)}catch{}}
let connectEpoch=0;
// What a dropped call hands the room to be taken back as it was (`resumeTicket`): the room's newest single-use token
// for its session, and the last numbered frame this page handled. Kept per tab as well, so a reload takes the call
// back too: written as the token rotates and, at most once a second, as the numbering advances; gone on a hang-up.
const RESUME_KEY='sidevoice.resume';
let resumeToken=null,lastSeq=0,ticketTimer=null;
function keepTicket(now=false){
 if(!now){if(!ticketTimer)ticketTimer=setTimeout(()=>keepTicket(true),1000);return}
 clearTimeout(ticketTimer);ticketTimer=null;
 try{const ticket=resumeTicket();if(ticket)sessionStorage.setItem(RESUME_KEY,JSON.stringify(ticket));else sessionStorage.removeItem(RESUME_KEY)}catch{}
}
// A join finds the ticket an earlier load of this tab kept, and takes that call back with it.
function storedTicket(){
 try{const ticket=JSON.parse(sessionStorage.getItem(RESUME_KEY)||'null');
  if(typeof ticket?.session_id!=='string'||typeof ticket.token!=='string'||!Number.isInteger(ticket.last_seq))return null;
  resumeToken=ticket.token;lastSeq=ticket.last_seq;return ticket}catch{return null}
}
window.sidevoiceSessionId=()=>state.sessionId;
let holding=false,spaceDown=false;
// How long a call may go without a sign of a person before it asks, and then leaves.
var IDLE_MS=15*60*1000,IDLE_WARN_MS=60*1000,lastPersonSignal=Date.now(),idleWarned=false,idleTimer=null;
let screenWakeLock=null,wakeRequest=null,wakeEpoch=0,wakeRetries=0;
/* ----- the call's voice (`voice-module.js`): it hears the person and says the replies; the page only carries what it
 * reports to the room, and hands it what the room sends ----- */
let voice=null;
const relay=createTurnRelay();
// The voice listens only when the person wants it and there is a conversation to say it to: in a call with none
// selected nothing is heard (2026-09-26).
function applyMicState(){voice?.mute(!state.micEnabled||!!(state.ws&&!targetId()))}
function showScreenLock(lockState,note){state.screenLock={state:lockState,note}}
async function keepScreenAwake(){
 // Asked for while connecting too: Safari grants the lock to the tap that started the
 // call, and by the end of the preparation chain that gesture has expired.
 if(!(state.ws||state.connecting)||document.hidden||screenWakeLock||wakeRequest)return;
 if(!globalThis.navigator?.wakeLock?.request){showScreenLock('off','Este dispositivo no permite mantener la pantalla encendida.');return}
 const epoch=wakeEpoch;
 const request=(async()=>{
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(epoch!==wakeEpoch||document.hidden){await lock.release();return}
   screenWakeLock=lock;wakeRetries=0;showScreenLock('on','Pantalla activa durante la llamada.');
   // The system takes the lock back on its own — a screen that locked once, a route
   // change. While the call is up and the room is on screen, ask again.
   lock.addEventListener('release',()=>{
    if(screenWakeLock!==lock)return;
    screenWakeLock=null;showScreenLock('off','La pantalla puede apagarse; vuelve a la sala para mantenerla activa.');
    if(state.ws&&!document.hidden&&wakeRetries<3){++wakeRetries;setTimeout(()=>{if(state.ws&&!document.hidden)keepScreenAwake()},1000)}
   });
  }catch{showScreenLock('off','No se pudo mantener la pantalla activa. El móvil podría suspender la llamada.')}
 })();
 wakeRequest=request;
 try{await request}finally{if(wakeRequest===request)wakeRequest=null}
}
function releaseScreenWakeLock(){
 ++wakeEpoch;const lock=screenWakeLock;screenWakeLock=null;wakeRequest=null;wakeRetries=0;
 if(lock)lock.release().catch(()=>{});
 showScreenLock('','');
}
let textAttempt=null;
try{state.roomSeen=JSON.parse(sessionStorage.getItem('voice-room-seen')||'{}')}catch{}
try{state.history=JSON.parse(sessionStorage.getItem('voice-room-transcript')||'[]');if(!Array.isArray(state.history))state.history=[]}catch{}
function save(){try{sessionStorage.setItem('voice-room-transcript',JSON.stringify(state.history.slice(-1000)))}catch{}}
function targetId(){return state.roomBinding?.thread_id||null}
function historyThreadId(){return state.viewedThread||targetId()}

// A refusal is a sentence, or a key with its English sentence (sidevoice-core's newer refusals): the sentence is said.
async function api(path,options){const r=await request(path,options);if(r.status===401)throw Error(reachNote(state)||NO_MACHINE);const d=await r.json();if(!r.ok)throw Error(sayRefusal(d.detail,'No se pudo completar la operación'));return d}
const post=(path,body,method='POST')=>api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
/* ----- what the call owes its machine: the outbox (`outbox.js`) -----
 * A turn of the person's and what became of a reply are each one message with its own `client_msg_id`, which the machine
 * remembers: sent twice it is taken once and acknowledged either way. So each waits here until acknowledged, and is
 * said again on every socket the call gets until then — never twice on the same one. Per tab: another tab's call is
 * another call. */
const OUTBOX_SCOPE_KEY='sidevoice.outbox-scope';
function outboxScope(){try{let scope=sessionStorage.getItem(OUTBOX_SCOPE_KEY);if(!scope){scope=crypto.randomUUID();sessionStorage.setItem(OUTBOX_SCOPE_KEY,scope)}return scope}catch{return 'page'}}
const outbox=createOutbox({scope:outboxScope()});
// While a new session's room has not said which conversation this browser is on, nothing goes on its socket.
let outboxHold=null;
// A message the voice made, kept under the `client_msg_id` it already carries.
function keepMessage(kind,type,data){return outbox.add({id:data.client_msg_id,kind,session_id:state.sessionId,node:state.node,payload:{type,data}})}
/* Everything waiting, in order, on the socket the call has now, under the session it has now. A turn belongs to the
 * conversation, not to the session that heard it: the room knows it by its `turn_id` on the session that took its start,
 * and as words said while away when this session never took that start (`turn-relay.js`). A turn's end whose start is
 * not answered yet holds what comes after it, so the room hears a person's turns in order. Anything for another machine
 * is let go. */
function flushOutbox(socket=state.ws){
 // A socket carries nothing until the room has answered its hello with the session it speaks for.
 if(outboxHold||!socket||socket.readyState!==WebSocket.OPEN||!state.sessionId||socket.session!==state.sessionId)return;
 for(const entry of outbox.list()){
  if(entry.sentOn===socket)continue;
  if(entry.node!==state.node){outbox.remove(entry.id);continue}
  let data=entry.payload.data;
  if(entry.kind==='user-turn'){
   // A start made for a session the room has replaced is never answered there: the room takes each message once
   // per device, so sent again it is only acknowledged. Its turn's end goes as words said while away.
   if(data.phase==='started'&&entry.session_id!==state.sessionId){outbox.remove(entry.id);continue}
   const route=relay.route(data);
   if(route.wait)return;
   if(route.drop){outbox.remove(entry.id);continue}
   data=route.send;
   if(data.offline)nameOfflineRow(data.turn_id,state.sessionId+':user-turn:'+data.turn_id);
  }
  try{socket.send(JSON.stringify({type:entry.payload.type,data:{...data,session_id:state.sessionId,client_msg_id:entry.id}}))}catch{return}
  if(entry.kind==='user-turn'&&data.phase==='started')relay.sent(data.turn_id,entry.id);
  entry.sentOn=socket;
 }
}
// Words said while away become the room's own row: the bubble takes that row's id, so history and receipts find it.
function nameOfflineRow(turnId,id){
 const mine=r=>r.turn_id===turnId&&r.segment!==id;if(!state.history.some(mine))return;
 state.history=state.history.map(r=>mine(r)?{...r,segment:id,offline:true,delivery:takeReceipt(id)||r.delivery}:r);save();markHistorySeen();
}

// Where the reader of a reply is, on the bubble of that reply: its row, by the reply this page was handed.
const repliesSpoken=new Map();
function updateKaraoke(k){
 const reply=repliesSpoken.get(k?.utterance_id);
 state.karaokeState=reply&&Array.isArray(k.sounding)?{segment:speechSegment(reply),start:k.sounding[0],end:k.sounding[1]}:null;
}
function markHistorySeen() {
    const id = historyThreadId(), seen = Math.max(state.roomSeen[id] || 0, ...state.history.filter(r => r.thread === id).map(r => r.seq || 0));
    if (seen !== (state.roomSeen[id] || 0)) {
        state.roomSeen = { ...state.roomSeen, [id]: seen };
        try {
            sessionStorage.setItem('voice-room-seen', JSON.stringify(state.roomSeen));
        }
        catch { }
    }
}
function add(role, text, segment, thread = targetId(), metadata = {}) { if (!text?.trim())
    return; const key = metadata.history_id || (segment == null ? null : state.sessionId + ':' + segment); const existing = key && state.history.find(r => r.segment === key); if (existing) {
    state.history = state.history.map(r => r === existing ? { ...r, text, ...metadata } : r);
    save();
    markHistorySeen();
    return;
} state.history = [...state.history, { segment: key, thread, role, text, session: state.sessionId, revision: segment?.toString().startsWith('user-turn:') ? Number(segment.slice(10)) : undefined, ...metadata, name: role === 'user' ? 'Tú' : state.people.find(p => p.thread_id === thread)?.title || state.roomBinding?.title || 'Conversación', time: metadata.time || Date.now() }]; state.history = state.history.slice(-1000); save(); markHistorySeen(); }
function cancelCurrentInput(){if(!state.userTurn||state.cancelledInput)return;voice?.cancelInput();cancelDraft(state.userTurn)}

function cancelDraft(turn){state.cancelledInput=true;state.history=state.history.filter(r=>r.segment!==turn.segment);save();partial('');markHistorySeen()}
function partial(text){state.pendingUserText=text||''}
function updateComposer(){const ready=!!(state.ws||state.reconnecting)&&!!state.sessionId&&!!targetId()&&historyThreadId()===targetId()&&!state.switching;$('text-message').disabled=!ready;$('text-send').disabled=!ready||state.textSending;$('text-message').placeholder=ready?'Escribe un mensaje…':'Entra en la sala y selecciona una conversación';}
$('text-composer').onsubmit=async event=>{event.preventDefault();personSignal();const input=$('text-message'),text=input.value;if(state.textSending||!text.trim()||!state.sessionId||!targetId())return;const destination=targetId(),key=JSON.stringify([state.sessionId,destination,text]);if(textAttempt?.key!==key)textAttempt={key,id:crypto.randomUUID()};const attempt=textAttempt;state.textSending=true;updateComposer();setRoomError('');try{await post('/api/presentation/text',{text,thread_id:destination,session_id:state.sessionId,binding_id:state.roomBinding.binding_id,message_id:attempt.id});if(input.value===text)input.value='';if(textAttempt===attempt)textAttempt=null;await refreshHistory()}catch(e){setRoomError(e.message||'No se pudo confirmar el envío. El texto se conserva.')}finally{state.textSending=false;updateComposer()}};
$('text-message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('text-composer').requestSubmit()}});
function updateMic(){updateComposer()}
function setMic(enabled){personSignal();state.micEnabled=enabled;applyMicState();updateMic();syncNowPlaying()}
function releaseHold(){spaceDown=false;state.holding=false;if(holding){holding=false;setMic(false)}}

document.addEventListener('click',event=>{for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))if(!menu.contains(event.target))menu.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))menu.open=false});
async function select(id){if(state.switching||id===targetId()||!state.sessionId)return;state.switching=true;try{await post('/api/presentation/select',{thread_id:id,session_id:state.sessionId});rememberThread(id);await refresh()}catch(e){setRoomError(e.message)}finally{state.switching=false}}
// Answers can arrive out of order, and one asked before this page had a session describes nobody: either
// would read as the binding changing and cancel a reply just handed to this page.
let refreshAsked=0,refreshApplied=0;
/* A page older than the one the room serves keeps its old behaviour until somebody reloads it, and an iPhone
 * kept the old one through reloads (2026-09-26). Out of a call it reloads itself — under an address naming
 * the new build, so no cache can answer with the old one; in a call it says so and waits for the hang-up. */
function followServedBuild(served){
 const page=window.sidevoiceBuildId||'dev';
 if(!served||page==='dev'||served===page)return;
 if(state.ws||state.connecting||state.reconnecting){state.liveNote='Hay una versión nueva de la sala: se cargará al colgar.';return}
 try{if(sessionStorage.getItem('sidevoice.reloadedFor')===served)return;sessionStorage.setItem('sidevoice.reloadedFor',served)}catch{}
 const query=new URLSearchParams(location.search);query.set('v',served);
 location.replace(location.pathname+'?'+query);
}
async function refresh(){if(nodeBase==null)return;const asked=++refreshAsked,session=state.sessionId;try{
 const d=await api(roomQuery('/api/presentation'));
 if(asked<refreshApplied||session!==state.sessionId)return;
 refreshApplied=asked;
 const previousThread=targetId(),changed=state.roomBinding?.binding_id!==d.binding?.binding_id;roomStore.batch(()=>{state.roomBinding=d.binding;if(d.binding?.thread_id)rememberThread(d.binding.thread_id);
 if(changed){state.viewedThread=null;state.turns={};if(previousThread!==targetId())state.harness=Object.fromEntries(Object.entries(state.harness).filter(([id])=>id!==previousThread));
  // A new binding on the same conversation is a rejoin, not a move: what is playing for it goes on.
  state.pendingUserText='';state.userLive=state.botLive=false;markHistorySeen()}
 updateComposer();
 const call=d.call?.id===state.sessionId?d.call:null;if(call?.error)setRoomError(call.error);});
 applyMicState();
 if(previousThread&&targetId()!==previousThread)void silenceLeftConversation();
 // The page follows the build of whoever serves it: this answer's only when the node itself served the page.
 if(target===''&&nodeBase==='')followServedBuild(d.room?.web_build);
}catch{state.liveNote='Servidor no disponible'}}
async function refreshHistory() { try {
    const data = await api(roomQuery('/api/presentation/history'));
    let changed = false;
    for (const r of data.messages) {
        const marker = ':voice:', suffix = r.role === 'assistant' && r.id.includes(marker) ? r.id.slice(r.id.lastIndexOf(marker)) : null;
        let row = state.history.find(h => h.segment === r.id);
        const aliases = suffix ? state.history.filter(h => h !== row && h.role === 'assistant' && h.segment?.endsWith(suffix) && h.thread === r.thread && h.text === r.text) : [];
        if (!row && aliases.length) {
            row = aliases.shift();
            changed = true;
        }
        if (aliases.length) {
            state.history = state.history.filter(h => !aliases.includes(h));
            changed = true;
        }
        const patch = { segment: r.id, thread: r.thread, role: r.role, text: r.text, name: r.role === 'user' ? 'Tú' : state.people.find(p => p.thread_id === r.thread)?.title || r.name, time: r.time, seq: r.seq, session: r.session, revision: r.revision, audio_reason: r.audio_reason, offline: r.offline, interrupted: ['interrupted', 'disconnected'].includes(r.status), replayable: !!r.replayable, draft: false, delivery: r.role === 'user' ? r.status : undefined, audio: r.role === 'assistant' ? r.status : undefined };
        if (!row) {
            state.history = [...state.history, patch];
            changed = true;
        }
        else if (JSON.stringify({ ...row, ...patch }) !== JSON.stringify(row)) {
            state.history = state.history.map(r => r === row ? { ...r, ...patch } : r);
            changed = true;
        }
    }
    if (changed) {
        state.history = state.history.slice(-1000);
        save();
        markHistorySeen();
    }
    for (const r of state.history) {
        const turn = (r.session || state.sessionId) + ':user-turn:' + r.revision;
        if (state.turns[turn] && r.delivery && r.delivery !== state.turns[turn].status)
            presenceReceipt(turn, r.delivery);
    }
}
catch { } }
// Joining a room lands on a conversation: the one this tab remembers, else the first one listening in the
// list. With none at all, the list opens by itself — empty, which says so — once per call (2026-09-26).
let emptyListShownFor=null;
async function selectOnlyListeningConversation(){
 if(targetId()||state.switching||!state.ws)return false;
 const listening=state.people.filter(person=>person.available&&person.reach?.state==='listening');
 if(!listening.length){
  if(emptyListShownFor!==state.sessionId){emptyListShownFor=state.sessionId;window.dispatchEvent(new Event('sidevoice-conversations-open'))}
  return false;
 }
 await select(listening[0].thread_id);return true;
}
// An answer from the machine this page has just left describes nobody it can talk to.
async function refreshPeople(){const base=nodeBase;try{const data=await api(roomQuery('/api/presentation/participants'));if(base!==nodeBase)return;state.people=data.participants;await reselectRemembered()||await selectOnlyListeningConversation()}catch{}finally{refreshMachines()}}
// Where the machine in use answers rides the conversations' beat, and so does the clock the rows read.
function refreshMachines(){roomStore.patch({machinesAt:Date.now()});void locate()}
/* Which address the machine in use answers at is asked when it matters: on load, on the beat while there is
 * none, before a join that has none, and before each reconnection attempt after the first. An address that
 * proved itself is trusted for a few minutes. A call in progress is never moved by it
 * — changing machine is a hang-up, and the person's to make. A reconnecting call (`hold`) keeps the address it
 * had while that one's proof is recent: the machine may be restarting, and the socket is the better probe. */
const verified=new Map();
let locateAsked=0,locateApplied=0,targetAbout=null,reachFailure='',doubted=null;
async function locate({move=!(state.ws||state.connecting||state.reconnecting),fresh=false,hold=false}={}){
 if(!move)return;
 const pairing=pairingInUse(pairings);
 if(!pairing){settleBase(null,localHostSelected?'away':'unpaired',null);return}
 if(pairing.revoked){settleBase(null,'revoked',pairing);return}
 // Native verified the local identity over the peer-checked socket. Its per-launch proxy is the locator: never
 // send the app's session secret to the core's TCP listener or probe another address with it.
 if(pairing.local){
  const local=localHostLocator(pairing,state.localHostStatus);
  settleBase(local,local?'ok':'away',pairing);
  return;
 }
 const recent=base=>base!=null&&Date.now()-(verified.get(base)||0)<VERIFIED_FOR_MS;
 if(!fresh&&state.node===pairing.fp&&recent(nodeBase)&&doubted!==nodeBase)return;
 setRemoteHostStatus(pairing.fp,'checking');
 const asked=++locateAsked,deps={get:fetch},started=new Map();
 let found=null,reach='away';
 try{
  // The pairing's own addresses are asked while the target says what it is: its answer can only add one more.
  void firstProven(candidateBases(pairing,{origin:location.origin}),pairing,deps,started).catch(()=>{});
  const about=await askTarget(target,fetch);
  if(about)targetAbout=about;
  found=await firstProven(candidateBases(pairing,{target,about,origin:location.origin}),pairing,deps,started);
  // With nothing proven, the room the machine links with says whether it is there at all.
  if(!found&&pairing.rv&&await askRoomNode(pairing.rv.url,pairing.rv.node,fetch)===false)reach='offline';
 }catch{}
 if(asked<locateApplied||pairingInUse(pairings)!==pairing)return;
 locateApplied=asked;
 // The page follows the build of whoever serves it: a room serving this page says which.
 if(target===''&&targetAbout?.kind==='room')followServedBuild(targetAbout.build);
 if(found){verified.set(found.base,Date.now());setRemoteHostStatus(pairing.fp,'connected');if(doubted===found.base)doubted=null;if(!state.ws||found.base===nodeBase)settleBase(found,'ok',pairing);return}
 if(hold&&state.node===pairing.fp&&recent(nodeBase))return;
 setRemoteHostStatus(pairing.fp,'offline');
 settleBase(null,reach,pairing);
}
function settleBase(found,reach,pairing){
 const base=found?.base??null,moved=base!==nodeBase,machine=pairing?.fp??null,other=machine!==state.node;
 nodeBase=base;
 roomStore.batch(()=>{
  state.nodeReach=reach;state.rendezvous=found?(found.via==='room'?'room':'node'):'';
  // Another machine's conversations are not this one's: what the page knew of the last one goes with it.
  if(other){state.node=machine;state.people=[];state.roomBinding=null;state.viewedThread=null}
  if(base!=null&&reachFailure&&state.joinFailure===reachFailure){state.joinFailure='';reachFailure=''}
 });
 if(moved&&base!=null){refresh();refreshPeople();refreshHistory()}
}
/* ----- pairing this device with a machine (`device-pairing.js`) ----- */
function openPairing(note=''){roomStore.patch({pairingOpen:true,pairingNote:note})}
function closePairing(){roomStore.patch({pairingOpen:false,pairingNote:''})}
// The machine no longer knows this device's token: the pairing is kept, saying so, and a new code is asked for.
function pairingRefused(fp,{call=false}={}){
 const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing||pairing.revoked)return;
 keepPairings(revokedPairing(pairings,fp));
 if(pairings.inUse!==fp)return;
 const inCall=call||!!(state.ws||state.connecting||state.reconnecting);
 if(inCall)disconnect();
 settleBase(null,'revoked',pairingInUse(pairings));
 reachFailure=reachNote(state);
 if(inCall)failJoin(reachFailure);
 openPairing(reachFailure);
}
// A code, redeemed where the machine proves it is itself. Paired during a call, it waits for its "Usar".
async function pairDevice(code,name){
 const about=await askTarget(target,fetch);if(about)targetAbout=about;
 const t=hostTranslator(),defaultName=currentDeviceName(where=>t('pair.deviceName',{where}));
 const {pairing,base}=await redeemPairingCode(code,{name:name||defaultName,target,about,origin:location.origin,get:fetch});
 if(localPairing?.fp===pairing.fp){
  try{await fetch(base.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token))}catch{}
  closePairing();return {host:localPairing.host};
 }
 const inCall=!!(state.ws||state.connecting||state.reconnecting),use=!inCall||pairings.inUse===pairing.fp;
 keepPairings(withPairing(pairings,pairing,{use}));
 verified.set(base.base,Date.now());
 if(use&&!inCall)settleBase(base,'ok',pairing);
 closePairing();
 return {host:pairing.host};
}
// Forgotten here at once; the machine is asked to revoke the token too, only at an address that proves it is that
// machine — the token goes nowhere else — and without waiting on it: it is a courtesy, not a condition.
async function forgetMachine(fp){
 if(pairings.list.some(p=>p.fp===fp&&p.local))return;
 const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing)return;
 const wasInUse=pairings.inUse===fp,known=wasInUse&&state.node===fp?nodeBase:null;
 if(wasInUse&&(state.ws||state.connecting||state.reconnecting))disconnect();
 const remaining=withoutPairing(pairings,fp);
 keepPairings(localHostSelected&&!localPairing&&!wasInUse?{...remaining,inUse:pairings.inUse}:remaining);
 if(wasInUse){const next=pairingInUse(pairings);settleBase(null,next?'':'unpaired',next);if(next)void locate({move:true})}
 if(pairing.revoked)return;
 try{
  const place=known!=null&&Date.now()-(verified.get(known)||0)<VERIFIED_FOR_MS?{base:known}
   :await firstProven(candidateBases(pairing,{target,about:targetAbout,origin:location.origin}),pairing,{get:fetch});
  if(place)await fetch(place.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token));
 }catch{}
}
async function localHostApi(path,options={}){
 const pairing=localPairing;
 if(!pairing||!pairing.urls[0])throw Error('local-host-unavailable');
 const response=await fetch(pairing.urls[0]+path,withToken({...options,redirect:'error'},pairing.token));
 if(!response.ok)throw Error('local-host-request-failed');
 return response;
}
async function localHostDevices(){
 const data=await(await localHostApi('/api/device/devices',{headers:{accept:'application/json'},cache:'no-store'})).json();
 const rows=Array.isArray(data)?data:Array.isArray(data?.devices)?data.devices:[];
 return rows.filter(row=>row&&(typeof row.device_id==='string'||typeof row.id==='string')).map(row=>({device_id:row.device_id||row.id,name:row.name||null,kind:row.kind||'code',current:!!row.current,
  created_at:row.created_at??row.created??null,last_seen_at:row.last_seen_at??row.last_seen??null}));
}
async function revokeLocalHostDevice(id){
 await localHostApi('/api/device/devices/'+encodeURIComponent(id),{method:'DELETE',headers:{accept:'application/json'}});
}
// Browsers cannot set headers on a WebSocket: the token travels as the second subprotocol, the node answers with the first.
function callProtocols(){const token=pairingInUse(pairings)?.token;if(!token)throw Error(NO_MACHINE);return ['sidevoice','sidevoice.token.'+token]}
async function reselectRemembered(){
 // After a reload or a reconnect this tab goes back to the conversation it was on, if it is still in the room.
 const wanted=rememberedThread();
 if(!wanted||targetId()||state.switching||!state.ws)return false;
 if(!state.people.some(person=>person.thread_id===wanted&&person.available))return false;
 await select(wanted);return true;
}
// Stats poll only while the modal is open; each opening owns its requests.
let statsEpoch=0,statsTimer=null,statsRequest=null;
const statsNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function statsDuration(value){return statsNumber(value)?(value<1000?Math.round(value)+' ms':(value/1000).toFixed(2)+' s'):'—'}
function statsMedian(values){
 const sorted=values.filter(statsNumber).sort((a,b)=>a-b),n=sorted.length;
 return n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null;
}
function statsCell(tag,value){const node=document.createElement(tag);node.textContent=String(value??'—');return node}
function renderLatencyStats(snapshot,thread){
 const measured=(Array.isArray(snapshot?.replies)?snapshot.replies:[]).filter(Boolean);
 const replies=measured.filter(r=>r.thread_id===thread);
 const firstReplies=new Map();
 for(const reply of replies){const key=reply.reply_revision,value=reply.server_ms?.input_queued_to_reply_received_ms;
  if(statsNumber(value)&&(!firstReplies.has(key)||value<firstReplies.get(key)))firstReplies.set(key,value)}
 $('stats-recognition').textContent=statsDuration(statsMedian(replies.map(r=>r.input_ms?.recognition_ms)));
 $('stats-response').textContent=statsDuration(statsMedian([...firstReplies.values()]));
 const states={queued:'En cola',playing:'Reproduciendo',playback_finished:'Escuchada',interrupted:'Interrumpida',failed:'Falló'};
 const rows=replies.slice(-12).reverse().map(r=>{
  const row=document.createElement('tr'),input=r.input_ms||{},server=r.server_ms||{};
  row.append(statsCell('td',r.reply_revision),...[
   input.endpoint_silence_ms,input.recognition_ms,
   server.input_queued_to_reply_received_ms,server.reply_received_to_synthesis_started_ms
  ].map(value=>statsCell('td',statsDuration(value))),statsCell('td',states[r.status]||r.status||'—'));
  return row;
 });
 $('stats-rows').replaceChildren(...rows);
 $('stats-empty').textContent=replies.length?'':'Aún no hay respuestas medidas para esta conversación.';
 renderLatencyStages(replies.at(-1));
 renderLatencyAggregates(measured);
}
// The last turn, stage by stage in the order they happen; each measured on its own clock, so bars compare, they do not add up.
// The third entry is the stage's stable name: it identifies the row in the aggregates and is what a metric will be called.
const LATENCY_STAGES=[
 ['Silencio hasta cerrar el turno',r=>r.input_ms?.endpoint_silence_ms,'endpoint_silence'],
 ['Turno cerrado → texto',r=>r.input_ms?.recognition_ms,'recognition'],
 ['Texto → entregado al agente',r=>r.input_ms?.transcript_to_delivery_ms,'transcript_to_delivery'],
 ['Entregado → leído por la conversación',r=>r.server_ms?.delivery_accepted_to_read_ms??r.server_ms?.input_queued_to_read_ms,'delivery_to_read'],
 ['Leído → primera respuesta',r=>r.server_ms?.read_to_reply_received_ms,'read_to_reply'],
 ['Agente: entrega → primera respuesta',r=>r.server_ms?.input_queued_to_reply_received_ms,'input_queued_to_reply'],
 ['Respuesta → enviada a este dispositivo',r=>r.server_ms?.reply_received_to_synthesis_started_ms,'reply_to_synthesis'],
];
function renderLatencyStages(reply){
 const list=$('stats-stages');if(!list)return;list.replaceChildren();
 if(!reply){$('stats-stages-note').textContent='Aún no hay un turno completo que mostrar.';return}
 const values=LATENCY_STAGES.map(([label,pick])=>[label,pick(reply)]),max=Math.max(1,...values.map(([,v])=>statsNumber(v)?v:0));
 for(const [label,value] of values){const item=document.createElement('li');const name=document.createElement('span');name.textContent=label;const bar=document.createElement('i');if(statsNumber(value))bar.style.width=Math.max(1,Math.round(value/max*100))+'%';else bar.hidden=true;const amount=document.createElement('b');amount.textContent=statsDuration(value);item.append(name,bar,amount);list.append(item)}
 $('stats-stages-note').textContent='Turno '+reply.reply_revision+' · el tramo más largo marca la escala.';
}
// Aggregates over the whole call, from the same snapshot the dialog already polls. Percentiles are
// nearest-rank: every number shown is a measurement that happened, never an interpolation between two.
// A stage nobody measured keeps its row with no numbers; a missing observation is never a zero.
function statsPercentile(sorted,fraction){
 return sorted.length?sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(fraction*sorted.length)-1))]:null;
}
function statsSummary(values){
 const sample=(Array.isArray(values)?values:[]).filter(statsNumber).sort((a,b)=>a-b),count=sample.length;
 if(!count)return {count:0,mean:null,p50:null,p90:null,max:null};
 return {count,mean:sample.reduce((total,value)=>total+value,0)/count,p50:statsPercentile(sample,0.5),p90:statsPercentile(sample,0.9),max:sample[count-1]};
}
function statsAggregate(replies,stages=LATENCY_STAGES){
 const measured=(Array.isArray(replies)?replies:[]).filter(Boolean);
 return stages.map(([label,pick,key])=>({key,label,...statsSummary(measured.map(reply=>pick(reply)))}));
}
const AGGREGATE_COLUMNS=['Tramo','n','Media','p50','p90','Máx'];
function statsThreads(replies){return [...new Set(replies.map(reply=>reply.thread_id).filter(Boolean))]}
function statsConversationName(threadId){return state.people.find(person=>person.thread_id===threadId)?.title||threadId}
function statsAggregateCaption(count){return count+(count===1?' respuesta medida':' respuestas medidas')}
function statsAggregateTable(caption,rows){
 const wrap=document.createElement('div');wrap.className='stats-table-wrap';
 const table=document.createElement('table');table.className='stats-table';
 const title=document.createElement('caption');title.textContent=caption;
 const head=document.createElement('thead'),headRow=document.createElement('tr');
 headRow.append(...AGGREGATE_COLUMNS.map(text=>statsCell('th',text)));head.append(headRow);
 const body=document.createElement('tbody');
 for(const row of rows){
  const line=document.createElement('tr');
  line.append(statsCell('td',row.label),statsCell('td',row.count||'—'),...[row.mean,row.p50,row.p90,row.max].map(value=>statsCell('td',statsDuration(value))));
  body.append(line);
 }
 table.append(title,head,body);wrap.append(table);return wrap;
}
// Whatever the dialog is aggregating right now, so the copy button and the tables never disagree.
let statsReplies=[];
function renderLatencyAggregates(replies){
 const host=$('stats-aggregates');if(!host)return;
 statsReplies=(Array.isArray(replies)?replies:[]).filter(Boolean);
 $('stats-aggregates-copied').textContent='';
 $('stats-aggregates-copy').disabled=!statsReplies.length;
 if(!statsReplies.length){host.replaceChildren();$('stats-aggregates-note').textContent='Aún no hay respuestas medidas en esta llamada.';return}
 const threads=statsThreads(statsReplies);
 const tables=[statsAggregateTable('Toda la sesión · '+statsAggregateCaption(statsReplies.length),statsAggregate(statsReplies))];
 // The agent side dominates and differs per harness, so a call that talked to two conversations gets one table each.
 if(threads.length>1)for(const thread of threads){
  const own=statsReplies.filter(reply=>reply.thread_id===thread);
  tables.push(statsAggregateTable(statsConversationName(thread)+' · '+statsAggregateCaption(own.length),statsAggregate(own)));
 }
 host.replaceChildren(...tables);
 $('stats-aggregates-note').textContent='Recuento, media, p50, p90 y máximo por tramo sobre '+statsAggregateCaption(statsReplies.length)+'. Los tramos se solapan: no se deben sumar. Percentiles por rango más cercano.';
}
function statsTextTable(caption,rows){
 const cells=[AGGREGATE_COLUMNS,...rows.map(row=>[row.label,row.count?String(row.count):'—',statsDuration(row.mean),statsDuration(row.p50),statsDuration(row.p90),statsDuration(row.max)])];
 const widths=AGGREGATE_COLUMNS.map((_,column)=>Math.max(...cells.map(row=>row[column].length)));
 const line=row=>row.map((cell,column)=>column?cell.padStart(widths[column]):cell.padEnd(widths[column])).join('  ').trimEnd();
 return [caption,line(cells[0]),widths.map(width=>'-'.repeat(width)).join('  '),...cells.slice(1).map(line)].join('\n');
}
function statsAggregatesText(replies){
 const measured=(Array.isArray(replies)?replies:[]).filter(Boolean),threads=statsThreads(measured);
 const blocks=[statsTextTable('Toda la sesión · '+statsAggregateCaption(measured.length),statsAggregate(measured))];
 if(threads.length>1)for(const thread of threads){
  const own=measured.filter(reply=>reply.thread_id===thread);
  blocks.push(statsTextTable(statsConversationName(thread)+' · '+statsAggregateCaption(own.length),statsAggregate(own)));
 }
 return ['Sidevoice · agregados de latencia · los tramos se solapan, no se suman',...blocks].join('\n\n');
}
async function copyLatencyAggregates(){
 const status=$('stats-aggregates-copied');
 if(!statsReplies.length){status.textContent='Aún no hay nada que copiar.';return}
 try{
  const clipboard=globalThis.navigator?.clipboard;
  if(!clipboard?.writeText)throw Error('sin portapapeles');
  await clipboard.writeText(statsAggregatesText(statsReplies));
  status.textContent='Copiado como texto.';
 }catch{status.textContent='No se pudo copiar; selecciona la tabla a mano.'}
}

/* ----- the turn in the conversation's hands -----
 * Receipts and replies record turn work; the store derives from them, and from what the harness reports, whether the
 * conversation is working on what this browser said. */
let presenceTimer=null;
function presenceReceipt(id,status){
 roomStore.batch(()=>{state.now=Date.now();state.turns=recordReceipt(state,id,status,state.now)});
}
// The timer contributes a clock fact; the store derives everything else from it on every transition.
let receiptDeadline=null;
function reconcileSession(view){
 const deadlines=Object.values(state.turns).filter(t=>!t.settled&&['delivered','unconfirmed'].includes(t.status)&&t.readyAt>state.now).map(t=>t.readyAt);
 const deadline=deadlines.length?Math.min(...deadlines):null;
 if(deadline!==receiptDeadline){clearTimeout(presenceTimer);receiptDeadline=deadline;
  if(deadline!==null)presenceTimer=setTimeout(()=>{receiptDeadline=null;state.now=Math.max(Date.now(),deadline)},Math.max(0,deadline-state.now));
 }
 publishSessionView(view);
}

// ----- uncaught errors: nobody can read a phone's console while driving -----
// An uncaught error in the interface unmounts React and leaves a blank room, and the person it
// happens to is the one who cannot look. The room keeps the last few reports next to the audio ones,
// so the reason is read from the server. Never any transcript text: the message and the stack only.
function reportClientError(report){
 const entry={kind:String(report?.kind||'error').slice(0,40),message:String(report?.message||'').slice(0,400),
  stack:String(report?.stack||'').slice(0,2000),component:String(report?.component||'').slice(0,1000),
  build:String(window.sidevoiceBuildId||'').slice(0,40)};
 if(state.ws?.readyState===WebSocket.OPEN&&state.sessionId){
  try{state.ws.send(JSON.stringify({type:'voice-client-error',data:{session_id:state.sessionId,...entry}}));return}catch{}
 }
 // Before the call exists, or once its socket is gone, a request that outlives the page still reaches the machine.
 // Not a beacon: a beacon cannot carry this device's token.
 request('/api/presentation/client-error',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)}).catch(()=>{});
}
window.sidevoiceReportError=reportClientError;
for(const queued of window.sidevoiceClientErrors||[])reportClientError(queued);
window.sidevoiceClientErrors=[];
function forgetThread(threadId){state.history=state.history.filter(r=>r.thread!==threadId);save();if(state.viewedThread===threadId)state.viewedThread=null;markHistorySeen()}
function versionFacts(){
 const page=window.sidevoiceBuildId||'dev',served=state.roomInfo?.web_build||null;
 const stale=served&&page!=='dev'&&served!==page;
 return [['Versión de la página',page],['Versión que sirve la sala',served?served+(stale?' · hay una versión nueva, recarga':' · al día'):'—'],['Servidor',state.roomInfo?.version||'—']];
}
const VOICE_STATES={idle:'Sin iniciar',muted:'Silenciado',listening:'Escuchando',speaking:'Hablando'};
const PLAYBACK_STATES={idle:'En silencio',synthesizing:'Generando voz',playing:'Reproduciendo'};
function renderConnectionStats(data,roundTrip){
 const call=state.sessionId&&data?.call?.id===state.sessionId?data.call:null,voiceState=state.voiceState;
 const socket=['Conectando','Conectado','Cerrando','Desconectado'][state.ws?.readyState]||'Desconectado';
 const facts=[
  ...versionFacts(),
  ['WebSocket',socket],
  ['Consulta al servidor (HTTP)',statsDuration(roundTrip)],
  ['Sesión',state.sessionId||'Sin llamada'],
  ['Servidor y este dispositivo',call?'Misma sesión':state.sessionId?'Sesión no confirmada':'Sin llamada'],
  ['Voz',state.inApp?'La de la aplicación':'La de esta página'],
  ['Micrófono',VOICE_STATES[voiceState?.listening]||'Sin iniciar'],
  ['Intervenciones transcribiéndose',voiceState?String(voiceState.recognising):'—'],
  ['Altavoz',PLAYBACK_STATES[voiceState?.playback]||'—'],
  ['Mensajes sin confirmar',String(outbox.size)],
  ['Pantalla activa',screenWakeLock&&!screenWakeLock.released?'Activado':'No confirmado']
 ];
 $('stats-connection').replaceChildren(...facts.flatMap(([label,value])=>[statsCell('dt',label),statsCell('dd',value)]));
}
function resetStats(){renderLatencyStats(null,null);$('stats-connection').replaceChildren();$('stats-updated').textContent=''}
async function refreshConnectionStats(){
 if(!$('connection-stats').open||statsRequest)return;
 const epoch=statsEpoch,callId=state.sessionId,thread=targetId(),controller=new AbortController();
 statsRequest=controller;$('stats-refresh').disabled=true;
 const timeout=setTimeout(()=>controller.abort(),5000);
 const started=latencyNow();
 try{
  const [connection,latency]=await Promise.allSettled([
   api(roomQuery('/api/presentation'),{signal:controller.signal}).then(data=>({data,elapsed:latencyNow()-started})),
   request(roomQuery('/api/presentation/latency'),{signal:controller.signal}).then(async response=>{
    if(response.status===404)return {unavailable:true};
    if(!response.ok)throw Error('No se pudieron consultar las mediciones.');
    return response.json();
   })
  ]);
  if(epoch!==statsEpoch||!$('connection-stats').open)return;
  if(callId!==state.sessionId||thread!==targetId()){resetStats();$('stats-status').textContent='La conversación ha cambiado. Actualizando…';return}
  if(connection.status==='fulfilled')renderConnectionStats(connection.value.data,connection.value.elapsed);
  else renderConnectionStats(null,null);
  const snapshot=latency.status==='fulfilled'?latency.value:null;
  const matches=!!callId&&snapshot?.session_id===callId;
  renderLatencyStats(matches?snapshot:null,thread);
  if(connection.status==='rejected'||latency.status==='rejected')$('stats-status').textContent='No se pudo actualizar. Se reintentará mientras esta vista esté abierta.';
  else if(snapshot?.unavailable)$('stats-status').textContent='Este servidor aún no ofrece mediciones. Hace falta reiniciarlo con la versión actualizada.';
  else if(!callId)$('stats-status').textContent='Entra en la sala para medir esta llamada.';
  else if(!matches)$('stats-status').textContent='Esperando las mediciones de esta sesión.';
  else $('stats-status').textContent='Mediciones de esta conversación · actualización cada 2 segundos';
  $('stats-updated').textContent=new Date().toLocaleTimeString();
 }finally{
  clearTimeout(timeout);
  if(statsRequest===controller){statsRequest=null;$('stats-refresh').disabled=false}
  if(epoch===statsEpoch&&$('connection-stats').open){clearTimeout(statsTimer);statsTimer=setTimeout(refreshConnectionStats,2000)}
 }
}
function stopConnectionStats(){
 ++statsEpoch;clearTimeout(statsTimer);statsTimer=null;statsRequest?.abort();statsRequest=null;$('stats-refresh').disabled=false;
}
function openConnectionStats(){
 stopConnectionStats();$('call-menu').open=false;resetStats();
 $('stats-status').textContent='Recogiendo mediciones…';
 if(!$('connection-stats').open)$('connection-stats').showModal();
 return refreshConnectionStats();
}
$('stats-aggregates-copy').onclick=copyLatencyAggregates;
$('stats-open').onclick=openConnectionStats;
$('stats-close').onclick=()=>$('connection-stats').close();
$('stats-refresh').onclick=()=>{clearTimeout(statsTimer);return refreshConnectionStats()};
$('connection-stats').addEventListener('close',stopConnectionStats);
$('connection-stats').addEventListener('cancel',stopConnectionStats);
// A backdrop click closes the modal without swallowing clicks inside its scroll area.
$('connection-stats').addEventListener('click',event=>{if(event.target!==$('connection-stats'))return;const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close()});
// Diagnostic durations only. These events originate on the server; they are not raw mic timestamps.
const latencyTurns=new Map();
let latencyActiveTurn=null;
function latencyNow(){return globalThis.performance?.now?.()}
function latencyKey(thread,revision){return JSON.stringify([state.sessionId,thread,revision])}
// The turn's root span is this page's: the room announces the turn, this browser opens the span and
// hands the room its W3C traceparent, so every stage the room measures hangs from the same trace.
function openTurnTrace(threadId,revision){
 const traceparent=window.sidevoiceTelemetry?.startTurn?.(threadId,revision,{});
 if(!traceparent||!state.ws||state.ws.readyState!==1||!state.sessionId)return;
 try{state.ws.send(JSON.stringify({type:'voice-turn-trace',data:{session_id:state.sessionId,thread_id:threadId,revision,traceparent}}))}catch{}
}
const latencyRevisions=new Map();
function observeLatencyEvent(type,data){
 const now=latencyNow();if(!Number.isFinite(now))return;
 if(type==='voice-user-turn'){
  // The room names the turn; only its answer to `started` carries the revision the turn is measured under.
  if(data.phase==='started'&&data.turn_id!=null){latencyRevisions.set(data.turn_id,data.revision);if(latencyRevisions.size>128)latencyRevisions.delete(latencyRevisions.keys().next().value)}
  const revision=data.revision??latencyRevisions.get(data.turn_id);
  if(revision==null)return;
  data={...data,revision};
  const key=latencyKey(data.thread_id,data.revision);
  if(data.phase==='started'){latencyActiveTurn=key;if(!latencyTurns.has(key))latencyTurns.set(key,{});openTurnTrace(data.thread_id,data.revision)}
  if(data.phase==='cancelled'){latencyTurns.delete(key);if(latencyActiveTurn===key)latencyActiveTurn=null;window.sidevoiceTelemetry?.endTurn?.(data.thread_id,data.revision,data.merged?'merged':'cancelled')}
  if(data.phase==='finished'){const turn=latencyTurns.get(key)||{};turn.finished=now;latencyTurns.set(key,turn)}
  if(latencyTurns.size>128)latencyTurns.delete(latencyTurns.keys().next().value);
 }
}
// `socket` is the one the frame came in on: during a transcription swap this page holds two, and an
// answer belongs to the socket that asked, not to whichever one the call is using.
function message(raw,socket){return roomStore.batch(()=>recordMessage(raw,socket))}
function recordMessage(raw, socket) {
    let m;
    try {
        m = JSON.parse(raw);
    }
    catch {
        return;
    }
    const t = m.type, d = m.data || {};
    // Every frame of a session is numbered: one already handled — a resumed call's replay reaching back past the
    // drop — is not handled twice.
    if (Number.isInteger(m.seq)) {
        if (m.seq <= lastSeq)
            return;
        lastSeq = m.seq;
        keepTicket();
    }
    if (t === 'voice-ack') {
        outbox.remove(d.client_msg_id);
        return;
    }
    // The room asks whether anyone is still here, because a closed tab behind a tunnel leaves its
    // socket up and its seat taken. The page keeps no clock of its own for this: a background
    // tab's timers are throttled, but the frame that arrives still wakes this handler, and a muted
    // browser sends no audio the room could have taken for an answer.
    if (t === 'voice-ping') {
        const link = socket || state.ws;
        try { link?.send(JSON.stringify({ type: 'voice-pong', data: { session_id: d.session_id || state.sessionId } })); } catch { }
        return;
    }
    if (t === 'voice-user-turn' && d.session_id && d.session_id !== state.sessionId)
        return;
    observeLatencyEvent(t, d);
    // A reply to say: written in the conversation at once, and handed to the voice, which decides when it sounds.
    if (t === 'voice-reply') {
        receiveReply(d);
        return;
    }
    // The room's answer to a turn this page said started, by the turn's name: its end may go now, the conversation it
    // goes to is the one the room captured, and the voice takes the turn's revision as its boundary for stale replies.
    if (t === 'voice-user-turn' && d.phase === 'started') {
        state.roomRevision = Math.max(state.roomRevision, d.revision);
        // Every answer goes to the voice, an offline turn's too: it keeps those of its own turns and ignores the rest.
        voice?.turnStarted?.(d);
        if (relay.answered(d.turn_id)) {
            if (state.userTurn?.id === d.turn_id)
                state.userTurn = { ...state.userTurn, thread: d.thread_id };
        }
        flushOutbox();
        return;
    }
    if (t === 'voice-input-receipt') {
        const receiptId = d.history_id || (d.session_id || state.sessionId) + ':user-turn:' + d.turn_id;
        const row = state.history.find(r => r.thread === d.thread_id && r.segment === receiptId);
        if (row) {
            state.history = state.history.map(r => r === row ? { ...r, delivery: d.status } : r);
            save();
            markHistorySeen();
        }
        else
            state.inputReceipts = { ...state.inputReceipts, [receiptId]: d.status };
        if ((d.session_id || state.sessionId) === state.sessionId && d.thread_id === targetId())
            presenceReceipt((d.session_id || state.sessionId) + ':user-turn:' + d.revision, d.status);
    }
    if (t === 'voice-conversation' && d.thread_id) {
        if (typeof d.working === 'boolean') {
            state.harness = { ...state.harness, [d.thread_id]: d.working };
            if (d.turn_phase === 'end' && d.session_id === state.sessionId && d.thread_id === targetId()
                    && Number.isInteger(d.revision)) {
                const id = d.session_id + ':user-turn:' + d.revision;
                const previous = state.turns[id] || {};
                state.turns = { ...state.turns, [id]: { ...previous, session: d.session_id,
                    thread: d.thread_id, settled: true, harnessEnded: true } };
                if (!previous.harnessEnded)
                    window.sidevoiceTelemetry?.endTurn?.(d.thread_id, d.revision, 'harness_finished');
            }
        }
    }
    if (t === 'error') {
        // A refusal of one of this page's own messages is about that message: a turn's start the room would not
        // take never gets a revision, and the rest is the room keeping its own books.
        if (d.client_msg_id) {
            relay.refusedMessage(d.client_msg_id);
            flushOutbox();
            return;
        }
        setRoomError(sayRefusal(d, d.error || 'Error de conexión'));
    }
}
/* ----- the voice's reports -----
 * The person's turn, as the voice heard it: a draft bubble while it is open, the words once it is finished, and the
 * message itself in the outbox for the room. */
function voiceTurn(turn){
 roomStore.batch(()=>{
  if(turn.phase==='started'){
   personSignal();
   state.cancelledInput=false;
   // The row's id is the room's for this turn (`session:user-turn:turn_id`) from the start.
   state.userTurn={id:turn.turn_id,segment:state.sessionId+':user-turn:'+turn.turn_id,thread:targetId()};
   state.pendingPhase='listening';
   partial('');
  }else if(state.userTurn?.id===turn.turn_id){
   const thread=state.userTurn.thread,segment=state.userTurn.segment;
   state.pendingPhase='';partial('');state.userTurn=null;
   if(turn.phase==='finished'&&turn.text?.trim()){
    state.history=state.history.filter(r=>r.segment!==segment);
    add('user',turn.text,null,thread,{history_id:segment,turn_id:turn.turn_id,draft:false,time:Date.now(),delivery:thread?takeReceipt(segment)||'pending':'not_sent'});
   }else state.history=state.history.filter(r=>r.segment!==segment);
   markHistorySeen();
  }else if(turn.phase==='finished'&&turn.offline&&turn.text?.trim()){
   // A turn started while the room was out of reach is only ever finished: its row is the words said while away.
   const segment=state.sessionId+':user-turn:'+turn.turn_id;
   add('user',turn.text,null,targetId(),{history_id:segment,turn_id:turn.turn_id,offline:true,draft:false,time:Date.now(),delivery:takeReceipt(segment)||'pending'});
   markHistorySeen();
  }
 });
 keepMessage('user-turn','voice-user-turn',turn);flushOutbox();
}
// A receipt the room sent before this page had the row it is about: handed over once, then forgotten.
function takeReceipt(segment){const status=state.inputReceipts[segment];if(status==null)return null;const {[segment]:_,...rest}=state.inputReceipts;state.inputReceipts=rest;return status}
// Why the voice could not do something (a reply it could not say, a transcription that failed) stays here, where it can
// be acted on, and in the machine's log. The voice's turns and playback reports are already in the room's shape.
function voiceFailed(error){setRoomError(voiceErrorText(error));reportClientError({kind:'voice',message:String(error?.code||'')})}
function voicePlayback(report){
 if(report.status!=='playing')repliesSpoken.delete(report.utterance_id);
 keepMessage('playback','voice-playback',report);flushOutbox();
}
function voiceStateChanged(next){
 roomStore.batch(()=>{
  state.voiceState=next;
  state.userLive=next?.listening==='speaking';
  state.botLive=next?.playback==='playing';
  if(state.userTurn&&next?.listening!=='speaking'&&next?.recognising>0)state.pendingPhase='transcribing';
  if(next?.listening==='speaking'){state.userQuietAt=0;state.liveNote=''}
 });
}
// The microphone's level for whoever shows it: the meter, the bubble's waveform, and outside this page the desktop
// app's call controls card (state/mic-level.ts). From 0 to 100, as the meter's scale.
const waveLevels=new Float32Array(256);
function voiceLevel(level){
 const value=Math.max(0,Math.min(100,Math.round(Number(level)*100)||0));
 waveLevels.copyWithin(0,1);waveLevels[waveLevels.length-1]=value/100;
 $('mute')?.style.setProperty('--mic-fill',value+'%');
 $('mic-level-meter')?.setAttribute('aria-valuenow',String(value));
 const channel=window.sidevoiceUI?.micLevel;if(typeof channel?.publish==='function')channel.publish(value);
}
// The bubble of the turn being recorded draws the level the voice reports, as a waveform of the last moments.
window.sidevoiceAudio={readWaveform(){return voice?waveLevels.map((value,index)=>value*(index%2?1:-1)):null}};
function receiveReply(d){
 if(d.session_id!==state.sessionId)return;
 state.roomRevision=Math.max(state.roomRevision,d.revision);
 if(!d.replay)state.turns=recordReply(state,d);
 add('assistant',d.text,'voice:'+d.utterance_id,d.thread_id,{history_id:d.history_id,session:d.session_id,revision:d.revision});
 // A reply of a conversation this call has left is not said: the room hears so, unless the person asked for it.
 if(d.thread_id!==targetId()&&!d.requested){
  keepMessage('playback','voice-playback',{client_msg_id:crypto.randomUUID(),utterance_id:d.utterance_id,status:'unplayed',heard_chars:0,reason:'focus_changed',at:Date.now()});
  flushOutbox();return;
 }
 repliesSpoken.set(d.utterance_id,d);
 voice?.speak(d);
}
// A move to another conversation ends what the last one was saying here: the voice stops (the reply playing cut, the
// queue dropped, each reported) and listens again on the same models.
async function silenceLeftConversation(){
 const current=voice;if(!current)return;
 try{await current.stop();if(voice===current)await current.start()}catch(error){if(voice===current)setRoomError(voiceErrorText(error))}
}
function roomSocketUrl(){if(nodeBase==null)throw Error(reachNote(state)||NO_MACHINE);return callSocketUrl(nodeBase,location)}
const ROOM_IS_FULL='La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.';
/* Why the room refused, asked of the room itself over an ordinary request.
 * The room says it twice on the socket — an error frame, then the close code 1013 — and a tunnel
 * can lose both: a phone read only «La sala rechazó la conexión» while the room had written that it
 * was full, and restarting the room was what let it in. An HTTP request is the one path no
 * proxy rewrites. `null` means the room could not be reached at all, which is a different sentence.
 * A seat freed between the refusal and this question makes the room say it would admit us now; that
 * is a truthful answer to a question asked a moment too late, and it costs only the generic line. */
async function roomRefusal(){try{const answer=await request('/api/presentation/admission',{cache:'no-store'});if(!answer.ok)return null;const admission=await answer.json();return admission&&typeof admission==='object'?admission:{}}catch{return null}}
const NODE_AWAY=new Set(['node_offline','node_unreachable','node_timeout','choose_node']);
function refusalText(admission,broken){
 if(admission===null)return 'No se pudo conectar con la sala';
 if(admission.reason==='room_is_full')return ROOM_IS_FULL;   // the room's reason, in this page's language
 if(admission.admitted===false&&admission.message)return admission.message;
 return broken?'No se pudo conectar con la sala':'La sala rechazó la conexión';
}
// The room speaks first: its call id and how this call is resumed. Anything else arriving meanwhile is an ordinary room event.
function openSession(socket,hello={}){return new Promise((resolve,reject)=>{const fail=(text,forGood=false)=>{clearTimeout(timer);const error=Error(text);error.refused=forGood;reject(error)};let timer=setTimeout(()=>lateFail(),25000),refusal=null,refused=null,broken=false;const lateFail=()=>{
  // Asking why keeps the same short patience as after a close: a room that never answered the hello may not answer this either.
  timer=setTimeout(()=>fail('Este dispositivo tardó demasiado en entrar. Vuelve a intentarlo.'),3000);
  roomRefusal().then(admission=>fail(admission&&admission.admitted?'Este dispositivo tardó demasiado en entrar. Vuelve a intentarlo.':refusalText(admission,false),admission?.admitted===false))};socket.onopen=()=>socket.send(JSON.stringify({label:'rtvi-ai',type:'client-ready',id:crypto.randomUUID(),data:hello}));
 // An error event is always followed by a close event, and the close is the one that can find out
 // why: failing here would answer «no se pudo conectar» to a room that knows it is full.
 socket.onerror=()=>{broken=true};
 socket.onclose=event=>{clearTimeout(timer);timer=null;
  // The machine no longer knows this device's token: final, and the pairing is what has to change.
  if(event?.code===4401){pairingRefused(pairings.inUse);return fail(reachNote(state)||NO_MACHINE,true)}
  // However the reason arrived — the close code, the frame's own name for it, the frame's sentence —
  // the person reads one sentence for one reason.
  // A room that answered and said no is not a room that is away: these are the refusals a reconnection
  // must not insist on. Everything else — no answer at all — is worth another try.
  // A room whose relay cannot reach the machine says so with the same close code as a full room, and a
  // machine that is restarting is not a refusal: its own sentence, and the next attempt may find it back.
  if(NODE_AWAY.has(refused))return fail(refusal||'La máquina no está conectada a la sala ahora mismo.',false);
  // A frame that named another reason is that reason, whatever the close code: 1013 alone means full.
  if(refused==='room_is_full'||event?.code===1013&&!refused)return fail(ROOM_IS_FULL,true);
  if(refusal)return fail(refusal,true);
  // The question keeps a short patience of its own: a room that does not answer it cannot say why
  // either, and nobody is left looking at a join line while a request hangs.
  timer=setTimeout(()=>fail('La sala rechazó la conexión'),3000);
  roomRefusal().then(admission=>fail(refusalText(admission,broken),admission?.admitted===false))};
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type!=='voice-session'){if(m.type==='error'){refusal=sayRefusal(m.data,m.data?.error||refusal);refused=m.data?.reason||refused}message(e.data,socket);return}state.roomInfo=m.data?.room||state.roomInfo;clearTimeout(timer);resolve(m.data)}})}
function disconnect() {
    window.sidevoiceTelemetry?.endCall?.('left');
    // A hang-up ends what the call still owed its session.
    outbox.clear();
    resumeToken = null;
    lastSeq = 0;
    keepTicket(true);
    outboxHold = null;
    relay.reset();
    stopIdleWatch();
    ++connectEpoch;
    state.connecting = false;
    releaseScreenWakeLock();
    roomStore.patch({ harness: {}, turns: {} });
    clearJoinStatus();
    const socket = state.ws, current = voice;
    state.ws = null;
    voice = null;
    current?.stop().catch(() => {});
    for (const stop of voiceListeners.splice(0)) stop();
    // 1000 is a hang-up: any other close the room takes for a drop, and parks the call for its return.
    socket?.close(1000);
    state.sessionId = null;
    state.userLive = state.botLive = holding = spaceDown = false;
    state.userTurn = null;
    state.pendingPhase = '';
    state.voiceState = null;
    state.karaokeState = null;
    repliesSpoken.clear();
    partial('');
    state.holding = false;
    state.liveNote = '';
    voiceLevel(0);
    updateMic();
    applyLockScreen(false);
}
// The voice's reports, for as long as this call has it.
const voiceListeners=[];
function attachVoice(next){
 voiceListeners.push(next.onUserTurn(voiceTurn),next.onPlayback(voicePlayback),next.onState(voiceStateChanged),next.onLevel(voiceLevel),
  next.onKaraoke(updateKaraoke),next.onError(voiceFailed));
}
// Joining and leaving are the same button, and it belongs to React: this is what it calls.
async function toggleCall(){if(state.ws||state.connecting||state.reconnecting){disconnect();return}
 // Nothing to join without a machine this device is paired with: the tap asks for a code instead.
 const pairing=pairingInUse(pairings);if(!pairing||pairing.revoked){openPairing(pairing?reachNote(state):'');return}
 personSignal();primeNowPlaying();state.connecting=true;const epoch=++connectEpoch;keepScreenAwake();setRoomError('');joinStatus('voice');
 try{
  if(nodeBase==null){await locate({move:true,fresh:true});if(epoch!==connectEpoch)return}
  if(nodeBase==null){reachFailure=reachNote(state)||NO_MACHINE;throw Error(reachFailure)}
  const next=await voiceHost();if(epoch!==connectEpoch)return;
  voice=next;attachVoice(next);
  await next.setSettings(state.voiceSettings);
  // A hang-up while the settings were taken leaves this join: nothing of it may start the microphone after it.
  if(epoch!==connectEpoch)return;
  await next.start();
  // One that came while starting stops what this join started, unless a newer call has taken the same voice.
  if(epoch!==connectEpoch){if(voice!==next)next.stop().catch(()=>{});return}
  applyMicState();applyLockScreen(true);
  joinStatus('room');
  const session=await joinRoom(epoch,{resume:storedTicket()});if(epoch!==connectEpoch||!session)return;
  voice.setOnline(true);updateMic();
  const remembered=rememberedThread();if(remembered)joinStatus('conversation',{subject:conversationTitle(remembered)});
  await refresh();await refreshPeople();
  if(epoch===connectEpoch){clearJoinStatus();flushOutbox()}
 }catch(e){if(epoch===connectEpoch){const failed=state.joinStep;disconnect();failJoin(joinFailureText(failed,e))}}
 finally{if(epoch===connectEpoch)state.connecting=false}
}
// ----- the socket: opened on join, reopened by itself when the room goes away -----
// A room restart or a network blip must not end the call: the microphone permission, the media stream
// and the unlocked output all survive it; only the socket needs reopening, with the same hello.
// Quick at first, then every five seconds for as long as it takes: a tunnel, a garage or a lift must not
// end the call (2026-09-26, driving). Only the person hanging up, or the room refusing this browser, stops it.
const RECONNECT_DELAYS_MS=[1000,2000,5000];

function shouldReconnect(event){return ![1008,1013,4401].includes(event?.code)}   // refused by policy, full, or not paired: do not insist
// A room that answers and refuses this browser is not a room that is away: insisting would never end.
function refusedForGood(error){return error?.refused===true}
async function joinRoom(epoch,context){
 const socket=new WebSocket(roomSocketUrl(),callProtocols());
 state.ws=socket;
 let session;
 // The hello carries this browser's call span, so the room's own spans are inside it instead of
 // being a second trace about the same call. With no collector configured there is no span to carry.
 const traceparent=window.sidevoiceTelemetry?.startCall?.({});
 try{session=await openSession(socket,{conversation:rememberedThread(),ui_language:devicePreferences().ui_language,...(context.resume?{resume:context.resume}:{}),...(traceparent?{telemetry:{traceparent}}:{})})}
 // A join that failed leaves nothing behind. A room that is not told keeps the seat for the length of its keepalive
 // budget while the page tries again, so one local failure became a reconnect loop that ate the room's seats one every
 // thirty seconds (2026-09-22).
 catch(error){socket.onclose=socket.onmessage=socket.onerror=null;try{socket.close(1000)}catch{}if(state.ws===socket)state.ws=null;throw error}
 if(epoch!==connectEpoch){socket.close(1000);return null}
 socket.onerror=null;
 if(socket.readyState!==WebSocket.OPEN)throw Error('La sala cerró la conexión');
 socket.onclose=event=>{if(state.ws===socket)lostConnection(event,epoch)};
 socket.onmessage=e=>{if(state.ws===socket)message(e.data,socket)};
 // Every session and every resume hands over a fresh single-use token: the newest is the one a drop will name.
 resumeToken=session.resume?.token||null;
 // Taken back as it was: the same session, its turn and its history, and every frame after `last_seq` on its way. A
 // new session knows none of the last one's turns.
 if(!resumedSession(session,context.resume)||state.sessionId!==session.session_id){
  if(!resumedSession(session,context.resume)){lastSeq=0;state.roomRevision=0}
  state.sessionId=session.session_id;relay.reset();
 }
 keepTicket(true);
 // From here this socket speaks for the session: the outbox may use it.
 socket.session=state.sessionId;
 window.sidevoiceTelemetry?.noteSession?.(state.sessionId);
 return session;
}
// The room took the call back only when it says so for the very session this page asked for.
function resumedSession(session,ticket){return !!ticket&&session?.resumed===true&&session.session_id===ticket.session_id}
function resumeTicket(){return resumeToken&&state.sessionId?{session_id:state.sessionId,token:resumeToken,last_seq:lastSeq}:null}
// A promise with a patience of its own: past `ms` nobody waits for it any more (it is not cancelled).
function within(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms)})]).finally(()=>clearTimeout(timer))}
// One attempt — the machine located, the room answering the hello — has a deadline past the room's own patience with
// a hello (25 s, and 3 more to ask why): nothing it waits on keeps the call from the next attempt.
const RECONNECT_ATTEMPT_MS=35000,REJOIN_STEP_MS=5000;
// What a rejoin still asks — the output unlocked, the binding, the conversations — never holds the call in
// «reconnecting»: each question has its own patience, and only a catch-up the outbox holds for them waits.
async function settleRejoin(epoch,hold){
 try{for(const step of [refresh,refreshPeople]){await within(Promise.resolve().then(step),REJOIN_STEP_MS).catch(()=>{});if(epoch!==connectEpoch)return}}
 finally{if(hold&&outboxHold===hold){outboxHold=null;flushOutbox()}}
}
async function lostConnection(event,epoch){
 if(epoch!==connectEpoch||state.reconnecting)return;
 state.ws=null;keepTicket(true);
 window.sidevoiceTelemetry?.endCall?.('connection_lost');
 // Nothing the call is doing stops with its socket: the voice goes on hearing and speaking, and what it reports waits
 // in the outbox. The room parks the session meanwhile, so its turn and its history stay as they are here too.
 voice?.setOnline(false);
 if(event?.code===4401){pairingRefused(pairings.inUse,{call:true});return}
 if(!shouldReconnect(event)){disconnect();failJoin('La sala cerró la llamada. Vuelve a pulsar para entrar cuando esté disponible.');return}
 state.reconnecting=true;
 // The first seconds of a drop are the network's, not the person's: no line, no control held. One that outlasts the
 // grace is said.
 const grace=setTimeout(()=>{if(epoch!==connectEpoch||!state.reconnecting)return;roomStore.batch(()=>{state.reconnectShown=true;joinStatus('reconnect')})},RECONNECT_GRACE_MS);
 try{
  for(let attempt=0,current=0;;attempt++){
   if(state.reconnectShown)joinStatus('reconnect',{detail:String(attempt+1)});
   await new Promise(resolve=>setTimeout(resolve,RECONNECT_DELAYS_MS[Math.min(attempt,RECONNECT_DELAYS_MS.length-1)]));
   if(epoch!==connectEpoch)return;
   // An attempt past its deadline is let go, and its socket with it: a late answer to it changes nothing.
   const ticket=resumeTicket(),mine=++current;
   let session;
   try{session=await within((async()=>{await locate({move:true,fresh:attempt>0,hold:true});return epoch===connectEpoch&&mine===current?joinRoom(epoch,{resume:ticket}):null})(),RECONNECT_ATTEMPT_MS)}
   catch(e){
    if(epoch!==connectEpoch)return;
    ++current;const pending=state.ws;state.ws=null;try{pending?.close()}catch{}
    if(refusedForGood(e)){disconnect();failJoin(e.message||'La sala no deja entrar a este dispositivo.');return}
    continue;
   }
   if(epoch!==connectEpoch||!session)return;
   let hold=null;
   if(!resumedSession(session,ticket)){
    // A new session: the room lost the old one. What the voice reported meanwhile goes to the new one once the room
    // has said which conversation this browser is on, so the outbox holds it until then.
    roomStore.patch({harness:{},turns:{}});state.userLive=false;state.pendingUserText='';state.pendingPhase='';markHistorySeen();
    hold=outboxHold={};
   }
   voice?.setOnline(true);
   // The same session again: what waited in the outbox goes now, not at the next thing the voice says.
   if(!hold)flushOutbox();
   void settleRejoin(epoch,hold);
   // Time spent in a tunnel is not time spent away: the idle clock starts again with the call.
   personSignal();
   setRoomError('');clearJoinStatus();
   return;
  }
 }finally{clearTimeout(grace);roomStore.batch(()=>{state.reconnecting=false;state.reconnectShown=false})}
}
async function replayReply(historyId){
 if(!historyId||!state.sessionId)return;
 try{await post('/api/presentation/replay',{session_id:state.sessionId,history_id:historyId})}
 catch(error){setRoomError(error.message||'No se pudo volver a reproducir.')}
}

/* ----- the voice's settings and the remote providers' keys: this device's, never the room's -----
 * One voice for the page: the settings pane asks it for its catalogue and keeps keys with it, and every call of this
 * page drives it. A key goes from the pane to the voice and nowhere else: the voice keeps it (the desktop app in the
 * system keychain, a browser in this page's storage) and hands it to the provider. */
let voiceHostOpening=null;
function voiceHost(){return voiceHostOpening??=openVoice().catch(error=>{voiceHostOpening=null;throw error})}
async function keptProviderKeys(host){return Object.fromEntries(await Promise.all(PROVIDERS.map(async provider=>[provider,await host.hasProviderKey(provider).catch(()=>null)])))}
async function loadVoiceCatalogue(){
 roomStore.patch({voiceCatalogue:{...state.voiceCatalogue,state:'loading',error:''}});
 try{const host=await voiceHost();const [models,keys]=await Promise.all([host.models(),keptProviderKeys(host)]);roomStore.patch({voiceCatalogue:{state:'ready',models,error:''},providerKeys:keys})}
 catch(error){roomStore.patch({voiceCatalogue:{state:'failed',models:[],error:voiceErrorText(error)}})}
}
function editVoice(patch){roomStore.patch({voiceDraft:editVoiceSettings(state.voiceDraft||state.voiceSettings,patch,state.voiceCatalogue.models)})}
// The voice takes the settings first when this page has one: what it refuses is not kept, and a call goes on as it was.
async function saveVoiceSettings(){
 const draft=state.voiceDraft;if(!draft||JSON.stringify(draft)===JSON.stringify(state.voiceSettings))return;
 const host=await voiceHost().catch(()=>null);
 if(host)await host.setSettings(draft);
 writeVoiceSettings(pageStorage(),draft);roomStore.patch({voiceSettings:draft});
}
async function saveProviderKey(provider,key){
 try{const host=await voiceHost();await host.setProviderKey(provider,key||null)}catch(error){throw Error(voiceErrorText(error))}
 const host=await voiceHost();
 roomStore.patch({providerKeys:await keptProviderKeys(host)});
 const models=await host.models().catch(()=>null);if(models)roomStore.patch({voiceCatalogue:{state:'ready',models,error:''}});
}
roomStore.patch({voiceSettings:readVoiceSettings(pageStorage(),state.speechLanguage)});

$('settings-open').onclick=()=>{try{
 if(nodeBase==null)settingsSection('machines');
 roomStore.patch({voiceDraft:state.voiceSettings});void loadVoiceCatalogue();
 const p=devicePreferences();window.roomI18n?.setLanguage(p.ui_language);
 $('ui-language').value=p.ui_language;
 $('settings-error').textContent='';
 if(!$('language-settings').open)$('language-settings').showModal();
}catch(e){$('settings-error').textContent=e.message;setRoomError(e.message)}};
function settingsSection(name){for(const section of ['general','voice','providers','machines']){$('pane-'+section).hidden=section!==name;$('settings-'+section).setAttribute('aria-pressed',String(section===name))}}
$('settings-general').onclick=()=>settingsSection('general');
$('settings-voice').onclick=()=>settingsSection('voice');
$('settings-providers').onclick=()=>settingsSection('providers');
$('settings-machines').onclick=()=>settingsSection('machines');
$('ui-language').onchange=()=>window.roomI18n?.setLanguage($('ui-language').value);
$('reset-settings').onclick=()=>{try{localStorage.removeItem(SETTINGS_KEY)}catch{}$('settings-open').onclick();roomStore.patch({voiceDraft:defaultVoiceSettings(state.speechLanguage)});$('reset-settings-note').textContent='Restablecido a los valores por defecto. Guarda para aplicarlo.'};
$('settings-close').onclick=()=>$('language-settings').close();
// Every setting belongs to this device, and the room keeps no copy: what this browser saved wins over what its system
// says. Only the settings of today's shape are read back.
const SETTINGS_KEY='sidevoice.settings';
const DEVICE_KEYS=['ui_language'];
function readStored(key){try{const stored=JSON.parse(localStorage.getItem(key)||'null');return stored&&typeof stored==='object'?stored:{}}catch{return {}}}
function storedPreferences(){const stored=readStored(SETTINGS_KEY);return Object.fromEntries(DEVICE_KEYS.filter(key=>key in stored).map(key=>[key,stored[key]]))}
function storePreferences(p){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(Object.fromEntries(DEVICE_KEYS.filter(key=>key in p).map(key=>[key,p[key]]))))}catch{}}
function devicePreferences(){return {...systemPreferences(),...storedPreferences()}}
// The interface's language is this device's: saved here, said to the call in progress, applied at once.
async function saveSettings(){
 await saveVoiceSettings();
 const p={...devicePreferences(),ui_language:$('ui-language').value||devicePreferences().ui_language};
 storePreferences(p);window.roomI18n?.setLanguage(p.ui_language);
 if(state.ws&&state.ws.readyState===WebSocket.OPEN&&state.sessionId)state.ws.send(JSON.stringify({type:'voice-settings',data:{session_id:state.sessionId,ui_language:p.ui_language}}));
 $('language-settings').close();state.liveNote='Preferencias guardadas';
}
$('language-form').onsubmit=e=>{e.preventDefault();$('settings-error').textContent='';saveSettings().catch(error=>{$('settings-error').textContent=error?.code?voiceErrorText(error):error?.message||String(error)})};
window.sidevoiceActions={
 cancelInput:cancelCurrentInput,
 editVoice,
 saveProviderKey,
 loadVoiceCatalogue,
 replayReply,
 toggleMic,
 toggleCall,
 selectParticipant(threadId){
  const participant=state.people.find(item=>item.thread_id===threadId);
  state.viewedThread=threadId;markHistorySeen();
  if(participant?.available)void select(threadId);
  updateComposer();
 },
 async closeParticipant(threadId){
  try{await post('/api/presentation/close',{thread_id:threadId})}
  catch(e){
   // The room does not know it (it was closed elsewhere, or the room restarted): only this page remembered it.
   if(!/No se encuentra/.test(e.message||'')){setRoomError(e.message);throw e}
   forgetThread(threadId)
  }
  await refresh();await refreshPeople();await refreshHistory()
 },
 // Changing machine is a hang-up: a call is with one machine, and the other one's is joined afresh — right
 // away, inside the person's own tap. The choice is this device's, kept for next time.
 chooseMachine(id){
  if(!pairings.list.some(p=>p.fp===id)||id===pairings.inUse)return;
  const rejoin=!!(state.ws||state.connecting||state.reconnecting);
  if(rejoin)disconnect();
  keepPairings(usingPairing(pairings,id));
  settleBase(null,'',pairingInUse(pairings));
  if(rejoin)void toggleCall();else void locate({move:true});
 },
 forgetMachine,
 pairDevice,
 localHostDevices,
 revokeLocalHostDevice,
 openPairing:()=>openPairing(),
 closePairing,
};
// ----- the lock screen and the headphones' button (sidevoice/sidevoice-web#8) -----
// iOS gives the lock-screen tile — and with it what a headphone click sends — to an ordinary media element,
// not to the live stream the call plays through (WebKit keeps calls from becoming "Now Playing" on purpose).
// So the call owns it with an element of its own: a faint looping file, far below the microphone's
// detector, playing while the microphone is open and paused while it is muted. A click then toggles the
// microphone. It never touches the call's own output element, which is what echo cancellation listens to.
let nowPlaying=null;
function faintLoop(){
 const rate=8000,seconds=2,count=rate*seconds,bytes=new DataView(new ArrayBuffer(44+count*2));
 const text=(at,value)=>{for(let i=0;i<value.length;i++)bytes.setUint8(at+i,value.charCodeAt(i))};
 text(0,'RIFF');bytes.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');bytes.setUint32(16,16,true);
 bytes.setUint16(20,1,true);bytes.setUint16(22,1,true);bytes.setUint32(24,rate,true);bytes.setUint32(28,rate*2,true);
 bytes.setUint16(32,2,true);bytes.setUint16(34,16,true);text(36,'data');bytes.setUint32(40,count*2,true);
 // About -80 dBFS: not digital silence, which iOS does not count as playing.
 for(let i=0;i<count;i++)bytes.setInt16(44+i*2,Math.round((Math.random()*2-1)*3),true);
 return new Blob([bytes],{type:'audio/wav'});
}
function primeNowPlaying(){
 // Created and started inside the Join click: iOS lets an element play only from a gesture the first time.
 // Not in the desktop app on a Mac: the app is the Now Playing app there, and this element would compete with it.
 if(window.__sidevoiceDesktop?.host?.mediaKeys==='native'||nowPlaying||typeof Audio==='undefined'||typeof navigator==='undefined'||!navigator.mediaSession)return;
 try{
  const element=new Audio();element.loop=true;element.setAttribute('playsinline','');
  element.src=URL.createObjectURL(faintLoop());nowPlaying=element;
  element.play().catch(()=>{});
 }catch{}
}
function micLive(){return !!voice&&state.micEnabled}
function syncNowPlaying(){
 if(!nowPlaying)return;
 const wanted=lockScreenOn&&micLive();
 if(wanted&&nowPlaying.paused)nowPlaying.play().catch(()=>{});
 if(!wanted&&!nowPlaying.paused)nowPlaying.pause();
}
let lockScreenOn=false;
function applyLockScreen(on){
 lockScreenOn=on;
 // In the desktop app on a Mac the app answers the headset's buttons itself (sidevoice-desktop src/headset.rs):
 // handlers here too would toggle the microphone twice on one click.
 const session=typeof navigator!=='undefined'&&window.__sidevoiceDesktop?.host?.mediaKeys!=='native'?navigator.mediaSession:null;
 if(session){
  // A click arrives as play or pause, whichever the platform thinks is next. "Play" always means open the
  // microphone; "pause" toggles it, because a click may reach us as pause even while muted.
  // "togglemicrophone" is where an AirPods press would arrive while the microphone is open, once Safari turns
  // on the mute API it already has behind a flag (WebKit 54a7d6e278); Safari's own mute control uses it too.
  const handlers={play:()=>setMic(true),pause:()=>setMic(!micLive()),
   togglemicrophone:details=>setMic(typeof details?.isActivating==='boolean'?details.isActivating:!micLive())};
  for(const [action,run] of Object.entries(handlers)){
   try{session.setActionHandler(action,on?run:null)}catch{}
  }
  try{session.metadata=on?new MediaMetadata({title:'Sidevoice',artist:conversationTitle(targetId())||'Llamada'}):null}catch{}
 }
 syncNowPlaying();
}
function toggleMic(){holding=false;setMic(!state.micEnabled)}
function typing(e){return e.target instanceof Element&&!!e.target.closest('input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[data-radix-popper-content-wrapper]')}
window.addEventListener('keydown',e=>{personSignal();
 if(typing(e)||e.altKey)return;
 if(e.code==='KeyD'&&(e.metaKey||e.ctrlKey)&&!e.shiftKey){e.preventDefault();if(!e.repeat)toggleMic();return}
 if(voice&&e.code==='Space'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('summary')){
  e.preventDefault();
  if(spaceDown)return;
  spaceDown=true;
  if(!state.micEnabled){holding=true;setMic(true);state.holding=true}
 }
},true);
window.addEventListener('keyup',e=>{if(e.code==='Space'&&spaceDown){e.preventDefault();releaseHold()}},true);
window.addEventListener('blur',releaseHold);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseHold()});
// A page going away is not a hang-up: its call is parked, and the ticket kept here lets the next load take it back.
window.addEventListener('pagehide',()=>keepTicket(true));
window.addEventListener('beforeunload',()=>{keepTicket(true);state.ws?.close();void voice?.stop().catch(()=>{})});updateMic();
// Discover the desktop-owned host before validating the persisted selection. Pairing remains an explicit action:
// an unpaired browser shows setup guidance, and an unpaired desktop does not open a modal by itself.
window.roomI18n?.setLanguage(devicePreferences().ui_language);
function startInitialLocate(){
 publishPairings();
 void locate().finally(()=>window.roomI18n?.setLanguage(devicePreferences().ui_language));
}
// A normal browser has no native projection to wait for, so keep its existing first locate timing. The desktop
// app must wait until its local pairing is projected before the persisted in-use pointer is resolved.
if(desktopLocalHost)void refreshLocalHost().finally(startInitialLocate);
else{void refreshLocalHost();startInitialLocate()}
setInterval(refreshHistory,1500);setInterval(refresh,1500);setInterval(refreshPeople,6000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.ws)keepScreenAwake()});
setupIdleWatch();

// ----- a call nobody is using ends itself, for this browser only -----
// The room went on hearing a room nobody was talking to, for a long while, and delivering what it heard. A
// browser that gives no sign of a person — no speech, nothing typed, no touch, no key — for IDLE_MS is asked
// "¿sigues ahí?" with a sound, and if nothing answers within IDLE_WARN_MS it leaves the call, the way a
// video call does. The conversations stay in the room; re-entering is one tap. The agent's replies are not
// a sign of anybody: an agent can talk to an empty car for ever.
function personSignal(){
 lastPersonSignal=Date.now();
 if(idleWarned){idleWarned=false;state.liveNote=''}
}
function checkIdle(){
 if(!state.ws){idleWarned=false;return}
 const quiet=Date.now()-lastPersonSignal;
 if(quiet>=IDLE_MS){
  idleWarned=false;disconnect();
  failJoin('Saliste de la llamada: '+Math.round(IDLE_MS/60000)+' minutos sin señales tuyas. Pulsa para volver a entrar.');
  return;
 }
 if(!idleWarned&&quiet>=IDLE_MS-IDLE_WARN_MS){
  idleWarned=true;
  state.liveNote='¿Sigues ahí? Sin señales tuyas, saldrás de la llamada en '+Math.round(IDLE_WARN_MS/1000)+' segundos. Habla o toca la pantalla para seguir.';
 }
}
function setupIdleWatch(){
 // Keys and touches are counted where the page already listens for them (the keyboard shortcuts and the
 // output owner), so no second listener competes with those.
 idleTimer=setInterval(checkIdle,5000);
}
function stopIdleWatch(){lastPersonSignal=Date.now();idleWarned=false}


let lastBridge=null,lastJoin;
function publishSessionView(view = roomStore.getState()) {
    const ui = window.sidevoiceUI;
    if (ui && ui.store !== roomStore) {
        ui.setConversation?.(view.conversation);
        ui.setParticipants?.(view.participants);
        const key = JSON.stringify(view.join);
        if (ui !== lastBridge || key !== lastJoin) {
            lastBridge = ui;
            lastJoin = key;
            ui.setJoinStatus?.(view.join);
        }
    }
    // The join line has one owner: JoinStatus renders it from this same store. Writing its textContent
    // from here removed React's own children, and the next render threw NotFoundError trying to replace
    // a node that was no longer there — which unmounts the whole root and leaves the room blank.
    // The badge, the echo light and the notes are React's, rendered from this same store.
    updateComposer();
}
roomStore.subscribe(reconcileSession);
reconcileSession(roomStore.getState());

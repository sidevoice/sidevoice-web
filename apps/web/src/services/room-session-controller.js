import {createRoomSessionStore,stageContext,working,joinView,conversationView,participantsView,echoCoverage as deriveEchoCoverage,offlineNote,audioNote,engineBadgeText,speechSegment,recordReceipt,recordReply,PRESENCE_LEVEL,GAP_BUFFER_SECONDS,BED_AFTER_USER_MS,REPLAY_NOTES,NO_MACHINE,reachNote,keyedProvider} from '../state/room-session-state.js';
import {pageTarget,routeUrl,callSocketUrl,isNodePath,askTarget,askRoomNode} from './rendezvous.js';
import {readPairings,writePairings,withPairing,withoutPairing,usingPairing,revokedPairing,pairingInUse,pairingSummary,candidateBases,firstProven,redeemPairingCode,VERIFIED_FOR_MS} from './device-pairing.js';
import {createMicLink,webrtcAllowed} from './webrtc-mic.js';
import {systemLanguage,systemPreferences,SPEECH_LANGUAGES} from './system-language.js';
import {TASKS,DEVICE,effectiveStage,defaultStage,deviceBuild,taskOffers,withPlace,withModel,withOption,withBuild,voiceFor,withVoicesChosen,stageProblem,stageLabel,diagnosticsText} from '../state/stage-settings.js';
import {offers as resolveOffers} from '../../../../packages/browser-audio/offers';
import {pageSize,pageCached} from '../../../../packages/browser-audio/page-models.js';
import {languageFor} from '../../../../packages/browser-audio/model-check.js';
import {verifyDevice,verifyProvider} from './load-and-verify.js';
import {createStageSelection} from './stage-selection.js';
import modelCatalog from '../../../../packages/browser-audio/models.json';
import voiceCatalogFile from '../../../../packages/browser-audio/catalog.json';
import {refusalText as sayRefusal} from '../../../../packages/browser-audio/refusals.js';
const roomStore=window.sidevoiceUI?.store||createRoomSessionStore();
const state=roomStore.facts;
// Selecting a model checks it before it takes effect (#124 §6): the state machine, its steps below (selectStage).
const selection=createStageSelection({
 publish:(task,check)=>roomStore.patch({stageChecks:{...state.stageChecks,[task]:check&&{...check,previous:stageLabel(stageContext(state),task,activeStage(task))}}}),
 consent:(...step)=>consentFor(...step),verify:(...step)=>verifyStage(...step),activate:(...step)=>activateStage(...step),discard:(...step)=>discardCandidate(...step),
});
// What the stages are chosen from, as this page was built: the model catalogue and the speech languages (#124).
roomStore.patch({modelCatalog,voiceLanguages:voiceCatalogFile.languages,speechLanguage:systemLanguage(SPEECH_LANGUAGES),inApp:!!window.__sidevoiceDesktop?.host?.nativeEngine});
// Browser room orchestration. Loaded once after React mounts the stable UI shell.
const $=id=>document.getElementById(id);
function setRoomError(message){const value=message||null;if(window.sidevoiceUI)window.sidevoiceUI.setBootError(value);else $("error").textContent=value||""}
function showPreparation(d){
 const box=$('voice-loading');
 if(d.phase==='inline'){state.liveNote=d.text;return}
 if(d.phase==='hidden'||d.phase==='ready'){if(box.open)box.close();return}
 const transcription=d.kind==='transcription';
 box.dataset.kind=d.kind||'voice';
 $('loading-title').textContent=d.title||(d.phase==='error'?'No se pudo preparar la voz':'Preparando voz');
 $('loading-note').textContent=state.inApp
  ?'La primera vez se descarga el modelo en este dispositivo. Después se reutiliza.'
  :transcription?'La primera vez se descarga Whisper en este dispositivo. Después se reutiliza su caché local.'
  :'La primera vez se descargan el modelo y la voz. Después se reutilizan.';
 $('loading-detail').textContent=d.text||'';
 if(d.progress==null){$('loading-progress').removeAttribute('value');$('loading-percent').textContent=''}else{const progress=Math.max(0,Math.min(100,Number(d.progress)||0));$('loading-progress').value=progress;$('loading-percent').textContent=Math.round(progress)+' %'}
 $('loading-cancel').textContent=d.phase==='error'?'Cerrar':'Cancelar';
 if(!box.open)box.showModal();
}
window.addEventListener('voice-preparation',({detail:d})=>{showPreparation(d);noteJoinPreparation(d)});
/* One quiet line from the tap until this browser is in the room, naming the step the join is on.
 * It reuses the events that already existed — the engine's preparation, the room's hello, the
 * conversation this tab goes back to — and measures nothing of its own. A step that fails leaves
 * its reason, and what to do about it, in the same place. */


function joinStatus(step,{detail='',progress=null,subject=''}={}){roomStore.patch({joinStep:step,joinFailure:'',joinDetail:detail?String(detail).slice(0,80):'',joinProgress:progress==null?null:Number(progress),joinSubject:subject})}
function clearJoinStatus(){roomStore.patch({joinStep:null,joinFailure:'',joinDetail:'',joinProgress:null,joinSubject:'',liveNote:''})}
function failJoin(text){roomStore.patch({joinStep:null,joinFailure:text||'',joinDetail:'',joinProgress:null,joinSubject:''})}
// The engine's own progress refines the model step the join is already on; anywhere else it belongs to the modal alone.
function noteJoinPreparation(d){
 if(!d||d.phase!=='loading'||!['audio','whisper','voice','transcription','mic'].includes(state.joinStep))return;
 joinStatus(d.kind==='transcription'?'whisper':'voice',{progress:d.progress==null?null:d.progress});
}
// What this tab already calls the conversation it is going back to; the room is not asked again for a title.
function conversationTitle(id){return state.people.find(p=>p.thread_id===id)?.title||state.history.find(r=>r.thread===id)?.name||'tu conversación'}
/* Three failures actually happen here, and each one has something the person can do about it. Anything
 * else says what the browser said, because inventing a remedy for it would be worse than quoting it. */
function joinFailureText(step,error){
 const name=String(error?.name||''),message=String(error?.message||error||'');
 if(step==='microphone'){
  if(/NotAllowedError|SecurityError/.test(name)||/permiso|permission|denied/i.test(message))
   return state.inApp?'El micrófono está bloqueado para Sidevoice. Dale permiso en los ajustes del sistema y vuelve a pulsar para entrar.'
    :'El micrófono está bloqueado para esta página. Dale permiso en el navegador y vuelve a pulsar para entrar.';
  if(/NotFoundError|OverconstrainedError|NotReadableError/.test(name))
   return 'No se pudo usar el micrófono elegido. Conéctalo o elige otro en los dispositivos de audio, y vuelve a entrar.';
  return 'No se pudo abrir el micrófono: '+message+'. Revísalo y vuelve a entrar.';
 }
 if(step==='whisper'||step==='voice')
  return /Configuración/.test(message)?message   // the step already said where to change it
   :'El modelo no se pudo cargar en este dispositivo ('+message+'). Elige uno más pequeño en Configuración, o OpenAI para transcribir.';
 return message+(/[.!?…]$/.test(message)?'':'.');
}
function cancelPreparation(){if(state.activeSpeech){const d=state.activeSpeech;post('/api/presentation/browser-receipt',{session_id:d.session_id,revision:d.revision,utterance_id:d.utterance_id,status:'failed'}).catch(()=>{});cancelBrowserSpeech()}else if(state.previewJob)stopPreview();else if(state.switchingSession)abortSwitch();else if(state.connecting||state.switchingTranscription)disconnect();else window.roomVoice?.cancel();$('voice-loading').close()}
$('loading-cancel').onclick=cancelPreparation;$('voice-loading').addEventListener('cancel',e=>{e.preventDefault();cancelPreparation()});

// The room holds several browsers at once, so every question this page asks the
// room carries its own session: the answer is about this browser and no other.
function roomQuery(path){return state.sessionId?path+(path.includes('?')?'&':'?')+'session_id='+encodeURIComponent(state.sessionId):path}
/* Where each request goes (docs/RENDEZVOUS.md, docs/DEVICE_PAIRING.md): a conversation's, the call and this
 * device's own pairing to the node this device is paired with; telemetry to the target. The node base is an
 * address that proved — with the key pinned when pairing — that it is that node. Until one has there is none,
 * null, and nothing of a node is asked: every such request carries this device's token. */
const target=pageTarget();
let nodeBase=null;
// This device's pairings: several, one in use, kept across tabs and reloads. The tokens stay in here and in
// storage; the store the interface reads gets everything else.
function pageStorage(){try{return localStorage}catch{return null}}
let pairings=readPairings(pageStorage());
function publishPairings(){roomStore.patch({pairings:pairings.list.map(pairingSummary),pairingInUse:pairings.inUse,machinesAt:Date.now()})}
function keepPairings(next){const moved=next.inUse!==pairings.inUse;pairings=next;if(moved)switchStages();const storage=pageStorage();if(storage)writePairings(storage,next);publishPairings()}
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
/* A reconnection is a new client id in the room, so nothing there would tie the browser that comes back
 * to the one that left. This tab names the ids it has used, and the room answers from its own journal
 * which replies *this* browser never heard (#52). Naming an id can only take a reply out of the
 * catch-up, never put someone else's in, so a stale id costs at most one repetition. */
const SESSIONS_KEY='sidevoice.sessions',REMEMBERED_SESSIONS=8;
function rememberedSessions(){try{const stored=JSON.parse(sessionStorage.getItem(SESSIONS_KEY)||'[]');return Array.isArray(stored)?stored.filter(id=>typeof id==='string').slice(-REMEMBERED_SESSIONS):[]}catch{return []}}
function rememberSession(id){if(!id)return;try{sessionStorage.setItem(SESSIONS_KEY,JSON.stringify([...rememberedSessions().filter(value=>value!==id),id].slice(-REMEMBERED_SESSIONS)))}catch{}}
let connectEpoch=0;
// A setting the room can only honour with another pipeline opens a second socket while the first
// one still carries the call. Until the room answers it, that socket is nobody's: `ws` is the call.
let openingSocket=null,switchEpoch=0;
window.sidevoiceSessionId=()=>state.sessionId;
let audioContext=null,analyser=null,micSource=null,meterFrame=null,holding=false,spaceDown=false;
// How long a call may go without a sign of a person before it asks, and then leaves (#63).
var IDLE_MS=15*60*1000,IDLE_WARN_MS=60*1000,lastPersonSignal=Date.now(),idleWarned=false,idleTimer=null;
let inputDeviceId='default',outputDeviceId='default',captureNode=null,deviceEpoch=0,captureRate=16000;
let screenWakeLock=null,wakeRequest=null,wakeEpoch=0,wakeRetries=0;
const waveLevels=Array(5).fill(0);
function micTrack(){return state.stream?.getAudioTracks?.()[0]||null}
// The track carries sound only when the person wants it and there is a conversation to say it to: in a call
// with none selected nothing is captured or sent (2026-09-26).
function applyMicState(){const track=micTrack();if(track)track.enabled=state.micEnabled&&!(state.ws&&!targetId())}
function microphoneConstraints(id=inputDeviceId){
 return {echoCancellation:true,noiseSuppression:true,autoGainControl:true,
  ...(id!=='default'?{deviceId:{exact:id}}:{})};
}
async function acquireMicrophone(id=inputDeviceId){
 const next=await navigator.mediaDevices.getUserMedia({audio:microphoneConstraints(id),video:false});
 const track=next.getAudioTracks()[0];
 // "all" includes local TTS. Older browsers retain their normal AEC.
 try{if(track.getCapabilities?.().echoCancellation?.includes('all'))
  await track.applyConstraints({echoCancellation:{exact:'all'}})}catch{}
 return next;
}
function audioSession(active){try{if(navigator.audioSession)navigator.audioSession.type=active?'play-and-record':'auto'}catch{}}
/* The light by the call controls, because the sentence under them lives in the device
 * panel and a phone in a car never has that panel open. */
function showScreenLock(lockState,note){state.screenLock={state:lockState,note}}
/* Echo coverage, as far as the page can see it: the microphone track must have echo cancellation on, and the
 * room's voice must leave through the media element (on iOS only that playback joins the echo reference). The
 * page cannot see whether the canceller is doing well; what it can see is whether the conditions hold. */
function echoCoverage(){const track=micTrack();return deriveEchoCoverage({connected:!!state.ws,track:!!track,aec:track?.getSettings?.().echoCancellation,health:window.roomVoice?.health?.()})}
function showEchoCover(){const track=micTrack();state.echoFacts={connected:!!state.ws,track:!!track,aec:track?.getSettings?.().echoCancellation,health:window.roomVoice?.health?.()}}
window.addEventListener('voice-output',()=>showEchoCover());
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
/* The list of microphones and speakers is a fact about this device, and the selects that show it are
 * React's. The browser only names a device once the microphone has been granted, so the list is refreshed
 * rather than read once (#53). */
function deviceOptions(devices,kind,selected){
  const listed=devices.filter(d=>d.kind===kind&&d.deviceId&&d.deviceId!=='default');
  const options=[{id:'default',label:'Predeterminado del sistema'},
    ...listed.map((device,index)=>({id:device.deviceId,label:device.label||((kind==='audioinput'?'Micrófono ':'Altavoz ')+(index+1))}))];
  if(selected!=='default'&&!listed.some(d=>d.deviceId===selected))
   options.push({id:selected,label:'Dispositivo seleccionado · desconectado'});
  return options;
}
async function refreshAudioDevices(){
 const devices=state.audioDevices;
 if(!globalThis.navigator?.mediaDevices?.enumerateDevices){
  state.audioDevices={...devices,inputs:[],outputs:[],available:false};
  state.deviceNote='Selecciona los dispositivos desde los ajustes del sistema.';
  return;
 }
 try{
  const listed=await navigator.mediaDevices.enumerateDevices();
  const outputs=!!window.roomVoice?.supportsOutputSelection;
  state.audioDevices={busy:false,available:true,outputAvailable:outputs,
   inputs:deviceOptions(listed,'audioinput',inputDeviceId),outputs:deviceOptions(listed,'audiooutput',outputDeviceId),
   inputId:inputDeviceId,outputId:outputDeviceId};
  state.deviceNote=outputs?'Los nombres aparecen tras conceder permiso al micrófono.'
   :'Cambia la salida desde los ajustes del sistema; aquí no se puede elegir.';
 }catch(error){state.deviceNote=error.message||'No se pudieron enumerar los dispositivos.'}
}
/* Choosing one is an action, not an event on a node: React calls this and the runtime does the work. */
async function selectAudioDevice(kind,id){
 const devices=state.audioDevices;
 state.audioDevices={...devices,busy:true,...(kind==='input'?{inputId:id}:{outputId:id})};
 try{
  if(kind==='input'){await replaceMicrophone(id);state.deviceNote='Micrófono seleccionado.'}
  else{await window.roomVoice.unlock();await window.roomVoice.setOutputDevice(id);outputDeviceId=id;state.deviceNote='Salida de audio seleccionada.'}
  state.audioDevices={...state.audioDevices,busy:false};
 }catch(error){
  state.audioDevices={...state.audioDevices,busy:false,...(kind==='input'?{inputId:inputDeviceId}:{outputId:outputDeviceId})};
  state.deviceNote=error.message;
 }
}
async function replaceMicrophone(id){
 const epoch=++deviceEpoch,socket=state.ws,callEpoch=connectEpoch;
 if(!socket||!captureNode){inputDeviceId=id;return}
 const next=await acquireMicrophone(id);
 if(epoch!==deviceEpoch||socket!==state.ws||callEpoch!==connectEpoch){next.getTracks().forEach(t=>t.stop());return}
 let source;
 try{
  source=audioContext.createMediaStreamSource(next);
  next.getAudioTracks().forEach(t=>t.enabled=state.micEnabled);
  source.connect(analyser);source.connect(captureNode);
 }catch(error){source?.disconnect();next.getTracks().forEach(t=>t.stop());throw error}
 const previous=state.stream;micSource.disconnect();micSource=source;state.stream=next;inputDeviceId=id;micLink?.replaceTrack(next.getAudioTracks()[0]);
 previous.getTracks().forEach(t=>t.stop());
 await window.roomVoice.unlock();updateMic();
}
/* Headphones connected mid-call on an iPhone kept the call on the speaker until a reload (2026-09-26). While
 * the microphone is open, iOS plays our output through the microphone's own echo-cancelling unit, and rebuilds
 * that unit on a new route only when the microphone it holds goes away. So when the devices change and this
 * device follows the system's default, the capture is started again — the old one stopped first, which is
 * what lets iOS rebuild on the new route — and the output handed back. A few hundred milliseconds of
 * microphone are lost; the call's output keeps its floor flowing, so the element is never handed an empty sink. */
let routeTimer=null;
function followDefaultRoute(){
 clearTimeout(routeTimer);
 // One change arrives as several events: act once they have settled.
 routeTimer=setTimeout(()=>void restartCaptureOnRoute(),400);
}
async function restartCaptureOnRoute(){
 if(!state.ws||!captureNode||inputDeviceId!=='default'||!window.roomVoice?.pausesByDefault)return;
 const epoch=++deviceEpoch,socket=state.ws,callEpoch=connectEpoch;
 window.roomVoice?.note?.('route-change','restarting capture');
 const previous=state.stream;
 try{micSource?.disconnect()}catch{}
 previous?.getTracks().forEach(t=>t.stop());
 let next;
 try{next=await acquireMicrophone('default')}
 catch(error){window.roomVoice?.note?.('route-change-failed',error?.message||'microphone');state.deviceNote='No se pudo recuperar el micrófono tras cambiar de auriculares: '+(error?.message||'');return}
 if(epoch!==deviceEpoch||socket!==state.ws||callEpoch!==connectEpoch){next.getTracks().forEach(t=>t.stop());return}
 const source=audioContext.createMediaStreamSource(next);
 next.getAudioTracks().forEach(t=>t.enabled=state.micEnabled);
 source.connect(analyser);source.connect(captureNode);
 micSource=source;state.stream=next;micLink?.replaceTrack(next.getAudioTracks()[0]);
 await window.roomVoice.resumeOutput?.();
 window.roomVoice?.note?.('route-change','capture restarted');syncNowPlaying();
 updateMic();
}
function updateWave(value){
 waveLevels.shift();waveLevels.push(value);
 const bars=$('mic-control').querySelectorAll?.('.mic-wave i')||[];
 for(const [i,bar] of [...bars].entries())bar.style.height=Math.max(2,Math.round(waveLevels[i]*.26))+'px';
}
function setDevicesOpen(open){
 $('audio-device-panel').hidden=!open;$('audio-devices').setAttribute('aria-expanded',String(open));
 $('call-controls').classList[open?'add':'remove']('devices-open');
 if(open){$('call-menu').open=false;refreshAudioDevices()}
}
function setupAudioControls(){
 $('audio-devices').onclick=()=>setDevicesOpen($('audio-device-panel').hidden);
 $('call-settings-open').onclick=()=>{$('call-menu').open=false;$('settings-open').click()};
 $('refresh-devices').onclick=refreshAudioDevices;

 globalThis.navigator?.mediaDevices?.addEventListener?.('devicechange',()=>{refreshAudioDevices();followDefaultRoute()});
}
let pendingBotText=[];
let textAttempt=null;
try{state.roomSeen=JSON.parse(sessionStorage.getItem('voice-room-seen')||'{}')}catch{}
try{state.history=JSON.parse(sessionStorage.getItem('voice-room-transcript')||'[]');if(!Array.isArray(state.history))state.history=[]}catch{}
function save(){try{sessionStorage.setItem('voice-room-transcript',JSON.stringify(state.history.slice(-1000)))}catch{}}
function targetId(){return state.roomBinding?.thread_id||null}
function historyThreadId(){return state.viewedThread||targetId()}

// A refusal is a sentence, or a key with its English sentence (sidevoice-core's newer refusals): the sentence is said.
async function api(path,options){const r=await request(path,options);if(r.status===401)throw Error(reachNote(state)||NO_MACHINE);const d=await r.json();if(!r.ok)throw Error(sayRefusal(d.detail,'No se pudo completar la operación'));return d}
const post=(path,body,method='POST')=>api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

/* What the microphone heard while the room was unreachable, said plainly. The person spoke to
 * nobody for a moment, and how much of it survived is a fact they are entitled to read. */

/* What the room is repeating because this browser never heard it (#52), said on the bubble itself so a
 * reply from two minutes ago is never taken for something just said. The mark follows what actually
 * happened to the repetition — queued, sounding, finished, cancelled by a new turn, or an audio the
 * room no longer has — because promising a repetition that never played would be the same lie. */


function replayNote(r){return r.role==='assistant'&&REPLAY_NOTES[state.replayMarks[r.segment]]||''}
function markReplay(id,status){if(!id||!Object.hasOwn(state.replayMarks,id))return;state.replayMarks={...state.replayMarks,[id]:status};markHistorySeen()}
function noteReplay(d){
 for(const item of d.replies||[])if(item?.history_id)state.replayMarks={...state.replayMarks,[item.history_id]:'queued'};
 for(const item of d.skipped||[])if(item?.history_id)state.replayMarks={...state.replayMarks,[item.history_id]:'gone'};
 markHistorySeen();
}
// A new turn, or the room cancelling the audio, ends the catch-up: what never sounded does not claim it did.
function cancelPendingReplays(){
 let changed=false;
 for(const [id,status] of Object.entries(state.replayMarks))if(status==='queued'||status==='playing'){state.replayMarks={...state.replayMarks,[id]:'cancelled'};changed=true}
 if(changed)markHistorySeen();
}


function clearKaraoke(speech){if(state.karaokeState?.segment===speechSegment(speech))state.karaokeState=null}
function updateKaraoke(speech,range){
 if(state.activeSpeech?.utterance_id!==speech.utterance_id||speech.session_id!==state.sessionId)return;
 state.karaokeState=range?{segment:speechSegment(speech),...range}:null;
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
async function cancelCurrentInput(){if(!state.userTurn||state.cancelledInput)return;const revision=Number(state.userTurn.key.slice(10));try{await post("/api/presentation/cancel-input",{session_id:state.sessionId,revision});cancelDraft(revision)}catch(e){setRoomError(e.message);throw e}}

function cancelDraft(revision){state.cancelledInput=true;state.history=state.history.filter(r=>r.segment!==state.sessionId+':user-turn:'+revision);save();partial('');markHistorySeen()}
function partial(text){state.pendingUserText=text||''}
function updateComposer(){const ready=!!state.ws&&!!state.sessionId&&!!targetId()&&historyThreadId()===targetId()&&!state.switching;$('text-message').disabled=!ready;$('text-send').disabled=!ready||state.textSending;$('text-message').placeholder=ready?'Escribe un mensaje…':'Entra en la sala y selecciona una conversación';}
$('text-composer').onsubmit=async event=>{event.preventDefault();personSignal();const input=$('text-message'),text=input.value;if(state.textSending||!text.trim()||!state.sessionId||!targetId())return;const destination=targetId(),key=JSON.stringify([state.sessionId,destination,text]);if(textAttempt?.key!==key)textAttempt={key,id:crypto.randomUUID()};const attempt=textAttempt;state.textSending=true;updateComposer();setRoomError('');try{await post('/api/presentation/text',{text,thread_id:destination,session_id:state.sessionId,binding_id:state.roomBinding.binding_id,message_id:attempt.id});if(input.value===text)input.value='';if(textAttempt===attempt)textAttempt=null;await refreshHistory()}catch(e){setRoomError(e.message||'No se pudo confirmar el envío. El texto se conserva.')}finally{state.textSending=false;updateComposer()}};
$('text-message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('text-composer').requestSubmit()}});
function updateMic(){state.micEnabled=micTrack()?.enabled??state.micEnabled;updateComposer()}
function setMic(enabled){personSignal();stopPreview();state.micEnabled=enabled;applyMicState();updateMic();syncNowPlaying()}
function releaseHold(){spaceDown=false;state.holding=false;if(holding){holding=false;setMic(false)}}

document.addEventListener('click',event=>{if(!$('call-controls').contains(event.target))setDevicesOpen(false);for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))if(!menu.contains(event.target))menu.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setDevicesOpen(false);if(event.key==='Escape')for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))menu.open=false});
async function select(id){if(state.switching||id===targetId()||!state.sessionId)return;state.switching=true;try{await post('/api/presentation/select',{thread_id:id,session_id:state.sessionId});rememberThread(id);await refresh()}catch(e){setRoomError(e.message)}finally{state.switching=false}}
// Answers can arrive out of order, and one asked before this page had a session describes nobody: either
// would read as the binding changing and cancel a reply just handed to this page (#73).
let refreshAsked=0,refreshApplied=0;
/* A page older than the one the room serves keeps its old behaviour until somebody reloads it, and an iPhone
 * kept the old one through reloads (2026-09-26). Out of a call it reloads itself — under an address naming
 * the new build, so no cache can answer with the old one; in a call it says so and waits for the hang-up. */
function followServedBuild(served){
 const page=window.sidevoiceBuildId||'dev';
 if(!served||page==='dev'||served===page)return;
 if(state.ws||state.connecting){state.liveNote='Hay una versión nueva de la sala: se cargará al colgar.';return}
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
  if(state.activeSpeech?.thread_id!==targetId())cancelBrowserSpeech();pendingBotText=[];state.pendingUserText='';state.userLive=state.botLive=false;markHistorySeen()}
 updateComposer();
 const call=d.call?.id===state.sessionId?d.call:null;if(call?.error)setRoomError(call.error);});
 applyMicState();
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
 * proved itself is trusted for a few minutes (docs/DEVICE_PAIRING.md). A call in progress is never moved by it
 * — changing machine is a hang-up, and the person's to make. A reconnecting call (`hold`) keeps the address it
 * had while that one's proof is recent: the machine may be restarting, and the socket is the better probe. */
const verified=new Map();
let locateAsked=0,locateApplied=0,targetAbout=null,reachFailure='',doubted=null;
async function locate({move=!(state.ws||state.connecting||state.reconnecting),fresh=false,hold=false}={}){
 if(!move)return;
 const pairing=pairingInUse(pairings);
 if(!pairing){settleBase(null,'unpaired',null);return}
 if(pairing.revoked){settleBase(null,'revoked',pairing);return}
 const recent=base=>base!=null&&Date.now()-(verified.get(base)||0)<VERIFIED_FOR_MS;
 if(!fresh&&state.node===pairing.fp&&recent(nodeBase)&&doubted!==nodeBase)return;
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
 if(found){verified.set(found.base,Date.now());if(doubted===found.base)doubted=null;if(!state.ws||found.base===nodeBase)settleBase(found,'ok',pairing);return}
 if(hold&&state.node===pairing.fp&&recent(nodeBase))return;
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
 // Settings open on another machine: its integrations and its providers' lists are read afresh (F13).
 if(base!=null&&state.integrationsStatus==='idle'&&$('language-settings')?.open)void loadIntegrations().then(()=>loadStageLists(true));
}
/* ----- pairing this device with a machine (docs/DEVICE_PAIRING.md) ----- */
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
 const {pairing,base}=await redeemPairingCode(code,{name,target,about,origin:location.origin,get:fetch});
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
 const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing)return;
 const wasInUse=pairings.inUse===fp,known=wasInUse&&state.node===fp?nodeBase:null;
 if(wasInUse&&(state.ws||state.connecting||state.reconnecting))disconnect();
 keepPairings(withoutPairing(pairings,fp));
 if(wasInUse){const next=pairingInUse(pairings);settleBase(null,next?'':'unpaired',next);if(next)void locate({move:true})}
 if(pairing.revoked)return;
 try{
  const place=known!=null&&Date.now()-(verified.get(known)||0)<VERIFIED_FOR_MS?{base:known}
   :await firstProven(candidateBases(pairing,{target,about:targetAbout,origin:location.origin}),pairing,{get:fetch});
  if(place)await fetch(place.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token));
 }catch{}
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
 $('stats-endpoint').textContent=statsDuration(statsMedian(replies.map(r=>r.input_ms?.speech_end_to_transcript_ms)));
 $('stats-response').textContent=statsDuration(statsMedian([...firstReplies.values()]));
 $('stats-synthesis').textContent=statsDuration(statsMedian(replies.map(r=>r.provider_ms?.request_to_complete_ms)));
 $('stats-playout').textContent=statsDuration(statsMedian(replies.map(r=>r.browser_ms?.audio_received_to_playback_scheduled_ms)));
 const states={queued:'En cola',synthesizing:'Generando voz',ready:'Audio listo',dispatched:'Audio enviado',playing:'Reproduciendo',completed:'Reproducción terminada',interrupted:'Interrumpida',failed:'Falló',disconnected:'Desconectada'};
 const rows=replies.slice(-12).reverse().map(r=>{
  const row=document.createElement('tr'),input=r.input_ms||{},server=r.server_ms||{},provider=r.provider_ms||{};
  row.append(statsCell('td',r.reply_revision),...[
   input.speech_end_to_transcript_ms,input.endpoint_silence_ms,input.recognition_ms,
   server.input_queued_to_reply_received_ms,server.reply_received_to_synthesis_started_ms,
   provider.request_to_first_chunk_ms,provider.request_to_complete_ms,
   r.browser_ms?.audio_received_to_playback_scheduled_ms
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
 ['Whisper en este dispositivo',r=>r.input_ms?.request_to_transcript_ms,'request_to_transcript'],
 ['Texto → entregado al agente',r=>r.input_ms?.transcript_to_delivery_ms,'transcript_to_delivery'],
 ['Entregado → leído por la conversación',r=>r.server_ms?.delivery_accepted_to_read_ms??r.server_ms?.input_queued_to_read_ms,'delivery_to_read'],
 ['Leído → primera respuesta',r=>r.server_ms?.read_to_reply_received_ms,'read_to_reply'],
 ['Agente: entrega → primera respuesta',r=>r.server_ms?.input_queued_to_reply_received_ms,'input_queued_to_reply'],
 ['Respuesta → inicio de síntesis',r=>r.server_ms?.reply_received_to_synthesis_started_ms,'reply_to_synthesis'],
 ['Síntesis en el proveedor',r=>r.provider_ms?.request_to_complete_ms,'provider_synthesis'],
 ['Audio recibido → reproducción',r=>r.browser_ms?.audio_received_to_playback_scheduled_ms,'audio_received_to_playback'],
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

// ----- the ambient bed: this browser's turn is in the conversation's hands (#42) -----
// Feedback with no model in it. Between the moment the conversation has read what this browser sent and
// the moment it speaks, a driver cannot tell work from a hang, and the silence is the whole problem. So
// The harness report is authoritative. Without one, receipts and replies record turn work;
// the store derives whether the silence between voices can carry the ambient breath.
// The sound itself, its level and why it cannot open a microphone turn are in RoomVoice.startPresence.
let presenceTimer=null;
function bedQuietReason(session){
 const harness=state.harness[targetId()];
 if(!session.working)return 'not_working'+(typeof harness==='boolean'?' · harness '+harness:' · no harness');
 if(session.speaker!=='nobody')return 'speaker '+session.speaker;
 if(state.activeSpeech)return 'reply queued';
 if(state.voicePreferences?.presence_sound==='off')return 'turned off';
 return 'not_quiet';
}
function presenceReceipt(id,status){
 roomStore.batch(()=>{state.now=Date.now();state.turns=recordReceipt(state,id,status,state.now)});
}
// The timer contributes a clock fact. Scheduling and ambient playback are reconciled below,
// for every store transition, rather than remembered by individual event handlers.
let receiptDeadline=null,bedPlaying=false,observedStream=null;
function reconcileSession(view){
 if(view.facts.stream!==observedStream){observedStream=view.facts.stream;showEchoCover();return}
 const deadlines=Object.values(state.turns).filter(t=>!t.settled&&['delivered','unconfirmed'].includes(t.status)&&t.readyAt>state.now).map(t=>t.readyAt);
 // The bed waits for the person to be really done, so the moment that wait ends is a deadline like any other.
 if(state.userQuietAt&&state.userQuietAt+BED_AFTER_USER_MS>state.now)deadlines.push(state.userQuietAt+BED_AFTER_USER_MS);
 const deadline=deadlines.length?Math.min(...deadlines):null;
 if(deadline!==receiptDeadline){clearTimeout(presenceTimer);receiptDeadline=deadline;
  if(deadline!==null)presenceTimer=setTimeout(()=>{receiptDeadline=null;state.now=Math.max(Date.now(),deadline)},Math.max(0,deadline-state.now));
 }
 if(view.session.bed!==bedPlaying){
  if(view.session.bed){bedPlaying=true;bedPlaying=!!window.roomVoice?.startPresence?.({volume:PRESENCE_LEVEL,reason:'working_quiet'})}
  else {bedPlaying=false;window.roomVoice?.stopPresence?.(bedQuietReason(view.session))}
  // The room hears about every change of the bed at once, with its reason: "no breath while it worked"
  // is otherwise a question nobody can answer afterwards (2026-09-26).
  reportAudioHealth(view.session.bed?'bed-on':'bed-off');
 }
 publishSessionView(view);
}
// The output's notable moments go to the room, so a phone that gets stuck can be read from the other end.
const REPORTED_OUTPUT_EVENTS=new Set(['cancel','stall','fail','complete','attach-refused','resume-refused','element-refused','audio-while-stopped','unlock-refused']);
function reportAudioHealth(reason){
 if(!state.ws||state.ws.readyState!==1||!state.sessionId||!window.roomVoice?.health)return;
 const health=window.roomVoice.health();
 // The same moment, twice said and once measured: the room's report keeps working exactly as it did,
 // and the trace gets it as an event on the call span instead of a channel of its own.
 window.sidevoiceTelemetry?.audioEvent?.(reason,{'sidevoice.audio_output':health?.output,'sidevoice.audio_context':health?.context,'sidevoice.stalls':health?.stalls});
 try{state.ws.send(JSON.stringify({type:'voice-audio-health',data:{session_id:state.sessionId,reason,health}}))}catch{}
}
window.addEventListener('voice-output',event=>{const kind=event.detail?.kind;if(REPORTED_OUTPUT_EVENTS.has(kind))reportAudioHealth(kind)});

// ----- uncaught errors: nobody can read a phone's console while driving (#58) -----
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
function audioOutputFacts(health){
 if(!health)return [];
 const states={running:'activo',suspended:'suspendido',interrupted:'interrumpido',closed:'cerrado',none:'sin iniciar'};
 const output=health.output==='element'?(health.element?.paused?'Elemento de audio en pausa':'Elemento de audio reproduciendo'):health.output==='context'?'Contexto directo':'Sin salida';
 const clock=statsNumber(health.clock)?health.clock.toFixed(2)+' s · '+(states[health.context]||health.context):'—';
 const events=(health.events||[]).slice(-6).map(e=>new Date(e.at).toTimeString().slice(3,8)+' '+e.kind+(e.detail?' ('+e.detail+')':'')).join(' · ')||'Ninguno';
 const presence=health.presence?'Sonando · pico '+(health.presence*100).toFixed(1)+' % de escala':'En silencio';
 return [['Salida de audio',output],['Reloj de audio',clock],['Sonido de presencia',presence],['Bloqueos de reproducción',String(health.stalls||0)+(health.resuming?' · recuperando':'')],['Últimos eventos de audio',events]];
}
function renderConnectionStats(data,roundTrip){
 const call=state.sessionId&&data?.call?.id===state.sessionId?data.call:null,track=micTrack(),settings=track?.getSettings?.()||{};
 // The stats read the same list the selects do, not the DOM the selects happen to have rendered.
 const selectedLabel=kind=>{const devices=state.audioDevices,id=kind==='input'?devices.inputId:devices.outputId;
  return (kind==='input'?devices.inputs:devices.outputs).find(option=>option.id===id)?.label||'Predeterminado del sistema'};
 const flag=value=>value===true||value==='all'?'Activado':value===false?'Desactivado':'No confirmado';
 const socket=['Conectando','Conectado','Cerrando','Desconectado'][state.ws?.readyState]||'Desconectado';
 const context=window.roomVoice?.context||audioContext,stt=call?.transcription;
 // Where it runs: this device on an accelerator (and the one it fell back from), or a provider, remotely.
 const sttExecution=!stt?'—':stt.place==='device'
  ?[stt.accelerator,stt.fallback_from&&'antes '+stt.fallback_from].filter(Boolean).join(' · ')||'—'
  :'Remota';
 const facts=[
  ...versionFacts(),
  ['WebSocket',socket],
  ['Consulta al servidor (HTTP)',statsDuration(roundTrip)],
  ['Sesión',state.sessionId||'Sin llamada'],
  ['Servidor y este dispositivo',call?'Misma sesión':state.sessionId?'Sesión no confirmada':'Sin llamada'],
  ['Transcripción',stt?[stt.place,stt.model].filter(Boolean).join(' · '):'—'],
  ['Motor STT',stt?.engine||'—'],
  ['Ejecución STT',sttExecution],
  ['Motor de audio',({running:'Activo',suspended:'Suspendido',closed:'Cerrado'})[context?.state]||'No iniciado'],
  ...audioOutputFacts(window.roomVoice?.health?.()),
  ['Micrófono',track?.label||selectedLabel('input')],
  ['Captura',!track?'No iniciada':track.readyState==='ended'?'Finalizada':track.muted?'Sin señal del dispositivo':track.enabled?'Activa':'Silenciada'],
  ['Ruta del micrófono',micPathFact()],
  ['Altavoces',selectedLabel('output')],
  ['Cancelación de eco',flag(settings.echoCancellation)],
  ['Reducción de ruido',flag(settings.noiseSuppression)],
  ['Frecuencia de captura',statsNumber(settings.sampleRate)?settings.sampleRate+' Hz':'—'],
  ['Audio recibido por el servidor',call?.mic?call.mic.frames+' frames · '+call.mic.bytes+' bytes':'—'],
  ['Último hueco entre paquetes',call?.mic?statsDuration(call.mic.last_gap_ms):'—'],
  ['Mayor hueco entre paquetes',call?.mic?statsDuration(call.mic.max_gap_ms):'—'],
  ['Huecos de más de 250 ms',call?.mic?call.mic.gaps_over_250ms:'—'],
  ['Pantalla activa',screenWakeLock&&!screenWakeLock.released?'Activado':'No confirmado']
 ];
 $('stats-connection').replaceChildren(...facts.flatMap(([label,value])=>[statsCell('dt',label),statsCell('dd',value)]));
}
// Which path the microphone reaches the machine on, and — when it is not WebRTC — why not (phase 4).
function micPathFact(){
 const link=state.sessionId&&micLink?.sessionId===state.sessionId?micLink:null;if(!link)return '—';
 if(link.path==='webrtc')return 'WebRTC';
 const socket=state.rendezvous==='room'?'Socket (relé)':'Socket';
 const why=({negotiating:'preparando WebRTC…',recovering:'WebRTC interrumpido; esperando a que vuelva'})[link.state]||({page_off:'WebRTC desactivado en este dispositivo',unsupported:'este dispositivo no tiene WebRTC',unavailable:'la máquina no ofrece WebRTC',node_off:'la máquina tiene WebRTC desactivado',offer:'la máquina no aceptó la conexión WebRTC',timeout:'WebRTC no llegó a conectar',failed:'la conexión WebRTC falló',closed:'la conexión WebRTC se cerró',disconnected:'WebRTC se cortó y no volvió',track:'el micrófono nuevo no pasó a WebRTC',error:'no se pudo preparar WebRTC'})[link.reason];
 return why?socket+' · '+why+(link.detail&&['offer','error','unavailable'].includes(link.reason)?': '+link.detail:''):socket;
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
 stopConnectionStats();$('call-menu').open=false;setDevicesOpen(false);resetStats();
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
 const traceparent=window.sidevoiceTelemetry?.startTurn?.(threadId,revision,{'sidevoice.stt_place':state.voicePreferences?.stt?.place,'sidevoice.turn_end_mode':state.voicePreferences?.turn_end_mode});
 if(!traceparent||!state.ws||state.ws.readyState!==1||!state.sessionId)return;
 try{state.ws.send(JSON.stringify({type:'voice-turn-trace',data:{session_id:state.sessionId,thread_id:threadId,revision,traceparent}}))}catch{}
}
function observeLatencyEvent(type,data){
 const now=latencyNow();if(!Number.isFinite(now))return;
 if(type==='voice-user-turn'){
  const key=latencyKey(data.thread_id,data.revision);
  if(data.phase==='started'){latencyActiveTurn=key;if(!latencyTurns.has(key))latencyTurns.set(key,{});openTurnTrace(data.thread_id,data.revision)}
  if(data.phase==='cancelled'){latencyTurns.delete(key);if(latencyActiveTurn===key)latencyActiveTurn=null;window.sidevoiceTelemetry?.endTurn?.(data.thread_id,data.revision,data.merged?'merged':'cancelled')}
  if(data.phase==='finished'){const turn=latencyTurns.get(key)||{};turn.finished=now;latencyTurns.set(key,turn)}
  if(latencyTurns.size>128)latencyTurns.delete(latencyTurns.keys().next().value);
 }else if(type==='user-stopped-speaking'){
  const turn=latencyTurns.get(latencyActiveTurn);if(turn)turn.vadStop=now;
 }else if(type==='user-started-speaking'){
  const turn=latencyTurns.get(latencyActiveTurn);if(turn&&!Number.isFinite(turn.finished))delete turn.vadStop;
 }
}
function browserLatency(d,received){
 const now=latencyNow();if(!Number.isFinite(now)||!Number.isFinite(received))return {};
 const durations={audio_received_to_playback_scheduled_ms:now-received};
 window.sidevoiceTelemetry?.stage?.(d.thread_id,d.reply_revision??d.revision,'audio_received_to_playback',now-received,{'sidevoice.utterance_id':d.utterance_id,'sidevoice.reply_revision':d.reply_revision??d.revision});
 const turn=latencyTurns.get(latencyKey(d.thread_id,d.reply_revision??d.revision));
 if(Number.isFinite(turn?.finished)){
  durations.turn_finished_event_to_playback_scheduled_ms=now-turn.finished;
  if(Number.isFinite(turn.vadStop))durations.vad_stop_event_to_turn_finished_event_ms=turn.finished-turn.vadStop;
 }
 return Object.fromEntries(Object.entries(durations).filter(([,v])=>Number.isFinite(v)&&v>=0&&v<=3600000));
}
// `socket` is the one the frame came in on: during a transcription swap this page holds two, and an
// answer belongs to the socket that asked, not to whichever one the call is using.
function message(raw,socket){return roomStore.batch(()=>recordMessage(raw,socket))}
function refuseTranscription(d, error) {
 try{state.ws?.send(JSON.stringify({type:'voice-transcript-error',data:{session_id:state.sessionId,request_id:d.request_id,error}}))}catch{}
}
function recordMessage(raw, socket) {
    let m;
    try {
        m = JSON.parse(raw);
    }
    catch {
        return;
    }
    const t = m.type, d = m.data || {};
    // The room asks whether anyone is still here, because a closed tab behind a tunnel leaves its
    // socket up and its seat taken (#63). The page keeps no clock of its own for this: a background
    // tab's timers are throttled, but the frame that arrives still wakes this handler, and a muted
    // browser sends no audio the room could have taken for an answer.
    if (t === 'voice-ping') {
        const link = socket || state.ws;
        try { link?.send(JSON.stringify({ type: 'voice-pong', data: { session_id: d.session_id || state.sessionId } })); } catch { }
        return;
    }
    if (['voice-user-turn', 'user-transcription', 'user-started-speaking', 'user-stopped-speaking'].includes(t) && d.session_id && d.session_id !== state.sessionId)
        return;
    observeLatencyEvent(t, d);
    if (t === 'voice-transcribe') {
        // A request this browser cannot serve is refused now, not left for the room to time out ninety
        // seconds later with nothing to say (2026-09-20, a phone whose Whisper never loaded).
        if (d.session_id !== state.sessionId)
            return;
        const runtime = window.roomTranscription;
        if (typeof runtime?.transcribe !== 'function')
            return refuseTranscription(d, 'Este dispositivo no tiene lista la transcripción.');
        try { runtime.transcribe(d); }
        catch (error) { refuseTranscription(d, error?.message || 'La transcripción falló en este dispositivo.'); }
        return;
    }
    if (t === 'voice-speech') {
        receiveBrowserSpeech(d);
        return;
    }
    if (t === 'voice-speech-audio') {
        receiveServerSpeech(d);
        return;
    }
    if (t === 'voice-replay' && d.session_id === state.sessionId) {
        noteReplay(d);
        return;
    }
    if (t === 'voice-cancel' && d.session_id === state.sessionId) {
        state.roomRevision = Math.max(state.roomRevision, d.revision);
        cancelPendingReplays();
        cancelBrowserSpeech();
        return;
    }
    if (t === 'voice-user-turn' && d.phase === 'started') {
        state.roomRevision = Math.max(state.roomRevision, d.revision);
        cancelPendingReplays();
        cancelBrowserSpeech();
    }
    if (t === 'voice-catchup-turn' && d.session_id === state.sessionId) { /* a message from the gap: its own bubble, with this browser's own clock, and nothing of the turn that may be open now */
        add('user', d.text, null, d.thread_id, { history_id: d.history_id, draft: false, offline: d.offline, time: d.time || Date.now(), delivery: d.thread_id ? (state.inputReceipts[d.history_id] || 'pending') : 'not_sent' });
        state.inputReceipts = Object.fromEntries(Object.entries(state.inputReceipts).filter(([id]) => id !== d.history_id));
        return;
    }
    if (t === 'voice-input-receipt') {
        if ((d.session_id || state.sessionId) === state.sessionId && ['delivered', 'read', 'unconfirmed', 'not_sent'].includes(d.status))
            confirmSpokenTurn(d.revision);
        const receiptId = d.history_id || (d.session_id || state.sessionId) + ':user-turn:' + d.revision;
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
    if (t === 'voice-user-turn') {
        const key = 'user-turn:' + d.revision, receiptId = (d.session_id || state.sessionId) + ':' + key;
        if (d.phase === 'started') {
            personSignal();
            openSpokenTurn(d.revision);
            state.cancelledInput = false;
            state.userTurn = { key, text: '', thread: d.thread_id };
            state.pendingPhase = 'listening';
            partial('');
        }
        else if (d.phase === 'cancelled') {
            // Nothing to deliver, or its text now rides the turn that is open: either way this one is done.
            confirmSpokenTurn(d.revision);
            state.inputReceipts = Object.fromEntries(Object.entries(state.inputReceipts).filter(([id]) => id !== receiptId));
            if (d.merged) { /* the room held this text for the turn now open: same bubble, nothing to remove */
                state.history = state.history.filter(r => r.segment !== state.sessionId + ':user-turn:' + d.revision);
                markHistorySeen();
            }
            else {
                state.pendingPhase = '';
                cancelDraft(d.revision);
            }
        }
        else if (d.phase === 'finished') {
            state.pendingPhase = '';
            partial('');
            add('user', d.text, key, d.thread_id, { draft: false, time: Date.now(), delivery: d.thread_id ? (state.inputReceipts[receiptId] || 'pending') : 'not_sent' });
            state.inputReceipts = Object.fromEntries(Object.entries(state.inputReceipts).filter(([id]) => id !== receiptId));
            state.userTurn = null;
        }
    }
    if (t === 'user-transcription' && !state.cancelledInput) {
        if (d.final) {
            partial('');
            if (state.userTurn) {
                state.userTurn = { ...state.userTurn, text: [state.userTurn.text, d.text].filter(Boolean).join(' ') };
                add('user', state.userTurn.text, state.userTurn.key, state.userTurn.thread, { draft: true });
            }
        }
        else if (!state.userTurn || state.userTurn.thread === historyThreadId())
            partial(d.text);
    }
    if (t === 'bot-output' && !['word', 'token'].includes(d.aggregated_by)) {
        const completed = d.spoken === true || d.spoken_status === 'completed';
        const index = completed ? pendingBotText.indexOf(d.text) : -1;
        if (index >= 0) {
            pendingBotText.splice(index, 1);
        }
        else {
            add('assistant', d.text, d.segment_id);
            if (d.spoken === false || d.spoken_status === 'new')
                pendingBotText.push(d.text);
        }
    }
    if (t === 'bot-started-speaking') {
        stopPreview();
        state.botLive = true;
    }
    if (t === 'bot-stopped-speaking') {
        state.botLive = false;
    }
    if (t === 'user-started-speaking') {
        if (state.userTurn) {
            state.pendingPhase = 'listening';
            markHistorySeen();
        }
        state.userLive = true;
        state.userQuietAt = 0;
        state.liveNote = '';
        cancelBrowserSpeech();
        state.userLive = true;
        if (state.botLive) {
            const last = [...state.history].reverse().find(r => r.thread === targetId() && r.role === 'assistant');
            if (last) {
                state.history = state.history.map(r => r === last ? { ...r, interrupted: true } : r);
                save();
                markHistorySeen();
            }
        }
        state.botLive = false;
    }
    if (t === 'user-stopped-speaking') {
        if (state.userTurn && state.pendingPhase === 'listening') {
            state.pendingPhase = 'transcribing';
            markHistorySeen();
        }
        state.userLive = false;
        state.userQuietAt = Date.now();
    }
    if (t === 'voice-conversation' && d.thread_id) {
        if (typeof d.working === 'boolean') {
            // Only changes are written down (the connector repeats itself every two seconds): what the harness
            // said, next to what the bed did, is what tells a silent breath from a lost signal.
            if (state.harness[d.thread_id] !== d.working)
                window.roomVoice?.note?.('harness', (d.working ? 'working' : 'idle') + (d.turn_phase ? ' · ' + d.turn_phase : '') + (d.thread_id === targetId() ? '' : ' · other'));
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
    if (t === 'error')
        setRoomError(sayRefusal(d, d.error || 'Error de conexión'));
}
function stopMeter(){cancelAnimationFrame(meterFrame);meterFrame=null;captureNode?.disconnect();captureNode=null;micSource?.disconnect();analyser?.disconnect();if(audioContext&&audioContext!==window.roomVoice?.context)audioContext.close().catch(()=>{});audioContext=null;analyser=null;micSource=null;$('mute').style.setProperty('--mic-fill','0%');$('mic-control').dataset.signal='quiet';$('mic-level-meter').setAttribute('aria-valuenow','0');waveLevels.fill(0);updateWave(0)}
/* The bubble of the turn being recorded draws this microphone: the waveform pulls the samples the meter's
 * own analyser already holds, once per animation frame and from the canvas itself. No second audio graph, no
 * capture of its own, and nothing that renders React at meter frequency (docs/FRONTEND.md). */
let waveSamples=null;
window.sidevoiceAudio={readWaveform(){
 if(!analyser)return null;
 if(!waveSamples||waveSamples.length!==analyser.fftSize)waveSamples=new Float32Array(analyser.fftSize);
 analyser.getFloatTimeDomainData(waveSamples);
 return waveSamples;
}};
function measureMic(samples,enabled){
 if(!enabled)return {value:0,state:'quiet',peak:0};
 let squares=0,peak=0;for(const sample of samples){squares+=sample*sample;peak=Math.max(peak,Math.abs(sample))}
 const rms=Math.sqrt(squares/samples.length),db=20*Math.log10(Math.max(rms,1e-6));
 return {value:Math.max(0,Math.min(100,Math.round((db+60)/60*100))),peak,state:peak>=.98?'clip':peak>=.8?'high':rms>.001?'normal':'quiet'};
}
function startMeter(rate){try{audioContext=window.roomVoice?.context||roomAudioContext(rate);analyser=audioContext.createAnalyser();analyser.fftSize=1024;micSource=audioContext.createMediaStreamSource(state.stream);micSource.connect(analyser);const data=new Float32Array(1024);let clipUntil=0,lastWave=0;function tick(){if(!analyser)return;analyser.getFloatTimeDomainData(data);const enabled=!!state.stream?.getAudioTracks()[0]?.enabled,level=measureMic(data,enabled);if(level.signal==='clip')clipUntil=Date.now()+600;const signal=enabled&&Date.now()<clipUntil?'clip':level.state;$('mute').style.setProperty('--mic-fill',level.value+'%');const meter=$('mic-level-meter'),mic=$('mic-control');mic.dataset.signal=signal;if(Date.now()-lastWave>=80){updateWave(level.value);lastWave=Date.now()}meter.setAttribute('aria-valuenow',String(level.value));const description=signal==='clip'?'Posible saturación del micrófono':signal==='high'?'Nivel de micrófono alto':'Nivel de micrófono';if(meter.dataset.signal!==signal){meter.dataset.signal=signal;meter.setAttribute('title',description);meter.setAttribute('aria-label',description)}meterFrame=requestAnimationFrame(tick)}tick()}catch{}}
function roomSocketUrl(){if(nodeBase==null)throw Error(reachNote(state)||NO_MACHINE);return callSocketUrl(nodeBase,location)}
const ROOM_IS_FULL='La sala ya tiene el máximo de dispositivos conectados. Espera a que salga alguien y vuelve a entrar.';
/* Why the room refused, asked of the room itself over an ordinary request.
 * The room says it twice on the socket — an error frame, then the close code 1013 — and a tunnel
 * can lose both: a phone read only «La sala rechazó la conexión» while the room had written that it
 * was full, and restarting the room was what let it in (#63). An HTTP request is the one path no
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
// The room speaks first: its call id and the PCM format it expects. Anything else arriving meanwhile is an ordinary room event.
function openSession(socket,hello={}){return new Promise((resolve,reject)=>{const fail=(text,forGood=false)=>{clearTimeout(timer);const error=Error(text);error.refused=forGood;reject(error)};let timer=setTimeout(()=>lateFail(),25000),refusal=null,refused=null,broken=false;const lateFail=()=>roomRefusal().then(admission=>fail(admission&&admission.admitted?'Este dispositivo tardó demasiado en entrar. Vuelve a intentarlo.':refusalText(admission,false),admission?.admitted===false));socket.onopen=()=>socket.send(JSON.stringify({label:'rtvi-ai',type:'client-ready',id:crypto.randomUUID(),data:hello}));
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
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='voice-preparation'){if(m.data?.phase==='loading'){clearTimeout(timer);timer=null}showPreparation(m.data||{});noteJoinPreparation(m.data||{});return}if(m.type!=='voice-session'){if(m.type==='error'){refusal=sayRefusal(m.data,m.data?.error||refusal);refused=m.data?.reason||refused}message(e.data,socket);return}state.roomInfo=m.data?.room||state.roomInfo;clearTimeout(timer);showPreparation({phase:'hidden'});resolve(m.data)}})}
// Capturing at the room's rate lets the browser resample; the worklet covers browsers that refuse the rate.
function roomAudioContext(rate){try{return new AudioContext({sampleRate:rate})}catch{return new AudioContext()}}
async function startCapture(socket,session){if(!micSource)throw Error('No se pudo capturar el micrófono');
 // A context created outside the click gesture can start suspended, and a suspended context never
 // runs the worklet: no audio would leave the page and nothing would say why.
 if(audioContext.state!=='running'){try{await audioContext.resume()}catch{}}
 if(audioContext.state!=='running')throw Error('Este dispositivo no autorizó la captura de audio. Vuelve a pulsar para unirte.');
 const context=audioContext,source=micSource,epoch=connectEpoch;
 await context.audioWorklet.addModule('/voice/mic_capture.js?v='+encodeURIComponent(window.sidevoiceBuildId||'dev'));
 if(state.ws!==socket||audioContext!==context||epoch!==connectEpoch)return;
 captureRate=session.sample_rate;
 const node=new AudioWorkletNode(context,'mic-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{sampleRate:session.sample_rate}});captureNode=node;node.port.onmessage=e=>{
  if(captureNode!==node||!micTrack()?.enabled)return;
  sendMicFrame(socket,e.data);
 };source.connect(node);node.connect(context.destination)/* reachable from the destination so it keeps running; its output stays silent */}
// One frame of what the microphone heard. The socket is gone but the call is not: this is what the gap buffer exists
// for. While WebRTC carries the microphone the socket sends none of it, and the page still keeps its own copy of an
// unconfirmed turn (#102): a machine that restarts mid-sentence loses it whichever path it came by.
function sendMicFrame(socket,data){if(state.ws===socket&&socket.readyState===WebSocket.OPEN){if(!micOnWebrtc(socket))socket.send(data);holdSpokenAudio(data)}else bufferGapAudio(data)}
/* ----- the microphone over WebRTC (docs/RENDEZVOUS.md, phase 4) -----
 * Once a call has its session, the track the page already captures is offered to the machine; while that
 * connection is up the socket stops carrying the microphone and carries everything else exactly as before. The
 * attempt belongs to its session and to the socket that session came on: a new session closes it and tries again. */
let micLink=null,micLinkSocket=null;
function startMicLink(socket,sessionId){
 closeMicLink();
 let stored=null;try{stored=localStorage.getItem('sidevoice.webrtc')}catch{}
 micLinkSocket=socket;
 micLink=createMicLink({sessionId,track:micTrack(),allowed:webrtcAllowed({search:location.search,stored}),Peer:globalThis.RTCPeerConnection,
  config:()=>api('/api/presentation/rtc/config'),offer:body=>post('/api/presentation/rtc/offer',body),
  // Said on the socket this session came on and on no other: a session being replaced has nobody left to tell.
  announce:path=>{if(state.ws===socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'voice-media',data:{session_id:sessionId,path}}))},
  onChange:link=>window.roomVoice?.note?.('mic-path',link.path+' · '+link.state+(link.reason?' · '+link.reason:''))});
 void micLink.start();
}
function closeMicLink(){const link=micLink;micLink=micLinkSocket=null;link?.close()}
function micOnWebrtc(socket){return micLinkSocket===socket&&micLink?.path==='webrtc'}
function disconnect() {
    latencyTurns.clear();
    latencyActiveTurn = null;
    window.sidevoiceTelemetry?.endCall?.('left');
    forgetSpokenAudio();
    stopIdleWatch();
    ++connectEpoch;
    state.connecting = false;
    releaseScreenWakeLock();
    audioSession(false);
    ++deviceEpoch;
    roomStore.patch({ harness: {}, turns: {} });
    window.roomVoice?.cancel();
    window.roomTranscription?.stop();
    if ($('voice-loading').open)
        $('voice-loading').close();
    clearJoinStatus();
    cancelBrowserSpeech();
    stopPreview();
    disarmGapBuffer();
    state.replayMarks = {};
    ++switchEpoch;
    state.switchingSession = false;
    const socket = state.ws, opening = openingSocket;
    state.ws = openingSocket = null;
    closeMicLink();
    socket?.close();
    opening?.close();
    state.engineReady=false;
    showEchoCover();
    state.stream?.getTracks().forEach(t => t.stop());
    state.stream = null;
    stopMeter();
    state.sessionId = null;
    state.userLive = state.botLive = holding = spaceDown = false;
    state.userTurn = null;
    state.pendingPhase = '';
    pendingBotText = [];
    partial('');
    state.holding = false;
    state.liveNote = '';
    updateMic();
    applyLockedCall();
}
// Joining and leaving are the same button, and it belongs to React: this is what it calls (#53).
async function toggleCall(){if(state.ws||state.connecting){disconnect();return}
 // Nothing to join without a machine this device is paired with: the tap asks for a code instead.
 const pairing=pairingInUse(pairings);if(!pairing||pairing.revoked){openPairing(pairing?reachNote(state):'');return}
 personSignal();primeNowPlaying();state.connecting=true;const epoch=++connectEpoch;keepScreenAwake();setRoomError('');joinStatus('audio');try{await window.roomVoice.unlock();if(epoch!==connectEpoch)return;if(nodeBase==null){await locate({move:true,fresh:true});if(epoch!==connectEpoch)return}if(nodeBase==null){reachFailure=reachNote(state)||NO_MACHINE;throw Error(reachFailure)}state.voicePreferences=await callPreferences();if(epoch!==connectEpoch)return;if(state.voicePreferences.stt.place===DEVICE)joinStatus('whisper');const {browserStt,sttRuntime}=await prepareTranscription(state.voicePreferences);if(epoch!==connectEpoch)return;if(state.voicePreferences.tts.place===DEVICE){joinStatus('voice');await window.roomVoice.prepare(ttsRequest(state.voicePreferences.tts),text=>{state.liveNote=text})}if(epoch!==connectEpoch)return;audioSession(true);joinStatus('microphone');const acquiredStream=await acquireMicrophone();if(epoch!==connectEpoch){acquiredStream.getTracks().forEach(t=>t.stop());return}state.stream=acquiredStream;state.stream.getAudioTracks().forEach(t=>t.enabled=state.micEnabled);keepScreenAwake();refreshAudioDevices();roomStore.patch({engineReady:true,enginePreferences:state.voicePreferences,sttRuntime});applyLockedCall();joinStatus('room');const session=await joinRoom(epoch,{browserStt,sttRuntime});if(epoch!==connectEpoch||!session)return;await window.roomVoice.unlock();if(epoch!==connectEpoch)return;updateMic();showEchoCover();const remembered=rememberedThread();if(remembered)joinStatus('conversation',{subject:conversationTitle(remembered)});await refresh();await refreshPeople();if(epoch===connectEpoch)clearJoinStatus()}catch(e){if(epoch===connectEpoch){const failed=state.joinStep;disconnect();failJoin(joinFailureText(failed,e))}}finally{if(epoch===connectEpoch)state.connecting=false}}
// ----- the socket: opened on join, reopened by itself when the room goes away -----
// A room restart or a network blip must not end the call: the microphone permission, the media stream
// and the unlocked output all survive it; only the socket needs reopening, with the same hello.
// Quick at first, then every five seconds for as long as it takes: a tunnel, a garage or a lift must not
// end the call (2026-09-26, driving). Only the person hanging up, or the room refusing this browser, stops it.
const RECONNECT_DELAYS_MS=[1000,2000,5000];

function shouldReconnect(event){return ![1008,1013,4401].includes(event?.code)}   // refused by policy, full, or not paired: do not insist
// A room that answers and refuses this browser is not a room that is away: insisting would never end.
function refusedForGood(error){return error?.refused===true}
// The room replays nothing into a new session: the one being replaced is over the moment the new
// one exists, so this page drops what belonged to it instead of pretending it is still running.
function dropReplacedSession(socket){
 if(micLinkSocket===socket)closeMicLink();
 socket.onclose=socket.onmessage=socket.onerror=null;
 try{socket.close()}catch{}
 window.roomTranscription?.stop();
 cancelBrowserSpeech();state.userLive=state.botLive=false;state.pendingUserText='';state.pendingPhase='';markHistorySeen();
}
// `context.keepCurrent` is a swap: the call in progress keeps this page's socket, its audio and its
// microphone until the room has answered the new hello, so a refusal costs the call nothing.
async function joinRoom(epoch,context){
 const socket=new WebSocket(roomSocketUrl(),callProtocols());socket.binaryType='arraybuffer';
 if(context.keepCurrent)openingSocket=socket;else state.ws=socket;
 let session;
 // The hello carries this browser's call span, so the room's own spans are inside it instead of
 // being a second trace about the same call. With no collector configured there is no span to carry.
 const traceparent=window.sidevoiceTelemetry?.startCall?.({'sidevoice.stt_place':state.voicePreferences?.stt?.place,'sidevoice.stt_model':state.voicePreferences?.stt?.model});
 try{session=await openSession(socket,{conversation:rememberedThread(),sessions:rememberedSessions(),settings:state.voicePreferences,transcription:context.sttRuntime,...(traceparent?{telemetry:{traceparent}}:{})})}
 // A swap that failed leaves nothing behind: this socket never became the call's, and a refusal
 // that timed out could still be open and still be talking to a page that is not listening.
 // A join that failed leaves nothing behind, whichever way this socket was opened. A room that is
 // not told keeps the seat for the length of its keepalive budget while the page tries again, so one
 // local failure — a microphone that never arrived, an audio engine that would not start — became a
 // reconnect loop that ate the room's seats one every thirty seconds (2026-09-22).
 catch(error){socket.onclose=socket.onmessage=socket.onerror=null;try{socket.close()}catch{}if(state.ws===socket)state.ws=null;throw error}
 finally{if(openingSocket===socket)openingSocket=null}
 if(epoch!==connectEpoch){socket.close();return null}
 socket.onerror=null;
 // Nothing is swapped over a socket that is already gone: the call keeps the one it has.
 if(socket.readyState!==WebSocket.OPEN)throw Error('La sala cerró la conexión');
 const replaced=context.keepCurrent&&state.ws&&state.ws!==socket?state.ws:null;
 state.ws=socket;
 if(replaced)dropReplacedSession(replaced);
 // What reopens this socket by itself is the call, never the swap that opened it.
 const again={browserStt:context.browserStt,sttRuntime:context.sttRuntime};
 socket.onclose=event=>{if(state.ws===socket)lostConnection(event,epoch,again)};
 socket.onmessage=e=>{if(state.ws===socket)message(e.data,socket)};
 state.sessionId=session.session_id;state.roomRevision=0;rememberSession(state.sessionId);
 window.sidevoiceTelemetry?.noteSession?.(state.sessionId);
 if(context.browserStt)window.roomTranscription.start({socket,language:state.voicePreferences.stt?.options?.language});
 else window.roomTranscription?.stop();
 stopMeter();startMeter(session.sample_rate);await startCapture(socket,session);
 if(state.ws===socket&&state.sessionId===session.session_id)startMicLink(socket,session.session_id);
 return session;
}
async function lostConnection(event,epoch,context){
 if(epoch!==connectEpoch||state.reconnecting)return;
 state.ws=null;closeMicLink();
 window.sidevoiceTelemetry?.endCall?.('connection_lost');
 // The meter and the capture stay up on purpose: the microphone was never paused, and what it hears
 // while the socket is down is what the gap buffer keeps. Only the room's own transcription stops.
 window.roomTranscription?.stop();roomStore.patch({harness:{},turns:{}});
 cancelBrowserSpeech();state.userLive=state.botLive=false;state.pendingUserText='';state.pendingPhase='';markHistorySeen();
 if(event?.code===4401){pairingRefused(pairings.inUse,{call:true});return}
 if(!shouldReconnect(event)){disconnect();failJoin('La sala cerró la llamada. Vuelve a pulsar para entrar cuando esté disponible.');return}
 // A reconnection comes back to the machine this call was on — by whichever of its addresses answers.
 const node=state.node;
 state.reconnecting=true;
 // Heard, not only shown: a driver cannot see "Reconectando…" (2026-09-26).
 window.roomVoice?.signal?.('lost');
 armGapBuffer(captureRate);
 try{
  for(let attempt=0;;attempt++){
   joinStatus('reconnect',{detail:attempt?String(attempt+1):''});
   if(attempt)window.roomVoice?.signal?.('retry');
   await new Promise(resolve=>setTimeout(resolve,RECONNECT_DELAYS_MS[Math.min(attempt,RECONNECT_DELAYS_MS.length-1)]));
   if(epoch!==connectEpoch)return;
   await locate({move:true,fresh:attempt>0,hold:true});
   if(epoch!==connectEpoch)return;
   try{
    const session=await joinRoom(epoch,context);
    if(epoch!==connectEpoch||!session)return;
    await window.roomVoice.unlock();
    await refresh();await refreshPeople();
    // Once the room has said which conversation this browser is on, what it missed can go to it. It
    // arrives after any turn already finished here, which is the order the room delivers turns in.
    // Words said to one machine's conversation are never handed to another's.
    if(state.node===node)sendGapAudio(state.ws);
    window.roomVoice?.signal?.('back');
    // Time spent in a tunnel is not time spent away: the idle clock starts again with the call (#63).
    personSignal();
    setRoomError('');clearJoinStatus();
    return;
   }catch(e){if(epoch!==connectEpoch)return;state.ws=null;if(refusedForGood(e)){disconnect();failJoin(e.message||'La sala no deja entrar a este dispositivo.');return}}
  }
 }finally{state.reconnecting=false;disarmGapBuffer()}
}
/* ----- what the microphone kept hearing while the socket was down -----
 * The microphone is never paused, so while the call is reconnecting the page holds on to the PCM it
 * would have streamed and hands it to the new session as one catch-up turn. The buffer is bounded on
 * purpose: a room that never comes back must not grow this page's memory, so the oldest audio is
 * dropped and the bubble says so rather than the page quietly shortening what was said. */
const GAP_FRAME_MS=20,GAP_VOICE_PEAK=.02,GAP_MARGIN_MS=250,GAP_SLICE_SAMPLES=32768;
const gap={armed:false,rate:16000,chunks:[],samples:0,dropped:false,startedAt:0};
function armGapBuffer(rate){
 Object.assign(gap,{armed:true,rate:rate||16000,chunks:[],samples:0,dropped:false,startedAt:0});
 // What was being said when the socket went is the start of the gap, not something already delivered (#102).
 if(unconfirmed.samples){Object.assign(gap,{chunks:[...unconfirmed.chunks],samples:unconfirmed.samples,dropped:unconfirmed.dropped,startedAt:unconfirmed.startedAt})}
 forgetSpokenAudio();
}
/* ----- what was said and not yet confirmed (#102) -----
 * A room that restarts mid-sentence loses the turn it was holding: the audio lived in its memory only. So
 * the page keeps its own copy of what it streamed from the moment a turn opens until the room confirms
 * the message reached the conversation (delivered or read), or the turn ends with nothing to deliver. If
 * the socket goes first, that copy becomes the head of the gap and is sent again as one catch-up message,
 * joined to whatever was said while the room was away. Bounded like the gap. */
const unconfirmed={open:new Set(),chunks:[],samples:0,dropped:false,startedAt:0};
function holdSpokenAudio(data){
 if(!unconfirmed.open.size)return;
 const chunk=new Int16Array(data.slice?data.slice(0):data);if(!chunk.length)return;
 if(!unconfirmed.chunks.length)unconfirmed.startedAt=Date.now()-Math.round(chunk.length/(captureRate||16000)*1000);
 unconfirmed.chunks.push(chunk);unconfirmed.samples+=chunk.length;
 const limit=(captureRate||16000)*GAP_BUFFER_SECONDS;
 while(unconfirmed.samples>limit){const oldest=unconfirmed.chunks.shift();unconfirmed.samples-=oldest.length;unconfirmed.dropped=true;
  unconfirmed.startedAt+=Math.round(oldest.length/(captureRate||16000)*1000)}
}
function forgetSpokenAudio(){unconfirmed.open.clear();Object.assign(unconfirmed,{chunks:[],samples:0,dropped:false,startedAt:0})}
function openSpokenTurn(revision){unconfirmed.open.add(revision)}
function confirmSpokenTurn(revision){
 unconfirmed.open.delete(revision);
 if(!unconfirmed.open.size)Object.assign(unconfirmed,{chunks:[],samples:0,dropped:false,startedAt:0});
}
function disarmGapBuffer(){Object.assign(gap,{armed:false,chunks:[],samples:0,dropped:false,startedAt:0})}
function bufferGapAudio(data){
 if(!gap.armed)return;
 const chunk=new Int16Array(data);if(!chunk.length)return;
 const now=Date.now();
 if(!gap.chunks.length)gap.startedAt=now-Math.round(chunk.length/gap.rate*1000);
 gap.chunks.push(chunk);gap.samples+=chunk.length;
 const limit=gap.rate*GAP_BUFFER_SECONDS;
 while(gap.samples>limit){
  const oldest=gap.chunks.shift();gap.samples-=oldest.length;gap.dropped=true;
  gap.startedAt+=Math.round(oldest.length/gap.rate*1000);
 }
}
/* What of the gap is worth sending: the voiced span, with a margin so no word loses its edges.
 * Silence is not a message — a gap that only held room noise is sent as nothing at all. */
function gapSpeech(){
 if(!gap.samples)return null;
 const frame=Math.max(1,Math.round(gap.rate*GAP_FRAME_MS/1000)),pcm=new Int16Array(gap.samples);
 let offset=0;for(const chunk of gap.chunks){pcm.set(chunk,offset);offset+=chunk.length}
 let first=-1,last=-1;
 for(let start=0;start<pcm.length;start+=frame){
  let peak=0;for(let i=start;i<Math.min(start+frame,pcm.length);i++)peak=Math.max(peak,Math.abs(pcm[i])/32768);
  if(peak<GAP_VOICE_PEAK)continue;
  if(first<0)first=start;
  last=Math.min(start+frame,pcm.length);
 }
 if(first<0)return null;
 const margin=Math.round(gap.rate*GAP_MARGIN_MS/1000);
 const from=Math.max(0,first-margin),to=Math.min(pcm.length,last+margin);
 return {samples:pcm.subarray(from,to),
  // The oldest audio was already speech when it was dropped: how much came before is unknowable.
  truncated:gap.dropped&&first===0,
  startedAt:gap.startedAt+Math.round(from/gap.rate*1000)};
}
function base64Pcm(samples){
 const bytes=new Uint8Array(samples.buffer,samples.byteOffset,samples.byteLength);
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
 return btoa(binary);
}
/* One catch-up, in slices small enough that no frame limit between here and the room can drop it.
 * It goes as text and never as the binary microphone frames: this audio belongs to a session that
 * is gone, and the room must not be able to mistake it for someone speaking now. */
function sendGapAudio(socket){
 const speech=gapSpeech(),rate=gap.rate;
 disarmGapBuffer();
 if(!speech||!socket||socket.readyState!==WebSocket.OPEN||!state.sessionId)return 0;
 const total=Math.ceil(speech.samples.length/GAP_SLICE_SAMPLES)||1;
 for(let index=0;index<total;index++){
  const slice=speech.samples.subarray(index*GAP_SLICE_SAMPLES,(index+1)*GAP_SLICE_SAMPLES);
  socket.send(JSON.stringify({type:'voice-catchup',data:{session_id:state.sessionId,sample_rate:rate,seq:index,
   audio_base64:base64Pcm(slice),final:index===total-1,truncated:speech.truncated,started_at:speech.startedAt}}));
 }
 return total;
}
/* The voice pane's preview: a sample in one language, with the voice and speed the pane shows now (saved or not). */
function stopPreview(){return roomStore.batch(()=>stopPreviewJob())}
function stopPreviewJob(){const job=state.previewJob;state.previewJob=null;if(!job)return;job.controller.abort();if(job.browser)window.roomVoice?.cancel();$('preview-audio')?.pause();$('preview-audio')?.removeAttribute('src');if(job.url)URL.revokeObjectURL(job.url)}
function paneStage(task){return effectiveStage(stageContext(state),task,(state.stageDraft||state.voicePreferences||{})[task])}
async function previewVoice(language){
 if(state.previewJob){stopPreview();state.previewNote='Prueba detenida';return}
 if(state.botLive){state.previewNote='Espera a que termine la locución antes de probar una voz.';return}
 const stage=paneStage('tts');if(!stage)return;
 const ctx=stageContext(state),voice=voiceFor(ctx,stage,language),speed=stage.options.speed??1;
 const sample=state.voiceLanguages.find(item=>item.id===language)?.sample||'';
 const job={controller:new AbortController(),language,browser:true};state.previewJob=job;state.previewNote='Preparando muestra…';
 try{
  await window.roomVoice.unlock();if(state.previewJob!==job)return;
  if(stage.place!==DEVICE){const audio=await post('/api/presentation/synthesis/preview',{model:stage.model,voice,speed,text:sample});if(state.previewJob!==job)return;await window.roomVoice.playEncoded(audio,text=>{state.previewNote=text})}
  else{await measureDevice();if(state.previewJob!==job)return;await window.roomVoice.speak({...ttsRequest(stage),voice,speed,text:sample},text=>{state.previewNote=text})}
  if(state.previewJob===job){stopPreview();state.previewNote='Prueba terminada'}
 }catch(e){if(state.previewJob!==job)return;stopPreview();state.previewNote=e.name==='AbortError'?'Prueba detenida':e.message}
}
async function prepareVoice(){
 if(state.activeSpeech||state.previewJob){state.prepareNote='Espera a que termine la voz.';return}
 try{await window.roomVoice.unlock();await measureDevice();const request=ttsRequest(paneStage('tts'));if(!request)return;await window.roomVoice.prepare(request,text=>{state.prepareNote=text})}
 catch(e){state.prepareNote=e.message}
}
// The job identity belongs to the async adapter; the store holds its observable facts.
let speechJob=null;
function cancelBrowserSpeech(skip=false){
 if(!state.activeSpeech)return;
 const speech=state.activeSpeech;speechJob=null;
 roomStore.batch(()=>{
  // Cancel before publishing silence: the engine repairs the sink before the bed can resume.
  window.roomVoice?.cancel();clearKaraoke(speech);
  roomStore.patch({activeSpeech:null,botLive:false});
  state.history=state.history.map(r=>r.segment===speechSegment(speech)?{...r,interrupted:!!speech.started}:r);
 });
 save();
 post('/api/presentation/browser-receipt',{session_id:speech.session_id,revision:speech.revision,
  utterance_id:speech.utterance_id,status:skip?'skipped':speech.started?'cancelled_playing':'cancelled_unplayed'}).catch(()=>{});
}
// Skipping is this browser saying it does not want this reply spoken: it stops here, the room marks it
// done for this browser and plays whatever comes next — no turn, nothing sent to the conversation.
function skipReply(){cancelBrowserSpeech(true)}
async function replayReply(historyId){
 if(!historyId||!state.sessionId)return;
 try{await post('/api/presentation/replay',{session_id:state.sessionId,history_id:historyId})}
 catch(error){setRoomError(error.message||'No se pudo volver a reproducir.')}
}
// What this page played to the end, by the reply's row. A socket that dropped before the room heard the
// receipt makes the room offer it again on the way back; the page knows better, and says so (#59).
const playedToEnd=new Set();
async function receiveBrowserSpeech(d,cloud=false){
 const receivedAt=latencyNow();
 if(d.session_id!==state.sessionId)return;
 if(d.replay&&!d.requested&&d.history_id&&playedToEnd.has(d.history_id)){
  post('/api/presentation/browser-receipt',{session_id:d.session_id,revision:d.revision,utterance_id:d.utterance_id,status:'playback_finished'}).catch(()=>{});
  if(d.replay)markReplay(d.history_id,'done');
  return;
 }
 if(d.thread_id!==targetId())await refresh();
 if(d.session_id!==state.sessionId||d.thread_id!==targetId())return;
 if(d.revision<state.roomRevision){if(!d.replay)state.turns=recordReply(state,d);return}
 state.roomRevision=d.revision;
 roomStore.batch(()=>{
  stopPreview();cancelBrowserSpeech();speechJob=d;
  roomStore.patch({activeSpeech:{...d},turns:d.replay?state.turns:recordReply(state,d)});
  add('assistant',d.text,'voice:'+d.utterance_id,d.thread_id,{history_id:d.history_id,session:d.session_id,revision:d.revision});
 });
 const receipt=status=>post('/api/presentation/browser-receipt',{session_id:d.session_id,revision:d.revision,
  utterance_id:d.utterance_id,status,...(status==='playing'?{timings_ms:browserLatency(d,receivedAt)}:{})});
 const finish=()=>roomStore.batch(()=>{clearKaraoke(d);speechJob=null;roomStore.patch({activeSpeech:null,botLive:false})});
 try{
  await window.roomVoice[cloud?'playEncoded':'speak'](cloud?d:{...d,...ttsRequest(state.voicePreferences?.tts)},()=>{},()=>{
   if(speechJob!==d||d.session_id!==state.sessionId)return;
   roomStore.batch(()=>{roomStore.patch({activeSpeech:{...d,started:true},botLive:true});if(d.replay)markReplay(d.history_id,'playing')});
   receipt('playing').catch(()=>{});
  },range=>{if(speechJob===d)updateKaraoke(d,range)});
  if(speechJob!==d)return
  finish();
  if(d.history_id)playedToEnd.add(d.history_id);
  if(d.replay)markReplay(d.history_id,'done');
  await receipt('playback_finished');
 }catch(e){
  if(speechJob!==d)return
  finish();
  if(d.replay)markReplay(d.history_id,'cancelled');
  if(e.name!=='AbortError'){setRoomError((cloud?'Audio de ElevenLabs: ':'Voz de este dispositivo: ')+e.message);receipt('failed').catch(()=>{})}
 }
}
function receiveServerSpeech(d){return receiveBrowserSpeech(d,true)}

$('settings-open').onclick=async()=>{try{
 // A new opening is a new settings session: whatever the last one still has on its way is dropped.
 integrationEpoch++;forgetKeyChecks();
 // Voices, transcription and keys are a machine's; pairing one is not. With none connected the dialog still
 // opens — on Máquinas, the one pane that has something to do — instead of failing on a catalogue nobody serves.
 if(nodeBase==null){settingsSection('machines');$('settings-error').textContent=reachNote(state)||NO_MACHINE;if(!$('language-settings').open)$('language-settings').showModal();return}
 const p=await loadPreferences();window.roomI18n?.setLanguage(p.ui_language);
 roomStore.patch({voicePreferences:p,stageDraft:null,previewNote:'',prepareNote:''});
 for(const task of TASKS)selection.dismiss(task);
 for(const key of ['ui_language','audio_grace_seconds','replay_on_return_seconds'])$(key.replaceAll('_','-')).value=p[key];
 for(const key of MIC_KEYS)$(key.replaceAll('_','-')).value=p[key];
 $('presence-sound').value=(p.presence_sound??'on')==='off'?'off':'on';
 $('locked-call').value=p.locked_call==='off'?'off':'on';
 $('settings-error').textContent='';
 if(!$('language-settings').open)$('language-settings').showModal();
 // What the stages are chosen from: the machine's integrations and what this device can run. Each opening asks
 // again, so a provider's lists are the account's as it is now.
 await Promise.all([loadIntegrations(),measureDevice().catch(error=>{$('settings-error').textContent=error.message})]);
 loadStageLists(true);
}catch(e){$('settings-error').textContent=e.message;setRoomError(e.message)}};
function settingsSection(name){for(const section of ['general','voice','transcription','integrations','machines','advanced']){$('pane-'+section).hidden=section!==name;$('settings-'+section).setAttribute('aria-pressed',String(section===name))}if(name!=='integrations'&&state.integrationFocus)state.integrationFocus=null}
$('settings-advanced').onclick=()=>settingsSection('advanced');
$('settings-general').onclick=()=>settingsSection('general');
$('settings-machines').onclick=()=>settingsSection('machines');
$('ui-language').onchange=()=>window.roomI18n?.setLanguage($('ui-language').value);
$('settings-voice').onclick=()=>settingsSection('voice');
$('settings-transcription').onclick=()=>settingsSection('transcription');
$('settings-integrations').onclick=()=>settingsSection('integrations');
/* The stages (#124): what this device measured about itself, the resolver's offers for it, and the edits the
 * panes make. The panes read all of it from the store (stage-settings.js); nothing here renders. */
function nativeEngine(){return window.__sidevoiceDesktop?.host?.nativeEngine||null}
function engineRuns(id){return state.modelCatalog?.engines?.find(engine=>engine.id===id)?.runs||'page'}
// WebKit on the iPhone offers WebGPU and then fails to load Whisper on it: once that happened, this device is
// taken not to have WebGPU at all, so nothing that needs it is offered again (it was a setting of its own before).
const WEBGPU_FAILED_KEY='sidevoice.webgpu-failed';
function webgpuFailed(){try{return localStorage.getItem(WEBGPU_FAILED_KEY)==='1'}catch{return false}}
/* Whether a failed load says something about the GPU. A download that did not arrive, a network that dropped or
 * a load somebody cancelled says nothing about it, and must not hide the models that need it (review R11). */
function acceleratorFailure(error){
 if(error?.name==='AbortError')return false;
 return !/fetch|network|download|could not locate|unauthori[sz]ed|forbidden|http|status|\b[45]\d\d\b|load failed|timed? ?out|cancel|offline|quota/i.test(String(error?.message||error));
}
/* Asked from Avanzado: this device's GPU is tried again, and what needs it is offered again. */
async function retryGpu(){try{localStorage.removeItem(WEBGPU_FAILED_KEY)}catch{}await measureDevice(true).catch(()=>{})}
let measuring=null;
/* What this device can run. In the desktop app only what its native engine reports (D5: no page engine in the app,
 * and no "navegador"); in a page, what the page's own engines find. Once per page, unless asked afresh. */
function measureDevice(fresh=false){
 if(measuring&&!fresh)return measuring;
 measuring=(async()=>{
  const engine=nativeEngine();let capabilities,installed=[];
  if(engine){capabilities=await engine.capabilities();try{installed=await engine.installed()}catch{}}
  else{
   const found=await window.roomTranscription.capabilities(),gpu=!!found.webgpu&&!webgpuFailed();
   roomStore.patch({gpuSetAside:!!found.webgpu&&webgpuFailed(),
    pageFacts:{adapter:found.adapter||null,crossOriginIsolated:!!globalThis.crossOriginIsolated,threads:found.threads??null,cores:globalThis.navigator?.hardwareConcurrency||null}});
   capabilities={runs:'page',has:[...(gpu?['webgpu']:[]),...(gpu&&found.webgpuFp16?['webgpu-f16']:[]),...(found.wasm?['wasm']:[])]};
  }
  roomStore.patch({deviceCapabilities:capabilities,deviceOffers:resolveOffers(state.modelCatalog,capabilities,'device'),installedBuilds:Array.isArray(installed)?installed:[]});
  return state.deviceOffers;
 })();
 measuring.catch(()=>{measuring=null});
 return measuring;
}
/** The build a device stage runs on, as the engines are asked for it. */
function buildRequest(build){
 if(!build)return build;
 // A page voice on WebGPU may try WASM when WebGPU fails to load it, if this device offers that build too.
 const offer=state.deviceOffers?.find(item=>item.model===build.model);
 const wasm=build.accelerator==='webgpu'&&[offer,...(offer?.alternatives||[])].some(choice=>choice?.engine===build.engine&&choice.accelerator==='wasm');
 return {...build,native:engineRuns(build.engine)==='native',...(wasm?{fallback:'wasm'}:{})};
}
function ttsRequest(stage){return buildRequest(deviceBuild(state.deviceOffers,stage)||deviceBuild(state.deviceOffers,defaultStage(stageContext(state),'tts')))}
function editStage(task,next){roomStore.patch({stageDraft:{...(state.stageDraft||{stt:state.voicePreferences?.stt,tts:state.voicePreferences?.tts}),[task]:next}})}
/* A place, a model or a build chosen in a pane is a selection: checked before it takes effect (below). A provider's
 * place waits for that account's lists, so there is a model to check; one that still lacks a model or a voice stays
 * a draft, which "Guardar cambios" refuses until it is complete. Options are not checked: they are the draft it saves. */
async function chooseStagePlace(task,place){
 if(place!==DEVICE)await loadRemote(place,task);
 const ctx=stageContext(state),next=withPlace(ctx,task,paneStage(task),place,state.voicePreferences?.[task]);
 if(next&&place!==DEVICE&&stageProblem(ctx,task,withVoicesChosen(ctx,next))){editStage(task,next);return}
 selectStage(task,next);
}
function chooseStageModel(task,model){selectStage(task,withModel(stageContext(state),task,paneStage(task),model))}
function setStageOption(task,id,value,language){editStage(task,withOption(stageContext(state),task,paneStage(task),id,value,language))}
function chooseStageBuild(task,value){selectStage(task,withBuild(stageContext(state),task,paneStage(task),value))}
/* Select = load and verify (#124 §6, D11–D12). A model chosen in a pane is checked first — on this device in a worker
 * of its own (load-and-verify.js), so the one in use goes on working; at a provider by the machine with its key —
 * and only a passed check puts it in effect: stored, swapped in for the model in use (in a call too, without ending
 * it) and only then the previous one let go. A failure, a cancel or "elegir otro" leave everything as it was.
 * stage-selection.js is the state machine; what each of its steps does on this page is here. */
function activeStage(task){return effectiveStage(stageContext(state),task,state.voicePreferences?.[task])}
function sameChoice(a,b){return !!a&&!!b&&a.place===b.place&&a.model===b.model&&JSON.stringify(a.build||null)===JSON.stringify(b.build||null)}
function selectStage(task,next){
 if(!next)return;
 // What is already in use is not selected again: an option changed with it is the draft's.
 if(sameChoice(next,activeStage(task))){selection.cancel(task);editStage(task,next);return}
 void selection.select(task,next);
}
/** The build a device stage is checked on, as the engines are asked for it. */
function deviceRequest(stage){return buildRequest(deviceBuild(state.deviceOffers,stage))}
/** Whether a build is what a stage in use runs (the other stage, or this one after a swap): never unloaded then. */
function inUse(build){return TASKS.some(task=>{const used=deviceRequest(activeStage(task));return used&&used.model===build.model&&used.engine===build.engine})}
/** The language a stage is checked in: a transcription's own when it has one, the person's speech language else. */
function checkLanguage(task,stage){const own=task==='stt'?stage.options?.language:null;return own&&own!=='auto'?own:state.speechLanguage}
/** What a native build downloads the first time: its files, and its engine's package unless that is already here. */
function nativeSize(build){
 const catalog=state.modelCatalog,capabilities=state.deviceCapabilities||{};
 const files=catalog?.models?.find(model=>model.id===build.model)?.builds?.find(item=>item.engine===build.engine)?.download?.size||0;
 const engine=catalog?.engines?.find(item=>item.id===build.engine);
 const pkg=(engine?.packages||[]).find(item=>item.os===capabilities.os&&(item.arch===undefined||item.arch===capabilities.arch));
 const engineHere=pkg?.bundled||(state.installedBuilds||[]).some(item=>item.engine===build.engine);
 return files+(engineHere?0:pkg?.download?.size||0);
}
/* Step 1: a model not on this device yet is downloaded only with the person's consent, its size in view. */
async function consentFor(task,stage){
 if(stage.place!==DEVICE)return null;
 const build=deviceRequest(stage);if(!build)return null;
 if(build.native)return (state.installedBuilds||[]).some(item=>item.model===build.model&&item.engine===build.engine)?null:{size:nativeSize(build)};
 return await pageCached(build.model,build.accelerator)?null:{size:pageSize(build.model,build.accelerator)};
}
async function fetchCheckClip(url){
 const answer=await fetch(url+'?v='+encodeURIComponent(globalThis.sidevoiceBuildId||'dev'));
 if(!answer.ok)throw Error('The check clip is missing ('+answer.status+').');
 return answer.arrayBuffer();
}
/* Steps 2–5: download, load and check, here or at the provider; what was measured is kept for Diagnóstico. */
async function verifyStage(task,stage,{signal,onProgress}){
 const language=checkLanguage(task,stage);
 if(stage.place!==DEVICE){
  const checked=withVoicesChosen(stageContext(state),stage);
  const result=await verifyProvider({task,stage:checked,language,request,signal});
  if(!result.cancelled)await recordDiagnostics(task,stage,result,null);
  return result;
 }
 await measureDevice();
 const build=deviceRequest(stage);
 if(!build)return {ok:false,step:'load',reason:{key:'build_unfit',message:stage.model+' does not run on this device.'},passes:[]};
 const run=async chosen=>verifyDevice({task,build:chosen,language,signal,onProgress,
  voice:task==='tts'?voiceFor(stageContext(state),stage,languageFor('tts',language)):undefined,speed:stage.options?.speed??1,
  download:!(chosen.native?(state.installedBuilds||[]).some(item=>item.model===chosen.model&&item.engine===chosen.engine):await pageCached(chosen.model,chosen.accelerator)),
  expected:chosen.native?nativeSize(chosen):pageSize(chosen.model,chosen.accelerator),fetchClip:fetchCheckClip,
  open:native=>task==='stt'?window.roomTranscription.candidate(native):window.roomVoice.candidate(native)});
 let used=build,result=await run(build);
 // WebKit on the iPhone offers WebGPU and then fails to load models on it. With the build left automatic, the same
 // engine is tried on WASM, and this device stops offering WebGPU (a voice's worker does this on its own).
 const wasm=build.accelerator==='webgpu'&&!stage.build&&taskOffers(state.deviceOffers,task).find(offer=>offer.model===build.model);
 if(!result.ok&&!result.cancelled&&result.step==='load'&&task==='stt'&&wasm&&[wasm,...wasm.alternatives].some(choice=>choice.engine===build.engine&&choice.accelerator==='wasm')&&acceleratorFailure(result.reason?.detail||result.reason?.message)){
  try{localStorage.setItem(WEBGPU_FAILED_KEY,'1')}catch{}
  void measureDevice(true).catch(()=>{});
  used={...build,accelerator:'wasm'};result=await run(used);
 }
 if(!result.cancelled)await recordDiagnostics(task,stage,result,used);
 return {...result,build:used,native:used.native};
}
async function recordDiagnostics(task,stage,result,build){
 let memory=null;
 if(build?.native){try{memory=await nativeEngine()?.memory?.()||null}catch{}}
 else if(build&&globalThis.navigator?.deviceMemory)memory={device_gb:globalThis.navigator.deviceMemory};
 roomStore.patch({stageDiagnostics:{...state.stageDiagnostics,[task]:{at:Date.now(),stage,ok:!!result.ok,step:result.step,reason:result.reason||null,
  build:build&&{engine:build.engine,accelerator:result.runtime?.accelerator||build.accelerator},load_ms:result.load_ms??null,passes:result.passes||[],memory,language:result.language||null}}});
}
/* Step 6 and the swap: the checked model is stored and put in place of the one in use — the call goes on — and only
 * then is the previous one let go (a page's went with its worker; the app's is unloaded unless still in use). */
async function activateStage(task,stage,result){
 const previous=state.voicePreferences||devicePreferences(),ctx=stageContext(state);
 const saved=withVoicesChosen(ctx,stage),next={...previous,[task]:saved};
 const before=previous?.[task]?deviceRequest(effectiveStage(ctx,task,previous[task])):null;
 if(result.worker){
  if(task==='stt')window.roomTranscription.adopt(result.worker,result.runtime,result.native);
  else window.roomVoice.adopt(result.worker,{native:result.native,model:result.build.model,accelerator:result.build.accelerator});
 }
 storePreferences(next);
 // The pane keeps showing what the person chose (a provider's "Automática" voice too); what is stored names it.
 roomStore.patch({voicePreferences:next,stageDraft:{...(state.stageDraft||{stt:previous?.stt,tts:previous?.tts}),[task]:stage}});
 if(state.ws&&state.ws.readyState===WebSocket.OPEN&&state.sessionId)state.ws.send(JSON.stringify({type:'voice-settings',data:{session_id:state.sessionId,settings:next}}));
 if(task==='stt'){
  try{if(await applyTranscriptionSettings(previous,next))state.liveNote='Transcripción cambiada sin salir de la llamada'}
  catch(error){setRoomError(error.message)}
 }
 if(before?.native&&!inUse(before))nativeEngine()?.unload(before.model,before.engine).catch(()=>{});
}
/* A candidate that does not take effect is let go: its worker, and in the app the model it loaded, unless in use. */
function discardCandidate(task,stage,result){
 result?.worker?.terminate();
 const build=result?.build;
 if(build?.native&&result.loaded&&!inUse(build))nativeEngine()?.unload(build.model,build.engine).catch(()=>{});
}
/* Diagnóstico's copy (#90, #123): its rows as text, in the page's language, with the build and the browser. */
async function copyDiagnostics(task){
 const view=roomStore.getState().stages?.[task]?.diagnostics;if(!view)return false;
 const text=diagnosticsText(task,view,[{label:'Compilación',value:globalThis.sidevoiceBuildId||'dev'},{label:'User agent',value:navigator.userAgent}],value=>window.roomI18n?.translate?.(value)??value);
 try{await navigator.clipboard.writeText(text);return true}catch{return false}
}
/* A provider's own lists — OpenAI's transcription models, ElevenLabs' models and the account's voices — asked for
 * only when a stage is on that provider, and only of the machine they were asked of (see integrationScope). */
function patchRemote(key,entry){roomStore.patch({remoteModels:{...state.remoteModels,[key]:entry}})}
async function loadRemote(place,task,refresh=false){
 const key=place+':'+task,scope=integrationScope();
 if(!refresh&&state.remoteModels[key]?.models)return;
 if(keyedProvider(state,place)!=='ready')return;
 patchRemote(key,{});
 try{
  let entry;
  // A read that failed is not an empty account: it leaves the lists unknown, so nothing chosen is replaced (R05).
  if(task==='stt'){const data=await api('/api/presentation/transcription/models?provider='+encodeURIComponent(place));entry=data.error?{error:data.error}:{models:Array.isArray(data.models)?data.models:[],error:''}}
  else{const data=await api('/api/presentation/voice-catalog'),own=data.providers?.[place]||{};entry=own.error?{error:own.error}:{models:own.models||[],voices:own.voices||[],error:''}}
  if(sameScope(scope))patchRemote(key,entry);
 }catch(error){if(sameScope(scope))patchRemote(key,{error:error.message||'No se pudo cargar el catálogo.'})}
}
function loadStageLists(refresh=false){for(const task of TASKS){const stage=paneStage(task);if(stage&&stage.place!==DEVICE)void loadRemote(stage.place,task,refresh)}}
/* Integrations (#64): the machine's key for each provider, one per provider whatever it is used for, written from
 * any paired device — each has the machine's full authority — and never read back. The machine lists them with what can be said about a key —
 * whether there is one, where from, its last four — and that listing is the one fact the panes derive from:
 * a provider that needs a key is offered, or greyed out with Configurar, as it says.
 *
 * A key checks itself where it is typed: leaving the field, a pause while typing, or Enter sends it, and the
 * machine stores only a key its provider accepted. What that provider offers is asked for right away and fills
 * the other panes in place (#72). A key the provider refuses changes nothing: the one installed keeps working,
 * and the line under the field says so. Removing a key is the ✕ in the field, and acts at once.
 *
 * Everything here belongs to one machine and one opening of the settings (integrationScope): a key typed for one
 * machine is never sent to another, and an answer from a machine this device has left is dropped (review F13).
 * The checks and removals of one provider run one after another, so a removal is never undone by a check still
 * in flight from this page; the machine itself refuses a check that a later removal superseded (F16). */
const KEY_CHECK_PAUSE=1500;
let keyChecks={};   // provider -> the plumbing of its check in this scope; what its row says is the store's
let integrationEpoch=0;
function integrationScope(){return {host:pairings.inUse,epoch:integrationEpoch}}
function sameScope(scope){return scope.host===pairings.inUse&&scope.epoch===integrationEpoch}
/* Another machine, or none: its listing, its keys being typed and every answer still on its way are forgotten,
 * and the stages are that machine's own (D7: a composition per client × host), switched in the same step. */
function switchStages(){
 resetIntegrations();
 for(const task of TASKS)selection.cancel(task);
 const {stt:_stt,tts:_tts,...rest}=state.voicePreferences||{};
 roomStore.patch({stageDraft:null,voicePreferences:state.voicePreferences&&{...rest,...storedStages(pairings.inUse)}});
}
function resetIntegrations(){
 integrationEpoch++;
 for(const check of Object.values(keyChecks))clearTimeout(check.timer);
 keyChecks={};
 roomStore.patch({integrations:null,integrationsStatus:'idle',integrationsError:'',integrationDrafts:{},integrationChecks:{},integrationFocus:null,remoteModels:{}});
}
function keyCheck(id){return keyChecks[id]||(keyChecks[id]={timer:null,chain:Promise.resolve(),sent:null})}
function integrationRow(id){return state.integrations?.providers?.find(row=>row.id===id)}
function keyNote(id,note,status){
 const checks={...state.integrationChecks};
 if(note)checks[id]={note,status};else delete checks[id];
 state.integrationChecks=checks;
}
function keyDraft(id,value){state.integrationDrafts={...state.integrationDrafts,[id]:value}}
function forgetKeyCheck(id){const check=keyCheck(id);clearTimeout(check.timer);Object.assign(check,{timer:null,sent:null});keyNote(id,'')}
function forgetKeyChecks(){roomStore.batch(()=>{for(const id of Object.keys(keyChecks))forgetKeyCheck(id);state.integrationDrafts={}})}
/* The listing of the machine in use. Not reading it is not a listing without providers: the panes keep the
 * choice they have and wait for it, with a way to ask again (F18). */
async function loadIntegrations(){
 const scope=integrationScope();
 roomStore.patch({integrationsStatus:'loading',integrationsError:''});
 try{const listing=await api('/api/presentation/integrations');if(sameScope(scope))roomStore.patch({integrations:listing,integrationsStatus:'ready'})}
 catch(error){if(sameScope(scope))roomStore.patch({integrationsStatus:'failed',integrationsError:'No se pudieron leer las integraciones de esta máquina: '+error.message})}
}
async function retryIntegrations(){await loadIntegrations();if(state.integrationsStatus==='ready')loadStageLists(true)}
/* One provider's key work, in order: a check, a removal, the next check. */
function queueKey(id,work){const check=keyCheck(id),run=check.chain.then(work,work);check.chain=run.catch(()=>{});return run}
function typeIntegrationKey(id,value){
 const check=keyCheck(id),scope=integrationScope();clearTimeout(check.timer);check.timer=null;
 keyDraft(id,value);
 if(String(value||'').trim()){check.timer=setTimeout(()=>{if(sameScope(scope))void checkIntegrationKey(id)},KEY_CHECK_PAUSE);return}
 // Emptying the field takes the complaint about what was in it away with it.
 check.sent=null;keyNote(id,'');
}
function checkIntegrationKey(id){
 const check=keyCheck(id),scope=integrationScope();
 clearTimeout(check.timer);check.timer=null;
 return queueKey(id,async()=>{
  if(!sameScope(scope))return;
  const key=String(state.integrationDrafts[id]||'').trim();
  if(!key||key===check.sent)return;
  check.sent=key;keyNote(id,'Comprobando la clave…','checking');
  await verifyIntegrationKey(id,key,scope);
 });
}
async function verifyIntegrationKey(id,key,scope){
 let listing;
 // The scope is checked right before the request, which reads the machine in use when it is made: a key
 // typed for one machine never leaves for another.
 if(!sameScope(scope))return;
 try{listing=await post('/api/presentation/integrations/'+encodeURIComponent(id),{key},'PUT')}
 catch(error){
  if(!sameScope(scope))return;
  // Nothing was stored, so the field keeps what was typed: a key with one wrong character is corrected, not retyped.
  keyNote(id,'Clave rechazada · '+error.message+' · '+(integrationRow(id)?.configured?'La clave anterior sigue en uso':'No hay ninguna clave guardada'),'refused');
  return;
 }
 if(!sameScope(scope))return;
 // A stored key leaves the field — unless the person already typed something else in it.
 roomStore.batch(()=>{state.integrations=listing;if(String(state.integrationDrafts[id]||'').trim()===key)keyDraft(id,'')});
 const news=await followIntegration(id,scope);
 // Its lists took a while: a note about this machine is not put on the next one's row (review R04).
 if(sameScope(scope))keyNote(id,'Clave verificada · '+news,'verified');
}
function clearIntegrationKey(id){
 const scope=integrationScope(),check=keyCheck(id);
 // What was typed goes with the key: a later blur or save must not install it again.
 clearTimeout(check.timer);check.timer=null;check.sent=null;keyNote(id,'');keyDraft(id,'');$('settings-error').textContent='';
 return queueKey(id,async()=>{
  if(!sameScope(scope))return;
  let listing;
  try{listing=await api('/api/presentation/integrations/'+encodeURIComponent(id),{method:'DELETE'})}
  catch(e){if(sameScope(scope))$('settings-error').textContent=e.message;return}
  if(!sameScope(scope))return;
  state.integrations=listing;
  await followIntegration(id,scope);
 });
}
/* What a changed key changes elsewhere: each list its provider serves a stage with is asked for again, and says
 * what it brought. The places themselves follow the listing on their own (stage-settings.js). */
async function followIntegration(id,scope){
 const news=[],provider=(state.modelCatalog?.providers||[]).find(item=>item.id===id);
 for(const task of provider?.tasks||[]){
  const key=id+':'+task;
  if(!integrationRow(id)?.configured){const {[key]:_,...rest}=state.remoteModels;roomStore.patch({remoteModels:rest});continue}
  await loadRemote(id,task,true);
  if(!sameScope(scope))return '';
  news.push(state.remoteModels[key]?.error||(task==='tts'?'Voces actualizadas':'Modelos actualizados'));
 }
 return news.join(' · ')||'Guardada en la máquina';
}
/* Saving carries no key — a verified one is already stored — so the form only waits for a check still in
 * flight, and refuses to close over a key the provider rejected while it is still in the field. Only what was
 * typed is a draft: text the browser filled in on its own (a saved password on the iPhone) never reached one,
 * and is not a key anyone asked to install. */
async function settleIntegrationKeys(){
 for(const id of Object.keys(state.integrationDrafts)){
  await checkIntegrationKey(id);
  const said=state.integrationChecks[id];
  if(said?.status==='refused'&&String(state.integrationDrafts[id]||'').trim())throw Error(said.note);
 }
}
function openIntegration(id){settingsSection('integrations');state.integrationFocus=id}
$('reset-settings').onclick=async()=>{try{localStorage.removeItem(SETTINGS_KEY);localStorage.removeItem(STAGES_KEY);localStorage.removeItem(WEBGPU_FAILED_KEY)}catch{}await measureDevice(true).catch(()=>{});await $('settings-open').onclick();$('reset-settings-note').textContent='Restablecido a los valores por defecto. Guarda para aplicarlo; la llamada en curso no se interrumpe.'};
$('settings-close').onclick=()=>{stopPreview();$('language-settings').close()};$('language-settings').addEventListener('close',stopPreview);
// What this device may set. The detector's tuning is the room's: one place to fix it for everyone.
// The only thing a device says about turn detection. The seconds behind each word are the room's, in one
// place for everyone: a device that had saved the old numbers kept them after the room changed its mind,
// and the fix never reached the person it was written for (2026-09-20).
const MIC_KEYS=['turn_patience'];
// Every setting belongs to this device. The room answers with its defaults and keeps no copy; what this browser saved wins.
// Between the two, what depends on the person's language comes from their system (system-language.js), and the
// stages from what this device can run (stage-settings.js). Only the settings of today's shape are read back:
// anything else a browser kept from before is dropped, not translated (greenfield, review F11).
// The stages are kept per machine, by its pairing's fingerprint: what this device does with one machine — its
// provider, that account's voices — is not what it does with another (D7, review R04). The rest is the device's.
const SETTINGS_KEY='sidevoice.settings',STAGES_KEY='sidevoice.stages';
const DEVICE_KEYS=['ui_language','audio_grace_seconds','replay_on_return_seconds','presence_sound','locked_call',...MIC_KEYS];
function readStored(key){try{const stored=JSON.parse(localStorage.getItem(key)||'null');return stored&&typeof stored==='object'?stored:{}}catch{return {}}}
function storedStages(fp){const stages=fp?readStored(STAGES_KEY)[fp]:null;return Object.fromEntries(TASKS.filter(task=>stages?.[task]).map(task=>[task,stages[task]]))}
function storedPreferences(){const stored=readStored(SETTINGS_KEY);return {...Object.fromEntries(DEVICE_KEYS.filter(key=>key in stored).map(key=>[key,stored[key]])),...storedStages(pairings.inUse)}}
function storePreferences(p,fp=pairings.inUse){try{
 localStorage.setItem(SETTINGS_KEY,JSON.stringify(Object.fromEntries(DEVICE_KEYS.filter(key=>key in p).map(key=>[key,p[key]]))));
 if(fp)localStorage.setItem(STAGES_KEY,JSON.stringify({...readStored(STAGES_KEY),[fp]:Object.fromEntries(TASKS.filter(task=>p[task]).map(task=>[task,p[task]]))}));
}catch{}}
function devicePreferences(){return {...systemPreferences(),...storedPreferences()}}
// The room's stage defaults are not this device's: it cannot know what this device runs, so they are left out.
async function loadPreferences(){const {stt:_stt,tts:_tts,...defaults}=await api('/api/presentation/languages');return {...defaults,...devicePreferences()}}
/* The preferences a call is made with: both stages resolved against what this device can run now. */
async function callPreferences(){
 const p=await loadPreferences();
 await measureDevice().catch(()=>{});
 const ctx=stageContext(state),stages={stt:effectiveStage(ctx,'stt',p.stt),tts:effectiveStage(ctx,'tts',p.tts)};
 // A call is only built from stages that can run: this device's, or a provider with its model (and voice). One
 // that cannot is a configuration to finish, said as such — never a stage made up for it (review R06).
 const problem=TASKS.map(task=>stageProblem(ctx,task,stages[task])).find(Boolean);
 if(problem)throw Error(problem+' Configúralo en Configuración.');
 return {...p,...stages};
}
// WebKit on the iPhone offers WebGPU and then fails while loading Whisper on it. A failed GPU load falls back to
// CPU for this call and is remembered for this device, so 'automatic' starts on CPU next time; choosing GPU explicitly still tries it.
// What this call is actually using, said small next to the controls: engine, model and processor, plus how the turn ends.


// What the output reports moves the mark: a stall is 'recovering' until something plays through; a refusal or a failure stays until the next playout succeeds.
function noteOutputHealth(kind){
 const next=kind==='stall'?'recovering':['fail','attach-refused','resume-refused','element-refused','unlock-refused','chime-failed'].includes(kind)?'failed':['complete','play-encoded'].includes(kind)?'ok':null;
 if(next&&next!==state.outputHealth){state.outputHealth=next}
}
window.addEventListener('voice-output',event=>noteOutputHealth(event.detail?.kind));
function modelLabel(id){return state.modelCatalog?.models?.find(model=>model.id===id)?.label||id}
/* A device stage's transcription model, on its build. WebGPU that fails to load it (the iPhone) falls back to the
 * same engine on WASM when this device has it, and this device stops offering WebGPU from then on. */
async function prepareLocalWhisper(build){
 try{return await window.roomTranscription.prepare(buildRequest(build))}
 catch(error){
  const offer=state.deviceOffers?.find(item=>item.model===build.model);
  const fallback=build.accelerator==='webgpu'&&[offer,...(offer?.alternatives||[])].find(choice=>choice?.engine===build.engine&&choice.accelerator==='wasm');
  if(!fallback)throw error;
  state.liveNote='La GPU no pudo cargar '+modelLabel(build.model)+'; este dispositivo usa la CPU';
  if(acceleratorFailure(error)){try{localStorage.setItem(WEBGPU_FAILED_KEY,'1')}catch{}void measureDevice(true).catch(()=>{})}
  const runtime=await window.roomTranscription.prepare(buildRequest({...build,accelerator:'wasm'}));
  return {...runtime,fallback_from:'webgpu',fallback_error:String(error?.message||error).slice(0,300)};
 }
}
// What this device runs before it can transcribe itself: the model it saved on its build, or the best one it can
// actually load, with the GPU→CPU fallback and the preparation indicator behind it.
async function prepareTranscription(preferences){
 if(preferences?.stt?.place!==DEVICE)return {browserStt:false,sttRuntime:null};
 await measureDevice();
 let build=deviceBuild(state.deviceOffers,preferences.stt);
 if(!build){
  const first=taskOffers(state.deviceOffers,'stt')[0];
  if(!first)throw Error('Este dispositivo no puede transcribir; elige un proveedor en Configuración.');
  state.liveNote='Este dispositivo no puede con el modelo guardado; se usa '+modelLabel(first.model);
  build={model:first.model,engine:first.engine,accelerator:first.accelerator};
 }
 return {browserStt:true,sttRuntime:await prepareLocalWhisper(build)};
}
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function micSettingsChanged(previous,next){return MIC_KEYS.some(key=>String(previous?.[key]??'')!==String(next?.[key]??''))}
function sttSettingsChanged(previous,next){return !same(previous?.stt,next?.stt)}
// The room builds its pipeline once per socket, out of the hello: who transcribes, in which language and with what
// context, and how this device's turns are detected, are fixed for that call. The model this device runs itself is
// not one of them — the room never runs it — unless a provider is the one being asked.
function pipelineSettingsChanged(previous,next){
 return micSettingsChanged(previous,next)
  ||previous?.stt?.place!==next?.stt?.place||!same(previous?.stt?.options,next?.stt?.options)
  ||(next?.stt?.place!==DEVICE&&previous?.stt?.model!==next?.stt?.model);
}
// Only the model this device itself runs changed: the room's pipeline stays as it is.
function localModelSwap(previous,next){return !!state.ws&&next?.stt?.place===DEVICE&&!pipelineSettingsChanged(previous,next)&&sttSettingsChanged(previous,next)}
/* Changing the pipeline used to hang up, and a hang-up in the middle of a conversation is not a
 * setting taking effect. The page opens a second socket instead: whatever has to load (a local
 * Whisper model, its GPU→CPU fallback) loads while the call goes on over the socket it already has,
 * the new session only replaces the old one once the room has answered it, and a refusal leaves the
 * call exactly as it was — with the room's own reason for it said out loud. */
async function switchSession(previous,next){
 if(!state.ws)return false;
 // The last save wins: a swap still in flight is abandoned, never queued behind this one.
 if(state.switchingSession)abortSwitch();
 const epoch=connectEpoch,attempt=++switchEpoch;
 const step=sttSettingsChanged(previous,next)?'transcription':'mic';
 const stale=()=>epoch!==connectEpoch||attempt!==switchEpoch;
 state.switchingSession=true;joinStatus(step);
 // The two things that can fail here fail differently: a model this device cannot load, and a room
 // that refuses the new session. Each one is told the way joining already tells it.
 let phase='whisper';
 try{
  const context=await prepareTranscription(next);
  if(stale())return false;
  phase='room';joinStatus(step);
  const session=await joinRoom(epoch,{...context,keepCurrent:true});
  if(stale()||!session)return false;
  await window.roomVoice?.unlock();
  roomStore.patch({engineReady:true,enginePreferences:next,voicePreferences:next,sttRuntime:context.sttRuntime});showEchoCover();
  await refresh();await refreshPeople();
  setRoomError('');clearJoinStatus();
  return true;
 }catch(error){
  if(stale())return false;
  // Nothing was swapped: `ws` is still the socket the call was already on.
  showPreparation({phase:'hidden'});
  failJoin('No se pudo aplicar el cambio: '+joinFailureText(phase,error)+' La llamada sigue con los ajustes anteriores.');

  return false;
 }finally{if(attempt===switchEpoch)state.switchingSession=false}
}
// Cancelling the preparation abandons the swap, not the call: the old session was never touched.
function abortSwitch(){
 if(!state.switchingSession)return;
 ++switchEpoch;state.switchingSession=false;
 const opening=openingSocket;openingSocket=null;opening?.close();
 showPreparation({phase:'hidden'});clearJoinStatus();
}
async function applyTranscriptionSettings(previous,next){
 if(!state.ws)return false;
 if(pipelineSettingsChanged(previous,next))return await switchSession(previous,next)&&'switched';
 if(!localModelSwap(previous,next))return false;
 const socket=state.ws,epoch=connectEpoch;state.switchingTranscription=true;
 window.roomTranscription.stop({cancelTurn:true});
 try{
  const {sttRuntime:runtime}=await prepareTranscription(next);
  if(state.ws!==socket||connectEpoch!==epoch)return false;
  socket.send(JSON.stringify({type:'voice-stt-ready',data:{session_id:state.sessionId,...runtime}}));roomStore.patch({engineReady:true,enginePreferences:next,voicePreferences:next,sttRuntime:runtime});
  window.roomTranscription.start({socket,language:next.stt.options?.language});
  return 'local';
 }finally{state.switchingTranscription=false}
}
async function saveSettings(){
 const scope=integrationScope();
 try{await settleIntegrationKeys()}catch(error){$('settings-error').textContent=error.message;return}
 // The machine changed while a key was being settled: what the panes show is now the other machine's.
 if(!sameScope(scope)){$('settings-error').textContent='Cambiaste de máquina: revisa la configuración y vuelve a guardar.';return}
 const previous=state.voicePreferences,ctx=stageContext(state),draft=state.stageDraft||previous||{},p={...previous};
 // The stages as the panes show them: a choice that waits for the machine's listing is saved as it was (F18), a
 // provider's "Automática" voice as the voice it names (R02), and one that cannot run is not saved at all.
 for(const task of TASKS)p[task]=withVoicesChosen(ctx,effectiveStage(ctx,task,draft[task]));
 // Before this device has measured itself it cannot say what it runs: the saved stages stay as they were.
 if(state.deviceOffers===null)for(const task of TASKS)if(!p[task])p[task]=previous?.[task];
 const problem=TASKS.map(task=>stageProblem(ctx,task,p[task])).find(Boolean);
 if(problem){$('settings-error').textContent=problem;return}
 // A control the person never saw is not a decision they made: a field with nothing in it keeps what was saved
 // before instead of writing an empty string (2026-09-20).
 const field=key=>{const node=$(key.replaceAll('_','-'));const raw=node?node.value:'';return raw===''||raw==null?previous?.[key]:raw};
 for(const key of ['ui_language','audio_grace_seconds','presence_sound','locked_call','replay_on_return_seconds',...MIC_KEYS]){const value=field(key);p[key]=['audio_grace_seconds','replay_on_return_seconds'].includes(key)?Number(value):value}
 let hotSwap=false;
 try{
  storePreferences(p,scope.host);
  if(state.ws&&state.ws.readyState===WebSocket.OPEN&&state.sessionId)state.ws.send(JSON.stringify({type:'voice-settings',data:{session_id:state.sessionId,settings:p}}));
  hotSwap=localModelSwap(previous,p);roomStore.patch({voicePreferences:p,stageDraft:null});applyLockedCall();window.roomI18n?.setLanguage(p.ui_language);stopPreview();$('language-settings').close();
  const applied=await applyTranscriptionSettings(previous,p);
  state.liveNote=applied==='switched'?'Preferencias guardadas · '+(sttSettingsChanged(previous,p)?'Transcripción cambiada':'Micrófono aplicado')+' sin salir de la llamada':applied?'Preferencias guardadas · Transcripción actualizada':'Preferencias guardadas';
 }catch(e){if(hotSwap)disconnect();if(hotSwap)setRoomError(e.message);else $("settings-error").textContent=e.message}
}
// Whatever goes wrong while reading the form is said where the person is looking, and nothing is half-saved.
// A form the settings never filled — no machine served its catalogues — is not saved over this device's settings.
$('language-form').onsubmit=async e=>{e.preventDefault();if(nodeBase==null){$('settings-error').textContent=reachNote(state)||NO_MACHINE;return}try{await saveSettings()}catch(error){$('settings-error').textContent=error?.message||String(error)}};
window.sidevoiceActions={
 cancelInput:cancelCurrentInput,
 skipReply:async()=>skipReply(),
 replayReply,
 toggleMic,
 toggleCall,
 selectAudioDevice,
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
 chooseStagePlace,
 chooseStageModel,
 setStageOption,
 chooseStageBuild,
 decideStage:(task,yes)=>selection.decide(task,yes),
 cancelStage:task=>selection.cancel(task),
 recheckStage:task=>{const stage=activeStage(task);if(stage)void selection.select(task,stage,{recheck:true})},
 copyDiagnostics,
 previewVoice,
 prepareVoice,
 retryIntegrations,
 retryGpu,
 typeIntegrationKey,
 checkIntegrationKey,
 clearIntegrationKey,
 openIntegration,
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
 openPairing:()=>openPairing(),
 closePairing,
};
// ----- the call with the screen locked (#59) -----
// On unless this device turned it off: the page keeps sounding when locked, and a faint floor keeps iOS from
// freezing it while nobody speaks (measured on an iPhone, 2026-09-26). The lock-screen tile and the
// headphones' button (#97) are not wired yet: the platform's rules for them are still being measured.
function applyLockedCall(){
 const on=state.voicePreferences?.locked_call!=='off'&&!!(state.ws||state.connecting);
 window.roomVoice?.keepPlayingWhileHidden?.(on);
 applyLockScreen(on);
}
// ----- the lock screen and the headphones' button (#97) -----
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
  element.play().then(()=>window.roomVoice?.note?.('now-playing','primed')).catch(error=>window.roomVoice?.note?.('now-playing-refused',error?.message||'play'));
 }catch(error){window.roomVoice?.note?.('now-playing-failed',error?.message||'create')}
}
function micLive(){return !!(state.stream?.getAudioTracks()[0]?.enabled??state.micEnabled)}
function syncNowPlaying(){
 if(!nowPlaying)return;
 const wanted=lockScreenOn&&micLive();
 if(wanted&&nowPlaying.paused)nowPlaying.play().catch(error=>window.roomVoice?.note?.('now-playing-refused',error?.message||'play'));
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
   try{session.setActionHandler(action,on?details=>{window.roomVoice?.note?.('media-session',action+' · '+(micLive()?'live':'muted'));run(details)}:null)}catch{}
  }
  try{session.metadata=on?new MediaMetadata({title:'Sidevoice',artist:conversationTitle(targetId())||'Llamada'}):null}catch{}
 }
 syncNowPlaying();
}
function toggleMic(){holding=false;setMic(!(state.stream?.getAudioTracks()[0]?.enabled??state.micEnabled))}
function typing(e){return e.target instanceof Element&&!!e.target.closest('input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[data-radix-popper-content-wrapper]')}
window.addEventListener('keydown',e=>{personSignal();
 if(typing(e)||e.altKey)return;
 if(e.code==='KeyD'&&(e.metaKey||e.ctrlKey)&&!e.shiftKey){e.preventDefault();if(!e.repeat)toggleMic();return}
 if(state.stream&&e.code==='Space'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('summary')){
  e.preventDefault();
  if(spaceDown)return;
  spaceDown=true;
  if(!state.stream.getAudioTracks()[0].enabled){holding=true;setMic(true);state.holding=true}
 }
},true);
window.addEventListener('keyup',e=>{if(e.code==='Space'&&spaceDown){e.preventDefault();releaseHold()}},true);
window.addEventListener('blur',releaseHold);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseHold()});window.addEventListener('beforeunload',()=>{state.ws?.close();state.stream?.getTracks().forEach(t=>t.stop())});updateMic();
// The first questions wait for the machine to prove where it is: finding it asks for the conversations by itself.
// A device paired with nothing is asked for a code at once. The interface language is this device's even with no
// machine to ask.
publishPairings();
if(!pairingInUse(pairings))openPairing();
window.roomI18n?.setLanguage(devicePreferences().ui_language);
locate().finally(()=>{loadPreferences().catch(()=>devicePreferences()).then(p=>window.roomI18n?.setLanguage(p.ui_language))});setInterval(refreshHistory,1500);setInterval(refresh,1500);setInterval(refreshPeople,6000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.ws)keepScreenAwake()});
setupAudioControls();
setupOutputOwner();
setupIdleWatch();

// ----- a call nobody is using ends itself, for this browser only (#63) -----
// The room went on hearing a room nobody was talking to, for a long while, and delivering what it heard. A
// browser that gives no sign of a person — no speech, nothing typed, no touch, no key — for IDLE_MS is asked
// "¿sigues ahí?" with a sound, and if nothing answers within IDLE_WARN_MS it leaves the call, the way a
// video call does. The conversations stay in the room; re-entering is one tap. The agent's replies are not
// a sign of anybody: an agent can talk to an empty car for ever.
function personSignal(){
 lastPersonSignal=Date.now();
 if(idleWarned){idleWarned=false;state.liveNote='';window.roomVoice?.note?.('idle','answered')}
}
function checkIdle(){
 if(!state.ws){idleWarned=false;return}
 const quiet=Date.now()-lastPersonSignal;
 if(quiet>=IDLE_MS){
  window.roomVoice?.note?.('idle','left after '+Math.round(quiet/60000)+' min');
  idleWarned=false;disconnect();
  failJoin('Saliste de la llamada: '+Math.round(IDLE_MS/60000)+' minutos sin señales tuyas. Pulsa para volver a entrar.');
  return;
 }
 if(!idleWarned&&quiet>=IDLE_MS-IDLE_WARN_MS){
  idleWarned=true;
  window.roomVoice?.signal?.('lost');
  window.roomVoice?.note?.('idle','asked');
  state.liveNote='¿Sigues ahí? Sin señales tuyas, saldrás de la llamada en '+Math.round(IDLE_WARN_MS/1000)+' segundos. Habla o toca la pantalla para seguir.';
 }
}
function setupIdleWatch(){
 // Keys and touches are counted where the page already listens for them (the keyboard shortcuts and the
 // output owner), so no second listener competes with those.
 idleTimer=setInterval(checkIdle,5000);
}
function stopIdleWatch(){lastPersonSignal=Date.now();idleWarned=false}

// ----- which of this browser's room tabs sounds (#96) -----
// A tab in the background keeps sounding, like any call; with the room open in two tabs only one may. The
// last tab shown or touched claims the output; a claim carries its time, and a tab yields only to a newer
// one, so two claims crossing each other still leave exactly one owner.
function setupOutputOwner(){
 if(typeof BroadcastChannel!=='function')return;
 const channel=new BroadcastChannel('sidevoice-output'),tab=Math.random().toString(36).slice(2);
 let claimedAt=0;
 const claim=()=>{claimedAt=Date.now();window.roomVoice?.setAudible?.(true);channel.postMessage({type:'claim',tab,at:claimedAt})};
 channel.onmessage=({data})=>{
  if(!data||data.tab===tab)return;
  if(data.type==='claim'&&(data.at>claimedAt||(data.at===claimedAt&&data.tab>tab))){claimedAt=data.at;window.roomVoice?.setAudible?.(false)}
  // The owner went away: whoever is in front takes the sound, and a tab in the background only if none is.
  if(data.type==='release'&&window.roomVoice?.audible===false){
   const seen=claimedAt;setTimeout(()=>{if(claimedAt===seen)claim()},document.hidden?150:0);
  }
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)claim()});
 window.addEventListener('pointerdown',()=>{personSignal();if(window.roomVoice?.audible===false)claim()},true);
 window.addEventListener('pagehide',()=>{if(window.roomVoice?.audible!==false)channel.postMessage({type:'release',tab})});
 claim();
}

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
    // a node that was no longer there — which unmounts the whole root and leaves the room blank (#58).
    // The badge, the echo light and the notes are React's, rendered from this same store (#53).
    updateComposer();
}
roomStore.subscribe(reconcileSession);
reconcileSession(roomStore.getState());

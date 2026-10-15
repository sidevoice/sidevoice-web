import {createRoomSessionStore,speechSegment,recordReceipt,recordReply,RECONNECT_GRACE_MS,noMachine,reachNote,conversationKey,conversationOf,personKey,displayTitle} from '../state/room-session-state.js';
import {pageTarget,targetAnswers,routeUrl,callSocketUrl,isNodePath,askTarget,askRoomNode} from './rendezvous.js';
import {readPairingState,projectPairings,writePairings,withPairing,withoutPairing,revokedPairing,pairingSummary,candidateBases,firstProven,redeemPairingCode,VERIFIED_FOR_MS} from './device-pairing.js';
import {localHostBridge,normalizeLocalHostPairing,localHostLocator} from './desktop-host.ts';
import {createHostAgentsController} from './host-agents.ts';
import {currentDeviceName} from '../state/device-name.ts';
import {translator,setUiLanguage,onUiLanguage,UI_LANGUAGES} from '../i18n/translator.ts';
import {voiceFailure,roomFailure,worded,errorLine} from '../features/settings/error-message.ts';
import {failureCode} from './failure-code.js';
import {probeSiteStorage} from './site-storage.js';
import {tryTranscription,tryVoice,tryEndOfTurn} from './voice-trial.js';
import {systemLanguage,SPEECH_LANGUAGES} from './system-language.js';
import {createOutbox} from './outbox.js';
import {pageVoice} from './voice-module.js';
import {readCallPreferences} from './call-preferences.ts';
import {clampDeviceName,deviceNameProblem} from './device-name-rules.js';
import {readDeleteUnused,writeDeleteUnused,staleModels} from './model-housekeeping.js';
import {readVoiceSettings,writeVoiceSettings,editVoiceSettings,defaultVoiceSettings,remoteProviders,voiceSettingsHere,endOfTurnModel,readyVoiceSettings,modelReady} from './voice-settings.js';
import {createTurnRelay} from './turn-relay.js';
import {turnMessage,playbackReport,sayingRange,scalarExtent} from './voice-room.js';
import {replyEligibility} from './reply-eligibility.js';
import {refusalError} from './refusals.js';
import {followWorking} from './working-clock.ts';
const roomStore=window.sidevoiceUI?.store||createRoomSessionStore();
const state=roomStore.facts;
// What this browser speaks in a call: the language of its system, among those the voice handles.
roomStore.patch({speechLanguage:systemLanguage(SPEECH_LANGUAGES),inApp:!!window.__sidevoiceDesktop?.host?.voice});
// Whether this browser lets the page keep anything: when it does not, one message says so, rather than each store
// failing on its own (`site-storage.js`).
void probeSiteStorage().then(probe=>roomStore.patch({storageBlocked:probe.blocked}),()=>{});
// Browser room orchestration. Loaded once after React mounts the stable UI shell.
const $=id=>document.getElementById(id);
// The room's error above the stage: a failure as people read it (`ErrorMessage`, error-message.ts), never a raw text.
function setRoomError(message){const value=message||null;if(window.sidevoiceUI)window.sidevoiceUI.setBootError(value);else $("error").textContent=value?typeof value==='string'?value:errorLine(value):""}
/* One quiet line from the tap until this browser is in the room, naming the step the join is on.
 * It reuses the events that already existed — the voice starting, the room's hello, the conversation this tab goes
 * back to — and measures nothing of its own. A step that fails leaves its reason, and what to do about it, in the
 * same place. */
function joinStatus(step,{detail='',progress=null,subject=''}={}){roomStore.patch({joinStep:step,joinFailure:'',joinFailureDetails:'',joinDetail:detail?String(detail).slice(0,80):'',joinProgress:progress==null?null:Number(progress),joinSubject:subject})}
function clearJoinStatus(){roomStore.patch({joinStep:null,joinFailure:'',joinFailureDetails:'',joinDetail:'',joinProgress:null,joinSubject:''})}
// A join that failed, in words (`ErrorMessage`): its sentence on the join line, what was raw about it behind Details.
function failJoin(message){roomStore.patch({joinStep:null,joinFailure:message?errorLine(message):'',joinFailureDetails:message?.details||'',joinDetail:'',joinProgress:null,joinSubject:''})}
// Why a call ended without the person ending it, for the desktop card's exit notice (FLOATING-CARD-SPEC FC7): idle,
// its machine gone (`detail`: the conversation's title) or refused (`detail`: the sentence the join line shows). Said
// before the call ends, so the snapshot that says the call is over already says why; cleared as a call starts; a hang-up
// never sets it.
function callEndedBy(reason,detail){roomStore.patch({callEnded:{reason,detail:detail||''}})}
// What this tab already calls the conversation it is going back to; the room is not asked again for a title.
// As every surface shows it (displayTitle).
function conversationTitle(id){const p=state.people.find(p=>personKey(p)===id);return displayTitle(p?.title,p)||displayTitle(state.history.find(r=>r.thread===id)?.name)}
/* What failed in the voice, its models or the room, as the person reads it (error-message.ts): a known code in the
 * words the bundles give it, any other one a generic line about what failed — never the engine's, the browser's or a
 * machine's own text, which goes behind Details with the code. A provider's own words, when it is the one refusing,
 * follow the sentence. `what` names what failed. */
function voiceError(error,what='voice'){return voiceFailure(error,{what,inApp:!!state.inApp,t:translator()})}
function roomError(error,what='room',generic){return roomFailure(error,{what,generic,t:translator()})}
// A sentence of this page's bundle, as a failure.
const bundled=(key,params)=>({text:translator()(key,params)});
function joinError(step,error){return step==='voice'?voiceError(error):roomError(error)}
// A failure of the voice handed to the interface: its code kept (for what the interface does about it), its words
// with it (`words`, what error-message.ts says of it).
function voiceRefused(error,what='voice'){const words=voiceError(error,what);return Object.assign(Error(words.text),{code:failureCode(error,''),words})}
// A download of a model that failed, as the slot's install says it (`voiceInstall`): its sentence, and its Details.
function installFailure(error){const words=voiceError(error,'download');return {error:errorLine(words),details:words.details||''}}

// The room holds several browsers at once, so every question this page asks the
// room carries its own session: the answer is about this browser and no other. Only the call's machine knows it.
function roomQuery(path,fp=state.callNode){return state.sessionId&&fp===state.callNode?path+(path.includes('?')?'&':'?')+'session_id='+encodeURIComponent(state.sessionId):path}
/* Where each request goes (`rendezvous.js`, `device-pairing.js`): a conversation's, the call and this device's own
 * pairing to the machine it belongs to; telemetry to the target. Every paired machine is reached at once, each at its
 * own node base: an address that proved — with the key pinned when pairing — that it is that machine. Until one has
 * there is none, null, and nothing of that machine is asked: every such request carries that pairing's token. */
const target=pageTarget();
// What the target is: asked only of a server that may answer (`targetAnswers`); a static site's origin is none.
const describeTarget=()=>targetAnswers(target)?askTarget(target,fetch):Promise.resolve(null);
// This device's pairings, every one of them live, kept across tabs and reloads. The tokens stay in here and in
// storage; the store the interface reads gets everything else.
function pageStorage(){try{return localStorage}catch{return null}}
const pairingStorage=pageStorage(),storedPairingState=readPairingState(pairingStorage);
let localPairing=null;
let pairings={list:storedPairingState.list};
const desktopLocalHost=localHostBridge();
roomStore.patch({localHostAvailable:!!desktopLocalHost});
// What this device calls a machine, if the person renamed it here (a hostname they would rather not read): this
// device's alone, shown everywhere here in place of the machine's own name, which stays as `machine_host`.
const ALIASES_KEY='sidevoice.machine-aliases';
function machineAliases(){try{const kept=JSON.parse(pageStorage()?.getItem(ALIASES_KEY)||'{}');return kept&&typeof kept==='object'&&!Array.isArray(kept)?kept:{}}catch{return {}}}
function aliased(summary){const alias=machineAliases()[summary.fp];return typeof alias==='string'&&alias.trim()?{...summary,host:alias.trim(),machine_host:summary.host,alias:true}:summary}
function publishPairings(){roomStore.patch({pairings:pairings.list.map(pairingSummary).map(aliased),machinesAt:Date.now()})}
/** Renames a machine on this device only; null goes back to the machine's own name. */
function renameMachine(fp,name){
 const next={...machineAliases()},text=typeof name==='string'?clampDeviceName(name):'';
 if(text)next[fp]=text;else delete next[fp];
 try{pageStorage()?.setItem(ALIASES_KEY,JSON.stringify(next))}catch{}
 publishPairings();
}
/** This device's name, as machines list it: kept for the next pairing, and asked of each machine it is paired with now
 *  (renaming this device in their lists). Resolves with how many could not be told. */
async function setDeviceName(name){
 const text=clampDeviceName(name||'');
 // One a machine would refuse is not kept, nor sent (the field says why).
 if(text&&deviceNameProblem(text))throw Object.assign(Error('device.name_invalid'),{key:'device.name_invalid'});
 try{if(text)pageStorage()?.setItem('sidevoice.deviceName',text);else pageStorage()?.removeItem('sidevoice.deviceName')}catch{}
 roomStore.patch({deviceName:text||null});
 if(!text)return 0;
 const asked=pairings.list.filter(p=>!p.revoked&&p.device_id).map(p=>p.local
  ?renameLocalHostDevice(p.device_id,text):renameMachineDevice(p.fp,p.device_id,text));
 const results=await Promise.allSettled(asked);
 return results.filter(r=>r.status==='rejected').length;
}
function persistPairingProjection(){if(pairingStorage)writePairings(pairingStorage,pairings);publishPairings()}
function keepPairings(next){
 const previous=pairings,projected=projectPairings(next,localPairing);
 pairings=projected;storedPairingState.list=projected.list.filter(p=>!p.local);
 discardChangedHostAgents(previous,projected);
 persistPairingProjection();
 syncLinks();
}
// The local host's fingerprint, kept while the app says it has one even when it does not answer for a while (its core
// restarting): its conversations stay listed, unreachable, rather than vanishing and coming back.
let localFp=null;
function setLocalPairing(value){
 const next=normalizeLocalHostPairing(value),duplicates=next?storedPairingState.list.filter(p=>p.fp===next.fp):[];
 const previousLocal=localPairing,previous=pairings;
 localPairing=next;
 if(next)localFp=next.fp;else if(state.localHostStatus?.state==='absent')localFp=null;
 const projected=projectPairings(storedPairingState,localPairing);
 storedPairingState.list=projected.list.filter(p=>!p.local);
 pairings=projected;
 discardChangedHostAgents(previous,projected);
 persistPairingProjection();
 // An unreachable report invalidates the app-owned per-launch proxy immediately. Never keep its URL or
 // session secret around to be reused after native starts a new core.
 if(previousLocal&&previousLocal.fp!==next?.fp)settleLink(previousLocal.fp,null,'away');
 if(next){hostAgentBases.set(next.fp,next.urls[0]);void locate(next.fp,{move:true,fresh:true})}
 syncLinks();
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
// What a paired machine says of its Sidevoice — its version, and whether it is behind — for its page's card: asked of it with this
// device's pairing (core GET /api/host/status, which core does not serve yet: a contract gap). Unknown stays unknown.
// One question per machine at a time: every place asking while it is out (its page's card, each place the updates
// show) shares its answer.
const machineInfoLoads=new Map();
function loadMachineInfo(fp){
 let load=machineInfoLoads.get(fp);
 if(!load){load=readMachineInfo(fp).finally(()=>machineInfoLoads.delete(fp));machineInfoLoads.set(fp,load)}
 return load;
}
async function readMachineInfo(fp){
 try{
  const answer=await hostApi(fp,'/api/host/status',{headers:{accept:'application/json'},cache:'no-store'});
  const info=answer&&typeof answer==='object'?answer:{};
  const version=typeof info.version==='string'&&/^\d+\.\d+\.\d+/.test(info.version)?info.version:null;
  // Behind the latest, and the command that updates it there where it names one (contract gap #57: no core says it
  // yet; with none, Updates says the documented one).
  const u=info.update&&typeof info.update==='object'?info.update:null;
  const update=u&&typeof u.latest==='string'&&u.latest.trim()?{latest:u.latest,command:typeof u.command==='string'&&u.command.trim()?u.command:null}:null;
  roomStore.patch({remoteHostStatus:{...state.remoteHostStatus,[fp]:{...state.remoteHostStatus?.[fp],version,update}}});
 }catch{}
}
async function refreshLocalHost(){
 if(!desktopLocalHost){
  pairings=projectPairings(storedPairingState,null);storedPairingState.list=pairings.list;
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
/* ----- every paired machine at once: one link each -----
 * A link is how this page reaches one machine: the node base that proved itself, how (directly or through the room
 * it links with), and the conversations it last listed. Every pairing has one, up to MAX_LINKS — the local host
 * first, then the newest — and the call's machine always; past the bound a machine is listed, not watched. A link
 * that loses its machine keeps its conversations, shown unreachable, until the machine is forgotten. */
const MAX_LINKS=6;
const links=new Map();
function linkOf(fp){let link=links.get(fp);if(!link){link={fp,base:null,reach:'checking',via:'',asked:0,applied:0,doubted:null,people:[],peopleAnswered:false};links.set(fp,link)}return link}
function linkBase(fp){return fp!=null&&links.has(fp)?links.get(fp).base:null}
/** The machines this page watches now: unrevoked pairings in the list's order, bounded, and the call's. */
function liveMachines(){
 const live=pairings.list.filter(p=>!p.revoked).slice(0,MAX_LINKS).map(p=>p.fp);
 if(state.callNode&&!live.includes(state.callNode)&&pairings.list.some(p=>p.fp===state.callNode&&!p.revoked))live.push(state.callNode);
 return live;
}
// A machine no longer paired leaves with everything this page knew of it; the call's stays while the call is on it.
function syncLinks(){
 const keep=new Set(pairings.list.map(p=>p.fp));
 if(state.callNode)keep.add(state.callNode);
 if(localFp)keep.add(localFp);
 for(const fp of [...links.keys()])if(!keep.has(fp)){links.delete(fp);forgetMachineState(fp)}
 publishLinks();
}
function forgetMachineState(fp){
 roomStore.batch(()=>{
  state.people=state.people.filter(p=>p.node!==fp);
  state.history=state.history.filter(r=>conversationOf(r.thread)?.node!==fp);save();
  if(conversationOf(state.viewedThread)?.node===fp)state.viewedThread=null;
 });
}
function publishLinks(){
 const next={};
 for(const p of pairings.list){const link=links.get(p.fp);next[p.fp]={reach:p.revoked?'revoked':link?.reach||'checking',via:link?.via||''}}
 if(localFp&&!next[localFp]){const link=links.get(localFp);if(link)next[localFp]={reach:link.reach,via:link.via}}
 roomStore.patch({machineLinks:next});
}
// Every link's conversations, in the order of the machines: the page's one list.
function mergePeople(){
 const order=[...new Set([...pairings.list.map(p=>p.fp),...links.keys()])];
 state.people=order.flatMap(fp=>links.get(fp)?.people||[]);
}
/* Which address each machine answers at is asked when it matters: on load, on the beat while it has none or its
 * proof is old, before a join that has none, and before each reconnection attempt after the first. An address that
 * proved itself is trusted for a few minutes. The call's machine is never moved by it while the call is on — only
 * its reconnection moves it (`move`). A reconnecting call (`hold`) keeps the address it had while that one's proof is
 * recent: the machine may be restarting, and the socket is the better probe. */
const verified=new Map(),hostAgentBases=new Map();
let settingsAgentRequestId=0;
let targetAbout=null,reachFailure=null;
const inCallNow=()=>!!(state.ws||state.connecting||state.reconnecting);
async function locate(fp,{move=!(fp===state.callNode&&inCallNow()),fresh=false,hold=false}={}){
 if(!move||fp==null)return;
 const pairing=pairings.list.find(p=>p.fp===fp);
 if(!pairing){settleLink(fp,null,'away');return}
 if(pairing.revoked){settleLink(fp,null,'revoked');return}
 // Native verified the local identity over the peer-checked socket. Its per-launch proxy is the locator: never
 // send the app's session secret to the core's TCP listener or probe another address with it.
 if(pairing.local){
  const local=localHostLocator(pairing,state.localHostStatus);
  settleLink(fp,local,local?'ok':'away');
  return;
 }
 const link=linkOf(fp),recent=base=>base!=null&&Date.now()-(verified.get(base)||0)<VERIFIED_FOR_MS;
 if(!fresh&&link.reach==='ok'&&recent(link.base)&&link.doubted!==link.base)return;
 const asked=++link.asked,deps={get:fetch},started=new Map();
 let found=null,reach='away';
 try{
  // The pairing's own addresses are asked while the target says what it is: its answer can only add one more.
  void firstProven(candidateBases(pairing,{origin:location.origin}),pairing,deps,started).catch(()=>{});
  const about=await describeTarget();
  if(about)targetAbout=about;
  found=await firstProven(candidateBases(pairing,{target,about,origin:location.origin}),pairing,deps,started);
  // With nothing proven, the room the machine links with says whether it is there at all.
  if(!found&&pairing.rv&&await askRoomNode(pairing.rv.url,pairing.rv.node,fetch)===false)reach='offline';
 }catch{}
 if(asked<link.applied||links.get(fp)!==link||pairings.list.find(p=>p.fp===fp)!==pairing)return;
 link.applied=asked;
 // The page follows the build of whoever serves it: a room serving this page says which (or a server of a kind this
 // version does not know yet, when it says it).
 if(target===''&&(targetAbout?.kind==='room'||targetAbout?.kind==='unknown'))followServedBuild(targetAbout.build);
 if(found){
  verified.set(found.base,Date.now());hostAgentBases.set(fp,found.base);if(link.doubted===found.base)link.doubted=null;
  // A call keeps the address its socket is on.
  if(!(fp===state.callNode&&state.ws)||found.base===link.base)settleLink(fp,found,'ok');
  return;
 }
 if(hold&&fp===state.callNode&&recent(link.base))return;
 settleLink(fp,null,reach);
}
function settleLink(fp,found,reach){
 const link=linkOf(fp),base=found?.base??null,moved=base!==link.base;
 link.base=base;link.reach=found?'ok':reach;link.via=found?(found.via==='room'?'room':'node'):'';
 if(found&&reachFailure&&(reachFailure.node==null||reachFailure.node===fp)&&state.joinFailure===reachFailure.text){roomStore.patch({joinFailure:'',joinFailureDetails:''});reachFailure=null}
 publishLinks();
 if(moved&&base!=null){if(fp===state.callNode)void refresh();void refreshPeople(fp);void refreshHistory(fp)}
}
function routed(path,fp){const url=routeUrl(path,target,linkBase(fp));if(url==null)throw worded(reachNote(state)||noMachine());return url}
// A request with the token is never redirected: the node base proved itself, wherever a redirect points did not.
function withToken(options,token){return {...options,redirect:'error',headers:{...(options?.headers||{}),Authorization:'Bearer '+token}}}
// Every request to a machine carries the token of that machine's pairing — never another's; one the machine refuses
// means that pairing is gone. An address that stops answering is looked at again on the next beat.
const request=async(path,options,fp=state.callNode)=>{
 const url=routed(path,fp);if(!isNodePath(path))return fetch(url,options);
 const pairing=pairings.list.find(p=>p.fp===fp),link=links.get(fp),base=link?.base;if(!pairing||pairing.revoked)throw worded(noMachine());
 let response;
 try{response=await fetch(url,withToken(options,pairing.token))}catch(error){if(link&&link.base===base)link.doubted=base;throw error}
 if(response.status===401)pairingRefused(fp,{token:pairing.token});
 return response;
};
// Which conversation this tab talks to is this tab's own state: the room routes, it never chooses for anyone. It is
// kept by its key — the machine and the thread — so a reload goes back to the same machine too.
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
 try{const ticket=resumeTicket();if(ticket)sessionStorage.setItem(RESUME_KEY,JSON.stringify({...ticket,node:state.callNode}));else sessionStorage.removeItem(RESUME_KEY)}catch{}
}
// A join finds the ticket an earlier load of this tab kept, and takes that call back with it: only on the machine
// that call was with — a ticket is that machine's to honour, and no other's to see.
function storedTicket(fp){
 try{const {node,...ticket}=JSON.parse(sessionStorage.getItem(RESUME_KEY)||'null')||{};
  if(node!==fp||typeof ticket.session_id!=='string'||typeof ticket.token!=='string'||!Number.isInteger(ticket.last_seq))return null;
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
// Nor while the call moves to another machine (`moveCall`): nobody is there to hear it.
let moving=false;
function applyMicState(){voice?.mute(!state.micEnabled||moving||!!(state.ws&&!targetId()))}
function showScreenLock(lockState,note){state.screenLock={state:lockState,note}}
async function keepScreenAwake(){
 // Asked for while connecting too: Safari grants the lock to the tap that started the
 // call, and by the end of the preparation chain that gesture has expired.
 if(!(state.ws||state.connecting)||document.hidden||screenWakeLock||wakeRequest)return;
 // Settings → Advanced may leave the screen to the system: a call that goes on with it off.
 if(!readCallPreferences().keepAwake)return;
 if(!globalThis.navigator?.wakeLock?.request){showScreenLock('off','session.screen.unsupported');return}
 const epoch=wakeEpoch;
 const request=(async()=>{
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(epoch!==wakeEpoch||document.hidden){await lock.release();return}
   screenWakeLock=lock;wakeRetries=0;showScreenLock('on','session.screen.on');
   // The system takes the lock back on its own — a screen that locked once, a route
   // change. While the call is up and the room is on screen, ask again.
   lock.addEventListener('release',()=>{
    if(screenWakeLock!==lock)return;
    screenWakeLock=null;showScreenLock('off','session.screen.released');
    if(state.ws&&!document.hidden&&wakeRetries<3){++wakeRetries;setTimeout(()=>{if(state.ws&&!document.hidden)keepScreenAwake()},1000)}
   });
  }catch{showScreenLock('off','session.screen.failed')}
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
// Kept per machine too: the newest rows of each, so a reload finds every machine's conversations, not the busiest's.
const SAVED_PER_MACHINE=300;
function save(){try{sessionStorage.setItem('voice-room-transcript',JSON.stringify(newestPerMachine(state.history,SAVED_PER_MACHINE)))}catch{}}
function newestPerMachine(rows,limit){
 const counts=new Map(),kept=[];
 for(let i=rows.length-1;i>=0;i--){const node=conversationOf(rows[i].thread)?.node||'',n=(counts.get(node)||0)+1;counts.set(node,n);if(n<=limit)kept.push(rows[i])}
 return kept.length===rows.length?rows:kept.reverse();
}
// The conversation the call talks to, by its key (machine and thread); the room's own name for it is `targetThread`.
function targetId(){return conversationKey(state.callNode,state.roomBinding?.thread_id)}
function targetThread(){return state.roomBinding?.thread_id||null}
function historyThreadId(){return state.viewedThread||targetId()}

// A refusal is a sentence, or a key with its sentence (sidevoice-core's refusals): rejected with both, for `roomError`
// to say by its key — the sentence, in whatever language it came, only behind Details.
async function api(path,options,fp=state.callNode){const r=await request(path,options,fp);if(r.status===401)throw worded(reachNote(state)||noMachine());const d=await r.json();if(!r.ok)throw refusalError(d.detail);return d}
const post=(path,body,fp=state.callNode)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},fp);
/* ----- what the call owes its machine: the outbox (`outbox.js`) -----
 * A turn of the person's and what became of a reply are each one message with its own `client_msg_id`, which the machine
 * remembers: sent twice it is taken once and acknowledged either way. So each waits here until acknowledged, and is
 * said again on every socket the call gets until then — never twice on the same one. Per tab: another tab's call is
 * another call. */
const OUTBOX_SCOPE_KEY='sidevoice.outbox-scope';
function outboxScope(){try{let scope=sessionStorage.getItem(OUTBOX_SCOPE_KEY);if(!scope){scope=crypto.randomUUID();sessionStorage.setItem(OUTBOX_SCOPE_KEY,scope)}return scope}catch{return 'page'}}
const outbox=createOutbox({scope:outboxScope()});
// What an earlier load of this tab kept may come back after the call has already flushed: it goes once it is here.
// flushOutbox sends only on the open socket of the current session, so a hang-up or a new session meanwhile is safe.
outbox.ready.then(()=>flushOutbox(),()=>{});
// While a new session's room has not said which conversation this browser is on, nothing goes on its socket.
let outboxHold=null;
// A message for the room, kept under the `client_msg_id` the page gives it.
function keepMessage(kind,type,data,id=crypto.randomUUID()){return outbox.add({id,kind,session_id:state.sessionId,node:state.callNode,payload:{type,data}})}
/* Everything waiting, in order, on the socket the call has now, under the session it has now. A turn belongs to the
 * conversation, not to the session that heard it: the room knows it by its `turn_id` on the session that took its start,
 * and as words said while away when this session never took that start (`turn-relay.js`). One socket keeps them in
 * order, so nothing waits for the room's answers. Anything for another machine is let go. */
function flushOutbox(socket=state.ws){
 // A socket carries nothing until the room has answered its hello with the session it speaks for.
 if(outboxHold||!socket||socket.readyState!==WebSocket.OPEN||!state.sessionId||socket.session!==state.sessionId)return;
 for(let again=true;again;){
  again=false;
  for(const entry of outbox.list()){
   if(entry.sentOn===socket)continue;
   if(entry.node!==state.callNode){outbox.remove(entry.id);continue}
   // What a reply of a replaced session became is that session's; the room ended its replies with it.
   if((entry.kind==='playback'||entry.kind==='speech')&&entry.session_id!==state.sessionId){outbox.remove(entry.id);continue}
   let data=entry.payload.data;
   if(entry.kind==='user-turn'){
    // A start made for a session the room has replaced is never answered there: the room takes each message once
    // per device, so sent again it is only acknowledged. Its turn's end goes as words said while away.
    if(data.phase==='started'&&entry.session_id!==state.sessionId){outbox.remove(entry.id);continue}
    const route=relay.route(data);
    if(route.hold)continue;
    if(route.drop){outbox.remove(entry.id);continue}
    data=route.send;
    if(data.offline)nameOfflineRow(data.turn_id,state.sessionId+':user-turn:'+data.turn_id);
   }
   try{socket.send(JSON.stringify({type:entry.payload.type,data:{...data,session_id:state.sessionId,client_msg_id:entry.id}}))}catch{return}
   entry.sentOn=socket;
   if(entry.kind!=='user-turn')continue;
   // A held turn's start went: its words, earlier in the outbox, go on the next pass.
   if(data.phase==='started'){if(relay.sent(data.turn_id,entry.id,data))again=true;continue}
   // A turn of this session ended: a start the room had no room for is said again, after it, as a new message.
   const retry=data.offline?null:relay.ended(data.turn_id,entry.id,entry.payload.data);
   if(retry){keepMessage('user-turn','voice-user-turn',retry);again=true;break}
  }
 }
}
// Words said while away become the room's own row: the bubble takes that row's id, so history and receipts find it.
function nameOfflineRow(turnId,id){
 const mine=r=>r.turn_id===turnId&&r.segment!==id;if(!state.history.some(mine))return;
 state.history=state.history.map(r=>mine(r)?{...r,segment:id,offline:true,delivery:takeReceipt(id)||r.delivery}:r);save();markHistorySeen();
}

/* ----- the replies being said -----
 * The voice says a reply as something of its own (a handle); the room names it by its `utterance_id`. While a reply
 * lives the page keeps one for the other: the room may withdraw it (`voice-reply-withdrawn`), and how it ended is the
 * room's `voice-playback`. Where its reader is lights the reply's bubble. */
const replies=new Map(); // core utterance_id → queued or active reply
const replyQueue=[];
const handleIds=new Map(); // voice handle ID → core utterance ID
const threadEpochs=new Map();
function acceptEpoch(thread,epoch){if(Number.isInteger(epoch))threadEpochs.set(thread,Math.max(epoch,threadEpochs.get(thread)??epoch))}
const openVoiceTurns=new Map();
const awaitingTurnAck=new Map();
const startMessageTurns=new Map();
let speechOutput='on';
let stoppingReplies=false;
function reportPlayback(said,data){
 if(said.terminal)return;
 if(data.status!=='playing')said.terminal=true;
 keepMessage('playback','voice-playback',{utterance_id:said.reply.utterance_id,...data});flushOutbox();
}
function finishReply(said,data){
 if(replies.get(said.reply.utterance_id)!==said)return;
 reportPlayback(said,data);
 replies.delete(said.reply.utterance_id);
 if(said.saying)handleIds.delete(said.saying.id);
 if(state.karaokeState?.segment===speechSegment(said.reply))state.karaokeState=null;
 if(!stoppingReplies)drainReplies();
}
function stopReplies(reason,onlyPlaying=false){
 stoppingReplies=true;
 for(const said of [...replies.values()]){
  if(onlyPlaying&&!said.playing)continue;
  said.action=reason;
  if(said.saying)said.saying.cancel();
  else finishReply(said,{status:'unplayed',reason});
 }
 stoppingReplies=false;
 drainReplies();
}
function drainReplies(){
 if([...replies.values()].some(said=>said.saying&&!said.terminal))return;
 while(replyQueue.length){
  const said=replyQueue[0];
  if(replies.get(said.reply.utterance_id)!==said){replyQueue.shift();continue}
  const reply=said.reply;
  const openHere=new Set([...openVoiceTurns.values(),...awaitingTurnAck.values()].filter(thread=>thread===reply.thread_id));
  const eligibility=moving?'focus_changed':replyEligibility(reply,{sessionId:state.sessionId,threadId:targetThread(),epoch:threadEpochs.get(reply.thread_id),openTurns:openHere,output:speechOutput,connected:!!state.ws&&!state.reconnecting});
  if(eligibility==='hold')return;
  replyQueue.shift();
  if(eligibility!=='play'){finishReply(said,{status:'unplayed',reason:eligibility});continue}
  const saying=voice?.say(reply.text,reply.language?{language:reply.language}:undefined);
  if(!saying){finishReply(said,{status:'unplayed',reason:'voice_off'});continue}
  said.saying=saying;handleIds.set(saying.id,reply.utterance_id);
  saying.onEvent(event=>{
   if(replies.get(reply.utterance_id)!==said)return;
   if(event.type==='playing'){said.playing=true;state.karaokeState={segment:speechSegment(reply),from:0,to:0};reportPlayback(said,{status:'playing'})}
   else if(event.type==='progress')state.karaokeState={segment:speechSegment(reply),...sayingRange(event,reply.text)};
   else if(event.type==='done')finishReply(said,playbackReport(event.outcome,reply.text,said.withdrawn,said.action));
  });
  return;
 }
}
// Skipping what sounds now, without saying anything: only this device stops hearing it, the reply stays written, and
// what is queued after it plays on.
function skipReply(){for(const said of replies.values())if(said.playing){said.action='user_skipped';said.saying.cancel();return}}
// The room took back replies it sent and this call has not finished: each is cancelled, and its end says why.
function withdrawReplies(d){
 if(d.session_id!==state.sessionId)return;
 for(const id of d.utterance_ids||[]){const said=replies.get(id);if(!said)continue;said.withdrawn=d.reason;if(said.saying)said.saying.cancel();else finishReply(said,{status:'unplayed',reason:d.reason})}
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
function add(role, text, segment, thread = targetId(), metadata = {}) { // thread: the conversation's key
 if (!text?.trim())
    return; const key = metadata.history_id || (segment == null ? null : state.sessionId + ':' + segment), node = conversationOf(thread)?.node; const existing = key && state.history.find(r => r.segment === key && conversationOf(r.thread)?.node === node); if (existing) {
    state.history = state.history.map(r => r === existing ? { ...r, text, ...metadata } : r);
    save();
    markHistorySeen();
    return;
} state.history = [...state.history, { segment: key, thread, role, text, session: state.sessionId, revision: segment?.toString().startsWith('user-turn:') ? Number(segment.slice(10)) : undefined, ...metadata, name: role === 'user' ? '' : state.people.find(p => personKey(p) === thread)?.title || state.roomBinding?.title || '', time: metadata.time || Date.now() }]; capHistory(); save(); markHistorySeen(); }
// What this page keeps of each machine's conversations: its newest rows, so a busy machine never pushes another's out.
const HISTORY_PER_MACHINE=1000;
function capHistory(){const kept=newestPerMachine(state.history,HISTORY_PER_MACHINE);if(kept!==state.history)state.history=kept}
function cancelCurrentInput(){if(!state.userTurn||state.cancelledInput)return;voice?.cancelInput();cancelDraft(state.userTurn)}

function cancelDraft(turn){state.cancelledInput=true;state.history=state.history.filter(r=>!(r.segment===turn.segment&&r.thread===turn.thread));save();partial('');markHistorySeen()}
function partial(text){state.pendingUserText=text||''}
// The text box comes and goes with the call view: with none mounted there is nothing to update.
function updateComposer(){const input=$('text-message'),send=$('text-send');if(!input||!send)return;const ready=!!(state.ws||state.reconnecting)&&!!state.sessionId&&!!targetId()&&historyThreadId()===targetId()&&!state.switching;input.disabled=!ready;send.disabled=!ready||state.textSending;const t=translator();input.placeholder=t(ready?'transcript.placeholder':'transcript.joinToWrite');}
async function sendText(){personSignal();const input=$('text-message'),text=input?.value;if(text==null)return;if(state.textSending||!text.trim()||!state.sessionId||!targetId())return;const destination=targetThread(),key=JSON.stringify([state.sessionId,targetId(),text]);if(textAttempt?.key!==key)textAttempt={key,id:crypto.randomUUID()};const attempt=textAttempt;state.textSending=true;updateComposer();setRoomError('');try{await post('/api/presentation/text',{text,thread_id:destination,session_id:state.sessionId,binding_id:state.roomBinding.binding_id,message_id:attempt.id});if(input.value===text)input.value='';if(textAttempt===attempt)textAttempt=null;await refreshHistory(state.callNode)}catch(e){setRoomError(roomError(e,'room',bundled('room.failure.textNotSent').text))}finally{state.textSending=false;updateComposer()}}
// Taken where they bubble to, not on the box itself, so a box mounted after this runs sends too.
document.addEventListener('submit',event=>{if(event.target?.id!=='text-composer')return;event.preventDefault();return sendText()});
document.addEventListener('keydown',event=>{if(event.target?.id==='text-message'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('text-composer')?.requestSubmit()}});
// A box mounted later renders disabled: it is brought up to date as it appears.
let composerBox=$('text-message');
// Its placeholder is written here, so it is written again in a language chosen later.
onUiLanguage(updateComposer);
new MutationObserver(()=>{const box=$('text-message');if(box===composerBox)return;composerBox=box;updateComposer()}).observe(document.body,{childList:true,subtree:true});
function updateMic(){updateComposer()}
function setMic(enabled){personSignal();state.micEnabled=enabled;applyMicState();updateMic();syncNowPlaying()}
function setSpeechOutput(next){
 if(next===speechOutput)return;
 speechOutput=next;state.speechOutput=next;
 if(next!=='on')stopReplies(next);
 if(state.sessionId){keepMessage('speech','voice-speech',next==='on'?{on:true}:{on:false,reason:next});flushOutbox()}
 if(next==='on')drainReplies();
}
function releaseHold(){spaceDown=false;state.holding=false;if(holding){holding=false;setMic(false)}}

document.addEventListener('click',event=>{for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))if(!menu.contains(event.target))menu.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of document.querySelectorAll('.participant-menu[open],.call-menu[open]'))menu.open=false});
// A conversation, by its key, for the call: on the call's machine the room is asked to move the binding; on another
// machine the call moves there (`moveCall`).
async function select(key){
 const to=conversationOf(key);
 if(!to||state.switching||key===targetId()||!state.sessionId)return;
 if(to.node!==state.callNode)return moveCall(to.node,to.thread);
 state.switching=true;
 try{await post('/api/presentation/select',{thread_id:to.thread,session_id:state.sessionId});rememberThread(key);await refresh()}catch(e){setRoomError(roomError(e))}finally{state.switching=false}
}
// Answers can arrive out of order, and one asked before this page had a session describes nobody: either
// would read as the binding changing and cancel a reply just handed to this page.
let refreshAsked=0,refreshApplied=0;
/* A page older than the one the room serves keeps its old behaviour until somebody reloads it, and an iPhone
 * kept the old one through reloads (2026-09-26). Out of a call it reloads itself — under an address naming
 * the new build, so no cache can answer with the old one; in a call it says so and waits for the hang-up. */
function followServedBuild(served){
 const page=window.sidevoiceBuildId||'dev';
 if(!served||page==='dev'||served===page)return;
 // In a call it waits, said in the updates' list too (webUpdate, whose Reload loads it at once), and loads after the hang-up.
 if(state.ws||state.connecting||state.reconnecting){if(state.webUpdate!==served)roomStore.patch({webUpdate:served});return}
 try{if(sessionStorage.getItem('sidevoice.reloadedFor')===served)return;sessionStorage.setItem('sidevoice.reloadedFor',served)}catch{}
 const query=new URLSearchParams(location.search);query.set('v',served);
 location.replace(location.pathname+'?'+query);
}
async function refresh(){const fp=state.callNode;if(linkBase(fp)==null)return;const asked=++refreshAsked,session=state.sessionId;try{
 const d=await api(roomQuery('/api/presentation',fp),undefined,fp);
 if(asked<refreshApplied||session!==state.sessionId||fp!==state.callNode)return;
 refreshApplied=asked;
 const previousThread=targetId(),changed=state.roomBinding?.binding_id!==d.binding?.binding_id;roomStore.batch(()=>{state.roomBinding=d.binding;if(d.binding?.thread_id)rememberThread(targetId());
  if(d.binding?.thread_id)acceptEpoch(d.binding.thread_id,d.binding.epoch);
 if(changed){state.viewedThread=null;state.turns={};if(previousThread!==targetId())state.harness=Object.fromEntries(Object.entries(state.harness).filter(([id])=>id!==previousThread));
  // A new binding on the same conversation is a rejoin, not a move: what is playing for it goes on.
  state.pendingUserText='';state.userLive=state.botLive=false;markHistorySeen()}
 updateComposer();
 const call=d.call?.id===state.sessionId?d.call:null;if(call?.error)setRoomError(roomError(call.error,'call'));});
 applyMicState();
 if(previousThread!==targetId())stopReplies('focus_changed');else drainReplies();
 // The page follows the build of whoever serves it: this answer's only when the machine itself served the page.
 if(target===''&&linkBase(fp)==='')followServedBuild(d.room?.web_build);
 // The conversations (and each one's model and effort) come on a slower beat: the first answer asks for them at once, so
 // the stage is whole from the start rather than six seconds later.
 if(!links.get(fp)?.peopleAnswered)void refreshPeople(fp);
}catch{}}
const HISTORY_ROLES=new Set(['user','assistant']);
function readableHistoryRow(r){return !!r&&typeof r==='object'&&typeof r.id==='string'&&!!r.id&&typeof r.text==='string'&&HISTORY_ROLES.has(r.role)}
// Each machine's history: its rows carry the conversation's key, so the same thread name on two machines is two
// conversations. The call's machine is asked on the call's beat, every other one on the machines' beat.
async function refreshHistory(fp=state.callNode) { const link = links.get(fp), base = link?.base; if (base == null) return; const asked=link.historyAsked=(link.historyAsked||0)+1; try {
    const data = await api(roomQuery('/api/presentation/history', fp), undefined, fp);
    if (links.get(fp) !== link || link.base !== base || asked!==link.historyAsked || !Array.isArray(data?.messages)) return;
    let changed = false;
    for (const r of data.messages) {
        // A row this page cannot draw — no id, no text, or a role it does not know (sidevoice-core#112) — is left out,
        // not the rest of the history with it.
        if (!readableHistoryRow(r)) continue;
        const thread = conversationKey(fp, r.thread), marker = ':voice:', suffix = r.role === 'assistant' && r.id.includes(marker) ? r.id.slice(r.id.lastIndexOf(marker)) : null;
        let row = state.history.find(h => h.segment === r.id && h.thread === thread);
        const aliases = suffix ? state.history.filter(h => h !== row && h.role === 'assistant' && h.segment?.endsWith(suffix) && h.thread === thread && h.text === r.text) : [];
        if (!row && aliases.length) {
            row = aliases.shift();
            changed = true;
        }
        if (aliases.length) {
            state.history = state.history.filter(h => !aliases.includes(h));
            changed = true;
        }
        const patch = { segment: r.id, thread, role: r.role, text: r.text, name: r.role === 'user' ? '' : state.people.find(p => personKey(p) === thread)?.title || r.name, time: r.time, seq: r.seq, session: r.session, revision: r.revision, epoch: r.epoch, audio_reason: r.audio_reason, heard_chars: r.heard_chars, globally_heard: r.globally_heard, offline: r.offline, interrupted: ['interrupted', 'disconnected'].includes(r.status), replayable: !!r.replayable, draft: false, delivery: r.role === 'user' ? r.status : undefined, audio: r.role === 'assistant' ? r.status : undefined };
        if(row?.globally_heard&&!patch.globally_heard){
            // A receipt confirmed after this snapshot was taken cannot be undone by it.
            Object.assign(patch,{globally_heard:true,audio:row.audio,audio_reason:row.audio_reason,replayable:false,interrupted:row.interrupted});
        }
        if(Number.isInteger(row?.heard_chars))patch.heard_chars=Math.max(row.heard_chars,Number.isInteger(patch.heard_chars)?patch.heard_chars:0);
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
        capHistory();
        save();
        markHistorySeen();
    }
    if (fp !== state.callNode) return;
    for (const r of state.history) {
        if (conversationOf(r.thread)?.node !== fp) continue;
        const turn = (r.session || state.sessionId) + ':user-turn:' + r.revision;
        if (state.turns[turn] && r.delivery && r.delivery !== state.turns[turn].status)
            presenceReceipt(turn, r.delivery);
    }
}
catch { } }
// Joining a room lands on a conversation of the machine joined: the one this tab remembers, else the first one
// listening in the list. With none at all, the list opens by itself — empty, which says so — once per call (2026-09-26).
let emptyListShownFor=null;
async function selectOnlyListeningConversation(){
 if(targetId()||state.switching||!state.ws)return false;
 const listening=state.people.filter(person=>person.node===state.callNode&&person.available&&person.reach?.state==='listening');
 if(!listening.length){
  if(emptyListShownFor!==state.sessionId){emptyListShownFor=state.sessionId;window.dispatchEvent(new Event('sidevoice-conversations-open'))}
  return false;
 }
 await select(personKey(listening[0]));return true;
}
// A machine's conversations, each row the room's own with the machine it came from. An answer from a link that has
// moved since describes nobody it can talk to.
async function refreshPeople(fp=state.callNode){
 const link=links.get(fp),base=link?.base;if(base==null)return;
 const asked=link.peopleAsked=(link.peopleAsked||0)+1,session=state.sessionId;
 try{
  const data=await api(roomQuery('/api/presentation/participants',fp),undefined,fp);
  if(links.get(fp)!==link||link.base!==base||asked!==link.peopleAsked||fp===state.callNode&&session!==state.sessionId||!Array.isArray(data?.participants))return;
  link.peopleAnswered=true;link.people=data.participants.map(person=>({...person,node:fp}));
  if(fp===state.callNode)for(const person of data.participants)acceptEpoch(person.thread_id,person.epoch);
  mergePeople();
  const activity={...state.harness};
  for(const person of data.participants){const key=conversationKey(fp,person.thread_id);
   if(typeof person.working==='boolean')activity[key]=person.working;
   else delete activity[key];
  }
  state.harness=activity;drainReplies();
  if(fp===state.callNode)await reselectRemembered()||await selectOnlyListeningConversation();
 }catch{}
}
/* The machines' beat: every live machine is located while it has no address (or its proof is old), and asked for its
 * conversations — and, unless the call is on it, its history — once it has one. The call's machine also has the call's
 * own quicker beat (`callBeat`). */
function machinesBeat(){
 roomStore.patch({machinesAt:Date.now()});
 for(const fp of liveMachines()){
  const link=links.get(fp),fresh=link?.base!=null&&Date.now()-(verified.get(link.base)||0)<VERIFIED_FOR_MS&&link.doubted!==link.base;
  if(!link||link.base==null||!fresh&&!pairings.list.find(p=>p.fp===fp)?.local)void locate(fp);
  if(link?.base!=null){void refreshPeople(fp);if(fp!==state.callNode)void refreshHistory(fp)}
 }
}
function callBeat(){if(state.callNode==null)return;void refresh();void refreshHistory(state.callNode)}
/* ----- pairing this device with a machine (`device-pairing.js`) ----- */
function openPairing(note=''){roomStore.patch({pairingOpen:true,pairingNote:note})}
function closePairing(){roomStore.patch({pairingOpen:false,pairingNote:''})}
// A machine no longer knows this device's token: the pairing is kept, saying so, and its conversations with it. When it
// is the call's machine the call ends. A new code is asked for only when the refusal answers something the person did
// on that machine — the call, or an action on its page (`asked`): one the page met while merely watching it says so in
// its row, and asks nothing of a person who may be busy with another.
// `token`: the credential that was refused — one a pairing made since has replaced is not this pairing's to lose.
function pairingRefused(fp,{call=false,token=null,asked=false}={}){
 const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing||pairing.revoked||token!=null&&pairing.token!==token)return;
 keepPairings(revokedPairing(pairings,fp));
 settleLink(fp,null,'revoked');
 const onCall=fp===state.callNode&&(call||inCallNow());
 if(!onCall&&!asked)return;
 // Said of the machine that refused, whichever one the call is on.
 const text=reachNote({...roomStore.getState().facts,callNode:fp});
 if(onCall){callEndedBy('failed',text);disconnect();reachFailure={text,node:fp};failJoin({text})}
 openPairing(text);
}
// A code, redeemed where the machine proves it is itself: from then on one more machine, live at once, call or not.
async function pairDevice(code,name,address='',{insecure=false}={}){
 const about=await describeTarget();if(about)targetAbout=about;
 const t=translator(),defaultName=currentDeviceName((kind,params)=>t('pair.deviceNameBrowser',params));
 const {pairing,base}=await redeemPairingCode(code,{name:name||defaultName,address,target,about,origin:location.origin,get:fetch,insecure});
 if(localPairing?.fp===pairing.fp){
  try{await fetch(base.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token))}catch{}
  closePairing();return {host:localPairing.host};
 }
 keepPairings(withPairing(pairings,pairing));
 void hostAgentsController.load(pairing.fp);
 verified.set(base.base,Date.now());hostAgentBases.set(pairing.fp,base.base);
 if(!(pairing.fp===state.callNode&&state.ws))settleLink(pairing.fp,base,'ok');
 closePairing();
 return {host:pairing.host};
}
// Forgotten here at once; the machine is asked to revoke the token too, only at an address that proves it is that
// machine — the token goes nowhere else — and without waiting on it: it is a courtesy, not a condition.
async function forgetMachine(fp){
 if(pairings.list.some(p=>p.fp===fp&&p.local))return;
 const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing)return;
 const known=linkBase(fp);
 // The call ends only when it is with the machine forgotten.
 if(fp===state.callNode&&inCallNow())disconnect();
 keepPairings(withoutPairing(pairings,fp));
 if(pairing.revoked)return;
 // Gone from here at once; the machine is told now if it answers, else whenever it does (pendingRevokes).
 const told=await revokeOn(pairing,known!=null&&Date.now()-(verified.get(known)||0)<VERIFIED_FOR_MS?known:null);
 if(!told)keepPendingRevoke(pairing);
}
// A forgotten machine that could not be told: its token is still good there until it is. What is needed to tell it is
// kept (this device's storage, as the pairing was) and tried again — on start, and every few minutes — until it hears.
const PENDING_REVOKES_KEY='sidevoice.pending-revokes';
function pendingRevokes(){try{const kept=JSON.parse(pageStorage()?.getItem(PENDING_REVOKES_KEY)||'[]');return Array.isArray(kept)?kept.filter(p=>p&&typeof p.fp==='string'&&typeof p.token==='string'&&typeof p.device_id==='string'):[]}catch{return []}}
function writePendingRevokes(list){try{if(list.length)pageStorage()?.setItem(PENDING_REVOKES_KEY,JSON.stringify(list));else pageStorage()?.removeItem(PENDING_REVOKES_KEY)}catch{}}
function keepPendingRevoke(pairing){
 const {fp,device_id,token,urls,rv,public_key,host,insecure}=pairing;
 writePendingRevokes([...pendingRevokes().filter(p=>p.fp!==fp),{fp,device_id,token,urls,rv,public_key,host,...(insecure?{insecure}:{})}]);
}
/** Tells a machine this device is gone (its token revoked there), at an address that proves it is that machine. */
async function revokeOn(pairing,knownBase=null){
 try{
  // The page's own origin is the base '', which is known all the same.
  const place=knownBase!=null?{base:knownBase}:await firstProven(candidateBases(pairing,{target,about:targetAbout,origin:location.origin}),pairing,{get:fetch});
  if(!place)return false;
  const response=await fetch(place.base+'/api/device/devices/'+encodeURIComponent(pairing.device_id),withToken({method:'DELETE'},pairing.token));
  // Gone there already (401/404) is as good as told.
  return response.ok||response.status===401||response.status===404;
 }catch{return false}
}
let revokingPending=false;
async function retryPendingRevokes(){
 if(revokingPending)return;revokingPending=true;
 try{
  const left=[];
  for(const pending of pendingRevokes()){
   // Paired again since: nothing to revoke.
   if(pairings.list.some(p=>p.fp===pending.fp))continue;
   if(!await revokeOn(pending))left.push(pending);
  }
  writePendingRevokes(left);
 }finally{revokingPending=false}
}
// (Never holding a process open where timers can: the runtime's tests.)
if(typeof setInterval==='function'){setTimeout(()=>void retryPendingRevokes(),5000)?.unref?.();setInterval(()=>void retryPendingRevokes(),5*60*1000)?.unref?.()}
async function localHostApi(path,options={}){
 const pairing=localPairing;
 if(!pairing||!pairing.urls[0])throw Error('local-host-unavailable');
 const response=await fetch(pairing.urls[0]+path,withToken({...options,redirect:'error'},pairing.token));
 if(!response.ok)throw Error('local-host-request-failed');
 return response;
}
async function hostApi(fp,path,options={}){
 const pairing=pairings.list.find(item=>item.fp===fp);
 if(!pairing||pairing.revoked)throw Object.assign(Error('unreachable'),{key:'unreachable'});
 let base=pairing.local?pairing.urls[0]:hostAgentBases.get(fp);
 if(base==null||!pairing.local&&Date.now()-(verified.get(base)||0)>=VERIFIED_FOR_MS){
  if(pairing.local)base=pairing.urls[0];
  else{
   let place=null;
   try{place=await firstProven(candidateBases(pairing,{target,about:targetAbout,origin:location.origin}),pairing,{get:fetch})}catch{}
   if(!place)throw Object.assign(Error('unreachable'),{key:'unreachable'});
   base=place.base;verified.set(base,Date.now());hostAgentBases.set(fp,base);
   // A machine found here is found for its conversations too — one watched, still paired as it was asked, and not
   // the call's on another address.
   if(linkBase(fp)==null&&liveMachines().includes(fp)&&pairings.list.find(p=>p.fp===fp)===pairing&&!(fp===state.callNode&&state.ws))settleLink(fp,place,'ok');
  }
 }
 // The page's own origin is a valid, empty prefix. Keep it distinct from a missing base so a node
 // served by this page can be proved and its authenticated API can use root-relative paths.
 if(typeof base!=='string')throw Object.assign(Error('unreachable'),{key:'unreachable'});
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),23000);
 let response;
 try{response=await fetch(base+path,withToken({...options,signal:abort.signal,redirect:'error'},pairing.token))}
 catch(error){throw Object.assign(Error('unreachable'),{key:error?.name==='AbortError'?'timeout':'unreachable'})}
 finally{clearTimeout(timer)}
 let data=null;
 try{data=await response.json()}catch{}
 // Asked of the machine from its page — its agents, its devices, its card: the person's own act on it.
 if(response.status===401){pairingRefused(fp,{token:pairing.token,asked:true});throw Object.assign(Error('unreachable'),{key:'unreachable'})}
 if(!response.ok){
  const failure=data?.error&&typeof data.error==='object'?data.error:data;
  const key=typeof failure?.key==='string'&&/^[a-z0-9._-]+$/.test(failure.key)?failure.key:response.status===503?'no-connector':'request-failed';
  const params=failure?.params&&typeof failure.params==='object'?Object.fromEntries(Object.entries(failure.params).filter(([,value])=>typeof value==='string'||typeof value==='number'&&Number.isFinite(value))):undefined;
  throw Object.assign(Error(key),{key,params});
 }
 return data;
}
function hostAgentState(fp){return state.hostAgents[fp]}
function setHostAgentState(fp,next){roomStore.patch({hostAgents:{...state.hostAgents,[fp]:next}})}
const hostAgentsController=createHostAgentsController({request:hostApi,
 hasHost:fp=>pairings.list.some(pairing=>pairing.fp===fp&&!pairing.revoked),getState:hostAgentState,setState:setHostAgentState,
 removeState:fp=>{const next={...state.hostAgents};delete next[fp];roomStore.patch({hostAgents:next})}});
function discardHostAgents(fp){
 hostAgentsController.invalidate(fp);
 hostAgentBases.delete(fp);
}
function discardChangedHostAgents(previous,next){
 for(const old of previous.list){
  const current=next.list.find(pairing=>pairing.fp===old.fp);
  if(!current||current.revoked||current.token!==old.token)discardHostAgents(old.fp);
 }
}
function scanPairedAgents(rescan=false){
 for(const pairing of pairings.list)if(!pairing.revoked)void hostAgentsController.load(pairing.fp,{rescan});
}
// This device in a section of its own, in the desktop app only: its agents and its preparing are asked for
// there, not under Remote machines.
function ownComputerSection(){return !!(state.inApp&&state.localHostAvailable)}
function openAgentSettings(fp){
 settingsSection(ownComputerSection()&&localPairing?.fp===fp?'this-computer':'machines');
 roomStore.patch({settingsAgentRequest:{fp,id:++settingsAgentRequestId}});
}
function deviceRows(data){
 const rows=Array.isArray(data)?data:Array.isArray(data?.devices)?data.devices:[];
 return rows.filter(row=>row&&(typeof row.device_id==='string'||typeof row.id==='string')).map(row=>({device_id:row.device_id||row.id,name:row.name||null,kind:row.kind||'code',current:!!row.current,
  created_at:row.created_at??row.created??null,last_seen_at:row.last_seen_at??row.last_seen??null}));
}
async function localHostDevices(){
 return deviceRows(await(await localHostApi('/api/device/devices',{headers:{accept:'application/json'},cache:'no-store'})).json());
}
async function revokeLocalHostDevice(id){
 await localHostApi('/api/device/devices/'+encodeURIComponent(id),{method:'DELETE',headers:{accept:'application/json'}});
}
// Any paired machine's devices, asked of it with this device's own pairing: every paired device may list them and
// revoke another (never itself: that is forgetting the machine).
async function machineDevices(fp){return deviceRows(await hostApi(fp,'/api/device/devices',{headers:{accept:'application/json'},cache:'no-store'}))}
async function revokeMachineDevice(fp,id){await hostApi(fp,'/api/device/devices/'+encodeURIComponent(id),{method:'DELETE',headers:{accept:'application/json'}})}
// A device renamed in a machine's list: the machine keeps its name (PATCH, sidevoice-web #75; a contract gap in core).
const renameBody=name=>({method:'PATCH',headers:{'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({name:clampDeviceName(name)})});
async function renameMachineDevice(fp,id,name){await hostApi(fp,'/api/device/devices/'+encodeURIComponent(id),renameBody(name))}
async function renameLocalHostDevice(id,name){await localHostApi('/api/device/devices/'+encodeURIComponent(id),renameBody(name))}
// Browsers cannot set headers on a WebSocket: the token travels as the second subprotocol, the node answers with the first.
function callProtocols(fp){const pairing=pairings.list.find(p=>p.fp===fp);if(!pairing?.token||pairing.revoked)throw worded(noMachine());return ['sidevoice','sidevoice.token.'+pairing.token]}
async function reselectRemembered(){
 // After a reload or a reconnect this tab goes back to the conversation it was on, if it is still in the room.
 const wanted=rememberedThread();
 if(!wanted||targetId()||state.switching||!state.ws||conversationOf(wanted)?.node!==state.callNode)return false;
 if(!state.people.some(person=>personKey(person)===wanted&&person.available))return false;
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
 const t=translator(),states=['queued','playing','playback_finished','interrupted','failed'];
 const rows=replies.slice(-12).reverse().map(r=>{
  const row=document.createElement('tr'),input=r.input_ms||{},server=r.server_ms||{};
  row.append(statsCell('td',r.reply_revision),...[
   input.endpoint_silence_ms,input.recognition_ms,
   server.input_queued_to_reply_received_ms,server.reply_received_to_dispatched_ms
  ].map(value=>statsCell('td',statsDuration(value))),statsCell('td',states.includes(r.status)?t('stats.reply.'+r.status):r.status||'—'));
  return row;
 });
 $('stats-rows').replaceChildren(...rows);
 $('stats-empty').textContent=replies.length?'':t('stats.noRepliesConversation');
 renderLatencyStages(replies.at(-1));
 renderLatencyAggregates(measured);
}
// The last turn, stage by stage in the order they happen; each measured on its own clock, so bars compare, they do not add up.
// The second entry is the stage's stable name: it identifies the row in the aggregates and is what a metric will be called.
// Its label is the key `stats.stage.<name>`.
const LATENCY_STAGES=[
 [r=>r.input_ms?.endpoint_silence_ms,'endpoint_silence'],
 [r=>r.input_ms?.recognition_ms,'recognition'],
 [r=>r.input_ms?.transcript_to_delivery_ms,'transcript_to_delivery'],
 [r=>r.server_ms?.delivery_accepted_to_read_ms??r.server_ms?.input_queued_to_read_ms,'delivery_to_read'],
 [r=>r.server_ms?.read_to_reply_received_ms,'read_to_reply'],
 [r=>r.server_ms?.input_queued_to_reply_received_ms,'input_queued_to_reply'],
 [r=>r.server_ms?.reply_received_to_dispatched_ms,'reply_to_dispatch'],
];
function renderLatencyStages(reply){
 const list=$('stats-stages');if(!list)return;list.replaceChildren();
 const t=translator();
 if(!reply){$('stats-stages-note').textContent=t('stats.noTurn');return}
 const values=LATENCY_STAGES.map(([pick,key])=>[t('stats.stage.'+key),pick(reply)]),max=Math.max(1,...values.map(([,v])=>statsNumber(v)?v:0));
 for(const [label,value] of values){const item=document.createElement('li');const name=document.createElement('span');name.textContent=label;const bar=document.createElement('i');if(statsNumber(value))bar.style.width=Math.max(1,Math.round(value/max*100))+'%';else bar.hidden=true;const amount=document.createElement('b');amount.textContent=statsDuration(value);item.append(name,bar,amount);list.append(item)}
 $('stats-stages-note').textContent=t('stats.stagesScale',{n:reply.reply_revision});
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
 const t=translator();
 return stages.map(([pick,key])=>({key,label:t('stats.stage.'+key),...statsSummary(measured.map(reply=>pick(reply)))}));
}
const aggregateColumns=()=>{const t=translator();return [t('stats.column.stage'),'n',t('stats.column.mean'),'p50','p90',t('stats.column.max')]};
function statsThreads(replies){return [...new Set(replies.map(reply=>reply.thread_id).filter(Boolean))]}
function statsConversationName(threadId){const p=state.people.find(person=>person.node===state.callNode&&person.thread_id===threadId);return displayTitle(p?.title,p)||threadId}
function statsAggregateCaption(count){return translator()(count===1?'stats.measured.one':'stats.measured.other',{n:count})}
function statsAggregateTable(caption,rows){
 const wrap=document.createElement('div');wrap.className='stats-table-wrap';
 const table=document.createElement('table');table.className='stats-table';
 const title=document.createElement('caption');title.textContent=caption;
 const head=document.createElement('thead'),headRow=document.createElement('tr');
 headRow.append(...aggregateColumns().map(text=>statsCell('th',text)));head.append(headRow);
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
 const t=translator();
 if(!statsReplies.length){host.replaceChildren();$('stats-aggregates-note').textContent=t('stats.noRepliesCall');return}
 const threads=statsThreads(statsReplies);
 const tables=[statsAggregateTable(t('stats.wholeSession',{measured:statsAggregateCaption(statsReplies.length)}),statsAggregate(statsReplies))];
 // The agent side dominates and differs per harness, so a call that talked to two conversations gets one table each.
 if(threads.length>1)for(const thread of threads){
  const own=statsReplies.filter(reply=>reply.thread_id===thread);
  tables.push(statsAggregateTable(statsConversationName(thread)+' · '+statsAggregateCaption(own.length),statsAggregate(own)));
 }
 host.replaceChildren(...tables);
 $('stats-aggregates-note').textContent=t('stats.aggregatesOver',{measured:statsAggregateCaption(statsReplies.length)});
}
function statsTextTable(caption,rows){
 const columns=aggregateColumns(),cells=[columns,...rows.map(row=>[row.label,row.count?String(row.count):'—',statsDuration(row.mean),statsDuration(row.p50),statsDuration(row.p90),statsDuration(row.max)])];
 const widths=columns.map((_,column)=>Math.max(...cells.map(row=>row[column].length)));
 const line=row=>row.map((cell,column)=>column?cell.padStart(widths[column]):cell.padEnd(widths[column])).join('  ').trimEnd();
 return [caption,line(cells[0]),widths.map(width=>'-'.repeat(width)).join('  '),...cells.slice(1).map(line)].join('\n');
}
function statsAggregatesText(replies){
 const measured=(Array.isArray(replies)?replies:[]).filter(Boolean),threads=statsThreads(measured);
 const t=translator(),blocks=[statsTextTable(t('stats.wholeSession',{measured:statsAggregateCaption(measured.length)}),statsAggregate(measured))];
 if(threads.length>1)for(const thread of threads){
  const own=measured.filter(reply=>reply.thread_id===thread);
  blocks.push(statsTextTable(statsConversationName(thread)+' · '+statsAggregateCaption(own.length),statsAggregate(own)));
 }
 return [t('stats.copyHeading'),...blocks].join('\n\n');
}
async function copyLatencyAggregates(){
 const status=$('stats-aggregates-copied');
 const t=translator();
 if(!statsReplies.length){status.textContent=t('stats.nothingToCopy');return}
 try{
  const clipboard=globalThis.navigator?.clipboard;
  if(!clipboard?.writeText)throw Error('no clipboard');
  await clipboard.writeText(statsAggregatesText(statsReplies));
  status.textContent=t('stats.copiedAsText');
 }catch{status.textContent=t('stats.copyFailedTable')}
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
let playbackThread=null;
function reconcileSession(view){
 const thread=targetId();
 if(thread!==playbackThread){playbackThread=thread;window.sidevoiceUI?.playbackLevel?.clear?.()}
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
 // The call's machine, else the first one this page reaches.
 const fp=state.callNode??[...links.values()].find(link=>link.base!=null)?.fp;
 if(fp==null)return;
 request('/api/presentation/client-error',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)},fp).catch(()=>{});
}
window.sidevoiceReportError=reportClientError;
for(const queued of window.sidevoiceClientErrors||[])reportClientError(queued);
window.sidevoiceClientErrors=[];
function forgetThread(threadId){state.history=state.history.filter(r=>r.thread!==threadId);save();if(state.viewedThread===threadId)state.viewedThread=null;markHistorySeen()}
function versionFacts(){
 const page=window.sidevoiceBuildId||'dev',served=state.roomInfo?.web_build||null;
 const stale=served&&page!=='dev'&&served!==page;
 const t=translator();
 return [[t('stats.fact.pageVersion'),page],[t('stats.fact.servedVersion'),served?t(stale?'stats.served.stale':'stats.served.current',{build:served}):'—'],[t('stats.fact.server'),state.roomInfo?.version||'—']];
}
const MIC_STATES=['idle','muted','listening','speaking'],SPEAKER_STATES=['idle','synthesizing','playing'],SOCKET_STATES=['connecting','open','closing','closed'];
function renderConnectionStats(data,roundTrip){
 const call=state.sessionId&&data?.call?.id===state.sessionId?data.call:null,voiceState=state.voiceState;
 const t=translator(),socket=t('stats.socket.'+(SOCKET_STATES[state.ws?.readyState]||'closed'));
 const facts=[
  ...versionFacts(),
  ['WebSocket',socket],
  [t('stats.fact.http'),statsDuration(roundTrip)],
  [t('stats.fact.session'),state.sessionId||t('stats.noCall')],
  [t('stats.fact.serverAndDevice'),call?t('stats.sameSession'):state.sessionId?t('stats.sessionUnconfirmed'):t('stats.noCall')],
  [t('stats.fact.voice'),t(state.inApp?'stats.voice.app':'stats.voice.page')],
  [t('stats.fact.microphone'),t('stats.mic.'+(MIC_STATES.includes(voiceState?.listening)?voiceState.listening:'idle'))],
  [t('stats.fact.transcribing'),voiceState?String(voiceState.recognising):'—'],
  [t('stats.fact.speaker'),SPEAKER_STATES.includes(voiceState?.playback)?t('stats.speaker.'+voiceState.playback):'—'],
  [t('stats.fact.unacknowledged'),String(outbox.size)],
  [t('stats.fact.screen'),t(screenWakeLock&&!screenWakeLock.released?'stats.enabled':'stats.unconfirmed')]
 ];
 $('stats-connection').replaceChildren(...facts.flatMap(([label,value])=>[statsCell('dt',label),statsCell('dd',value)]));
}
function resetStats(){renderLatencyStats(null,null);$('stats-connection').replaceChildren();$('stats-updated').textContent=''}
async function refreshConnectionStats(){
 if(!$('connection-stats').open||statsRequest)return;
 const epoch=statsEpoch,callId=state.sessionId,thread=targetThread(),controller=new AbortController();
 statsRequest=controller;$('stats-refresh').disabled=true;
 const timeout=setTimeout(()=>controller.abort(),5000);
 const started=latencyNow();
 try{
  const [connection,latency]=await Promise.allSettled([
   api(roomQuery('/api/presentation'),{signal:controller.signal}).then(data=>({data,elapsed:latencyNow()-started})),
   request(roomQuery('/api/presentation/latency'),{signal:controller.signal}).then(async response=>{
    if(response.status===404)return {unavailable:true};
    if(!response.ok)throw Error('latency request failed: '+response.status);
    return response.json();
   })
  ]);
  if(epoch!==statsEpoch||!$('connection-stats').open)return;
  const t=translator();
  if(callId!==state.sessionId||thread!==targetThread()){resetStats();$('stats-status').textContent=t('stats.status.changed');return}
  if(connection.status==='fulfilled')renderConnectionStats(connection.value.data,connection.value.elapsed);
  else renderConnectionStats(null,null);
  const snapshot=latency.status==='fulfilled'?latency.value:null;
  const matches=!!callId&&snapshot?.session_id===callId;
  renderLatencyStats(matches?snapshot:null,thread);
  $('stats-status').textContent=t(connection.status==='rejected'||latency.status==='rejected'?'stats.status.retrying'
   :snapshot?.unavailable?'stats.status.unavailable':!callId?'stats.status.join':!matches?'stats.status.waiting':'stats.status.live');
  $('stats-updated').textContent=new Date().toLocaleTimeString(document.documentElement?.lang||undefined);
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
 stopConnectionStats();const menu=$('call-menu');if(menu)menu.open=false;resetStats();
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
        startMessageTurns.delete(d.client_msg_id);
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
    if (t === 'voice-reply-withdrawn') {
        withdrawReplies(d);
        return;
    }
    // The room's answer to a turn this page said started, by the turn's name: the conversation it goes to is the one the
    // room captured.
    if (t === 'voice-user-turn' && d.phase === 'started') {
        state.roomRevision = Math.max(state.roomRevision, d.revision);
        acceptEpoch(d.thread_id,d.epoch);
        awaitingTurnAck.delete(d.turn_id);
        if (state.userTurn?.id === d.turn_id)
            state.userTurn = { ...state.userTurn, thread: conversationKey(state.callNode, d.thread_id) };
        drainReplies();
        return;
    }
    if (t === 'voice-input-receipt') {
        const receiptId = d.history_id || (d.session_id || state.sessionId) + ':user-turn:' + d.turn_id;
        const row = state.history.find(r => r.thread === conversationKey(state.callNode, d.thread_id) && r.segment === receiptId);
        if (row) {
            state.history = state.history.map(r => r === row ? { ...r, delivery: d.status } : r);
            save();
            markHistorySeen();
        }
        else
            state.inputReceipts = { ...state.inputReceipts, [receiptId]: d.status };
        if ((d.session_id || state.sessionId) === state.sessionId && conversationKey(state.callNode, d.thread_id) === targetId())
            presenceReceipt((d.session_id || state.sessionId) + ':user-turn:' + d.revision, d.status);
    }
    if (t === 'voice-conversation' && d.thread_id) {
        const key = conversationKey(state.callNode, d.thread_id);
        if (typeof d.working === 'boolean') {
            state.harness = { ...state.harness, [key]: d.working };
            if (d.turn_phase === 'end' && d.session_id === state.sessionId && key === targetId()
                    && Number.isInteger(d.revision)) {
                const id = d.session_id + ':user-turn:' + d.revision;
                const previous = state.turns[id] || {};
                state.turns = { ...state.turns, [id]: { ...previous, session: d.session_id,
                    thread: key, settled: true, harnessEnded: true } };
                if (!previous.harnessEnded)
                    window.sidevoiceTelemetry?.endTurn?.(d.thread_id, d.revision, 'harness_finished');
            }
        }
    }
    if (t === 'error') {
        // A refusal of one of this page's own messages is about that message (`turn-relay.js`): a turn the room has no
        // room for yet (`room.turns_full`) is kept, words and all, and started again once another ends; any other
        // refused start makes its turn's words go as said while away; the rest is the room keeping its own books.
        if (d.client_msg_id) {
            // An end refused because its start was: its words go again, as the start now allows.
            const words = relay.refusedMessage(d.client_msg_id, d.key);
            const turnId=startMessageTurns.get(d.client_msg_id);
            if(turnId){startMessageTurns.delete(d.client_msg_id);awaitingTurnAck.delete(turnId)}
            if (words)
                keepMessage('user-turn', 'voice-user-turn', words);
            flushOutbox();
            return;
        }
        setRoomError(roomError(refusalError(d)));
    }
}
/* ----- the voice's reports -----
 * The person's turn, as the voice heard it: a draft bubble while it is open, the words once it is finished, and the
 * message itself in the outbox for the room. */
// Which machine each of the voice's turns was said to. What the voice reports of a turn after the call moved to another
// machine (its words, transcribed late; its cancellation) is that machine's no longer, and goes nowhere.
const turnNodes=new Map();
let turnSend=Promise.resolve();
let turnSendPending=0;
function voiceTurn(turn){
 if(turn.phase==='started'){
  turnNodes.set(turn.turn_id,{node:state.callNode,thread_id:targetThread(),binding_id:state.roomBinding?.binding_id});
  if(turnNodes.size>64)turnNodes.delete(turnNodes.keys().next().value);
 }
 const target=turnNodes.get(turn.turn_id);
 if(turn.phase!=='started')turnNodes.delete(turn.turn_id);
 if(!target||target.node!==state.callNode)return;
 if(turn.phase==='started')openVoiceTurns.set(turn.turn_id,target.thread_id);
 else openVoiceTurns.delete(turn.turn_id);
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
    state.history=state.history.filter(r=>!(r.segment===segment&&r.thread===thread));
    add('user',turn.text,null,thread,{history_id:segment,turn_id:turn.turn_id,draft:false,time:Date.now(),delivery:thread?takeReceipt(segment)||'pending':'not_sent'});
   }else state.history=state.history.filter(r=>!(r.segment===segment&&r.thread===thread));
   markHistorySeen();
  }
 });
 const payload=turnMessage(turn,target);
 // A final turn frame cannot outrun the terminal playback evidence it caused.
 const active=turn.phase==='started'?[]:[...replies.values()].filter(said=>said.reply.thread_id===target.thread_id&&said.saying);
 const send=()=>{
  const entry=keepMessage('user-turn','voice-user-turn',payload);
  if(turn.phase==='started'){awaitingTurnAck.set(turn.turn_id,target.thread_id);startMessageTurns.set(entry.id,turn.turn_id)}
  flushOutbox();drainReplies();
 };
 if(!turnSendPending&&!active.length)send();
 else{
  ++turnSendPending;
  turnSend=turnSend.then(async()=>{await Promise.allSettled(active.map(said=>said.saying.outcome));send()}).finally(()=>{--turnSendPending});
 }
}
// A receipt the room sent before this page had the row it is about: handed over once, then forgotten.
function takeReceipt(segment){const status=state.inputReceipts[segment];if(status==null)return null;const {[segment]:_,...rest}=state.inputReceipts;state.inputReceipts=rest;return status}
// Why the voice could not do something (a reply it could not say, a transcription that failed) stays here, where it can
// be acted on, and in the machine's log.
function voiceFailed(error){window.sidevoiceUI?.playbackLevel?.clear?.();setRoomError(voiceError(error));reportClientError({kind:'voice',message:failureCode(error,'')})}
function voiceStateChanged(next){
 if(next?.playback!=='playing')window.sidevoiceUI?.playbackLevel?.clear?.();
 roomStore.batch(()=>{
  state.voiceState=next;
  state.userLive=next?.listening==='speaking';
  state.botLive=next?.playback==='playing';
  if(state.userTurn&&next?.listening!=='speaking'&&next?.recognising>0)state.pendingPhase='transcribing';
  if(next?.listening==='speaking')state.userQuietAt=0;
 });
}
// The microphone's level for whoever shows it: the meter, the bubble's waveform, and outside this page the desktop
// app's call controls card (state/mic-level.ts). From 0 to 100, as the meter's scale.
const waveLevels=new Float32Array(256);
function voiceLevel(level){
 const value=Math.max(0,Math.min(100,Math.round(Number(level)*100)||0));
 waveLevels.copyWithin(0,1);waveLevels[waveLevels.length-1]=value/100;
 $('mic-control')?.style.setProperty('--mic-fill',value+'%');
 $('mic-level-meter')?.setAttribute('aria-valuenow',String(value));
 const channel=window.sidevoiceUI?.micLevel;if(typeof channel?.publish==='function')channel.publish(value);
}
// This is the speaker's level, never the microphone's. A host without the optional output channel leaves it at rest.
function voicePlaybackLevel(level){
 if(!voice||state.voiceState?.playback!=='playing')return;
 // The host's level has no reply id. Use the replies whose handles say they are playing, not the binding at callback
 // time: a prior reply may still sound after a same-machine conversation switch. Mixed threads are ambiguous.
 const sounding=[...replies.values()].filter(said=>said.playing);
 if(!sounding.length||sounding.some(said=>said.thread!==sounding[0].thread)||sounding[0].thread!==targetId())return;
 window.sidevoiceUI?.playbackLevel?.publish?.(level,sounding[0].thread);
}
// The bubble of the turn being recorded draws the level the voice reports, as a waveform of the last moments.
window.sidevoiceAudio={readWaveform(){return voice?waveLevels.map((value,index)=>value*(index%2?1:-1)):null}};
// A reply to say: written in the conversation, and said after what is being said. Which replies are stale is the
// room's to say (`voice-reply-withdrawn`); one this page already says is not said twice.
function receiveReply(d){
 if(d.session_id!==state.sessionId||replies.has(d.utterance_id))return;
 state.roomRevision=Math.max(state.roomRevision,d.revision);
 if(!d.replay)state.turns=recordReply(state,d);
 add('assistant',d.text,'voice:'+d.utterance_id,conversationKey(state.callNode,d.thread_id),{history_id:d.history_id,session:d.session_id,revision:d.revision});
 const said={reply:d,saying:null,withdrawn:null,action:null,terminal:false,playing:false,thread:conversationKey(state.callNode,d.thread_id)};
 replies.set(d.utterance_id,said);replyQueue.push(said);
 drainReplies();
}
function roomSocketUrl(fp){const base=linkBase(fp);if(base==null)throw worded(reachNote(state)||noMachine());return callSocketUrl(base,location)}
/* Why the room refused, asked of the room itself over an ordinary request.
 * The room says it twice on the socket — an error frame, then the close code 1013 — and a tunnel
 * can lose both: a phone read only «La sala rechazó la conexión» while the room had written that it
 * was full, and restarting the room was what let it in. An HTTP request is the one path no
 * proxy rewrites. `null` means the room could not be reached at all, which is a different sentence.
 * A seat freed between the refusal and this question makes the room say it would admit us now; that
 * is a truthful answer to a question asked a moment too late, and it costs only the generic line. */
async function roomRefusal(){try{const answer=await request('/api/presentation/admission',{cache:'no-store'});if(!answer.ok)return null;const admission=await answer.json();return admission&&typeof admission==='object'?admission:{}}catch{return null}}
const NODE_AWAY=new Set(['node_offline','node_unreachable','node_timeout','choose_node']);
// Why the room refused, in this page's words: its reason by its key; a refusal this page has no words for is the room
// refusing, its own sentence behind Details.
function admissionFailure(admission,broken){
 if(admission===null)return bundled('room.failure.unreachable');
 if(admission.reason==='room_is_full')return bundled('room.failure.full');
 if(admission.admitted===false&&(admission.message||admission.key||admission.reason))return refusedBy(refusalError(admission));
 return bundled(broken?'room.failure.unreachable':'room.failure.rejected');
}
const refusedBy=refusal=>roomError(refusal,'room',bundled('room.failure.refused').text);
// The room speaks first: its call id and how this call is resumed. Anything else arriving meanwhile is an ordinary room event.
function openSession(socket,hello={},fp=state.callNode,token=null){return new Promise((resolve,reject)=>{const fail=(words,forGood=false)=>{clearTimeout(timer);reject(Object.assign(Error(words.text),{words,refused:forGood}))};let timer=setTimeout(()=>lateFail(),25000),refusal=null,refused=null,broken=false;const lateFail=()=>{
  // Asking why keeps the same short patience as after a close: a room that never answered the hello may not answer this either.
  timer=setTimeout(()=>fail(bundled('room.failure.slow')),3000);
  roomRefusal().then(admission=>fail(admission&&admission.admitted?bundled('room.failure.slow'):admissionFailure(admission,false),admission?.admitted===false))};socket.onopen=()=>socket.send(JSON.stringify({label:'rtvi-ai',type:'client-ready',id:crypto.randomUUID(),data:hello}));
 // An error event is always followed by a close event, and the close is the one that can find out
 // why: failing here would answer «no se pudo conectar» to a room that knows it is full.
 socket.onerror=()=>{broken=true};
 socket.onclose=event=>{clearTimeout(timer);timer=null;
  // The machine no longer knows this device's token: final, and the pairing is what has to change.
  if(event?.code===4401){pairingRefused(fp,{call:true,token});return fail({text:reachNote(state)||NO_MACHINE},true)}
  // However the reason arrived — the close code, the frame's own name for it, the frame's sentence —
  // the person reads one sentence for one reason.
  // A room that answered and said no is not a room that is away: these are the refusals a reconnection
  // must not insist on. Everything else — no answer at all — is worth another try.
  // A room whose relay cannot reach the machine says so with the same close code as a full room, and a
  // machine that is restarting is not a refusal: its own sentence, and the next attempt may find it back.
  if(NODE_AWAY.has(refused))return fail(bundled('room.failure.machineAway'),false);
  // A frame that named another reason is that reason, whatever the close code: 1013 alone means full.
  if(refused==='room_is_full'||event?.code===1013&&!refused)return fail(bundled('room.failure.full'),true);
  // Any other reason is said in the room's own sentence, and whether it is final is the close code's to say
  // (sidevoice-core#112): one a reconnection must not insist on (shouldReconnect) is; a reason this page does not know
  // yet, on any other close, is worth another try.
  if(refusal)return fail(refusedBy(refusal),!shouldReconnect(event));
  // The question keeps a short patience of its own: a room that does not answer it cannot say why
  // either, and nobody is left looking at a join line while a request hangs.
  timer=setTimeout(()=>fail(bundled('room.failure.rejected')),3000);
  roomRefusal().then(admission=>fail(admissionFailure(admission,broken),admission?.admitted===false))};
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type!=='voice-session'){if(m.type==='error'){refusal=m.data?refusalError(m.data):refusal;refused=m.data?.reason||refused}message(e.data,socket);return}state.roomInfo=m.data?.room||state.roomInfo;clearTimeout(timer);resolve(m.data)}})}
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
    window.sidevoiceUI?.playbackLevel?.clear?.();
    // What is being said ends with the call, and the room ends its replies with the session: nothing is reported.
    replies.clear();
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
    partial('');
    state.holding = false;
    // The call's machine is no longer the call's: the conversation it was on stays on screen, as one looked at.
    if (!state.viewedThread)
        state.viewedThread = targetId();
    state.roomBinding = null;
    state.callNode = null;
    state.switching = state.reconnecting = state.reconnectShown = moving = false;
    voiceLevel(0);
    updateMic();
    applyLockScreen(false);
    syncLinks();
}
// The voice's reports, for as long as this call has it.
const voiceListeners=[];
function attachVoice(next){
 window.sidevoiceUI?.playbackLevel?.clear?.();
 voiceListeners.push(next.onTurn(voiceTurn),next.onState(voiceStateChanged),next.onLevel(voiceLevel),next.onError(voiceFailed));
 voiceListeners.push(next.onPlaybackLevel(level=>{if(voice===next)voicePlaybackLevel(level)}));
 voiceListeners.push(next.onAgentInterrupted(cut=>{
  const coreId=handleIds.get(cut.utterance_id),said=coreId&&replies.get(coreId);
  if(!said)return;
  const heard=scalarExtent(said.reply.text,cut.heard_until);
  finishReply(said,cut.played?{status:'interrupted',reason:'user_interrupted',heard_chars:heard??0}:{status:'unplayed',reason:'newer_turn'});
 }));
 void watchAudioDevices();
}
/* The microphone and the speaker the voice uses (the same seam on the web and in the desktop app): this device's
 * choices, kept here and given to the voice when it is made, and its list followed as it changes. A chosen device that
 * goes away leaves the system's default in use: the choice is dropped, and said once (audioLost). */
const AUDIO_KEY='sidevoice.audio-devices';
function storedAudio(){try{const kept=JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}');return kept&&typeof kept==='object'?kept:{}}catch{return {}}}
function keepAudio(choice){try{localStorage.setItem(AUDIO_KEY,JSON.stringify(choice))}catch{}}
let audioWatched=null;
async function watchAudioDevices(){
 const host=await voiceHost().catch(()=>null);if(!host||audioWatched===host)return;audioWatched=host;
 if(typeof host.audioDevices!=='function'){roomStore.patch({audioDevices:null});return}
 host.onAudioDevices(audioDevicesChanged);
 const kept=storedAudio();
 let devices=null;
 try{devices=Object.keys(kept).length?await host.setAudioDevices(kept):await host.audioDevices()}
 catch{devices=await host.audioDevices().catch(()=>null)}
 if(devices)audioDevicesChanged(devices);
}
function audioDevicesChanged(devices){
 if(devices.lost){const kept=storedAudio();if(devices.lost.input)delete kept.input;if(devices.lost.output)delete kept.output;keepAudio(kept)}
 roomStore.patch({audioDevices:{inputs:devices.inputs||[],outputs:devices.outputs||[],input:devices.input??null,output:devices.output??null,outputSelectable:!!devices.outputSelectable},
  ...(devices.lost?{audioLost:devices.lost}:{})});
}
async function setAudioDevices(choice){
 const host=await voiceHost();
 let devices;
 try{devices=await host.setAudioDevices(choice)}catch(error){throw voiceRefused(error,'devices')}
 // Kept for this device; the system's default keeps nothing.
 const kept=storedAudio();
 for(const kind of ['input','output'])if(kind in choice){if(choice[kind]==null)delete kept[kind];else kept[kind]=choice[kind]}
 keepAudio(kept);audioDevicesChanged(devices);return devices;
}
async function refreshAudioDevices(){
 await watchAudioDevices();
 const host=await voiceHost();if(typeof host.audioDevices==='function')audioDevicesChanged(await host.audioDevices());
}
// Joining and leaving are the same button, and it belongs to React: this is what it calls.
/* Which machine a join goes to: the one of the conversation being looked at (or the one this tab remembers) — and
 * then that one or none, so the call never lands somewhere the person did not pick —, else the first watched machine
 * with a conversation listening, else the first that answers. One with no address yet is looked for first. */
async function callMachine(epoch){
 const live=liveMachines(),wanted=conversationOf(state.viewedThread||rememberedThread())?.node;
 if(wanted&&pairings.list.some(p=>p.fp===wanted)){if(linkBase(wanted)==null)await locate(wanted,{move:true,fresh:true});return wanted}
 const listening=fp=>links.get(fp)?.people.some(p=>p.available&&p.reach?.state==='listening');
 const pick=()=>live.filter(fp=>linkBase(fp)!=null).sort((a,b)=>Number(listening(b))-Number(listening(a)))[0]??null;
 if(pick()==null)await Promise.all(live.map(fp=>locate(fp,{move:true,fresh:true})));
 return epoch===connectEpoch?pick()??wanted??live[0]??null:null;
}
async function toggleCall(){if(state.ws||state.connecting||state.reconnecting){disconnect();return}
 // Nothing to join without a machine this device is paired with: the tap asks for a code instead.
 if(!pairings.list.some(p=>!p.revoked)){openPairing(pairings.list.length?reachNote(state):'');return}
 personSignal();primeNowPlaying();state.callEnded=null;state.connecting=true;const epoch=++connectEpoch;keepScreenAwake();setRoomError('');joinStatus('voice');
 try{
  const fp=await callMachine(epoch);if(epoch!==connectEpoch)return;
  // From here the call is this machine's: what the voice reports is kept for it, and its reach is the one said.
  state.callNode=fp;
  if(linkBase(fp)==null){const text=reachNote(state)||NO_MACHINE;reachFailure={text,node:fp};throw worded(text)}
  const next=await voiceHost();if(epoch!==connectEpoch)return;
  voice=next;attachVoice(next);
  await next.setSettings(voiceSettingsHere(state.voiceSettings,state.voiceCatalogue.catalogs));
  // A hang-up while the settings were taken leaves this join: nothing of it may start the microphone after it.
  if(epoch!==connectEpoch)return;
  await next.start();
  // One that came while starting stops what this join started, unless a newer call has taken the same voice.
  if(epoch!==connectEpoch){if(voice!==next)next.stop().catch(()=>{});return}
  applyMicState();applyLockScreen(true);
  joinStatus('room');
  const session=await joinRoom(epoch,{resume:storedTicket(fp)});if(epoch!==connectEpoch||!session)return;
  updateMic();
  const remembered=rememberedThread();if(rememberedOn(fp))joinStatus('conversation',{subject:conversationTitle(remembered)});
  await refresh();await refreshPeople(fp);
  if(epoch===connectEpoch){clearJoinStatus();flushOutbox()}
 }catch(e){if(epoch===connectEpoch){const failed=state.joinStep;disconnect();failJoin(joinError(failed,e))}}
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
// The conversation this tab goes back to on a machine, by the room's own name for it: none of another machine's.
function rememberedOn(fp){const wanted=conversationOf(rememberedThread());return wanted?.node===fp?wanted.thread:null}
async function joinRoom(epoch,context){
 const fp=state.callNode,protocols=callProtocols(fp);
 const socket=new WebSocket(roomSocketUrl(fp),protocols);
 // The credential this socket carries, to tell its refusal from one of a pairing made since.
 socket.token=protocols[1].slice('sidevoice.token.'.length);
 state.ws=socket;
 let session;
 // The hello carries this browser's call span, so the room's own spans are inside it instead of
 // being a second trace about the same call. With no collector configured there is no span to carry.
 const traceparent=window.sidevoiceTelemetry?.startCall?.({});
 try{session=await openSession(socket,{conversation:rememberedOn(fp),ui_language:devicePreferences().ui_language,speech:speechOutput==='on'?{on:true}:{on:false,reason:speechOutput},...(context.resume?{resume:context.resume}:{}),...(traceparent?{telemetry:{traceparent}}:{})},fp,socket.token)}
 // A join that failed leaves nothing behind. A room that is not told keeps the seat for the length of its keepalive
 // budget while the page tries again, so one local failure became a reconnect loop that ate the room's seats one every
 // thirty seconds (2026-09-22).
 catch(error){socket.onclose=socket.onmessage=socket.onerror=null;try{socket.close(1000)}catch{}if(state.ws===socket)state.ws=null;throw error}
 if(epoch!==connectEpoch){socket.close(1000);return null}
 socket.onerror=null;
 if(socket.readyState!==WebSocket.OPEN)throw worded(bundled('room.failure.dropped').text);
 socket.onclose=event=>{if(state.ws===socket)lostConnection(event,epoch,socket.token)};
 socket.onmessage=e=>{if(state.ws===socket)message(e.data,socket)};
 // Every session and every resume hands over a fresh single-use token: the newest is the one a drop will name.
 resumeToken=session.resume?.token||null;
 // Taken back as it was: the same session, its turn and its history, and every frame after `last_seq` on its way. A
 // new session knows none of the last one's turns.
 if(!resumedSession(session,context.resume)||state.sessionId!==session.session_id){
  if(!resumedSession(session,context.resume)){lastSeq=0;state.roomRevision=0}
  state.sessionId=session.session_id;relay.reset();awaitingTurnAck.clear();startMessageTurns.clear();threadEpochs.clear();
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
async function lostConnection(event,epoch,token=null){
 if(epoch!==connectEpoch||state.reconnecting)return;
 state.ws=null;keepTicket(true);
 stopReplies('connector_disconnected');
 window.sidevoiceTelemetry?.endCall?.('connection_lost');
 // Nothing the call is doing stops with its socket: the voice goes on hearing and speaking, and what it reports waits
 // in the outbox. The room parks the session meanwhile, so its turn and its history stay as they are here too.
 if(event?.code===4401){pairingRefused(state.callNode,{call:true,token});return}
 if(!shouldReconnect(event)){const message=bundled('room.failure.closed');callEndedBy('failed',message.text);disconnect();failJoin(message);return}
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
   try{session=await within((async()=>{await locate(state.callNode,{move:true,fresh:attempt>0,hold:true});return epoch===connectEpoch&&mine===current?joinRoom(epoch,{resume:ticket}):null})(),RECONNECT_ATTEMPT_MS)}
   catch(e){
    if(epoch!==connectEpoch)return;
    ++current;const pending=state.ws;state.ws=null;try{pending?.close()}catch{}
    if(refusedForGood(e)){const message=roomError(e,'room',bundled('room.failure.refused').text);callEndedBy('failed',message.text);disconnect();failJoin(message);return}
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
   // The same session again: what waited in the outbox goes now, not at the next thing the voice says.
   if(!hold)flushOutbox();
   void settleRejoin(epoch,hold);
   // Time spent in a tunnel is not time spent away: the idle clock starts again with the call.
   personSignal();
   setRoomError('');clearJoinStatus();
   return;
  }
 }finally{clearTimeout(grace);if(epoch===connectEpoch)roomStore.batch(()=>{state.reconnecting=false;state.reconnectShown=false})}
}
/* ----- the call follows the conversation: moving it to another machine -----
 * One call, one voice, with one machine at a time. Picking a conversation of another machine moves the call there and
 * keeps the voice (no new microphone prompt, no model loaded again, nothing that needs the tap's gesture):
 *  - what the person was saying was for the conversation being left: the open turn is cancelled;
 *  - the replies of the machine left that are queued or sounding are stopped, and what became of them (how much was
 *    heard) is told to that machine, so its room records them unheard — they are never said later;
 *  - what that machine is still owed is given MOVE_DRAIN_MS to be acknowledged on its socket, then the socket is closed
 *    as a hang-up (1000) and its resume ticket forgotten; anything left unacknowledged is let go, and reported;
 *  - a new session on the other machine, with the conversation picked.
 * A machine that cannot be reached, or refuses, ends the call with its reason, as a join that failed. */
var MOVE_DRAIN_MS=3000;
async function moveCall(fp,thread){
 if(!state.ws&&!state.reconnecting)return;
 const from=state.callNode,epoch=++connectEpoch,socket=state.ws;
 // From here the call is the move's: a join or a reconnection still on its way is not any more.
 roomStore.batch(()=>{state.switching=true;state.connecting=state.reconnecting=state.reconnectShown=false;state.movingTo=conversationKey(fp,thread)});
 moving=true;applyMicState();
 joinStatus('conversation',{subject:conversationTitle(conversationKey(fp,thread))});
 try{
  cancelCurrentInput();
  stopReplies('focus_changed');
  await drainOutbox(from,MOVE_DRAIN_MS,()=>epoch===connectEpoch&&state.ws===socket);
  if(epoch!==connectEpoch)return;
  leaveSession();
  rememberThread(conversationKey(fp,thread));
  state.callNode=fp;syncLinks();
  if(linkBase(fp)==null)await locate(fp,{move:true,fresh:true});
  if(epoch!==connectEpoch)return;
  if(linkBase(fp)==null){const text=reachNote(state)||NO_MACHINE;reachFailure={text,node:fp};throw worded(text)}
  const session=await joinRoom(epoch,{});
  if(epoch!==connectEpoch||!session)return;
  // In the call again: what the room still has to say of it (the binding, the conversations) never holds it in a move.
  moving=false;state.switching=false;applyMicState();clearJoinStatus();
  void settleRejoin(epoch,null);
 }catch(e){
  if(epoch!==connectEpoch)return;
  const message=joinError('room',e),gone=reachFailure?.node===fp;callEndedBy(gone?'offline':'failed',gone?conversationTitle(conversationKey(fp,thread)):message.text);disconnect();failJoin(message)
 }
 finally{if(epoch===connectEpoch){state.switching=false;moving=false;state.movingTo=null;applyMicState()}}
}
// What the call still owes a machine it is leaving, given a moment to be acknowledged on its open socket: the
// person's finished turns, and what became of each reply stopped. A stopped reply reports itself as it ends.
// `mine`: whether the move still owns the call — a hang-up or another join meanwhile, and the drain lets everything be.
async function drainOutbox(node,ms,mine){
 const owed=()=>outbox.list().some(entry=>entry.node===node)||replies.size>0;
 const until=Date.now()+ms;
 if(mine())flushOutbox();
 while(mine()&&owed()&&Date.now()<until&&state.ws?.readyState===WebSocket.OPEN){await new Promise(resolve=>setTimeout(resolve,50));if(mine())flushOutbox()}
 if(!mine())return;
 const left=outbox.list().filter(entry=>entry.node===node);
 for(const entry of left)outbox.remove(entry.id);
 if(left.length)reportClientError({kind:'move',message:'unacknowledged '+left.map(entry=>entry.kind).join(',')});
}
// The call's session ends, its voice does not: the socket is closed as a hang-up, and nothing of that session stays.
function leaveSession(){
 const socket=state.ws;
 if(socket){socket.onclose=socket.onmessage=socket.onerror=null;try{socket.close(1000)}catch{}}
 window.sidevoiceTelemetry?.endCall?.('moved');
 resumeToken=null;lastSeq=0;keepTicket(true);outboxHold=null;relay.reset();replies.clear();
 roomStore.batch(()=>{
  state.ws=null;state.sessionId=null;state.roomBinding=null;state.roomRevision=0;
  state.harness={};state.turns={};state.userTurn=null;state.pendingPhase='';state.pendingUserText='';
  state.karaokeState=null;state.userLive=state.botLive=false;
 });
}
async function replayReply(historyId){
 if(!historyId||!state.sessionId)return;
 // A reply is said again by the call's session: only one of the call's machine can be.
 if(!state.history.some(r=>r.segment===historyId&&conversationOf(r.thread)?.node===state.callNode))return;
 try{await post('/api/presentation/replay',{session_id:state.sessionId,history_id:historyId})}
 catch(error){setRoomError(roomError(error,'room',bundled('room.failure.replay').text))}
}

/* ----- the voice's settings and the remote providers' keys: this device's, never the room's -----
 * One voice for the page, and the engine's catalogues it chooses models from (`voice-module.js`): the settings pane
 * lists the catalogues and keeps keys with the engine, and every call of this page drives the voice. A key goes from
 * the pane to the engine's host and nowhere else (the desktop app keeps it in the system keychain, a browser in this
 * page's storage), and the engine hands it to the provider. */
const page=pageVoice();
let voiceHostOpening=null,catalogsOpening=null;
function voiceHost(){return voiceHostOpening??=page.voice().catch(error=>{voiceHostOpening=null;throw error})}
function modelCatalogs(){return catalogsOpening??=page.catalogs().catch(error=>{catalogsOpening=null;throw error})}
async function keptProviderKeys(models,catalogs){return Object.fromEntries(await Promise.all(remoteProviders(catalogs).map(async({id})=>[id,await models.hasCredential(id).catch(()=>null)])))}
async function loadVoiceCatalogue(){
 roomStore.patch({voiceCatalogue:{...state.voiceCatalogue,state:'loading',error:''}});
 try{const models=await modelCatalogs();const catalogs=await models.catalogs();roomStore.patch({voiceCatalogue:{state:'ready',catalogs,error:''},modelsRemovable:typeof models.uninstall==='function',providerKeys:await keptProviderKeys(models,catalogs)});
  // A model chosen while it was not here yet is put in use once it is.
  if(state.voiceDraft)void applyVoiceSettings();
  void deleteUnusedModels(models,catalogs)}
 catch(error){const words=voiceError(error,'models');roomStore.patch({voiceCatalogue:{state:'failed',catalogs:[],error:errorLine(words),details:words.details||''}})}
}
// Settings apply as they change (there is no Save): the draft is what was chosen, and what of it is ready is put in use
// at once; a model still to download waits in the draft, the one in use stays, and it switches once it is ready (the
// catalogues read again after its install). A download cancelled or failed leaves the one in use as it was.
function editVoice(patch){
 roomStore.patch({voiceDraft:editVoiceSettings(state.voiceDraft||state.voiceSettings,patch,state.voiceCatalogue.catalogs)});
 // A try of the end of turn that runs takes a change of it at once, before the voice is given the settings to keep.
 if(turnTry&&TURN_FIELDS.some(key=>key in patch))retuneTurnTry();
 void applyVoiceSettings();
}
let applying=Promise.resolve();
function applyVoiceSettings(){
 applying=applying.then(saveVoiceSettings).catch(error=>{roomStore.patch({settingsError:voiceError(error)})});
 return applying;
}
// The voice takes the settings first when this page has one: what it refuses is not kept, and a call goes on as it was.
async function saveVoiceSettings(){
 const draft=state.voiceDraft,saved=state.voiceSettings;if(!draft||!saved)return;
 const next=readyVoiceSettings(draft,saved,state.voiceCatalogue.catalogs);
 if(JSON.stringify(next)===JSON.stringify(saved))return;
 const host=await voiceHost().catch(()=>null);
 if(host)await host.setSettings(voiceSettingsHere(next,state.voiceCatalogue.catalogs));
 writeVoiceSettings(pageStorage(),next);roomStore.patch({voiceSettings:next,settingsSavedAt:Date.now(),settingsError:null});
}
// A try of the settings being edited (`voice-trial.js`), through the page's voice and outside any call: never during
// one, since it would take that call's voice. Settings that work are this device's from then on. As it goes it tells
// whoever shows it (room-types.ts TrialProgress): transcription, that the voice listens and the microphone's level;
// the voice, the part of `text` sounding, in the page's offsets into it as the room's karaoke has them (`sayingRange`).
// A try that records the person hands its take (`onTake`) to whoever shows it, and keeps nothing.
let voiceTry=null;
// Never during a call: the try would take its voice.
function refuseTryInCall(){
 if(state.ws||state.connecting||state.reconnecting)throw voiceRefused({code:'trial-in-call'},'try');
}
async function tryVoiceSettings(task,{text='',language=null,keep=true,onListening,onLevel,onProgress,onTranscribing,onTake}={}){
 refuseTryInCall();
 voiceTry?.abort();const abort=voiceTry=new AbortController();
 // Stop on a transcription try ends its take with what was said (finishVoiceTry), rather than dropping it.
 const finish=voiceTryFinish=new AbortController();
 const settings=voiceSettingsHere(state.voiceDraft||state.voiceSettings,state.voiceCatalogue.catalogs);
 try{
  const host=await voiceHost();
  // What each phase took, for the try to say how quick it was.
  let timings=null;const onTimings=value=>{timings=value};
  const result=task==='stt'?{text:await tryTranscription(host,settings,{signal:abort.signal,finish:finish.signal,onTimings,onListening,onLevel,onTranscribing,onTake})}
   :(await tryVoice(host,settings,text,{language,signal:abort.signal,onTimings,onProgress:onProgress&&(progress=>onProgress(sayingRange(progress,text)))}),{});
  result.timings=timings;
  if(keep){writeVoiceSettings(pageStorage(),settings);roomStore.patch({voiceSettings:settings})}
  return result;
 }catch(error){throw voiceRefused(error,'try')}
 finally{if(voiceTry===abort)voiceTry=null;if(voiceTryFinish===finish)voiceTryFinish=null}
}
let voiceTryFinish=null;
function cancelVoiceTry(){voiceTry?.abort()}
// Stop on a try that records: its take ends with what was said, and is transcribed; any other try is cancelled.
function finishVoiceTry(){if(voiceTryFinish)voiceTryFinish.abort();else cancelVoiceTry()}
// A try of the end of turn being edited (`voice-trial.js` tryEndOfTurn), as `tryVoiceSettings` tries the rest: through
// the page's voice, outside any call, in the same place (one try at a time, stopped by `cancelVoiceTry`). It listens
// until stopped, 30 s with no speech or a failure of the voice, telling whoever shows it each step of the person's
// turns (TrialProgress `onTurnStep`) and the microphone's level. A change of the end of turn while it runs (`editVoice`)
// restarts it with the change; the smart one without its model ready stops it. It keeps nothing: settings apply as
// they change.
const TURN_FIELDS=['patience','end_of_turn','turn_model'];
let turnTry=null;
const turnTrySettings=()=>voiceSettingsHere(state.voiceDraft||state.voiceSettings,state.voiceCatalogue.catalogs);
async function tryTurnSettings({onLevel,onTurnStep,onTake}={}){
 refuseTryInCall();
 voiceTry?.abort();const abort=voiceTry=new AbortController();
 try{
  const host=await voiceHost();
  const run=tryEndOfTurn(host,turnTrySettings(),{signal:abort.signal,onLevel,onTurnStep,onTake});
  turnTry={abort,run};
  await run.done;
 }catch(error){throw voiceRefused(error,'try')}
 finally{if(voiceTry===abort)voiceTry=null;if(turnTry?.abort===abort)turnTry=null}
}
function retuneTurnTry(){
 const settings=turnTrySettings();
 if(!modelReady(settings,'end-of-turn',state.voiceCatalogue.catalogs)){turnTry.abort.abort();return}
 void turnTry.run.retune(settings);
}
// A model of this device's catalogue the slot names but that is not on disk: installed on this device (the build the
// slot names, else its recommended one), its progress in `voiceInstall` for whatever shows it, and the catalogues read again once it is there.
let voiceInstall=null;
async function installVoiceModel(task){
 // The end of turn has no slot: its model is this device's end-of-turn model.
 const turn=task==='end-of-turn'?endOfTurnModel(state.voiceCatalogue.catalogs,(state.voiceDraft||state.voiceSettings)?.turn_model):null;
 const slot=turn?{catalog:'local',model:turn.id}:(state.voiceDraft||state.voiceSettings)?.[task];if(!slot)return;
 const model=state.voiceCatalogue.catalogs.find(c=>c.id===slot.catalog)?.models.find(m=>m.id===slot.model);
 const build=(slot.build&&model?.builds?.find(b=>b.id===slot.build))??model?.builds?.find(b=>b.id===model.recommendedBuild)??model?.builds?.find(b=>b.available);
 voiceInstall?.abort();const abort=voiceInstall=new AbortController();
 const at=fraction=>roomStore.patch({voiceInstall:{task,model:slot.model,state:'running',fraction,error:''}});
 at(null);
 try{
  const models=await modelCatalogs();
  await models.install(slot.model,{build:build?.id??null,engine:build?.backend??null,signal:abort.signal,onProgress:progress=>{if(voiceInstall===abort)at(progress.fraction)}});
  roomStore.patch({voiceInstall:null});await loadVoiceCatalogue();
 }catch(error){roomStore.patch({voiceInstall:failureCode(error,'')==='install-cancelled'?null:{task,model:slot.model,state:'failed',fraction:null,...installFailure(error)}})}
 finally{if(voiceInstall===abort)voiceInstall=null}
}
function cancelVoiceInstall(){voiceInstall?.abort()}
// Models not used for as long as the person chose (model-housekeeping.js), deleted where the engine can: none in use,
// none the engine says nothing about; the catalogues read again once one went.
async function deleteUnusedModels(models,catalogs){
 if(typeof models.uninstall!=='function')return;
 const stale=staleModels(catalogs,state.voiceSettings,state.deleteUnusedDays,Date.now());if(!stale.length)return;
 for(const model of stale)await models.uninstall(model).catch(()=>undefined);
 await loadVoiceCatalogue();
}
async function setDeleteUnusedModels(days){
 writeDeleteUnused(pageStorage(),days);roomStore.patch({deleteUnusedDays:readDeleteUnused(pageStorage())});
 if(state.voiceCatalogue.state==='ready')await deleteUnusedModels(await modelCatalogs(),state.voiceCatalogue.catalogs);
}
// A model taken off this device, every build of it, where the engine can (`modelsRemovable`); the catalogues read again.
// Its code stays on what it throws, for the pane to say a model in use as such.
async function uninstallVoiceModel(model){
 const models=await modelCatalogs();
 try{await models.uninstall(model)}catch(error){throw voiceRefused(error,'delete')}
 await loadVoiceCatalogue();
}
// A key changes what a provider lists: its catalogue is read again with it.
// A provider's key tested: the provider asked again, and the catalogues read with what it said. A host without a way to
// ask again (an older desktop app) reads them as they are.
async function testProviderKey(provider){
 const models=await modelCatalogs();
 await models.refresh?.(provider).catch(()=>undefined);
 const catalogs=await models.catalogs();
 roomStore.patch({voiceCatalogue:{state:'ready',catalogs,error:''},providerKeys:await keptProviderKeys(models,catalogs)});
}
// Only a key the provider takes is kept: tried first where the host can (`testCredential`), else kept, checked, and
// taken back when it was not taken and there was none before. A key the provider refuses, or one it could not be asked
// about (unreachable), throws its code and the provider's words; one taken that hits a limit (no credit, too many
// requests) is kept, and the provider's card says it.
const KEY_REFUSALS=new Set(['credential-rejected','listing-not-permitted','provider-unreachable','listing-failed']);
async function connectProviderKey(provider,key){
 const refused=reason=>Object.assign(Error(reason.code),{code:reason.code,detail:reason.detail??''});
 const models=await modelCatalogs();
 if(models.testCredential){
  const reason=await models.testCredential(provider,key);
  if(reason&&KEY_REFUSALS.has(reason.code))throw refused(reason);
  await saveProviderKey(provider,key);return;
 }
 const had=state.providerKeys[provider]===true;
 await saveProviderKey(provider,key);
 const status=state.voiceCatalogue.catalogs.find(catalog=>catalog.id===provider)?.status;
 if(status?.reason&&KEY_REFUSALS.has(status.reason.code)){if(!had)await saveProviderKey(provider,null);throw refused({...status.reason,detail:status.detail})}
}
async function saveProviderKey(provider,key){
 // What the engine refuses goes as it is, its code and a provider's words with it: the dialog says it (ProviderConnect).
 const models=await modelCatalogs();await models.setCredential(provider,key||null);
 // A key just given is checked with the provider at once, past any list kept from the key before.
 if(key)await models.refresh?.(provider).catch(()=>undefined);
 const catalogs=await models.catalogs().catch(()=>null);
 if(catalogs)roomStore.patch({voiceCatalogue:{state:'ready',catalogs,error:''},providerKeys:await keptProviderKeys(models,catalogs)});
}
roomStore.patch({voiceSettings:readVoiceSettings(pageStorage()),deleteUnusedDays:readDeleteUnused(pageStorage())});

$('settings-open').onclick=()=>{try{
 // Every opening reads each paired machine's agents again.
 scanPairedAgents(true);
 // Opened with no machine reachable, it shows where to get one; pressed again while open (Advanced › Reset), it stays
 // where it is.
 if(!$('language-settings').open&&![...links.values()].some(link=>link.base!=null))settingsSection(ownComputerSection()&&!localPairing?'this-computer':'machines');
 // What was chosen and is still on its way stays chosen across openings.
 roomStore.patch({voiceDraft:state.voiceDraft||state.voiceSettings});void loadVoiceCatalogue();
 const p=devicePreferences();setUiLanguage(p.ui_language);
 // Empty is Automatic: the system's language, followed as it is rather than kept.
 roomStore.patch({uiLanguage:storedPreferences().ui_language||''});
 roomStore.patch({settingsError:null});
 if(!$('language-settings').open)$('language-settings').showModal();
}catch(e){const words=roomError(e,'settings');roomStore.patch({settingsError:words});setRoomError(words)}};
// Which section Settings shows is the page's (SettingsDialog): asked for here when Settings opens on the machines
// (no machine yet) or on an agent waiting to be connected — that section's own page on a phone, not the list of them.
function settingsSection(name){roomStore.patch({settingsSection:name,settingsLevel:'page'})}
$('reset-settings').onclick=()=>{try{localStorage.removeItem(SETTINGS_KEY)}catch{}$('settings-open').onclick();saveLanguage('');
 roomStore.patch({voiceDraft:defaultVoiceSettings()});void applyVoiceSettings();$('reset-settings-note').textContent=translator()('session.settingsReset')};
$('settings-close').onclick=()=>$('language-settings').close();
// Every setting belongs to this device, and the room keeps no copy: what this browser saved wins over what its system
// says. Only the settings of today's shape are read back.
const SETTINGS_KEY='sidevoice.settings';
const DEVICE_KEYS=['ui_language'];
function readStored(key){try{const stored=JSON.parse(localStorage.getItem(key)||'null');return stored&&typeof stored==='object'?stored:{}}catch{return {}}}
function storedPreferences(){const stored=readStored(SETTINGS_KEY);return Object.fromEntries(DEVICE_KEYS.filter(key=>key in stored).map(key=>[key,stored[key]]))}
function storePreferences(p){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(Object.fromEntries(DEVICE_KEYS.filter(key=>key in p).map(key=>[key,p[key]]))))}catch{}}
function devicePreferences(){return {ui_language:systemLanguage(UI_LANGUAGES),...storedPreferences()}}
// The interface's language is this device's: saved here as it is chosen ('' is Automatic), said to the call in
// progress, applied at once; Settings shows it from the store.
function saveLanguage(chosen){
 // Automatic keeps no language: the system's is read again at each start.
 storePreferences(chosen?{ui_language:chosen}:{});
 const p={ui_language:systemLanguage(UI_LANGUAGES),...(chosen?{ui_language:chosen}:{})};setUiLanguage(p.ui_language);
 if(state.ws&&state.ws.readyState===WebSocket.OPEN&&state.sessionId)state.ws.send(JSON.stringify({type:'voice-settings',data:{session_id:state.sessionId,ui_language:p.ui_language}}));
 roomStore.patch({uiLanguage:chosen,settingsSavedAt:Date.now()});
}
// Nothing to submit: every setting applies as it changes. Enter in a field submits nothing.
$('language-form').onsubmit=e=>e.preventDefault();
window.sidevoiceActions={
 cancelInput:cancelCurrentInput,
 skipReply,
 setSpeechOutput,
 editVoice,
 saveProviderKey,
 connectProviderKey,
 setAudioDevices,
 refreshAudioDevices,
 // The interface's language, as the first-run setup asks it: '' is Automatic.
 interfaceLanguage:()=>storedPreferences().ui_language||'',
 // The newer build the room serves, loaded now (the updates' Reload), in a call or not: the person said so.
 reloadToUpdate(){
  const served=state.webUpdate;if(!served)return;
  const query=new URLSearchParams(location.search);query.set('v',served);location.replace(location.pathname+'?'+query);
 },
 setInterfaceLanguage(value){saveLanguage(value||'')},
 testProviderKey,
 loadVoiceCatalogue,
 replayReply,
 toggleMic,
 toggleCall,
 // A sign of the person: the desktop card's Keep on the idle warning (its `keep-alive`).
 keepVoiceOn:()=>personSignal(),
 // A conversation picked, by its key: looked at at once; the call goes to it when it can hear — on its machine, moving
 // the call there when it is another's. Out of a call it is the one the next join goes to. Picked while a join is still
 // on its way to another machine, that join is left and the call joined afresh, inside the person's own tap.
 selectParticipant(key){
  window.sidevoiceUI?.playbackLevel?.clear?.();
  const participant=state.people.find(item=>personKey(item)===key),to=conversationOf(key);
  state.viewedThread=key;markHistorySeen();
  if(!state.sessionId)rememberThread(key);
  // Only a machine that has proved where it is: one being looked for again is not reachable until it answers.
  const hears=!!participant?.available&&state.machineLinks?.[to?.node]?.reach==='ok'&&linkBase(to?.node)!=null;
  if(state.connecting&&!state.sessionId&&to&&to.node!==state.callNode){if(hears){disconnect();state.viewedThread=key;void toggleCall()}}
  else if(hears)void select(key);
  updateComposer();
 },
 async closeParticipant(key){
  const to=conversationOf(key);if(!to)return;
  try{await post('/api/presentation/close',{thread_id:to.thread},to.node)}
  catch(e){
   // The room does not know it (it was closed elsewhere, or the room restarted): only this page remembered it.
   if(!/No se encuentra/.test(e.message||'')){setRoomError(roomError(e));throw e}
   forgetThread(key)
  }
  if(to.node===state.callNode)await refresh();await refreshPeople(to.node);await refreshHistory(to.node)
 },
 tryVoiceSettings,
 tryTurnSettings,
 cancelVoiceTry,finishVoiceTry,
 installVoiceModel,
 cancelVoiceInstall,
 uninstallVoiceModel,
 setDeleteUnusedModels,
 loadHostAgents:(fp,options={})=>hostAgentsController.load(fp,options),
 hostAgentAction:(fp,id,action)=>hostAgentsController.act(fp,id,action),
 openAgentSettings,
 showSettingsSection:settingsSection,
 forgetMachine,
 pairDevice,
 localHostDevices,
 revokeLocalHostDevice,
 renameLocalHostDevice,
 renameMachineDevice,
 renameMachine,
 setDeviceName,
 loadMachineInfo,
 machineDevices,
 revokeMachineDevice,
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
// Discover the desktop-owned host first: it is one more machine, listed first. Pairing remains an explicit action:
// an unpaired browser shows setup guidance, and an unpaired desktop does not open a modal by itself.
setUiLanguage(devicePreferences().ui_language);
// The conversation this tab was looking at is looked at again: the next join goes to its machine.
if(rememberedThread())state.viewedThread=rememberedThread();
function startInitialLocate(){
 publishPairings();
 scanPairedAgents();
 void Promise.allSettled(liveMachines().map(fp=>locate(fp))).finally(()=>setUiLanguage(devicePreferences().ui_language));
}
if(desktopLocalHost)void refreshLocalHost().finally(startInitialLocate);
else{void refreshLocalHost();startInitialLocate()}
setInterval(callBeat,1500);setInterval(machinesBeat,6000);
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
 if(idleWarned){idleWarned=false;roomStore.patch({callIdleWarning:false})}
}
function checkIdle(){
 if(!state.ws){idleWarned=false;return}
 const quiet=Date.now()-lastPersonSignal;
 if(quiet>=IDLE_MS){
  idleWarned=false;callEndedBy('idle','');disconnect();
  failJoin(bundled('room.failure.idle',{minutes:Math.round(IDLE_MS/60000)}));
  return;
 }
 if(!idleWarned&&quiet>=IDLE_MS-IDLE_WARN_MS){
  idleWarned=true;
  // Said in the room's line, and shown on the desktop card with its Keep (FLOATING-CARD-SPEC FC6).
  state.callIdleWarning=true;
 }
}
function setupIdleWatch(){
 // Keys and touches are counted where the page already listens for them (the keyboard shortcuts and the
 // output owner), so no second listener competes with those.
 idleTimer=setInterval(checkIdle,5000);
}
function stopIdleWatch(){lastPersonSignal=Date.now();idleWarned=false;if(state.callIdleWarning)state.callIdleWarning=false}


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
// Working shows once a conversation has been busy for a while (WORKING_SHOWN_AFTER_MS): this keeps its start and clock.
followWorking(roomStore);

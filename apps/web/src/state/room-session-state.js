// The session's facts and pure projections. No DOM, storage, audio engine or clock reads here.
import { stageView } from './stage-settings.js';
import { downloadsView } from './downloads-view.js';
export const PRESENCE_LEVEL = .1;
export const PRESENCE_DELIVERED_DELAY_MS = 1500;
export const GAP_BUFFER_SECONDS = 30;
// A turn closing is not the same as a person having finished: between one turn and the next there is a
// breath, and the bed used to start in it, over someone who was still talking (2026-09-20).
export const BED_AFTER_USER_MS = 2000;
export const JOIN_STEPS = { audio: 'Preparando audio', whisper: 'Cargando Whisper', voice: 'Cargando el modelo de voz', microphone: 'Pidiendo el micrófono', room: 'Entrando en la sala', conversation: 'Volviendo a ', reconnect: 'Reconectando con la sala…', transcription: 'Cambiando de transcripción…', mic: 'Aplicando los ajustes del micrófono…' };
export const NO_MACHINE = 'Ninguna máquina disponible. Enciende la que usas, o empareja una en Configuración › Máquinas.';
export const UNPAIRED = 'Este dispositivo no está emparejado con ninguna máquina. Emparéjalo para poder entrar.';
export const REPLAY_NOTES = { queued: 'Repitiendo lo que no oíste', playing: 'Repitiendo lo que no oíste', done: 'Repetido al volver', cancelled: 'Repetición cancelada', gone: 'No se pudo repetir · la sala ya no tiene ese audio' };
const OUTPUT_MARKS = { ok: '', recovering: ' · audio ↻', failed: ' · audio ✕' };
const OUTPUT_TITLES = { ok: 'Salida de audio en orden', recovering: 'La salida de audio se atascó y se está recuperando', failed: 'La salida de audio falló; revisa las estadísticas' };
export function initialSessionFacts() {
    return {
        ws: null, stream: null, sessionId: null, roomRevision: 0, roomInfo: null, connecting: false, reconnecting: false,
        switching: false, switchingSession: false, switchingTranscription: false, roomBinding: null, viewedThread: null,
        people: [], history: [], roomSeen: {}, replayMarks: {}, inputReceipts: {},
        userLive: false, botLive: false, activeSpeech: null, previewJob: null,
        userTurn: null, pendingPhase: '', pendingUserText: '', cancelledInput: false, textSending: false, micEnabled: true,
        voicePreferences: null, enginePreferences: null, sttRuntime: null, engineReady: false, outputHealth: 'ok', echoFacts: null,
        joinStep: null, joinFailure: '', joinProgress: null, joinDetail: '', joinSubject: '',
        screenLock: { state: '', note: '' }, deviceNote: '', holding: false, userQuietAt: 0, liveNote: '',
        audioDevices: { inputs: [], outputs: [], inputId: 'default', outputId: 'default', available: true, outputAvailable: true, busy: false },
        harness: {}, turns: {}, now: 0, karaokeState: null, bootError: null,
        // The machines this device is paired with (never their tokens), the one in use, and the clock of the
        // moment they were read so a row can say "hace 3 días" without reading one.
        pairings: [], pairingInUse: null, machinesAt: 0, machinesReady: false, remoteHostStatus: {},
        // Host-owned agent state is keyed by fingerprint, never by the machine currently in use.
        hostAgents: {}, settingsAgentRequest: null,
        settingsPreferences: { host: null, request: 0, status: 'idle' },
        localHostAvailable: false, localHostSelected: false, localHostStatus: { state: 'absent' },
        // How the node base in use is reached ('room' through a relay, 'node' directly; '' with none), the
        // machine it belongs to, and — with none — why: 'unpaired', 'revoked', 'offline', 'away'.
        rendezvous: '', node: null, nodeReach: '',
        // The pairing dialog, and the sentence it opens with when the page opened it (a revoked pairing).
        pairingOpen: false, pairingNote: '',
        // The machine's integrations as it listed them for this device — never a key, only whether there is one
        // — or null until read; why they could not be read; what is typed in each row and not yet
        // stored, what the machine said about it, and the row a pane's "Configurar" opened.
        integrations: null, integrationsError: '', integrationDrafts: {}, integrationChecks: {}, integrationFocus: null,
        // Whether that listing is the current machine's: 'loading', 'ready', or 'failed' (then `integrationsError`
        // says why). A listing that is not in is not a listing without providers: a pane keeps the choice it has.
        integrationsStatus: 'idle',
        // What the stages (transcription, voice) are chosen from (sidevoice/sidevoice-core#21): the model catalogue this page was built
        // with, the speech languages and their voices' names, the person's system language, whether this page
        // runs inside the desktop app, what this device measured about itself and the resolver's offers for it,
        // the builds already on its disk (the app's), and each provider's own lists keyed `place:task`.
        modelCatalog: null, voiceLanguages: [], speechLanguage: 'en', inApp: false,
        deviceCapabilities: null, deviceOffers: null, installedBuilds: [], remoteModels: {},
        // The settings dialog's unsaved stages ({stt, tts}), or null when it shows what is saved.
        stageDraft: null,
        // What the voice pane says about a preview and about preloading the model.
        previewNote: '', prepareNote: '',
        // This page's WebGPU failed to load a model and is set aside, until the person asks to try it again.
        gpuSetAside: false,
        // Selecting a model loads and checks it first (sidevoice/sidevoice-core#21): per stage, the selection in flight or just over
        // (stage-selection.js's record), and what the last check measured, for Diagnóstico (sidevoice/sidevoice-core#13). In a page, what
        // the page itself has: its WebGPU adapter, whether it is cross-origin isolated, its threads and cores.
        stageChecks: {}, stageDiagnostics: {}, pageFacts: null,
        // Every model or engine download in flight, and the ones that just ended (services/downloads.js).
        downloads: [],
    };
}
export function selectedThread(s) { return s.roomBinding?.thread_id || null; }
export function viewedThread(s) { return s.viewedThread || selectedThread(s); }
export function speechSegment(speech) { return speech.history_id || speech.session_id + ':voice:' + speech.utterance_id; }
export function working(s, thread = selectedThread(s)) {
    if (!s.ws || !thread)
        return false;
    // false is an authoritative report too. Receipts and replies can never override it.
    if (typeof s.harness[thread] === 'boolean')
        return s.harness[thread];
    return Object.values(s.turns).some(t => t.thread === thread && t.session === s.sessionId && !t.settled &&
        !['not_sent', 'channel_closed'].includes(t.status) &&
        (t.status === 'read' || (['delivered', 'unconfirmed'].includes(t.status) && s.now >= t.readyAt)));
}
/** Whether enough silence has passed since this person last spoke for an ambient sound to be welcome. */
export function userSettled(s) {
    return !s.userQuietAt || s.now >= s.userQuietAt + BED_AFTER_USER_MS;
}
export function sessionStatus(s) {
    const speaker = s.userLive ? 'user' : s.botLive || s.activeSpeech?.started ? 'room' : 'nobody';
    const busy = working(s);
    const tab = s.reconnecting ? 'reconnecting' : s.switching || s.switchingSession || s.switchingTranscription ? 'switching' :
        !s.ws ? 'out' : s.pendingPhase === 'transcribing' ? 'transcribing' : 'listening';
    return { speaker, conversation: busy ? 'working' : speaker === 'room' ? 'speaking' : 'idle', tab,
        selected: selectedThread(s), viewed: viewedThread(s), harness: s.harness[selectedThread(s)] ?? null,
        working: busy, bed: busy && speaker === 'nobody' && userSettled(s) && !s.activeSpeech && !s.previewJob &&
            !s.reconnecting && !s.switching && !s.switchingSession && !s.switchingTranscription && s.voicePreferences?.presence_sound !== 'off' };
}
/** What the desktop app's call controls card shows (sidevoice/sidevoice-desktop#4), projected from the facts: the
 *  agent and the person are independent — both can speak at once, and the agent works while a turn is transcribed —
 *  and the card names the conversation the call is on (the microphone's), never a transcript being browsed. */
export function callCardView(s) {
    const selected = selectedThread(s);
    const agentSpeaking = !!(s.botLive || s.activeSpeech?.started);
    const agent = agentSpeaking ? 'speaking' : working(s) || s.pendingPhase === 'transcribing' ? 'working' : 'idle';
    const row = selected ? s.people.find(p => p.thread_id === selected) : null;
    return { agent, youTalking: !!s.userLive, canSkip: !!s.activeSpeech, conversation: selected,
        title: row?.title || s.roomBinding?.title || '' };
}
export function joinView(s) {
    if (s.joinFailure)
        return { step: 'failed', text: s.joinFailure, progress: null, failed: true };
    // With no machine to talk to, the line where a join starts says so before anybody taps: a standing
    // note rather than a step, gone by itself the moment the machine answers.
    if (!s.joinStep) {
        const note = !s.ws && !s.connecting ? reachNote(s) : '';
        return note ? { step: 'no-machine', text: note, progress: null, failed: false, note: true } : null;
    }
    const base = JOIN_STEPS[s.joinStep] + (s.joinStep === 'conversation' ? s.joinSubject : '');
    const note = s.joinProgress != null ? Math.round(s.joinProgress) + ' %' : s.joinDetail;
    return { step: s.joinStep, text: note ? base + ' (' + note + ')' : base, progress: s.joinProgress, failed: false };
}
export function echoCoverage(f) {
    if (!f?.connected || !f.track)
        return { state: '', note: '' };
    if (f.aec === false)
        return { state: 'off', note: 'El micrófono no tiene cancelación de eco: la voz de la sala por el altavoz abrirá intervenciones.' };
    if (f.aec !== true)
        return { state: 'partial', note: 'Este dispositivo no confirma la cancelación de eco del micrófono.' };
    // Off the iPhone the voice plays straight through the context on purpose, and the browser cancels it.
    if (f.health && f.health.strategy === 'context' && f.health.output === 'context')
        return { state: 'on', note: 'Cancelación de eco activa; la voz sale directa por el contexto de audio.' };
    if (f.health && f.health.output !== 'element')
        return { state: 'partial', note: 'La voz no sale por el elemento de audio: en el iPhone no entra en la cancelación de eco.' };
    if (f.health?.element?.paused)
        return { state: 'partial', note: 'La salida de audio está en pausa; se recupera con la siguiente locución.' };
    return { state: 'on', note: 'Cancelación de eco activa y la voz sale por el elemento de audio.' };
}
/** The microphone button: what it says and whether it can be pressed. The level itself is not here —
 *  it changes per animation frame and belongs to whoever owns the meter. */
export function micView(s) {
    const enabled = s.micEnabled !== false;
    const label = enabled ? 'Silenciar micrófono' : 'Activar micrófono';
    // Not disabled before joining: the preference is set then as often as during a call, and a button that
    // looks dead right after a reload reads as "the microphone is broken" (2026-09-20). In a call with no
    // conversation selected there is nobody to speak to, so it is off and says why (2026-09-26).
    if (s.ws && !selectedThread(s))
        return { enabled, label: 'Elige una conversación para hablar', pressed: !enabled, disabled: true, holding: false,
            title: 'Elige una conversación para hablar: sin ninguna seleccionada, el micrófono no envía nada.' };
    return { enabled, label, pressed: !enabled, disabled: false, holding: !!s.holding,
        title: label + ' (⌘D / Ctrl+D). Mantén Espacio para hablar si está silenciado.' };
}
/** The call button: joining and leaving are the same button, and it says which one it is now. */
export function callView(s) {
    const joined = !!(s.ws || s.connecting);
    return { joined, busy: !!(s.reconnecting || s.switchingSession),
        label: joined ? 'Salir de la sala' : 'Entrar en la sala' };
}
/** The name over the transcript: the conversation being looked at, whoever it is. */
export function viewedTitle(s) {
    const id = viewedThread(s);
    if (!id)
        return 'Conversación en directo';
    return s.people.find(p => p.thread_id === id)?.title
        || s.history.find(r => r.thread === id && r.role === 'assistant')?.name
        || s.roomBinding?.title || 'Conversación en directo';
}
export function engineView(s) {
    const base = s.engineReady ? engineBadgeText(s.enginePreferences || s.voicePreferences, s.sttRuntime) : '';
    return { text: base ? base + OUTPUT_MARKS[s.outputHealth] : '', title: base ? base + ' · ' + OUTPUT_TITLES[s.outputHealth] : '', output: s.outputHealth };
}
/** A stage's model as a few words: a catalogue model by its label, a provider's by its own id. */
function stageModelText(s, stage, runtime) {
    if (!stage)
        return '';
    if (stage.place !== 'device')
        return (s.modelCatalog?.providers?.find(p => p.id === stage.place)?.label || stage.place) + ' · ' + (stage.model || '');
    const id = runtime?.model || stage.model;
    return (s.modelCatalog?.models?.find(m => m.id === id)?.label || id || '') + ' · en este dispositivo';
}
const ACCELERATOR_WORDS = { webgpu: 'GPU', wasm: 'CPU', cpu: 'CPU', coreml: 'Core ML', metal: 'Metal', cuda: 'CUDA' };
const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);
/** The model a conversation thinks with, said the way a person says it: the family and its version,
 *  without the vendor prefix or the build date (`claude-fable-5-1` → `Fable 5.1`, `gpt-5.6-terra` →
 *  `GPT-5.6 Terra`). A name we cannot read is shown exactly as it came — never guessed at, never cut. */
export function shortModel(name) {
    const raw = String(name || '').trim();
    const claude = /^claude-([a-z]+)-(\d+(?:-\d+)*?)(?:-\d{6,})?$/.exec(raw);
    if (claude)
        return capitalize(claude[1]) + ' ' + claude[2].replace(/-/g, '.');
    const gpt = /^gpt-([\d.]+)(?:-(.+))?$/.exec(raw);
    if (gpt)
        return 'GPT-' + gpt[1] + (gpt[2] ? ' ' + gpt[2].split('-').map(capitalize).join(' ') : '');
    return raw;
}
/** Who is answering: one row per model, and the agent's own when its harness could read it. No row for
 *  anything that is not a choice — how a turn ends is the room's and the same for everyone. */
export function enginePanel(s) {
    const p = s.enginePreferences || s.voicePreferences, runtime = s.sttRuntime, rows = [];
    if (p) {
        rows.push({ id: 'stt', label: 'STT',
            value: stageModelText(s, p.stt, runtime),
            state: runtime?.fallback_from ? 'warn' : 'ok',
            note: runtime?.fallback_from ? 'La GPU no pudo con el modelo; va por CPU.' : '' });
        rows.push({ id: 'tts', label: 'TTS', value: stageModelText(s, p.tts, null), state: 'ok', note: '' });
    }
    const engine = s.people?.find(person => person.thread_id === selectedThread(s))?.engine;
    if (engine?.model)
        rows.push({ id: 'agent', label: 'LLM',
            value: [shortModel(engine.model), engine.effort && 'esfuerzo ' + engine.effort].filter(Boolean).join(' · '),
            state: 'ok', note: '' });
    return rows;
}
/** What this call has switched on right now, as lights: the browser's own hardware, echo coverage, the
 *  screen. Facts about the device, not choices, which is why they sit apart from the models. */
export function capabilityPanel(s) {
    const rows = [], runtime = s.sttRuntime;
    if (runtime?.accelerator)
        rows.push({ id: 'device', label: ACCELERATOR_WORDS[runtime.accelerator] || runtime.accelerator,
            value: 'La transcripción usa ' + (runtime.accelerator === 'webgpu' ? 'la GPU' : ['wasm', 'cpu'].includes(runtime.accelerator) ? 'la CPU' : ACCELERATOR_WORDS[runtime.accelerator] || runtime.accelerator),
            state: runtime.fallback_from ? 'warn' : 'ok',
            note: runtime.fallback_from ? 'Se pidió GPU y no pudo con el modelo.' : '' });
    const echo = echoCoverage({ ...s.echoFacts, connected: !!s.ws, track: !!s.stream });
    if (echo.state)
        rows.push({ id: 'echo', label: 'Eco',
            value: echo.state === 'on' ? 'Cancelación activa' : echo.state === 'partial' ? 'Cobertura parcial' : 'Sin cancelación',
            state: echo.state === 'on' ? 'ok' : echo.state === 'partial' ? 'warn' : 'fail', note: echo.note });
    if (s.screenLock?.state)
        rows.push({ id: 'screen', label: 'Pantalla',
            value: s.screenLock.state === 'on' ? 'Se mantiene encendida' : 'No se pudo mantener',
            state: s.screenLock.state === 'on' ? 'ok' : 'warn', note: s.screenLock.note });
    rows.push({ id: 'output', label: 'Audio',
        value: s.outputHealth === 'failed' ? 'El audio falló' : s.outputHealth === 'recovering' ? 'Recuperándose' : 'Audio en orden',
        state: s.outputHealth === 'failed' ? 'fail' : s.outputHealth === 'recovering' ? 'warn' : 'ok',
        note: OUTPUT_TITLES[s.outputHealth] });
    return rows;
}
export function playbackState(r, s) {
    if (r.role !== 'assistant')
        return undefined;
    if (s.activeSpeech && r.segment === speechSegment(s.activeSpeech))
        return s.activeSpeech.started ? 'playing' : 'pending';
    if (['queued', 'synthesizing', 'waiting_for_turn', 'waiting_for_pause'].includes(r.audio))
        return 'pending';
    return r.audio === 'playing' ? 'playing' : 'complete';
}
export function receiptView(status) {
    const symbols = { pending: '◷', sending: '◷', delivered: '✓', unconfirmed: '✓', read: '✓✓', uncertain: '!', not_sent: '!' };
    const labels = { pending: 'Enviando', sending: 'Enviando', delivered: 'Entregado a la conversación; lectura sin confirmar', unconfirmed: 'Escrito en la conversación, sin acuse', read: 'Leído por la conversación', uncertain: 'Entrega sin confirmar', not_sent: 'No enviado' };
    return { symbol: symbols[status] || '', label: labels[status] || '' };
}
export function orderedHistory(s, id) { return s.history.filter(r => r.thread === id).slice().sort((a, b) => Number(!!a.draft) - Number(!!b.draft) || a.time - b.time || (a.seq || 0) - (b.seq || 0)); }
export function unreadCount(s, id) { return s.history.filter(r => r.thread === id && r.role === 'assistant' && r.seq > (s.roomSeen[id] || 0)).length; }
export function conversationView(s) {
    const id = viewedThread(s), own = s.userTurn?.thread === id, activeDraft = own ? s.sessionId + ':' + s.userTurn.key : null;
    // A browser outside the room reads no transcript. What was said belongs to the call, and showing it
    // to somebody who has not joined put the last thing they said, undelivered, on an empty page. The
    // session, not the socket: a reconnection must not blank the transcript somebody is reading.
    const records = s.sessionId ? orderedHistory(s, id) : [];
    const ahead = new Map();
    let sounding = 0;
    for (const r of records) {
        ahead.set(r, sounding);
        sounding += Number(r.role === 'assistant' && ['queued', 'synthesizing', 'waiting_for_turn', 'waiting_for_pause', 'playing'].includes(r.audio));
    }
    return { messages: records.map(r => ({ ...r, cancellable: !!activeDraft && !s.cancelledInput && r.draft === true && r.segment === activeDraft,
            audioNote: audioNote(r, ahead.get(r), { seconds: Number(s.voicePreferences?.replay_on_return_seconds ?? 120), now: s.now || Date.now() }), offlineNote: offlineNote(r), deliveryNote: deliveryNote(r), replayNote: r.role === 'assistant' ? REPLAY_NOTES[s.replayMarks[r.segment]] || '' : '',
            playback: playbackState(r, s), karaoke: s.karaokeState?.segment === r.segment ? s.karaokeState : null })),
        pendingText: own ? s.pendingUserText : '', pendingPhase: own && !s.cancelledInput ? s.pendingPhase : '',
        pendingCancellable: own && !s.cancelledInput, working: working(s, id) };
}
/** How a conversation's harness is reached, in the words under its title. Only routes that differ in what the
 *  person can do are named; a room that does not say leaves it to the harness name. */
export function routeLabel(p) {
    return { 'cursor-editor-bridge': 'Desktop Bridge (experimental)', 'cursor-editor-view': 'tarjeta (experimental)', 'cursor-cli-persist': 'CLI persist (experimental)', 'cursor-cli': 'CLI, solo escucha' }[p.route] || null;
}
/** A capability the harness reaches by a route it does not offer: said, because it can misbehave. */
export function experimentalNote(p) {
    const marked = p.capabilities?.experimental || [];
    return [marked.includes('deliver') ? 'Entrega experimental: lo que dices se escribe en la conversación por un camino que su harness no ofrece; si escribes a la vez, se mezcla.' : null,
        marked.includes('sessionIdentity') ? 'Identificación experimental: la conversación es la que muestra la tarjeta de Sidevoice.' : null].filter(Boolean).join(' ') || null;
}
export function workingCapabilityNote(p) { const v = p.capabilities?.working; return v === 'supported' ? null : v === 'unsupported' ? 'Este harness no informa cuándo está trabajando; los puntos siguen lo que dice la conversación.' : 'No sabemos si este harness informa cuándo está trabajando.'; }
export function participantsView(s) {
    const selected = selectedThread(s), entries = [...s.people];
    if (selected && !entries.some(p => p.thread_id === selected))
        entries.unshift({ thread_id: selected, title: s.roomBinding.title, available: true });
    return entries.map(p => {
        const unread = unreadCount(s, p.thread_id);
        const reach = p.reach?.state || (p.available ? 'listening' : 'offline');
        const base = reach === 'listening' ? (unread ? unread + ' nuevas' : 'Escuchando') : reach === 'holding' ? 'No puede recibir' : p.available ? 'Sin poder recibir' : 'Desconectada';
        const busy = working(s, p.thread_id);
        // The dot already says "listening"; the line under the title says only what the dot cannot: where the
        // conversation runs, that it is thinking, what is waiting to be read, and a reach that is not normal.
        const subtitle = [unread ? unread + ' nuevas' : null,
            reach === 'holding' ? 'No puede recibir' : reach === 'offline' && !p.available ? 'Desconectada' : reach === 'offline' ? 'Sin poder recibir' : null]
            .filter(Boolean).join(' · ');
        return { threadId: p.thread_id, title: p.title, selected: p.thread_id === selected, available: !!p.available, switching: s.switching,
            unread, reach, stateLabel: unread && reach !== 'listening' ? base + ' · ' + unread + ' nuevas' : base, subtitle, working: busy,
            machine: p.machine?.host || null, machineId: p.machine?.id || null, harness: p.harness || null, route: routeLabel(p),
            activityNote: [experimentalNote(p), workingCapabilityNote(p)].filter(Boolean).join(' ') || null, detail: p.reach?.detail ? (p.reach.detail + (p.reach.remedy ? '\n\n' + p.reach.remedy : '')) : undefined };
    });
}
/** How long ago, said the way a person says it. The clock comes in with the facts — nothing here
 *  reads one — so the same facts always render the same line. */
export function sinceText(seconds, now) {
    if (!seconds || !now)
        return '';
    const elapsed = Math.max(0, Math.round(now / 1000 - seconds));
    if (elapsed < 90)
        return 'hace un momento';
    const minutes = Math.round(elapsed / 60);
    if (minutes < 60)
        return 'hace ' + minutes + ' min';
    const hours = Math.round(minutes / 60);
    if (hours < 24)
        return 'hace ' + hours + ' h';
    const days = Math.round(hours / 24);
    return days === 1 ? 'hace 1 día' : 'hace ' + days + ' días';
}
/** The machines this device is paired with, each as one row: its name, whether it is the one in use, where
 *  this device reaches it, and since when. A pairing the machine revoked stays listed, saying so, until the
 *  person pairs again or forgets it — a row that vanished would leave nothing to read about why. */
export function machinesView(s) {
    const local = (s.pairings || []).find(p => p.local);
    const localStatus = s.localHostStatus?.state || 'absent';
    const showLocal = !!local || (s.localHostAvailable && localStatus !== 'absent');
    const localRow = showLocal ? {
        fp: local?.fp || 'local-host', host: local?.host || null, local: true,
        inUse: !!s.localHostSelected || (!!local && s.pairingInUse === local.fp),
        selectable: !!local && s.localHostStatus?.reachable === true,
        localStatus,
    } : null;
    const rows = [
        ...(localRow ? [localRow] : []),
        ...(s.pairings || []).filter(p => !p.local && p.fp !== local?.fp).map(p => ({ ...p, inUse: !s.localHostSelected && p.fp === s.pairingInUse, localStatus: null, selectable: true })),
    ];
    return rows.map(p => {
        const inUse = !!p.inUse;
        const status = p.local ? s.localHostStatus : null;
        const localStatus = p.local ? status?.state || 'absent' : null;
        const knownRemote = s.remoteHostStatus?.[p.fp];
        const remoteReach = inUse && s.node === p.fp ? s.nodeReach === 'ok' ? 'connected'
            : ['away', 'offline'].includes(s.nodeReach) ? 'offline' : 'checking' : knownRemote?.state || 'checking';
        const reachableLocal = p.local && status?.reachable === true && !!local?.fp;
        const reach = p.revoked ? 'revoked' : p.local ? reachableLocal ? 'direct'
            : ['failed', 'service-failed', 'refused', 'incompatible'].includes(localStatus) ? 'offline' : 'checking'
            : remoteReach === 'connected' ? s.node === p.fp && s.rendezvous === 'room' ? 'room'
                : s.node === p.fp && s.rendezvous === 'node' ? 'direct' : 'idle'
            : remoteReach === 'offline' ? 'offline' : 'checking';
        const state = p.local ? reachableLocal ? 'connected' : ['failed', 'service-failed', 'refused', 'incompatible'].includes(localStatus) ? 'failed' : 'offline'
            : p.revoked ? 'revoked' : remoteReach;
        return { id: p.local ? 'local-host' : p.fp, pairingId: p.local ? local?.fp : p.fp, host: p.host || '', inUse, revoked: !!p.revoked, reach,
            state, local: !!p.local, localStatus, selectable: p.selectable,
            pairedLabel: sinceText(p.paired_at, s.machinesAt) && 'Emparejada ' + sinceText(p.paired_at, s.machinesAt) };
    });
}
const CAPABILITY_LABELS = { transcription: 'transcripción', voice: 'voz' };
/** One row per provider of the machine in use, for any paired device: the key as far as anyone may see it (masked,
 *  its last four), where it came from, what the provider can do, and what is typed in the row and not stored. */
export function integrationsView(s) {
    return (s.integrations?.providers || []).map(p => {
        const check = s.integrationChecks[p.id], environment = p.configured && p.source === 'environment';
        return { id: p.id, label: p.label, uses: capitalize((p.capabilities || []).map(c => CAPABILITY_LABELS[c] || c).join(' y ')),
            configured: !!p.configured, placeholder: p.configured ? '•••••••• ' + (p.hint || '') : 'Sin clave',
            note: check?.note || (environment ? 'Esta clave viene del entorno de la máquina' + (p.environment ? ' (' + p.environment + ')' : '') + '; no se puede quitar desde aquí.' : ''),
            status: check?.status || '', canClear: !!p.configured && p.source === 'stored',
            draft: s.integrationDrafts[p.id] || '', focused: s.integrationFocus === p.id };
    });
}
/** A provider that needs a key, as a pane offers it: 'ready' with its key, 'missing' — greyed out, with a
 *  way to configure it — when the machine lists it without one, to any paired device (there is no owner and no
 *  guest: every paired device has the machine's full authority), and 'absent' when the machine does not list it
 *  at all — it cannot call that provider — or the list is not known. */
export function keyedProvider(s, id) {
    const row = s.integrations?.providers?.find(p => p.id === id);
    return !row ? 'absent' : row.configured ? 'ready' : 'missing';
}
/** What a stage is chosen from, as stage-settings.js reads it. */
export function stageContext(s) {
    return { catalog: s.modelCatalog, offers: s.deviceOffers, installed: s.installedBuilds, inApp: s.inApp, language: s.speechLanguage,
        languages: s.voiceLanguages, remote: s.remoteModels, integrations: s.integrationsStatus, keyed: (id) => keyedProvider(s, id),
        checks: s.stageChecks, diagnostics: s.stageDiagnostics, pageFacts: s.pageFacts };
}
/** Transcription and voice as their panes show them: the draft while the dialog edits one, else what is saved. */
export function stagesView(s) {
    if (!s.modelCatalog)
        return null;
    const ctx = stageContext(s), source = s.stageDraft || s.voicePreferences || {};
    return { stt: stageView(ctx, 'stt', source.stt), tts: stageView(ctx, 'tts', source.tts) };
}
/** Why there is no machine to talk to, in one sentence, or '' when there is one (or it is still being found). */
export function reachNote(s) {
    const p = (s.pairings || []).find(x => x.fp === s.pairingInUse), called = p?.host ? '«' + p.host + '»' : 'la máquina';
    const Called = called[0].toUpperCase() + called.slice(1);
    if (s.nodeReach === 'unpaired')
        return UNPAIRED;
    if (s.nodeReach === 'revoked')
        return Called + ' ya no reconoce este dispositivo: se revocó el emparejamiento. Vuelve a emparejarlo con un código nuevo.';
    if (s.nodeReach === 'offline')
        return Called + ' no está conectada a la sala ahora mismo. Enciéndela, o usa otra en Configuración › Máquinas.';
    if (s.nodeReach === 'away')
        return 'No se llega a ' + called + ' ni directamente ni a través de la sala. Comprueba que está encendida.';
    return '';
}
export function liveText(s) {
    // A notice the runtime put there (the voice model loading, a saved preference, a server that did not
    // answer) speaks for the moment it belongs to; it is cleared when the call moves on, not overwritten
    // by the next unrelated store change, which is what writing the node used to mean.
    if (s.liveNote)
        return s.liveNote;
    const v = sessionStatus(s);
    if (v.tab === 'reconnecting')
        return 'Reconectando con la sala…';
    if (v.tab === 'switching')
        return 'Cambiando de conversación…';
    if (s.ws && s.stream && s.micEnabled === false)
        return 'Micrófono silenciado';
    if (v.speaker === 'user')
        return 'Te estamos escuchando…';
    if (v.speaker === 'room')
        return 'La conversación está hablando · Puedes interrumpir';
    if (v.tab === 'transcribing')
        return 'Procesando tu intervención…';
    return s.ws ? (v.selected ? 'Puedes hablar. La transcripción aparece al completar tu intervención.' : 'Estás en la sala · Esperando a una conversación') : 'Entra en la sala para hablar.';
}
// A receipt/reply records evidence about its own turn, never an instruction to extinguish a light.
export function recordReceipt(s, id, status, at) {
    const previous = s.turns[id] || {};
    return { ...s.turns, [id]: { ...previous, session: previous.session ?? s.sessionId, thread: previous.thread ?? selectedThread(s), status,
            readyAt: previous.readyAt ?? at + PRESENCE_DELIVERED_DELAY_MS } };
}
export function recordReply(s, d) {
    const id = (d.session_id || s.sessionId) + ':user-turn:' + (d.reply_revision ?? d.revision);
    const previous = s.turns[id] || {};
    return { ...s.turns, [id]: { ...previous, session: d.session_id || s.sessionId, thread: d.thread_id, settled: true } };
}
// A single store is shared by React and the runtime adapter. The writable facade records top-level
// facts; batch() makes a synchronous protocol transition observable only once. Nested records are
// replaced, not mutated. Browser handles are opaque and never persisted or sent to the room.
export function createRoomSessionStore(seed = {}) {
    let facts = { ...initialSessionFacts(), ...seed }, depth = 0, dirty = false;
    const listeners = new Set();
    let snapshot;
    function project() {
        return { facts, session: sessionStatus(facts), conversation: conversationView(facts), participants: participantsView(facts),
            join: joinView(facts), engine: engineView(facts), echo: echoCoverage({ ...facts.echoFacts, connected: !!facts.ws, track: !!facts.stream }), live: liveText(facts),
            mic: micView(facts), call: callView(facts), callCard: callCardView(facts), title: viewedTitle(facts), screenLock: facts.screenLock, deviceNote: facts.deviceNote,
            enginePanel: enginePanel(facts), capabilityPanel: capabilityPanel(facts),
            audioDevices: facts.audioDevices, machines: machinesView(facts), pairing: { open: facts.pairingOpen, note: facts.pairingNote },
            integrations: { error: facts.integrationsError,
                status: facts.integrationsStatus, rows: integrationsView(facts) },
            bootError: facts.bootError, stages: stagesView(facts), downloads: downloadsView(facts.downloads),
            voiceTools: { previewing: facts.previewJob?.language || null, previewNote: facts.previewNote, prepareNote: facts.prepareNote, gpuSetAside: facts.gpuSetAside } };
    }
    function publish() { if (depth || !dirty)
        return; dirty = false; const previous = snapshot; snapshot = project(); for (const listener of listeners)
        listener(snapshot, previous); }
    function patch(values) { if (!Object.entries(values).some(([k, v]) => facts[k] !== v))
        return; facts = { ...facts, ...values }; dirty = true; publish(); }
    snapshot = project();
    const initial = snapshot;
    return {
        facts: new Proxy({}, { get: (_, key) => facts[key], set: (_, key, value) => { patch({ [key]: value }); return true; } }),
        getState: () => snapshot, getInitialState: () => initial, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
        patch, batch(fn) { depth++; try {
            return fn();
        }
        finally {
            depth--;
            publish();
        } },
    };
}
/** Input that never reached the conversation, said plainly under it. The tick beside the clock is for
 *  the ordinary path; a message that will never arrive is not a shade of delivered. */
export function deliveryNote(r) {
    if (r.role !== 'user' || r.status !== 'not_sent')
        return '';
    return r.audio_reason === 'expired'
        ? 'No llegó a la conversación: la máquina no volvió a tiempo'
        : 'No llegó a la conversación';
}
export function offlineNote(r) {
    // Only what changes the reading of it: a message the gap buffer had to cut is incomplete and says so.
    // That it was captured while the room was away is how it got here, not something to tell anybody.
    return r.role === 'user' && r.offline === 'truncated'
        ? 'Solo se guardaron los últimos ' + GAP_BUFFER_SECONDS + ' s'
        : '';
}
export function audioNote(r, ahead = 0, replay = null) {
    // Three of these mean nobody was listening when the reply arrived; the room keeps it and repeats it when
    // someone returns to the conversation within this device's window, and the note promises it only while
    // that is still true — past the window it says what happened and nothing more.
    const repeats = !replay || (replay.seconds > 0 && (!r.time || replay.now - r.time < replay.seconds * 1000));
    const away = where => where + (repeats ? ' · Se repite al volver' : '');
    const reasons = { newer_turn: 'Empezaste otra intervención', user_speaking: 'Estabas hablando', focus_changed: away('No estabas en esta conversación'), call_ended: away('No estabas en la llamada'), session_changed: away('No estabas en la llamada'), expired_audio_turn: 'El turno de audio había caducado', queue_full: 'Cola de audio llena', user_interrupted: 'Interrumpiste el audio', user_skipped: 'Lo saltaste', playback_failed: 'Falló la reproducción', service_restarted: 'Se reinició el servicio', channel_closed: 'Canal de voz cerrado' };
    const reason = reasons[r.audio_reason];
    if (r.audio === 'waiting_for_pause')
        return 'Audio pendiente · Breve pausa antes de hablar';
    if (r.audio === 'waiting_for_turn')
        return 'Audio pendiente · Esperando a que termines de hablar';
    // Held behind another reply, not behind anybody's voice: say which wait it is, and how long the line is.
    if (r.audio === 'queued' && r.audio_reason === 'previous_reply')
        return 'Audio pendiente · ' + (ahead > 1 ? 'Hay ' + ahead + ' respuestas antes' : 'Esperando a que termine la respuesta anterior');
    if (r.audio === 'text_only')
        return 'Sin audio' + (reason ? ' · ' + reason : ' · Motivo no registrado');
    if (r.audio === 'interrupted' || r.audio === 'disconnected' || r.interrupted)
        return 'Audio interrumpido' + (reason ? ' · ' + reason : '') + ' · El texto puede incluir partes que no sonaron';
    if (r.audio === 'failed' && r.audio_reason === 'unconfirmed')
        return 'Audio sin confirmar · Este dispositivo no dijo si llegó a sonar';
    if (r.audio === 'failed')
        return 'Audio no reproducido · Falló la reproducción';
    return '';
}
export function engineBadgeText(p, runtime) {
    if (!p)
        return '';
    const turn = p.turn_end_mode === 'timer' ? 'silencio ' + String(p.user_speech_timeout ?? 2.5).replace('.', ',') + ' s' : 'smart-turn';
    const stage = p.stt;
    if (stage && stage.place !== 'device')
        return (stage.place === 'openai' ? 'OpenAI' : stage.place) + ' · ' + (stage.model || '') + ' · ' + turn;
    const model = String(runtime?.model || stage?.model || '').replace(/^whisper-/, 'Whisper ').replace('large-v3-turbo', 'large v3 turbo'), where = ACCELERATOR_WORDS[runtime?.accelerator] || '';
    return [model, where + (runtime?.fallback_from ? ' (GPU falló)' : ''), turn].filter(Boolean).join(' · ');
}

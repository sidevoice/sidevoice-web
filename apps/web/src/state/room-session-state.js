// The session's facts and pure projections. No DOM, storage, audio engine or clock reads here.
export const PRESENCE_DELIVERED_DELAY_MS = 1500;
// A dropped socket is the network's business for this long: the call goes on as if nothing happened (no tone, no
// line, no control held), and only a drop that outlasts it says the call is reconnecting.
export const RECONNECT_GRACE_MS = 30000;
export const JOIN_STEPS = { voice: 'Preparando la voz', room: 'Entrando en la sala', conversation: 'Volviendo a ', reconnect: 'Reconectando con la sala…' };
export const NO_MACHINE = 'Ninguna máquina disponible. Enciende alguna de las tuyas, o empareja una en Configuración › Máquinas.';
export const UNPAIRED = 'Este dispositivo no está emparejado con ninguna máquina. Emparéjalo para poder entrar.';
export function initialSessionFacts() {
    return {
        ws: null, sessionId: null, roomRevision: 0, roomInfo: null, connecting: false, reconnecting: false,
        // A reconnection that outlasted RECONNECT_GRACE_MS: only then is it shown.
        reconnectShown: false,
        switching: false, roomBinding: null, viewedThread: null,
        people: [], history: [], roomSeen: {}, inputReceipts: {},
        userLive: false, botLive: false,
        userTurn: null, pendingPhase: '', pendingUserText: '', cancelledInput: false, textSending: false, micEnabled: true,
        // Where the call's voice is (`{listening, recognising, playback}`, as it reports it), or null outside a call.
        voiceState: null,
        joinStep: null, joinFailure: '', joinProgress: null, joinDetail: '', joinSubject: '',
        screenLock: { state: '', note: '' }, holding: false, userQuietAt: 0, liveNote: '',
        harness: {}, turns: {}, now: 0, karaokeState: null, bootError: null,
        // The machines this device is paired with (never their tokens) and the clock of the moment they were read so a
        // row can say "hace 3 días" without reading one. Every one of them is live at once (`machineLinks`).
        pairings: [], machinesAt: 0, machinesReady: false, remoteHostStatus: {},
        // Host-owned agent state is keyed by fingerprint.
        hostAgents: {}, settingsAgentRequest: null,
        // The section Settings shows (SettingsDialog), and whether a phone shows that section's page or the list of them.
        settingsSection: 'general', settingsLevel: 'list', machinesView: { machine: null }, settingsSavedAt: 0, uiLanguage: '', webUpdate: null, settingsFocus: null, audioDevices: null, audioLost: null,
        localHostAvailable: false, localHostStatus: { state: 'absent' },
        // How each paired machine is reached, by fingerprint: `{reach, via}` — reach 'ok', 'checking', 'away', 'offline'
        // or 'revoked'; via 'room' (through a relay) or 'node' (directly). And the machine the call is with, if any.
        machineLinks: {}, callNode: null,
        // The pairing dialog, and the sentence it opens with when the page opened it (a revoked pairing).
        pairingOpen: false, pairingNote: '',
        // The language this device speaks in a call, and whether this page runs inside the desktop app.
        speechLanguage: 'en', inApp: false, avatarPreview: null,
        // Whether this browser refuses the page any storage (site data blocked), found once at start.
        storageBlocked: false,
        // A model of this device being installed for a voice slot, how far it has got, or why it failed.
        voiceInstall: null,
        // The voice settings this device keeps (`VoiceSettings`), the ones the open settings pane is editing, the engine's
        // catalogues for its choices, and whether this device keeps a key for each remote provider (never the key).
        voiceSettings: null, voiceDraft: null, voiceCatalogue: { state: 'idle', catalogs: [], error: '' }, modelsRemovable: false, deleteUnusedDays: null, deviceName: null, providerKeys: {},
        // Call model B (VARIANTS `call-model`: the room always open, a voice switch in the call's slot): whether the voice
        // is on or turning on, why it last turned itself off (VOICE_OFF_REASONS, and a failure's words), whether the idle
        // warning is up, whether the agents are muted and by what, the conversation a "Hear it" is asking (`{thread,
        // state: 'asking' | 'no-answer'}`), and the conversation a move to another machine is taking the session to.
        voiceOn: false, voiceStarting: false, voiceOffReason: null, voiceOffDetail: '', voiceIdleWarning: false,
        agentsMuted: false, agentsMutedBy: null, hearing: null, movingTo: null,
        // The call model this page runs, as the runtime read it once ('call' is A, 'voice-switch' B): the desktop card is
        // told it, never left to guess it from what the snapshot carries.
        callModel: 'call',
    };
}
/* ----- call model B: the voice switch (CALL-MODEL-B-SPEC.md) -----
 * The room is always open; the voice is a switch, and the agents a second mute. What the page needs from the room that
 * it does not offer yet is a contract gap (briefs/CONTRACT-GAPS-75.md #32–#38), each marked where it is read. */
/** Why the voice turned itself off, as the voice switch's note says it (the spec's §2.3). */
export const VOICE_OFF_REASONS = ['idle', 'micLost', 'micBlocked', 'micUnavailable', 'failed', 'reloaded'];
/** How long a "Hear it" waits for the agent's reply to start before it says the agent did not answer by voice, and how
 *  long that is said for (the spec's §9: the 45 s wait is an estimate, one agent turn taking 5–30 s). */
export const HEAR_WAIT_MS = 45000;
export const HEAR_NO_ANSWER_MS = 10000;
/** The voice's failure, by its code, as the reason the voice switch says. */
export function voiceOffReasonFor(code) {
    return { 'microphone-lost': 'micLost', 'microphone-denied': 'micBlocked', 'microphone-unavailable': 'micUnavailable' }[code] || 'failed';
}
/** Whether this session's speech is heard here, as the room is told it (gap #32, G1): off with the voice off or the
 *  agents muted, and why. */
export function speechOf(s) {
    if (s.voiceOn && !s.agentsMuted)
        return { on: true };
    return { on: false, reason: s.voiceOn ? 'agents_muted' : 'voice_off' };
}
/** How many conversations want to talk: those with a mark that can be reached, on every machine (the badge on Mute
 *  agents, and the desktop card's). */
export function wantToTalk(rows) { return rows.filter(row => row.mark && row.available).length; }
/** The reasons a reply went unheard that call model B adds (gap #32), as the transcript's keys name them. */
const SWITCH_REASONS = { agents_muted: 'agentsMuted', voice_off: 'voiceOff' };
/** Why a reply had no audio, when it is one of call model B's reasons. */
export function audioReasonKey(r) {
    return r.role === 'assistant' && ['text_only', 'interrupted', 'failed'].includes(r.audio) ? SWITCH_REASONS[r.audio_reason] || null : null;
}
/* A conversation is a thread on a machine: the page knows it by both (`conversationKey`), and only the requests and
 * frames to that machine use the room's own `thread_id`. A fingerprint is base64url, so it never holds the separator. */
const KEY_SEPARATOR = '|';
export function conversationKey(node, thread) { return node && thread ? node + KEY_SEPARATOR + thread : null; }
export function conversationOf(key) {
    const at = typeof key === 'string' ? key.indexOf(KEY_SEPARATOR) : -1;
    return at > 0 ? { node: key.slice(0, at), thread: key.slice(at + 1) } : null;
}
/** A row of a machine's conversations, as the page keeps it: the room's own, and the machine it came from. */
export function personKey(p) { return conversationKey(p?.node, p?.thread_id); }
/** The conversation the call is on: the call's machine and the thread its binding names. */
export function selectedThread(s) { return conversationKey(s.callNode, s.roomBinding?.thread_id); }
// A call whose socket is being reopened is still a call: the person is not told otherwise until the grace is over.
function inCall(s) { return !!(s.ws || s.reconnecting); }
export function viewedThread(s) { return s.viewedThread || selectedThread(s); }
export function speechSegment(speech) { return speech.history_id || speech.session_id + ':voice:' + speech.utterance_id; }
export function working(s, thread = selectedThread(s)) {
    if (!inCall(s) || !thread)
        return false;
    // false is an authoritative report too. Receipts and replies can never override it.
    if (typeof s.harness[thread] === 'boolean')
        return s.harness[thread];
    return Object.values(s.turns).some(t => t.thread === thread && t.session === s.sessionId && !t.settled &&
        !['not_sent', 'channel_closed'].includes(t.status) &&
        (t.status === 'read' || (['delivered', 'unconfirmed'].includes(t.status) && s.now >= t.readyAt)));
}
export function sessionStatus(s) {
    const speaker = s.userLive ? 'user' : s.botLive ? 'room' : 'nobody';
    const busy = working(s);
    const tab = s.reconnectShown ? 'reconnecting' : s.switching ? 'switching' :
        !inCall(s) ? 'out' : s.pendingPhase === 'transcribing' ? 'transcribing' : 'listening';
    return { speaker, conversation: busy ? 'working' : speaker === 'room' ? 'speaking' : 'idle', tab,
        selected: selectedThread(s), viewed: viewedThread(s), harness: s.harness[selectedThread(s)] ?? null,
        working: busy };
}
/** What the desktop app's call controls card shows (sidevoice/sidevoice-desktop#4), projected from the facts: the
 *  agent and the person are independent — both can speak at once, and the agent works while a turn is transcribed —
 *  and the card names the conversation the call is on (the microphone's), never a transcript being browsed. */
export function callCardView(s) {
    const selected = selectedThread(s);
    const agentSpeaking = !!s.botLive;
    const agent = agentSpeaking ? 'speaking' : working(s) || s.pendingPhase === 'transcribing' ? 'working' : 'idle';
    const row = selected ? s.people.find(p => personKey(p) === selected) : null;
    // Skip stops what is sounding, as the room's own Skip does.
    return { agent, youTalking: !!s.userLive, canSkip: !!s.botLive, conversation: selected,
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
    const joined = !!(inCall(s) || s.connecting);
    return { joined, busy: !!s.reconnectShown,
        label: joined ? 'Salir de la sala' : 'Entrar en la sala' };
}
/** The name over the transcript: the conversation being looked at, whoever it is. */
export function viewedTitle(s) {
    const id = viewedThread(s);
    if (!id)
        return 'Conversación en directo';
    return s.people.find(p => personKey(p) === id)?.title
        || s.history.find(r => r.thread === id && r.role === 'assistant')?.name
        || s.roomBinding?.title || 'Conversación en directo';
}
/** Who is answering: the agent's own model and effort, exactly as its harness reports them. */
export function enginePanel(s) {
    const rows = [];
    const engine = s.people?.find(person => personKey(person) === selectedThread(s))?.engine;
    if (engine?.model)
        rows.push({ id: 'agent', label: 'LLM',
            value: [engine.model, engine.effort].filter(Boolean).join(' · '),
            state: 'ok', note: '' });
    return rows;
}
const LISTENING_WORDS = { muted: 'Silenciado', listening: 'Escuchando', speaking: 'Te escucha', idle: 'Sin iniciar' };
/** What this call has switched on right now, as lights: the voice, and the screen. */
export function capabilityPanel(s) {
    const rows = [], voice = s.voiceState;
    if (voice)
        rows.push({ id: 'voice', label: 'Voz', value: LISTENING_WORDS[voice.listening] || voice.listening,
            state: s.reconnecting ? 'warn' : 'ok', note: s.reconnecting ? 'Sin la sala: lo que digas se envía al volver.' : '' });
    if (s.screenLock?.state)
        rows.push({ id: 'screen', label: 'Pantalla',
            value: s.screenLock.state === 'on' ? 'Se mantiene encendida' : 'No se pudo mantener',
            state: s.screenLock.state === 'on' ? 'ok' : 'warn', note: s.screenLock.note });
    return rows;
}
/** Whether the voice is saying reply `r` now. */
function saying(s, r) {
    return !!s.karaokeState && s.karaokeState.segment === r.segment && conversationOf(r.thread)?.node === s.callNode;
}
export function playbackState(r, s) {
    if (r.role !== 'assistant')
        return undefined;
    if (saying(s, r))
        return 'playing';
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
    const id = viewedThread(s), own = s.userTurn?.thread === id, activeDraft = own ? s.userTurn.segment : null;
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
    // A reply is said again through the call: one of another machine is not offered.
    return { messages: records.map(r => ({ ...r, replayable: !!r.replayable && conversationOf(r.thread)?.node === s.callNode, cancellable: !!activeDraft && !s.cancelledInput && r.draft === true && r.segment === activeDraft,
            audioNote: audioNote(r, ahead.get(r)), audioReason: audioReasonKey(r), deliveryNote: deliveryNote(r),
            playback: playbackState(r, s), karaoke: saying(s, r) ? { from: s.karaokeState.from, to: s.karaokeState.to } : null })),
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
/** Whether a machine this device is paired with cannot be reached now: its conversations cannot hear anybody. */
function machineDown(s, fp) { const reach = s.machineLinks?.[fp]?.reach; return !!reach && reach !== 'ok'; }
/** What this device calls a paired machine: its alias here, else the machine's own name. */
function machineName(s, fp) { return (s.pairings || []).find(p => p.fp === fp)?.host || null; }
export function participantsView(s) {
    const selected = selectedThread(s), entries = [...s.people];
    if (selected && !entries.some(p => personKey(p) === selected))
        entries.unshift({ thread_id: s.roomBinding.thread_id, node: s.callNode, title: s.roomBinding.title, available: true });
    return entries.map(person => {
        // A machine that does not answer leaves its conversations listed as it last said them, none of them reachable.
        const p = machineDown(s, person.node) ? { ...person, available: false, reach: { state: 'offline' } } : person;
        const key = personKey(p), unread = unreadCount(s, key);
        const reach = p.reach?.state || (p.available ? 'listening' : 'offline');
        const base = reach === 'listening' ? (unread ? unread + ' nuevas' : 'Escuchando') : reach === 'holding' ? 'No puede recibir' : p.available ? 'Sin poder recibir' : 'Desconectada';
        const busy = working(s, key);
        // Call model B. Whether its agent works, on every row: what the call's own conversation reports, else what the
        // room lists for each (gap #33, G2), null where nobody says. What it said that this page could not play (gap #34,
        // G3) is its mark — waiting for you while its agent is idle, wanting to talk while it works or nobody knows —
        // hidden on the call's own conversation while the person's turn to it is open or it speaks: that turn carries it.
        const reported = inCall(s) && typeof s.harness[key] === 'boolean' ? s.harness[key] : null;
        const agentWorking = busy ? true : reported ?? (typeof person.working === 'boolean' ? person.working : null);
        const count = Number(person.unheard?.count) || 0;
        const unheard = count > 0 ? { count, since: Number(person.unheard.since) || 0 } : null;
        const hushed = key === selected && (!!s.botLive || s.userTurn?.thread === key);
        const mark = unheard && !hushed ? (agentWorking === false ? 'waiting-for-you' : 'wants-to-talk') : null;
        // The dot already says "listening"; the line under the title says only what the dot cannot: where the
        // conversation runs, that it is thinking, what is waiting to be read, and a reach that is not normal.
        const subtitle = [unread ? unread + ' nuevas' : null,
            reach === 'holding' ? 'No puede recibir' : reach === 'offline' && !p.available ? 'Desconectada' : reach === 'offline' ? 'Sin poder recibir' : null]
            .filter(Boolean).join(' · ');
        // Grouped by the paired machine it runs on (one room each), named as this device names that machine.
        return { threadId: key, title: p.title, selected: key === selected, available: !!p.available, switching: s.switching,
            unread, reach, stateLabel: unread && reach !== 'listening' ? base + ' · ' + unread + ' nuevas' : base, subtitle, working: busy,
            machine: machineName(s, p.node) || p.machine?.host || null, machineId: p.node || p.machine?.id || null, harness: p.harness || null, route: routeLabel(p),
            model: p.engine?.model || null, effort: p.engine?.effort || null,
            activityNote: [experimentalNote(p), workingCapabilityNote(p)].filter(Boolean).join(' ') || null, detail: p.reach?.detail ? (p.reach.detail + (p.reach.remedy ? '\n\n' + p.reach.remedy : '')) : undefined,
            agentWorking, unheard, mark, speaking: key === selected && !!s.botLive, hearing: s.hearing?.thread === key ? s.hearing.state : null };
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
/** The machines this device is paired with, each as one row: its name, how this device reaches it, and since when.
 *  Every one of them is live at once: none is "the one in use". A pairing the machine revoked stays listed, saying so,
 *  until the person pairs again or forgets it — a row that vanished would leave nothing to read about why. */
export function machinesView(s) {
    const local = (s.pairings || []).find(p => p.local);
    const localStatus = s.localHostStatus?.state || 'absent';
    const showLocal = !!local || (s.localHostAvailable && localStatus !== 'absent');
    const localRow = showLocal ? {
        fp: local?.fp || 'local-host', host: local?.host || null, local: true, alias: !!local?.alias, machine_host: local?.machine_host ?? null,
        localStatus,
    } : null;
    const rows = [
        ...(localRow ? [localRow] : []),
        ...(s.pairings || []).filter(p => !p.local && p.fp !== local?.fp).map(p => ({ ...p, localStatus: null })),
    ];
    return rows.map(p => {
        const status = p.local ? s.localHostStatus : null;
        const localStatus = p.local ? status?.state || 'absent' : null;
        const link = s.machineLinks?.[p.fp];
        const remoteReach = link?.reach === 'ok' ? 'connected' : ['away', 'offline'].includes(link?.reach) ? 'offline' : 'checking';
        const reachableLocal = p.local && status?.reachable === true && !!local?.fp;
        const reach = p.revoked ? 'revoked' : p.local ? reachableLocal ? 'direct'
            : ['failed', 'service-failed', 'refused', 'incompatible'].includes(localStatus) ? 'offline' : 'checking'
            : remoteReach === 'connected' ? link.via === 'room' ? 'room' : 'direct'
            : remoteReach === 'offline' ? 'offline' : 'checking';
        const state = p.local ? reachableLocal ? 'connected' : ['failed', 'service-failed', 'refused', 'incompatible'].includes(localStatus) ? 'failed' : 'offline'
            : p.revoked ? 'revoked' : remoteReach;
        return { id: p.local ? 'local-host' : p.fp, pairingId: p.local ? local?.fp : p.fp, host: p.host || '', revoked: !!p.revoked, reach,
            state, local: !!p.local, localStatus, alias: !!p.alias, machineHost: p.machine_host ?? null, insecure: p.insecure === true,
            pairedLabel: sinceText(p.paired_at, s.machinesAt) && 'Emparejada ' + sinceText(p.paired_at, s.machinesAt) };
    });
}
/** Why there is no machine to talk to, in one sentence, or '' when there is one (or it is still being found). The
 *  machine it speaks of is the call's, else the one of the conversation being looked at, else the only one paired. */
export function reachNote(s) {
    const pairings = s.pairings || [];
    if (!pairings.length)
        return s.machinesReady ? UNPAIRED : '';
    const fp = s.callNode || conversationOf(viewedThread(s))?.node || (pairings.length === 1 ? pairings[0].fp : null);
    if (!fp) {
        // Several machines and none chosen: only when every one of them has answered that it is not there.
        const links = pairings.map(p => s.machineLinks?.[p.fp]?.reach);
        return links.every(reach => ['away', 'offline', 'revoked'].includes(reach)) ? NO_MACHINE : '';
    }
    const p = pairings.find(x => x.fp === fp), called = p?.host ? '«' + p.host + '»' : 'la máquina';
    const Called = called[0].toUpperCase() + called.slice(1), reach = p?.revoked ? 'revoked' : s.machineLinks?.[fp]?.reach;
    if (reach === 'revoked')
        return Called + ' ya no reconoce este dispositivo: se revocó el emparejamiento. Vuelve a emparejarlo con un código nuevo.';
    if (reach === 'offline')
        return Called + ' no está conectada a la sala ahora mismo. Comprueba que está encendida.';
    if (reach === 'away')
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
    if (inCall(s) && s.voiceState && s.micEnabled === false)
        return 'Micrófono silenciado';
    if (v.speaker === 'user')
        return 'Te estamos escuchando…';
    if (v.speaker === 'room')
        return 'La conversación está hablando · Puedes interrumpir';
    if (v.tab === 'transcribing')
        return 'Procesando tu intervención…';
    return inCall(s) ? (v.selected ? 'Puedes hablar. La transcripción aparece al completar tu intervención.' : 'Estás en la sala · Esperando a una conversación') : 'Entra en la sala para hablar.';
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
    return { ...s.turns, [id]: { ...previous, session: d.session_id || s.sessionId, thread: conversationKey(s.callNode, d.thread_id), settled: true } };
}
// A single store is shared by React and the runtime adapter. The writable facade records top-level
// facts; batch() makes a synchronous protocol transition observable only once. Nested records are
// replaced, not mutated. Browser handles are opaque and never persisted or sent to the room.
export function createRoomSessionStore(seed = {}) {
    let facts = { ...initialSessionFacts(), ...seed }, depth = 0, dirty = false;
    const listeners = new Set();
    let snapshot;
    function project() {
        const participants = participantsView(facts);
        // The desktop card's view, and call model B's on top (gap #38, G9): whether the voice is on, the agents muted,
        // how many conversations want to talk, and why the voice last turned itself off.
        const callCard = { ...callCardView(facts), voiceOn: !!facts.voiceOn, agentsMuted: !!facts.agentsMuted, wantToTalk: wantToTalk(participants),
            voiceOffReason: facts.voiceOffReason, callModel: facts.callModel === 'voice-switch' ? 'voice-switch' : 'call' };
        return { facts, session: sessionStatus(facts), conversation: conversationView(facts), participants,
            join: joinView(facts), live: liveText(facts),
            mic: micView(facts), call: callView(facts), callCard, title: viewedTitle(facts), screenLock: facts.screenLock,
            enginePanel: enginePanel(facts), capabilityPanel: capabilityPanel(facts),
            machines: machinesView(facts), pairing: { open: facts.pairingOpen, note: facts.pairingNote },
            bootError: facts.bootError };
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
export function audioNote(r, ahead = 0) {
    // Nothing a person did not hear is repeated by itself: a reply nobody was there for says so, and replaying it
    // is the person's choice.
    const reasons = { newer_turn: 'Empezaste otra intervención', user_speaking: 'Estabas hablando', focus_changed: 'No estabas en esta conversación', call_ended: 'No estabas en la llamada', session_changed: 'No estabas en la llamada', expired_audio_turn: 'El turno de audio había caducado', queue_full: 'Cola de audio llena', user_interrupted: 'Interrumpiste el audio', user_skipped: 'Lo saltaste', playback_failed: 'Falló la reproducción', service_restarted: 'Se reinició el servicio', channel_closed: 'Canal de voz cerrado' };
    const reason = reasons[r.audio_reason];
    if (r.audio === 'waiting_for_pause')
        return 'Audio pendiente · Breve pausa antes de hablar';
    if (r.audio === 'waiting_for_turn')
        return 'Audio pendiente · Esperando a que termines de hablar';
    // Held behind another reply, not behind anybody's voice: say which wait it is, and how long the line is.
    if (r.audio === 'queued' && r.audio_reason === 'previous_reply')
        return 'Audio pendiente · ' + (ahead > 1 ? 'Hay ' + ahead + ' respuestas antes' : 'Esperando a que termine la respuesta anterior');
    // Call model B's reasons are said by the transcript in its own words, after this (audioReasonKey).
    if (audioReasonKey(r))
        return 'Sin audio';
    if (r.audio === 'text_only')
        return 'Sin audio' + (reason ? ' · ' + reason : ' · Motivo no registrado');
    // Published while this device was away: none of it sounded, which is not the same as being cut off.
    if (r.audio_reason === 'unheard')
        return 'Audio no reproducido';
    if (r.audio === 'interrupted' || r.audio === 'disconnected' || r.interrupted)
        return 'Audio interrumpido' + (reason ? ' · ' + reason : '') + ' · El texto puede incluir partes que no sonaron';
    if (r.audio === 'failed' && r.audio_reason === 'unconfirmed')
        return 'Audio sin confirmar · Este dispositivo no dijo si llegó a sonar';
    if (r.audio === 'failed')
        return 'Audio no reproducido · Falló la reproducción';
    return '';
}

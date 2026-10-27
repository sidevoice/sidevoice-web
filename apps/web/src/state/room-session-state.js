// The session's facts and pure projections. No DOM, storage, audio engine or clock reads here.
export const PRESENCE_DELIVERED_DELAY_MS = 1500;
/* How long a conversation works without a break before it shows as working (the operator, 2026-10-14): its words, its
 * light and its avatar's work wait for it, so a plain back-and-forth does not flash Working between turns. */
export const WORKING_SHOWN_AFTER_MS = 3000;
// A dropped socket is the network's business for this long: the call goes on as if nothing happened (no tone, no
// line, no control held), and only a drop that outlasts it says the call is reconnecting.
export const RECONNECT_GRACE_MS = 30000;
/* The words every projection says, in the interface's language: whoever makes the store gives them (state/room-store.ts),
 * and the facts carry the language (`pageLanguage`), so a switch projects everything again. Until then, the keys. */
let say = (key, params) => key + (params ? ' ' + JSON.stringify(params) : '');
export function speakWith(translate) { say = translate; }
/** What a join line says at each step; the conversation's names the one it goes back to. */
export const JOIN_STEPS = { voice: 'session.join.voice', room: 'session.join.room', conversation: 'session.join.conversation', reconnect: 'session.join.reconnect' };
/** No machine this device can talk to, in one sentence. */
export function noMachine() { return say('session.reach.noMachine'); }
export function initialSessionFacts() {
    return {
        ws: null, sessionId: null, roomRevision: 0, roomInfo: null, connecting: false, reconnecting: false,
        // A reconnection that outlasted RECONNECT_GRACE_MS: only then is it shown.
        reconnectShown: false,
        switching: false, roomBinding: null, viewedThread: null,
        people: [], history: [], roomSeen: {}, inputReceipts: {},
        userLive: false, botLive: false,
        userTurn: null, pendingPhase: '', pendingUserText: '', cancelledInput: false, textSending: false, micEnabled: true, speechOutput: 'on',
        // Where the call's voice is (`{listening, recognising, playback}`, as it reports it), or null outside a call.
        voiceState: null,
        joinStep: null, joinFailure: '', joinFailureDetails: '', joinProgress: null, joinDetail: '', joinSubject: '',
        screenLock: { state: '', note: '' }, holding: false, userQuietAt: 0,
        harness: {}, turns: {}, now: 0, karaokeState: null, bootError: null,
        // Since when each conversation has been busy without a break (busySince): the runtime keeps it, and the clock
        // fact `now` above, so Working shows WORKING_SHOWN_AFTER_MS later (working).
        workingSince: {},
        figures: {}, restRelayed: false,
        // The machines this device is paired with (never their tokens), and when they were read. Every one of them is live
        // at once (`machineLinks`).
        pairings: [], machinesAt: 0, machinesReady: false, remoteHostStatus: {},
        // Host-owned agent state is keyed by fingerprint.
        hostAgents: {}, settingsAgentRequest: null,
        // The section Settings shows (SettingsDialog), and whether a phone shows that section's page or the list of them.
        settingsSection: 'general', settingsLevel: 'list', settingsError: null, machinesView: { machine: null }, settingsSavedAt: 0, uiLanguage: '', webUpdate: null, settingsFocus: null, audioDevices: null, audioLost: null,
        localHostAvailable: false, localHostStatus: { state: 'absent' },
        // How each paired machine is reached, by fingerprint: `{reach, via}` — reach 'ok', 'checking', 'away', 'offline'
        // or 'revoked'; via 'node' (directly). And the machine the call is with, if any.
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
        // The conversation a move to another machine is taking the call to.
        movingTo: null,
        // The floating call card (briefs/FLOATING-CARD-SPEC.md): whether the first setup is finished with its wizard
        // closed, the call's idle warning and why it ended by itself (`{reason: 'idle' | 'offline' | 'failed', detail}`),
        // and the theme and language the page wears.
        setupDone: false, callIdleWarning: false, callEnded: null, pageTheme: 'light', pageLanguage: 'en',
    };
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
/** The conversation in focus, the only one that may sound: with the window shown, the one on screen (`viewedThread`);
 *  minimised (`hidden`), the one selected on the call card, which is the one the call is on. */
export function focusedThread(s, hidden = false) { return hidden ? selectedThread(s) : viewedThread(s); }
export function speechSegment(speech) { return speech.history_id || speech.session_id + ':voice:' + speech.utterance_id; }
/** Whether the conversation is working on what this browser said, as soon as that is known: the harness's own report,
 *  else the turn's receipts. Shown only once it has lasted (working). */
export function busy(s, thread = selectedThread(s)) {
    if (!thread)
        return false;
    // false is an authoritative report too. Receipts and replies can never override it. The harness reports every
    // conversation of a paired machine, call or no call, so its word counts outside the call too.
    if (typeof s.harness[thread] === 'boolean')
        return s.harness[thread];
    // The receipts are this call's own: without a call there are none to read.
    return inCall(s) && Object.values(s.turns).some(t => t.thread === thread && t.session === s.sessionId && !t.settled &&
        !['not_sent', 'channel_closed'].includes(t.status) &&
        (t.status === 'read' || (['delivered', 'unconfirmed'].includes(t.status) && s.now >= t.readyAt)));
}
/** Whether the conversation shows as working: busy without a break since `workingSince` for WORKING_SHOWN_AFTER_MS, by
 *  the clock fact. One busy with no start recorded yet is not shown. */
export function working(s, thread = selectedThread(s)) {
    const since = thread ? s.workingSince?.[thread] : undefined;
    return since !== undefined && busy(s, thread) && s.now - since >= WORKING_SHOWN_AFTER_MS;
}
/** Since when each conversation has been busy without a break, as known at `at`: a start kept while it stays busy, `at`
 *  for one that just became busy, none for the rest. */
export function busySince(s, at) {
    const since = {};
    for (const thread of new Set([...Object.keys(s.harness), ...Object.values(s.turns).map(t => t.thread)]))
        if (thread && busy(s, thread))
            since[thread] = s.workingSince?.[thread] ?? at;
    return since;
}
/** When the next conversation busy for a while is due to show as working, by the clock fact; null when none is waiting. */
export function workingDeadline(s) {
    const due = Object.entries(s.workingSince || {}).map(([thread, since]) => since + WORKING_SHOWN_AFTER_MS)
        .filter(at => at > s.now);
    return due.length ? Math.min(...due) : null;
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
/** The conversation hears the person right now. */
export function canHear(row) {
    return !!row.available && row.reach === 'listening';
}
/** The agent on the stage, by priority: offline (the room cannot reach it: the stage shows its wanted poster), then
 *  speaking, listening (the person is talking to it and it can hear them), working, and idle for everything else.
 *  A reply it is saying in the call plays to its end whatever happens to the link, so it speaks until then and only
 *  then shows the poster (#220). Short of offline it neither speaks nor listens whenever it cannot hear the person: out
 *  of the call, not the one the microphone talks to, or holding what it is sent — a conversation that is holding does
 *  not react to the person at all. Working is the conversation's own, whoever it talks to: then it works if its harness
 *  says so, and is idle otherwise. Every copy of a conversation's agent (the stage, its row, the header) acts out this
 *  one mood (#166). */
export function stageMood(facts) {
    if (facts.reach === 'offline')
        return facts.inCall && facts.isTarget && facts.speaking ? 'speaking' : 'offline';
    if (!facts.inCall || !facts.isTarget || !facts.canHear)
        return facts.working ? 'working' : 'idle';
    if (facts.speaking)
        return 'speaking';
    if (facts.personSpeaking && (facts.reach === 'listening' || facts.reach === null))
        return 'listening';
    if (facts.working)
        return 'working';
    return 'idle';
}
/** The voice's devices as the card offers them (call-controls/host.ts AudioDevices): the system's default first, an
 *  option of its own (id ''); a device the system lists without a name said by its place; the speaker chosen only where
 *  the voice can move it. `busy` is its host's to set: a choice it carries that the room has not answered yet. */
function cardDevices(devices) {
    if (!devices)
        return null;
    const options = rows => [{ id: '', label: '', system: true }].concat((rows || [])
        .map((row, index) => row && typeof row.id === 'string' && row.id ? (row.label ? { id: row.id, label: row.label } : { id: row.id, label: '', number: index + 1 }) : null)
        .filter(Boolean));
    const outputAvailable = !!devices.outputSelectable;
    return { inputs: options(devices.inputs), outputs: options(devices.outputs), inputId: devices.input || '',
        outputId: outputAvailable ? devices.output || '' : '', available: true, outputAvailable, busy: false };
}
/** The facts the desktop's floating card draws the call from (sidevoice-web#229): the room's own components run in the card
 *  on a store of their own, patched with these, so the card and the room project the call with the same code. Only what
 *  the call needs, as plain data (the socket only as whether there is one); never what the person is browsing (the card
 *  shows the call's conversation, `viewedThread` null). The history is the call's conversation's last CARD_HISTORY
 *  records, and of the others only the replies not seen yet (their unread marks). */
const CARD_FACTS = ['sessionId', 'roomRevision', 'roomInfo', 'connecting', 'reconnecting', 'reconnectShown', 'switching', 'roomBinding', 'people',
    'roomSeen', 'inputReceipts', 'userLive', 'botLive', 'userTurn', 'pendingPhase', 'pendingUserText', 'cancelledInput', 'textSending', 'micEnabled',
    'speechOutput', 'voiceState', 'holding', 'harness', 'turns', 'now', 'karaokeState', 'workingSince', 'figures', 'pairings', 'machineLinks', 'callNode',
    'audioDevices', 'movingTo', 'setupDone', 'callIdleWarning', 'callEnded', 'screenLock'];
export const CARD_HISTORY = 40;
export function cardFacts(s) {
    const facts = { ws: !!s.ws, viewedThread: null };
    for (const key of CARD_FACTS)
        facts[key] = s[key];
    const selected = selectedThread(s);
    const own = s.history.filter(r => r.thread === selected);
    const unseen = s.history.filter(r => r.thread !== selected && r.role === 'assistant' && r.seq > (s.roomSeen[r.thread] || 0));
    facts.history = own.slice(-CARD_HISTORY).concat(unseen);
    return facts;
}
/** What the desktop app's call controls card shows (sidevoice/sidevoice-desktop#4), projected from the facts: its whole
 *  snapshot (call-controls/host.ts CallSnapshot) but what its host stamps — `version`, `since`, and `devices.busy` while
 *  a device choice it carries is pending —, so the app and the preview pass it through and never map the room again
 *  (briefs/FLOATING-CARD-SPEC.md FC0). The agent and the person are independent: both can speak at once, and the agent
 *  works while a turn is transcribed. The card names the conversation the call is on (the microphone's), never a
 *  transcript being browsed; its avatar acts out what the stage's would for it (stageMood, and the preview's
 *  `avatarPreview`), so the card and the stage never disagree (FC4). */
export function callCardView(s, participants = participantsView(s)) {
    const selected = selectedThread(s);
    const key = selected, isTarget = !!key;
    const row = key ? participants.find(p => p.threadId === key) || null : null;
    const agent = s.botLive ? 'speaking' : working(s) || s.pendingPhase === 'transcribing' ? 'working' : 'idle';
    // The person's turn to it, open: they are talking, or it is being transcribed (ConversationView.pendingPhase).
    const turn = isTarget && s.userTurn?.thread === key && !s.cancelledInput && (s.pendingPhase === 'listening' || s.pendingPhase === 'transcribing') ? s.pendingPhase : null;
    const reach = row?.reach ?? null, hears = row ? canHear(row) : isTarget, speaking = isTarget && !!s.botLive;
    const mood = s.avatarPreview ? s.avatarPreview.mood
        : stageMood({ inCall: inCall(s), isTarget, canHear: hears, reach, speaking, personSpeaking: !!turn, working: working(s) });
    const mic = micView(s);
    const busyReason = s.reconnectShown ? 'reconnecting' : s.switching || s.movingTo ? 'switching' : null;
    const target = busyReason === 'switching' ? s.movingTo || (s.viewedThread && s.viewedThread !== selected ? s.viewedThread : selected) : null;
    const title = row?.title || (isTarget && displayTitle(s.roomBinding?.title)) || '';
    return { ready: true, joined: callView(s).joined, busy: !!busyReason, micEnabled: mic.enabled, micDisabled: mic.disabled,
        // Skip stops what is sounding, as the room's own Skip (FC3).
        title, agent, youTalking: !!s.userLive, canSkip: !!s.botLive, conversation: key, participants, devices: cardDevices(s.audioDevices),
        // The floating card's (FLOATING-CARD-SPEC FC1, FC4, FC6, FC7, FC11–FC13).
        setupDone: !!s.setupDone, mood, turn,
        idleWarning: !!s.callIdleWarning, ended: s.callEnded || null,
        busyReason, switchingTo: target ? participants.find(p => p.threadId === target)?.title || (target === selected ? title : '') : null,
        theme: s.pageTheme === 'dark' ? 'dark' : 'light', language: s.pageLanguage || 'en',
        micSilent: !!s.ws && mic.enabled && s.voiceState?.microphone === 'muted',
        // The floating card's formats draw the call with the room's own components from these (cardFacts).
        facts: cardFacts(s) };
}
export function joinView(s) {
    if (s.joinFailure)
        return { step: 'failed', text: s.joinFailure, progress: null, failed: true, ...(s.joinFailureDetails ? { details: s.joinFailureDetails } : {}) };
    // With no machine to talk to, the line where a join starts says so before anybody taps: a standing
    // note rather than a step, gone by itself the moment the machine answers.
    if (!s.joinStep) {
        const note = !s.ws && !s.connecting ? reachNote(s) : '';
        return note ? { step: 'no-machine', text: note, progress: null, failed: false, note: true } : null;
    }
    const base = say(JOIN_STEPS[s.joinStep], s.joinStep === 'conversation' ? { name: s.joinSubject || say('session.yourConversation') } : undefined);
    const note = s.joinProgress != null ? Math.round(s.joinProgress) + ' %' : s.joinDetail;
    return { step: s.joinStep, text: note ? say('session.join.withDetail', { step: base, detail: note }) : base, progress: s.joinProgress, failed: false };
}
/** The microphone button: what it says and whether it can be pressed. The level itself is not here —
 *  it changes per animation frame and belongs to whoever owns the meter. */
export function micView(s) {
    const enabled = s.micEnabled !== false;
    const label = say(enabled ? 'session.mic.mute' : 'session.mic.unmute');
    // Not disabled before joining: the preference is set then as often as during a call, and a button that
    // looks dead right after a reload reads as "the microphone is broken" (2026-09-20). In a call with no
    // conversation selected there is nobody to speak to, so it is off and says why (2026-09-26).
    if (s.ws && !selectedThread(s))
        return { enabled, label: say('session.mic.choose'), pressed: !enabled, disabled: true, holding: false,
            title: say('session.mic.chooseTitle') };
    return { enabled, label, pressed: !enabled, disabled: false, holding: !!s.holding,
        title: say('session.mic.title', { label }) };
}
/** The call button: joining and leaving are the same button, and it says which one it is now. */
export function callView(s) {
    const joined = !!(inCall(s) || s.connecting);
    return { joined, busy: !!s.reconnectShown,
        label: say(joined ? 'session.call.leave' : 'session.call.join') };
}
/* A conversation's title as every surface shows it (its row, the header, the stage, the transcript, the desktop card):
 * the title its agent gave, on one line, without the quotes it may come wrapped in, and without a part that only names
 * what the conversation's own marks say already — its harness is its icon, never its name, and its model is on the
 * stage's badge. Each surface then cuts what is left with an ellipsis, the whole of it on hover. */
const HARNESS_NAMES = { claude: ['claude', 'claude code'], codex: ['codex', 'codex cli', 'openai codex'], cursor: ['cursor', 'cursor agent'] };
// Wrapped whole in one pair of quotes, with none inside.
const QUOTED = /^["'`\u201c\u2018\u00ab]([^"'`\u201c\u201d\u2018\u2019\u00ab\u00bb]*)["'`\u201d\u2019\u00bb]$/;
/** `title` as shown; `person`, the room's row it names (its `harness` and `engine.model`), when known. */
export function displayTitle(title, person = null) {
    const line = String(title ?? '').replace(/\s+/g, ' ').trim();
    const text = (QUOTED.exec(line)?.[1] ?? line).trim();
    const family = /^(claude|codex|cursor)/.exec(String(person?.harness || '').toLowerCase())?.[1];
    const named = new Set([...(HARNESS_NAMES[family] || []), String(person?.harness || '').toLowerCase(), String(person?.engine?.model || '').toLowerCase()].filter(Boolean));
    if (!named.size)
        return text;
    // A part in brackets, or one between separators (": ", " — ", " – ", " - ", " | ", " · "), that names the harness or the model.
    const unbracketed = text.replace(/\s*[([]([^()[\]]*)[)\]]/g, (group, inner) => named.has(inner.trim().toLowerCase()) ? '' : group);
    const parts = unbracketed.split(/(\s*:\s+|\s+[—–|·-]\s+)/);
    const kept = [];
    for (let i = 0; i < parts.length; i += 2)
        if (!named.has(parts[i].trim().toLowerCase()))
            kept.push(kept.length ? parts[i - 1] ?? ' ' : '', parts[i]);
    return kept.join('').trim() || text;
}
/** The name over the transcript: the conversation being looked at, whoever it is. */
export function viewedTitle(s) {
    const id = viewedThread(s);
    if (!id)
        return say('session.liveConversation');
    const person = s.people.find(p => personKey(p) === id);
    return displayTitle(person?.title, person)
        || displayTitle(s.history.find(r => r.thread === id && r.role === 'assistant')?.name)
        || displayTitle(s.roomBinding?.title) || say('session.liveConversation');
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
/** Whether the voice is saying reply `r` now. */
function saying(s, r) {
    return !!s.karaokeState && s.karaokeState.segment === r.segment && conversationOf(r.thread)?.node === s.callNode;
}
/** A reply's audio statuses that have finished, one way or another (sidevoice-core `control/room`). */
const AUDIO_ENDED = new Set(['playback_finished', 'heard', 'unplayed', 'interrupted', 'disconnected', 'failed', 'text_only']);
/** Where a reply's sound is: pending, playing, or complete — a reply with no status yet is written, and complete. A
 *  status this version does not know is none of them (sidevoice-core#112): left unsaid, so the reply is drawn as
 *  plain text, never as sounding or waiting, and not taken for finished; listening again stays the room's to offer
 *  (`replayable`). */
export function playbackState(r, s) {
    if (r.role !== 'assistant')
        return undefined;
    if (saying(s, r))
        return 'playing';
    if (['queued', 'synthesizing', 'waiting_for_turn', 'waiting_for_pause'].includes(r.audio))
        return 'pending';
    if (r.audio === 'playing')
        return 'playing';
    return r.audio == null || AUDIO_ENDED.has(r.audio) ? 'complete' : undefined;
}
/** A delivery status's mark and words; a status this version does not know has neither (sidevoice-core#112), and no
 *  mark is drawn for it — never the warning of one that failed. */
export function receiptView(status) {
    const symbols = { pending: '◷', sending: '◷', delivered: '✓', unconfirmed: '✓', read: '✓✓', uncertain: '!', not_sent: '!' };
    const labels = { pending: 'sending', sending: 'sending', delivered: 'delivered', unconfirmed: 'unconfirmed', read: 'read', uncertain: 'uncertain', not_sent: 'notSent' };
    return { symbol: symbols[status] || '', label: labels[status] ? say('session.receipt.' + labels[status]) : '' };
}
export function orderedHistory(s, id) { return s.history.filter(r => r.thread === id).slice().sort((a, b) => Number(!!a.draft) - Number(!!b.draft) || a.time - b.time || (a.seq || 0) - (b.seq || 0)); }
export function unreadCount(s, id) { return s.history.filter(r => r.thread === id && r.role === 'assistant' && r.seq > (s.roomSeen[id] || 0)).length; }
export function conversationView(s) {
    const id = viewedThread(s), own = s.userTurn?.thread === id, activeDraft = own ? s.userTurn.segment : null;
    // A browser outside the room reads no transcript. What was said belongs to the call, and showing it
    // to somebody who has not joined put the last thing they said, undelivered, on an empty page. The
    // session, not the socket: a reconnection must not blank the transcript somebody is reading. Nor a call that has
    // not reached its machine yet: what is written meanwhile waits there, and says so.
    const records = s.sessionId || inCall(s) ? orderedHistory(s, id) : [];
    const ahead = new Map();
    let sounding = 0;
    for (const r of records) {
        ahead.set(r, sounding);
        sounding += Number(r.role === 'assistant' && ['queued', 'synthesizing', 'waiting_for_turn', 'waiting_for_pause', 'playing'].includes(r.audio));
    }
    // A reply is said again through the call: one of another machine is not offered.
    const messages = records.map(r => ({ ...r, replayable: !!r.replayable && conversationOf(r.thread)?.node === s.callNode, cancellable: !!activeDraft && !s.cancelledInput && r.draft === true && r.segment === activeDraft,
            audioNote: audioNote(r, ahead.get(r)), deliveryNote: deliveryNote(r),
            playback: playbackState(r, s), karaoke: saying(s, r) ? { from: s.karaokeState.from, to: s.karaokeState.to } : null }));
    // The stage's balloon is the reply this page's voice is saying, where it has got to: playback alone, never a row's
    // status nor a reply waiting its turn, so a reply that no longer plays leaves none behind (#221).
    return { thread: id, messages, saying: messages.find(m => m.karaoke) ?? null,
        pendingText: own ? s.pendingUserText : '', pendingPhase: own && !s.cancelledInput ? s.pendingPhase : '',
        pendingCancellable: own && !s.cancelledInput, working: working(s, id) };
}
/** How a conversation's harness is reached, in the words under its title. Only routes that differ in what the
 *  person can do are named; a room that does not say leaves it to the harness name. */
export function routeLabel(p) {
    const route = { 'cursor-editor-bridge': 'bridge', 'cursor-editor-view': 'card', 'cursor-cli-persist': 'cliPersist', 'cursor-cli': 'cliListen' }[p.route];
    return route ? say('session.route.' + route) : null;
}
/** A capability the harness reaches by a route it does not offer: said, because it can misbehave. */
export function experimentalNote(p) {
    // A list of the capabilities marked experimental; anything else in its place marks none (sidevoice-core#112).
    const marked = Array.isArray(p.capabilities?.experimental) ? p.capabilities.experimental : [];
    return [marked.includes('deliver') ? say('session.note.experimentalDeliver') : null,
        marked.includes('sessionIdentity') ? say('session.note.experimentalIdentity') : null].filter(Boolean).join(' ') || null;
}
export function workingCapabilityNote(p) { const v = p.capabilities?.working; return v === 'supported' ? null : v === 'unsupported' ? say('session.note.workingUnsupported') : say('session.note.workingUnknown'); }
/** Whether a machine this device is paired with cannot be reached now: its conversations cannot hear anybody. The call's
 *  own is also not there once its drop has outlasted the grace (`reconnectShown`): its link keeps the address it proved for
 *  minutes, which a call looking for it does not trust that long. */
function machineDown(s, fp) { const reach = s.machineLinks?.[fp]?.reach; return !!reach && reach !== 'ok' || (!!s.reconnectShown && fp === s.callNode); }
const REACH_STATES = new Set(['listening', 'holding', 'offline']);
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
        // A reach this version does not know reads as one the room did not say (sidevoice-core#112): by whether the
        // conversation is available, which the room always says, rather than as offline.
        const reach = REACH_STATES.has(p.reach?.state) ? p.reach.state : (p.available ? 'listening' : 'offline');
        const busy = working(s, key);
        // Grouped by the paired machine it runs on (one room each), named as this device names that machine.
        return { threadId: key, title: displayTitle(p.title, p), selected: key === selected, available: !!p.available, switching: s.switching,
            unread, unheard: p.unheard?.count ?? 0, reach, working: busy,
            machine: machineName(s, p.node) || p.machine?.host || null, machineId: p.node || p.machine?.id || null, harness: p.harness || null, route: routeLabel(p),
            model: p.engine?.model || null, effort: p.engine?.effort || null,
            activityNote: [experimentalNote(p), workingCapabilityNote(p)].filter(Boolean).join(' ') || null, detail: p.reach?.detail ? (p.reach.detail + (p.reach.remedy ? '\n\n' + p.reach.remedy : '')) : undefined };
    });
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
            : remoteReach === 'connected' ? 'direct'
            : remoteReach === 'offline' ? 'offline' : 'checking';
        const state = p.local ? reachableLocal ? 'connected' : ['failed', 'service-failed', 'refused', 'incompatible'].includes(localStatus) ? 'failed' : 'offline'
            : p.revoked ? 'revoked' : remoteReach;
        return { id: p.local ? 'local-host' : p.fp, pairingId: p.local ? local?.fp : p.fp, host: p.host || '', revoked: !!p.revoked, reach,
            state, local: !!p.local, localStatus, alias: !!p.alias, machineHost: p.machine_host ?? null };
    });
}
/** Why there is no machine to talk to, in one sentence, or '' when there is one (or it is still being found). The
 *  machine it speaks of is the call's, else the one of the conversation being looked at, else the only one paired. */
export function reachNote(s) {
    const pairings = s.pairings || [];
    if (!pairings.length)
        return s.machinesReady ? say('session.reach.unpaired') : '';
    const fp = s.callNode || conversationOf(viewedThread(s))?.node || (pairings.length === 1 ? pairings[0].fp : null);
    if (!fp) {
        // Several machines and none chosen: only when every one of them has answered that it is not there.
        const links = pairings.map(p => s.machineLinks?.[p.fp]?.reach);
        return links.every(reach => ['away', 'offline', 'revoked'].includes(reach)) ? noMachine() : '';
    }
    const p = pairings.find(x => x.fp === fp), reach = p?.revoked ? 'revoked' : s.machineLinks?.[fp]?.reach;
    return ['revoked', 'offline', 'away'].includes(reach) ? say('session.reach.' + reach + (p?.host ? 'Named' : ''), { host: p?.host }) : '';
}
/** Why machine `fp` cannot be reached, said of that machine and never of the call's: a request to a machine that is away is
 *  no "no machine available" while this device is paired with one. Only a device with no such pairing gets that. */
export function unreached(s, fp, refused = false) {
    const facts = { ...s, callNode: fp };
    // `refused`: the machine answered and refused this device's token. That is what is said, whatever its stored reach still is.
    const as = (reach) => reachNote({ ...facts, machineLinks: { ...s.machineLinks, [fp]: { reach, via: '' } } });
    return (refused && as('revoked')) || reachNote(facts) || as('away') || noMachine();
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
/** `next`, with `previous` itself wherever the two hold the same data, at any depth: whoever holds a piece of a projection
 *  that did not change is not told it did (a component that reads it is not drawn again). Plain data only, as the
 *  projections are; anything else is the same only when it is the same object. Nothing of either is changed. */
export function keepEqual(previous, next) {
    if (Object.is(previous, next))
        return previous;
    const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    if (Array.isArray(next) && Array.isArray(previous)) {
        let kept = null;
        for (let i = 0; i < next.length; i++) {
            const item = i < previous.length ? keepEqual(previous[i], next[i]) : next[i];
            if (kept)
                kept.push(item);
            else if (item !== previous[i])
                kept = previous.slice(0, i).concat([item]);
        }
        return kept || (next.length === previous.length ? previous : previous.slice(0, next.length));
    }
    if (plain(next) && plain(previous)) {
        const keys = Object.keys(next);
        let kept = null;
        for (const key of keys) {
            const has = Object.prototype.hasOwnProperty.call(previous, key), item = has ? keepEqual(previous[key], next[key]) : next[key];
            if (kept)
                kept[key] = item;
            else if (!has || item !== previous[key]) {
                kept = {};
                for (const earlier of keys) {
                    if (earlier === key)
                        break;
                    kept[earlier] = previous[earlier];
                }
                kept[key] = item;
            }
        }
        return kept || (Object.keys(previous).length === keys.length ? previous : Object.fromEntries(keys.map(key => [key, previous[key]])));
    }
    return next;
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
        // The desktop card's whole snapshot, from the same rows.
        const callCard = callCardView(facts, participants);
        const next = { facts, session: sessionStatus(facts), conversation: conversationView(facts), participants,
            join: joinView(facts),
            mic: micView(facts), call: callView(facts), callCard, title: viewedTitle(facts), screenLock: facts.screenLock,
            enginePanel: enginePanel(facts),
            machines: machinesView(facts), pairing: { open: facts.pairingOpen, note: facts.pairingNote },
            bootError: facts.bootError };
        // Each projection is made anew from the facts, and most of them are what they were: the room's beats write the
        // same binding and the same conversations as new objects every second or two, and the voice's cues change only the
        // words. What did not change keeps its identity, so what shows it is not drawn again.
        if (snapshot)
            for (const key of Object.keys(next))
                if (key !== 'facts')
                    next[key] = keepEqual(snapshot[key], next[key]);
        return next;
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
    if (r.role !== 'user' || (r.delivery ?? r.status) !== 'not_sent')
        return '';
    return say(r.audio_reason === 'expired' ? 'session.delivery.notReachedExpired' : 'session.delivery.notReached');
}
export function audioNote(r, ahead = 0) {
    // Nothing a person did not hear is repeated by itself: a reply nobody was there for says so, and replaying it
    // is the person's choice.
    if (r.hearing === 'heard')
        return '';
    const reasons = { newer_turn: 'newer_turn', user_speaking: 'user_speaking', focus_changed: 'focus_changed', call_ended: 'call_ended', session_changed: 'call_ended', expired_audio_turn: 'expired_audio_turn', queue_full: 'queue_full', user_interrupted: 'user_interrupted', user_skipped: 'user_skipped', playback_failed: 'playback_failed', service_restarted: 'service_restarted', channel_closed: 'channel_closed', agents_muted: 'agents_muted', voice_off: 'voice_off', connector_disconnected: 'connector_disconnected', inactive_conversation: 'inactive_conversation', disconnected: 'disconnected', heard_elsewhere: 'heard_elsewhere' };
    const reason = reasons[r.audio_reason] ? say('session.audio.reason.' + reasons[r.audio_reason]) : '';
    if (r.audio === 'waiting_for_pause')
        return say('session.audio.waitingForPause');
    if (r.audio === 'waiting_for_turn')
        return say('session.audio.waitingForTurn');
    // Held behind another reply, not behind anybody's voice: say which wait it is, and how long the line is.
    if (r.audio === 'queued' && r.audio_reason === 'previous_reply')
        return say(ahead > 1 ? 'session.audio.queued.other' : 'session.audio.queued.one', { n: ahead });
    if (r.audio === 'text_only')
        return say('session.audio.textOnly', { reason: reason || say('session.audio.reasonUnknown') });
    // Published while this device was away: none of it sounded, which is not the same as being cut off.
    if (r.audio_reason === 'unheard')
        return say('session.audio.unheard');
    // A never-started, newer-turn diagnostic has no audio explanation to add to the semantic mark.
    if (r.audio_reason === 'newer_turn' && r.heard_chars == null)
        return '';
    if (r.audio === 'interrupted' || r.audio === 'disconnected' || r.interrupted)
        return reason ? say('session.audio.interruptedWhy', { reason }) : say('session.audio.interrupted');
    if (r.audio === 'failed' && r.audio_reason === 'unconfirmed')
        return say('session.audio.unconfirmed');
    if (r.audio === 'failed')
        return say('session.audio.failed');
    return '';
}

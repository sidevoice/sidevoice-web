// What a native call surface (the phone's Lock Screen card, Dynamic Island and ongoing notification) needs beyond the
// desktop card's `callCard`: the room's second projection of the call, `callSurface`, read by the hosts that draw one.
// Pure, like the rest of the session's projections: the clock's parts (the spoken page's throttle, the said text's
// three seconds, the stills' rendering) are state/call-surface-publisher.ts's, which hands them in as `live`.

/** The spoken page's size, in characters. */
export const SURFACE_PAGE_CHARS = 160;
/** How far back from that size a cut may go to land on a sentence end. */
export const SURFACE_SENTENCE_WINDOW = 40;
/** The current conversation's still, in pixels: 3x the largest slot (the Lock Screen tile, 80 pt). */
export const STILL_PX = 240;
/** The others' faces, 3x their 36 pt slot. */
export const FACE_PX = 108;
/** The id a still goes by across the bridge: the conversation and the size it was drawn at (the same creature is a
 *  240 px still as the current conversation and a 108 px face as another). */
export const stillId = (threadId, px) => threadId + '#' + px;
/** At most this many other conversations are shown, as faces. */
export const SURFACE_OTHERS = 3;

/** A sentence ends in one of these (and the closing marks after it); the CJK ones need no space after them. */
const SENTENCE_END = /[.!?…。！？]["'”’)\]]*$/;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const segmenters = new Map();
/** The word boundaries of `text` (indexes into it, ascending, from 0 to its length), by the platform's own segmentation
 *  where there is one, so that a run of Chinese or Japanese is cut in its words and not taken for one. Without it: at
 *  spaces, and around every CJK character. */
export function wordBoundaries(text, locale) {
    const out = [0];
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        let segmenter = segmenters.get(locale);
        if (!segmenter) {
            try { segmenter = new Intl.Segmenter(locale, { granularity: 'word' }); }
            catch { segmenter = new Intl.Segmenter(undefined, { granularity: 'word' }); }
            segmenters.set(locale, segmenter);
        }
        for (const part of segmenter.segment(text))
            if (part.index > 0)
                out.push(part.index);
    }
    else {
        let at = 0;
        for (const char of text) {
            const next = at + char.length;
            if (next < text.length && (/\s/.test(char) || /\s/.test(text[next]) || CJK.test(char) || CJK.test(text.slice(next, next + 1))))
                out.push(next);
            at = next;
        }
    }
    if (out[out.length - 1] !== text.length)
        out.push(text.length);
    return out;
}

/** The last boundary at or before `at`. */
function floorBoundary(boundaries, at) {
    let low = 0, high = boundaries.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (boundaries[mid] <= at)
            low = mid;
        else
            high = mid - 1;
    }
    return boundaries[low];
}

/** The page of `text` the voice is on: pages of about `max` characters, cut after a whole word (after a sentence end
 *  when one falls in the last SURFACE_SENTENCE_WINDOW characters), and the one holding the last lit character (the next
 *  page begins once the last word of this one is lit). `spoken` is how far the voice has got, as the room estimates it;
 *  `lit` is that rounded DOWN to the start of a word, never ahead of the voice, in UTF-16 code units of the page's text.
 *  The text ends in an ellipsis where more follows (every text does, HANDOVER §0). `locale` segments the words. */
export function spokenPage(text, spoken, max = SURFACE_PAGE_CHARS, locale) {
    if (typeof text !== 'string' || !text.trim())
        return null;
    const boundaries = wordBoundaries(text, locale);
    const lit = spoken > 0 ? floorBoundary(boundaries, Math.min(spoken, text.length)) : 0;
    let start = 0;
    for (;;) {
        let end = text.length;
        if (start + max < text.length) {
            end = floorBoundary(boundaries, start + max);
            if (end <= start)
                end = start + max; // One word longer than a page.
            else
                for (let i = boundaries.indexOf(end); i > 0 && boundaries[i] > start && boundaries[i] >= end - SURFACE_SENTENCE_WINDOW; i--)
                    if (SENTENCE_END.test(text.slice(start, boundaries[i]).trimEnd())) {
                        end = boundaries[i];
                        break;
                    }
        }
        // A page is over when its last character is lit and there is more after it.
        if (end < text.length && lit >= end) {
            start = end;
            continue;
        }
        const page = text.slice(start, end).trimEnd();
        return { text: end < text.length ? page + '…' : page, lit: Math.max(0, Math.min(page.length, lit - start)), more: end < text.length };
    }
}

/** What a call is doing, resolved by ONE precedence (the stage's mood, the card's state line, the native call surface and
 *  its Live Activity all read it, so web, iOS and Android agree): offline > the person's turn (listening, transcribing) >
 *  speaking > said > working > holding > idle. Holding is a standing condition, so it takes idle's place; what is happening
 *  now always wins. `turn` is the person's open turn ('listening', 'transcribing') or null. `said`: the person's words just
 *  sent are up, which only the native surface shows; while they are, they are all it says (D-LA-SAID-PRECEDENCE). */
export function callState({ offline, turn, speaking, said = false, working, holding }) {
    if (offline)
        return 'offline';
    if (turn === 'listening' || turn === 'transcribing')
        return turn;
    if (speaking)
        return 'speaking';
    if (said)
        return 'said';
    if (working)
        return 'working';
    return holding ? 'holding' : 'idle';
}
/** The line that says what the call is doing, in the page's words: the same words the stage, the card and the wave say
 *  for it (conversation-state.ts moodText, wave.transcribingTitle). */
function stateKey(card, said) {
    const state = callState({ offline: card.busyReason === 'reconnecting' || card.mood === 'offline',
        turn: card.turn ?? (card.mood === 'listening' ? 'listening' : null), speaking: card.mood === 'speaking', said, working: card.mood === 'working', holding: card.mood === 'holding' });
    return STATE_KEYS[state];
}
/** Your words have no line of their own: under the title they are all there is. */
const STATE_KEYS = { offline: 'state.offline', listening: 'state.listening', transcribing: 'wave.transcribingTitle', speaking: 'state.speaking',
    said: null, working: 'state.working', holding: 'state.holding', idle: 'state.resting' };

/** The words the surface draws, resolved in the page's language (the web catalogue under the app's overlay). A
 *  native catalogue never holds them. `offline` is always there, whatever the state: what a host cannot vouch for any
 *  more reads as that (D-LA-OFFLINE). `route` is the audio route's accessible name, which only the host knows the
 *  output of: the template, with `{route}` left in it. */
export function surfaceWords(state, say, total) {
    return {
        state, offline: say('state.offline'),
        mute: say('card.mute'), unmute: say('card.unmute'),
        skip: say('liveActivity.skipShort'), skipName: say('card.skip'),
        cancelSend: say('stage.cancelTurn'), hangUp: say('card.hangUp'),
        route: say('liveActivity.routeName', { route: '{route}' }), speaker: say('card.speaker'),
        conversations: say('card.conversationsCount', { n: total }), switchConversation: say('card.switchConversation'),
        openApp: say('card.openApp'),
    };
}

/** The reference to a still the host holds: its id and `k`. The bytes crossed on their own (state/call-surface-publisher.ts). */
const ref = (live, threadId, px) => (threadId && live?.stills?.[stillId(threadId, px)]) || null;

/** `callSurface`: of the CALL's conversation (never the one being browsed): pendingCancellable, its reach, model and
 *  machine, the working phase's start; and the others (up to SURFACE_OTHERS faces) with the count of all conversations,
 *  the spoken page, the said text, the words, and the stills by reference.
 *  `call` is what only the facts know: `{ pendingCancellable, workingSince, busySince }`; `previous` the last snapshot
 *  of this projection, whose state line is kept while the call switches conversation (until the new one lands).
 *  `live` is the publisher's: `{ page, said, stills }`, none of it until a host that draws a surface asks. */
export function callSurfaceView(card, participants, live, say, call, previous) {
    const row = card.conversation ? participants.find(p => p.threadId === card.conversation) ?? null : null;
    const reach = row?.reach ?? null;
    const others = participants.filter(p => p.threadId !== card.conversation).slice(0, SURFACE_OTHERS);
    const keeping = card.busyReason === 'switching' && previous;
    const thread = card.conversation ?? null;
    const key = stateKey(card, false);
    // The person's words just sent (their said text is up) win over what the call is doing under them, working included:
    // while they show, a native surface draws them and no state line (D-LA-SAID-PRECEDENCE). Only what is happening now
    // (the person's turn, the voice, offline) takes over.
    const said = !!thread && !!live?.said && stateKey(card, true) === null;
    // Once they are over, the call is working on them, and the surface says so at once, not after the 3 s the stage waits
    // before it shows Working. It goes on saying so, as long as the same conversation stays busy, until the stage's Working
    // takes over (the said text lasts 3 s from the message and the stage's wait 3 s from the work's start: between them the
    // line would drop to Resting and back). Only the native surface's snapshot: the stage and the card keep their own wait.
    const saying = key === 'state.resting' && !!thread
        && (!!live?.said || (previous?.saying === thread && call.busySince != null));
    const line = keeping ? previous.words.state : said ? '' : say(saying ? 'state.working' : key);
    return {
        pendingCancellable: !!call.pendingCancellable,
        reach,
        model: row?.model ?? null, effort: row?.effort ?? null, machine: row?.machine ?? null,
        // Since when the call's conversation has been busy without a break, while it shows as working; absent when the room does not know.
        workingSince: keeping ? previous.workingSince ?? null : said ? null : key === 'state.working' && call.workingSince != null ? call.workingSince
            : saying && call.busySince != null ? call.busySince : null,
        conversationCount: participants.length,
        others: others.map(p => ({ threadId: p.threadId, title: p.title, reach: p.reach, unread: p.unread, still: ref(live, p.threadId, FACE_PX) })),
        still: ref(live, card.conversation, STILL_PX),
        page: live?.page ?? null,
        said: live?.said ?? null,
        // The conversation whose said text the Working line is carried for (see `saying`); null otherwise.
        saying: keeping ? previous.saying ?? null : saying ? thread : null,
        words: surfaceWords(line, say, participants.length),
    };
}

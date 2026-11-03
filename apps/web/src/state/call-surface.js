// What a native call surface (the phone's Lock Screen card, Dynamic Island and ongoing notification) needs beyond the
// desktop card's `callCard`: the room's second projection of the call, `callSurface`, read by the hosts that draw one.
// Pure, like the rest of the session's projections: the clock's parts (the spoken page's throttle, the said text's
// three seconds, the stills' rendering) are state/call-surface-publisher.ts's, which hands them in as `live`.

/** The spoken page's size, in characters. */
export const SURFACE_PAGE_CHARS = 160;
/** At most this many other conversations are shown, as faces. */
export const SURFACE_OTHERS = 3;

/** Where a word ends when `at` falls inside it: a word lights whole. */
function wordEnd(text, at) {
    let end = at;
    while (end > 0 && end < text.length && /\S/.test(text[end - 1]) && /\S/.test(text[end]))
        end += 1;
    return end;
}

/** The page of `text` the voice is on: pages of at most `max` characters, cut after a space, and the one holding the
 *  last lit character (the next page begins once the last word of this one is lit). `lit` counts the lit characters of
 *  the page; the text ends in an ellipsis where more follows (every text does, HANDOVER §0). */
export function spokenPage(text, spoken, max = SURFACE_PAGE_CHARS) {
    if (typeof text !== 'string' || !text.trim())
        return null;
    const lit = spoken > 0 ? wordEnd(text, Math.min(spoken, text.length)) : 0;
    let start = 0;
    for (;;) {
        let end = Math.min(text.length, start + max);
        if (end < text.length) {
            const space = text.lastIndexOf(' ', end);
            if (space > start)
                end = space + 1;
        }
        // A page is over when its last character is lit and there is more after it.
        if (end < text.length && lit >= end) {
            start = end;
            continue;
        }
        const raw = text.slice(start, end);
        const page = raw.trimEnd();
        return { text: end < text.length ? page + '…' : page, lit: Math.max(0, Math.min(page.length, lit - start)), more: end < text.length };
    }
}

/** The line that says what the call is doing, in the page's words: the same words the stage, the card and the wave say
 *  for it (conversation-state.ts moodText, wave.*Title). */
function stateLine(card, reach, say) {
    if (card.busyReason === 'reconnecting' || card.mood === 'offline')
        return say('state.offline');
    if (reach === 'holding')
        return say('state.holding');
    if (card.turn === 'listening')
        return say('wave.listeningTitle');
    if (card.turn === 'transcribing')
        return say('wave.transcribingTitle');
    return say(card.mood === 'speaking' ? 'state.speaking' : card.mood === 'working' ? 'state.working' : card.mood === 'listening' ? 'state.listening' : 'state.resting');
}

/** The words the surface draws, resolved in the page's language (the web catalogue under the app's overlay). A
 *  native catalogue never holds them. `route` is the audio route's accessible name, which only the host knows the
 *  output of: the template, with `{route}` left in it. */
export function surfaceWords(card, reach, say, total) {
    return {
        state: stateLine(card, reach, say),
        mute: say('card.mute'), unmute: say('card.unmute'),
        skip: say('liveActivity.skipShort'), skipName: say('card.skip'),
        cancelSend: say('stage.cancelTurn'), hangUp: say('card.hangUp'),
        route: say('liveActivity.routeName', { route: '{route}' }), speaker: say('card.speaker'),
        conversations: say('card.conversationsCount', { n: total }), switchConversation: say('card.switchConversation'),
        openApp: say('card.openApp'),
    };
}

/** `callSurface`: pendingCancellable and the current conversation's reach, its model and machine, the others (up to
 *  SURFACE_OTHERS, and how many there are in all), the spoken page, the said text, the words, and the stills.
 *  `live` is the publisher's: `{ page, said, stills }`, none of it until a host that draws a surface asks. */
export function callSurfaceView(card, conversation, participants, live, say) {
    const row = card.conversation ? participants.find(p => p.threadId === card.conversation) ?? null : null;
    const reach = row?.reach ?? null;
    const others = participants.filter(p => p.threadId !== card.conversation);
    const stills = live?.stills ?? {};
    const keys = [card.conversation, ...others.slice(0, SURFACE_OTHERS).map(p => p.threadId)].filter(Boolean);
    return {
        pendingCancellable: !!conversation.pendingCancellable,
        reach,
        model: row?.model ?? null, effort: row?.effort ?? null, machine: row?.machine ?? null,
        others: { total: others.length, items: others.slice(0, SURFACE_OTHERS).map(p => ({ threadId: p.threadId, title: p.title, reach: p.reach, unread: p.unread })) },
        page: live?.page ?? null,
        said: live?.said ?? null,
        words: surfaceWords(card, reach, say, others.length),
        // The stills of the conversations shown only; the rest of what the publisher drew is not carried.
        stills: Object.fromEntries(keys.filter(k => stills[k]).map(k => [k, stills[k]])),
    };
}

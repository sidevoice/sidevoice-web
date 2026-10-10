/* The person's turns as the call's voice reports them, said the way the room takes them. The voice names each turn
 * (`turn_id`), and the room knows a turn by that name on the session that took its start. Messages go in order on one
 * socket, so a turn's end follows its start there and needs nothing from the room's answer: it goes as it is when its
 * start went on this session. The end of a turn whose start this session never sent (it went on a session the room has
 * replaced, or the room refused it) is words said while the call had no room (`offline`), which the room keeps as their
 * own row, and such a cancelled turn is nothing to say.
 *
 * A start the room refuses because too many of the call's turns still wait for their words (`room.turns_full`) is held,
 * with what follows it: the words are kept, and the start is said again, under a new message (the room takes each
 * message once), when another of the call's turns ends. A refusal names the message it refuses, so it is found by that
 * message's id. Nothing else waits: a start sent again is only acknowledged by the room, never answered again.
 *
 * A turn's end may go before the refusal of its start arrives; the room then refuses the end too (`room.input_ended`).
 * Its words are not lost: the end is queued again, as a new message, and goes as the turn's start now allows (held, or
 * as said while away). */
const KEPT = 64;

export function createTurnRelay() {
  const sent = new Map(); // turn → the message its start went as
  const starts = new Map(); // turn → its start's data, while it may have to be said again
  const held = new Map(); // turn → its start's data, refused for now (`room.turns_full`)
  const ends = new Map(); // message → {turn, data}: a turn's end that went
  const keep = (map) => { if (map.size > KEPT) map.delete(map.keys().next().value); };
  return {
    /** A start went on this session's socket, as message `messageId`: whether it was a held one, whose words may go now. */
    sent(turnId, messageId, data) {
      sent.set(turnId, messageId ?? null);
      const released = held.delete(turnId);
      if (data) starts.set(turnId, data);
      keep(sent);
      keep(starts);
      return released;
    },
    /** The room refused message `messageId` (`key`). A start refused for `room.turns_full` is held; any other refused
     *  start's end goes as words said while away. A refused end of such a turn is returned, to be queued again. */
    refusedMessage(messageId, key) {
      for (const [turnId, id] of sent) {
        if (id !== messageId) continue;
        sent.delete(turnId);
        if (key === 'room.turns_full' && starts.has(turnId)) held.set(turnId, starts.get(turnId));
      }
      const end = ends.get(messageId);
      ends.delete(messageId);
      return end && !sent.has(end.turn) ? end.data : null;
    },
    /** A turn's end went as message `messageId`: the oldest held start to say again after it, if any. */
    ended(turnId, messageId, data) {
      ends.set(messageId, { turn: turnId, data });
      keep(ends);
      const next = held.keys().next();
      return next.done ? null : held.get(next.value);
    },
    /** Another session: none of the last one's turns is known to the room now, nor held for it. */
    reset() { sent.clear(); starts.clear(); held.clear(); ends.clear(); },
    /**
     * How a turn message `data` goes to the room now: `{send}` with what to send, `{hold: true}` while its start is held
     * (it stays, and goes after the start), or `{drop: true}`.
     */
    route(data) {
      if (data.phase === 'started') return { send: data };
      if (held.has(data.turn_id)) return { hold: true };
      if (data.offline) return data.phase === 'finished' && data.text?.trim() ? { send: data } : { drop: true };
      if (sent.has(data.turn_id)) return { send: data };
      if (data.phase === 'finished' && data.text?.trim()) return { send: { ...data, offline: true } };
      return { drop: true };
    },
  };
}

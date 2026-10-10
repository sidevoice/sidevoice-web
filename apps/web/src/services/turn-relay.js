/* The person's turns as the call's voice module reports them, said the way the room takes them. The module names each
 * turn (`turn_id`), and the room knows a turn by that name on the session that took its start. Messages go in order on
 * one socket, so a turn's end follows its start there and needs nothing from the room's answer: it goes as it is when
 * its start went on this session. The end of a turn whose start this session never sent (it went on a session the
 * room has replaced, or the room refused it) is words said while the call had no room (`offline`), which the room keeps
 * as their own row, and such a cancelled turn is nothing to say. A turn the module started offline is only ever
 * finished, already `offline`.
 *
 * Nothing here waits: a start sent again (after a reload, say) is only acknowledged by the room, never answered again,
 * so waiting for its answer could hold the outbox for good. A refusal names the message it refuses, so it is found by
 * that message's id. */
const KEPT = 64;

export function createTurnRelay() {
  const sent = new Map();
  return {
    /** A start went on this session's socket, as message `messageId`. */
    sent(turnId, messageId) {
      sent.set(turnId, messageId ?? null);
      if (sent.size > KEPT) sent.delete(sent.keys().next().value);
    },
    /** The room refused message `messageId`: when it was a start, its turn's end goes as words said while away. */
    refusedMessage(messageId) {
      for (const [turnId, id] of sent) if (id === messageId) sent.delete(turnId);
    },
    /** Another session: none of the last one's turns is known to the room now. */
    reset() { sent.clear(); },
    /** How the module's turn message `data` goes to the room now: `{send}` with what to send, or `{drop: true}`. */
    route(data) {
      if (data.offline) return data.phase === 'finished' && data.text?.trim() ? { send: data } : { drop: true };
      if (data.phase === 'started' || sent.has(data.turn_id)) return { send: data };
      if (data.phase === 'finished' && data.text?.trim()) return { send: { ...data, offline: true } };
      return { drop: true };
    },
  };
}

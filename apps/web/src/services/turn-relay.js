/* The person's turns as the call's voice module reports them, said the way the room takes them. The module names each
 * turn (`turn_id`), and the room knows a turn by that name on the session that took its start: it answers the start
 * with the same `turn_id`. So a turn's end goes as it is once its start, sent on this session, is answered; while the
 * answer has not come it waits, so the room hears a person's turns in order. The end of a turn whose start this session
 * never took (sent on a session the room has replaced, or refused) is words said while the call had no room
 * (`offline`), which the room keeps as their own row, and such a cancelled turn is nothing to say. A turn the module
 * started offline is only ever finished, already `offline`.
 *
 * A start is waited for once however many times it is sent (the room takes each message once and only acknowledges a
 * repeat), and a refusal names the message it refuses, so it is found by that message's id. */
const KEPT = 64;

export function createTurnRelay() {
  const sent = new Map();
  const answered = new Set();
  const keep = (set) => { if (set.size > KEPT) set.delete(set.keys().next().value); };
  return {
    /** A start went on this session's socket, as message `messageId`. */
    sent(turnId, messageId) {
      if (!answered.has(turnId)) sent.set(turnId, messageId ?? null);
      keep(sent);
    },
    /** The room answered the start of `turnId`; whether it was one this session sent. */
    answered(turnId) {
      if (!sent.has(turnId)) return false;
      sent.delete(turnId);
      answered.add(turnId);
      keep(answered);
      return true;
    },
    /** The room refused message `messageId`: when it was a start, its turn's end goes as words said while away. */
    refusedMessage(messageId) {
      for (const [turnId, id] of sent) if (id === messageId) sent.delete(turnId);
    },
    /** Another session: none of the last one's turns is known to the room now. */
    reset() { sent.clear(); answered.clear(); },
    /**
     * How the module's turn message `data` goes to the room now: `{send}` with what to send, `{wait: true}` while its
     * start is unanswered, or `{drop: true}`.
     */
    route(data) {
      if (data.offline) return data.phase === 'finished' && data.text?.trim() ? { send: data } : { drop: true };
      if (data.phase === 'started') return { send: data };
      if (answered.has(data.turn_id)) return { send: data };
      if (sent.has(data.turn_id)) return { wait: true };
      if (data.phase === 'finished' && data.text?.trim()) return { send: { ...data, offline: true } };
      return { drop: true };
    },
  };
}

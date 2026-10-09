/* The person's turns as the call's voice module reports them, said the way the room takes them. The module names a
 * turn by its `turn_id`; the room gives a turn its revision when told it started, and wants that revision on the
 * turn's end. So a turn's end waits until its start is answered on this session; the end of one whose start this
 * session never saw is words said while the call had no room (`offline`), which the room keeps as their own row, and a
 * cancelled one is nothing to say. A start the module made while out of reach is not said at all: its end is offline. */
const KEPT = 64;

export function createTurnRelay() {
  const revisions = new Map();
  const asked = [];
  return {
    /** A start went on this session's socket. */
    sent(turnId) { asked.push(turnId); },
    /** The room's answer to the oldest start it has not answered: its turn. */
    answered(revision) {
      const turn = asked.shift();
      if (turn != null) {
        revisions.set(turn, revision);
        if (revisions.size > KEPT) revisions.delete(revisions.keys().next().value);
      }
      return turn ?? null;
    },
    /** The room refused a start: that turn gets no revision. */
    refused(turnId) {
      const index = asked.indexOf(turnId);
      if (index >= 0) asked.splice(index, 1);
    },
    /** Another session: nothing of the last one's turns holds. */
    reset() { revisions.clear(); asked.length = 0; },
    /** The revision the room gave `turnId` on this session, if it did. */
    revision(turnId) { return revisions.get(turnId) ?? null; },
    /**
     * How the module's turn message `data` goes to the room now: `{send}` with what to send, `{wait: true}` while its
     * start is unanswered, or `{drop: true}`.
     */
    route(data) {
      if (data.phase === 'started') return data.offline ? { drop: true } : { send: data };
      const revision = revisions.get(data.turn_id);
      if (revision != null) return { send: { ...data, revision } };
      if (asked.includes(data.turn_id)) return { wait: true };
      if (data.phase === 'finished' && data.text?.trim()) return { send: { ...data, offline: true } };
      return { drop: true };
    },
  };
}

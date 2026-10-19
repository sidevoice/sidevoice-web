/** The room's reply is admitted only against facts for this session and conversation, and only while that conversation
 *  is the one in focus (`focused`): every other one is silent. Whether the room can be reached now is none of these: a
 *  reply already here plays whatever happens to the link (#220). */
export function replyEligibility(reply, {sessionId, threadId, focused, epoch, openTurns, output}) {
  if (reply.session_id !== sessionId) return 'call_ended';
  if (reply.thread_id !== threadId || !focused) return 'focus_changed';
  if (output !== 'on') return output;
  if (!Number.isInteger(epoch) || !Number.isInteger(reply.epoch)) return 'hold';
  // Manual replay deliberately keeps the history row's original epoch. Core issued it for this current session.
  if (!reply.requested && reply.epoch < epoch) return 'newer_turn';
  // A newer reply may have come from another device. Wait for the room's epoch fact.
  if (!reply.requested && reply.epoch > epoch) return 'hold';
  if (openTurns?.size) return 'hold';
  return 'play';
}

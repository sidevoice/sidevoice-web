/** The room's reply is admitted only against facts for this session and conversation. */
export function replyEligibility(reply, {sessionId, threadId, epoch, openTurns, output, connected}) {
  if (reply.session_id !== sessionId) return 'call_ended';
  if (!connected) return 'connector_disconnected';
  if (reply.thread_id !== threadId) return 'focus_changed';
  if (output !== 'on') return output;
  if (!Number.isInteger(epoch) || !Number.isInteger(reply.epoch)) return 'hold';
  // Manual replay deliberately keeps the history row's original epoch. Core issued it for this current session.
  if (!reply.requested && reply.epoch !== epoch) return 'newer_turn';
  if (openTurns?.size) return 'hold';
  return 'play';
}

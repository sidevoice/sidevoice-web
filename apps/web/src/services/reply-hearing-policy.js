/* App policy for what the agent learns about a reply. Playback status and stop causes remain
 * diagnostics; only this module turns them into semantic hearing evidence. */
export const HEARING_POLICY = Object.freeze({
  skipCountsAsHeard: true,
  readMutedReplies: false,
});

const scalarLength = text => [...(text ?? '')].length;
const extentOf = (report, length) => Number.isInteger(report?.heard_chars) && report.heard_chars >= 0
  ? Math.min(report.heard_chars, length) : 0;

/** @returns {{outcome:'heard'|'partial'|'not_heard',heard_chars?:number}} */
export function playbackHearing(report, text, action = null, policy = HEARING_POLICY) {
  const length = scalarLength(text);
  if (report?.status === 'heard' || action === 'user_skipped' && policy.skipCountsAsHeard)
    return { outcome: 'heard' };
  // These are app availability choices, even when a physical prefix happened to play before stopping.
  if (['agents_muted', 'voice_off', 'connector_disconnected', 'focus_changed', 'call_ended', 'heard_elsewhere'].includes(action))
    return { outcome: 'not_heard' };
  const extent = extentOf(report, length);
  if (extent >= length && length > 0) return { outcome: 'heard' };
  if (extent > 0) return { outcome: 'partial', heard_chars: extent };
  return { outcome: 'not_heard' };
}

/** A written reply has no audio handle. In reading mode a muted page accepts its text as read. */
export function writtenReplyHearing(row, policy = HEARING_POLICY) {
  if (row?.status !== 'text_only') return null;
  const muted = row.audio_reason === 'agents_muted' || row.audio_reason === 'voice_off';
  return { outcome: muted && policy.readMutedReplies ? 'heard' : 'not_heard' };
}

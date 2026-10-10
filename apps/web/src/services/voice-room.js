/* What the call's voice says, in the room's words, and back. The voice (@sidevoice/voice, `js/voice-events.d.ts`)
 * knows nothing of the room: it names its own turns and the things it says, and tells how each ended. The room
 * (sidevoice-core) takes a person's turn as `voice-user-turn` and what became of a reply as `voice-playback`, with
 * its own reasons. Nothing here keeps state: the page holds the replies and the outbox. */

/** The reasons the room takes on a playback report. */
export const ROOM_PLAYBACK_REASONS = ['user_interrupted', 'newer_turn', 'user_skipped', 'focus_changed', 'call_ended', 'unheard'];

/**
 * A turn event of the voice as the room's `voice-user-turn` data (the page adds the session and the message id).
 * @param {import('@sidevoice/voice').VoiceTurnEvent} turn
 */
export function turnMessage(turn) {
  if (turn.phase === 'started') return { turn_id: turn.turn_id, phase: 'started', started_at: turn.started_at };
  if (turn.phase === 'cancelled') return { turn_id: turn.turn_id, phase: 'cancelled', merged: !!turn.merged };
  return {
    turn_id: turn.turn_id,
    phase: 'finished',
    text: turn.text,
    ...(turn.language ? { language: turn.language } : {}),
    started_at: turn.started_at,
    ended_at: turn.ended_at,
    merged: !!turn.merged,
    timings_ms: turn.timings,
  };
}

/** How many characters `text` has, as the voice counts them (Unicode scalar values). */
export function characters(text) {
  return [...(text ?? '')].length;
}

/**
 * Why something said stopped, in the room's words: a cancel is the room's own withdrawal (`withdrawn`, its reason) or
 * else the person's skip; a barge-in cuts what played (`user_interrupted`) and drops what waited (`newer_turn`); a stop
 * is the call ending. A failure has none: the room says `playback_failed` itself.
 * @param {import('@sidevoice/voice').VoiceStopReason} stop
 * @param {boolean} played
 * @param {string | null} withdrawn
 */
function roomReason(stop, played, withdrawn) {
  if (stop.reason === 'cancelled') return withdrawn ?? 'user_skipped';
  if (stop.reason === 'barge-in') return played ? 'user_interrupted' : 'newer_turn';
  if (stop.reason === 'stopped') return 'call_ended';
  return null;
}

/**
 * How a reply ended (`outcome`, the voice's) as the room's `voice-playback` data, for a reply of `text`; `withdrawn`
 * is the reason the room gave when it took the reply back.
 * @param {import('@sidevoice/voice').VoiceSayOutcome} outcome
 * @param {string} text
 * @param {string | null} [withdrawn]
 * @returns {{status: string, heard_chars: number, reason?: string}}
 */
export function playbackReport(outcome, text, withdrawn = null) {
  if (outcome.status === 'heard') return { status: 'heard', heard_chars: characters(text) };
  const played = outcome.status === 'heard-up-to';
  const heard = played ? outcome.heard_chars : 0;
  if (outcome.reason === 'failed') return { status: 'failed', heard_chars: heard };
  const reason = roomReason(outcome, played, withdrawn);
  return { status: played ? 'interrupted' : 'unplayed', heard_chars: heard, ...(reason ? { reason } : {}) };
}

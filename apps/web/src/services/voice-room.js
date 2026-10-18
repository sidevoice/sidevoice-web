/* What the call's voice says, in the room's words, and back. The voice (@sidevoice/voice, `js/voice-events.d.ts`)
 * knows nothing of the room: it names its own turns and the things it says, and tells how each ended. The room
 * (sidevoice-core) takes a person's turn as `voice-user-turn` and physical reply diagnostics as `voice-playback`.
 * App policy sends semantic hearing separately. Where the voice is in a reply it tells in its own count of characters, which the page turns into
 * offsets into the reply's text. Nothing here keeps state: the page holds the replies and the outbox. */

/** The reasons the room takes on a playback report. */
export const ROOM_PLAYBACK_REASONS = ['user_interrupted', 'newer_turn', 'focus_changed', 'call_ended', 'unheard', 'agents_muted', 'voice_off', 'connector_disconnected', 'heard_elsewhere', 'auto_start_expired'];

/**
 * A turn event of the voice as the room's `voice-user-turn` data (the page adds the session and the message id).
 * @param {import('@sidevoice/voice').VoiceTurnEvent} turn
 * @param {{thread_id: string, binding_id: string} | null} [target]
 */
export function turnMessage(turn, target = null) {
  const onset = turn.playback_at_turn_start
    ? {playback_at_turn_start: turn.playback_at_turn_start} : {};
  if (turn.phase === 'started') return {
    turn_id: turn.turn_id, phase: 'started', started_at: turn.started_at,
    ...onset,
    // Core admits the start against this captured focus, even if selection has since moved.
    thread_id: target?.thread_id && target?.binding_id ? target.thread_id : '',
    binding_id: target?.thread_id && target?.binding_id ? target.binding_id : '',
  };
  if (turn.phase === 'cancelled') return { turn_id: turn.turn_id, phase: 'cancelled', merged: !!turn.merged, ...onset };
  return {
    turn_id: turn.turn_id,
    phase: 'finished',
    text: turn.text,
    ...(turn.language ? { language: turn.language } : {}),
    started_at: turn.started_at,
    ended_at: turn.ended_at,
    merged: !!turn.merged,
    timings_ms: turn.timings,
    ...onset,
    ...(turn.not_played_at_turn_start ? {not_played_at_turn_start: turn.not_played_at_turn_start} : {}),
    ...(turn.not_played_at_turn_start_truncated ? {not_played_at_turn_start_truncated: true} : {}),
    ...(target?.thread_id && target?.binding_id ? { thread_id: target.thread_id, binding_id: target.binding_id } : {}),
  };
}

/** How many characters `text` has, as the voice counts them (Unicode scalar values). */
export function characters(text) {
  return [...(text ?? '')].length;
}

/** The room only accepts scalar counts. A host that reports a JavaScript text offset can be normalized here. */
export function scalarExtent(text, extent, units = 'scalars') {
  if (!Number.isInteger(extent) || extent < 0) return null;
  const length = units === 'utf16' ? [...text.slice(0, extent)].length : extent;
  return Math.min(length, characters(text));
}

/** Where the voice's character `at` (a count of Unicode scalar values) falls in `text`, as JavaScript indexes it. */
function offset(text, at) {
  let units = 0, counted = 0;
  for (const character of text) {
    if (counted >= at) break;
    units += character.length;
    counted += 1;
  }
  return units;
}

/**
 * Where the voice is in a reply of `text`, as a `progress` step tells it, in the page's offsets into `text`: the
 * chunk sounding now (`from`, `to`), or between chunks the end of what was heard (`from` and `to` both).
 * @param {{sounding: [number, number] | null, heard_chars: number}} progress
 * @param {string} text
 * @returns {{from: number, to: number}}
 */
export function sayingRange(progress, text) {
  if (progress.sounding) return { from: offset(text, progress.sounding[0]), to: offset(text, progress.sounding[1]) };
  const heard = offset(text, progress.heard_chars);
  return { from: heard, to: heard };
}

/**
 * Why something said stopped, in the room's words: a cancel is the room's own withdrawal (`withdrawn`, its reason) or
 * else has no diagnostic cause (including a local Skip); a barge-in cuts what played (`user_interrupted`) and drops what waited (`newer_turn`); a stop
 * is the call ending. A failure has none: the room says `playback_failed` itself.
 * @param {import('@sidevoice/voice').VoiceStopReason} stop
 * @param {boolean} played
 * @param {string | null} withdrawn
 * @param {string | null} action
 */
function roomReason(stop, played, withdrawn, action) {
  if (action === 'user_skipped') return null;
  if (stop.reason === 'cancelled') return withdrawn ?? action ?? null;
  if (stop.reason === 'barge-in') return action ?? (played ? 'user_interrupted' : 'newer_turn');
  if (stop.reason === 'stopped') return action ?? 'call_ended';
  return null;
}

/**
 * How a reply ended (`outcome`, the voice's) as the room's `voice-playback` data, for a reply of `text`; `withdrawn`
 * is the reason the room gave when it took the reply back.
 * @param {import('@sidevoice/voice').VoiceSayOutcome} outcome
 * @param {string} text
 * @param {string | null} [withdrawn]
 * @param {string | null} [action]
 * @returns {{status: string, heard_chars?: number, reason?: string}}
 */
export function playbackReport(outcome, text, withdrawn = null, action = null) {
  if (outcome.status === 'heard') return { status: 'heard', heard_chars: characters(text) };
  const played = outcome.status === 'heard-up-to';
  const heard = played ? scalarExtent(text, outcome.heard_chars) : null;
  if (outcome.reason === 'failed') return { status: 'failed', ...(heard != null ? {heard_chars: heard} : {}) };
  const reason = roomReason(outcome, played, withdrawn, action);
  return { status: played ? 'interrupted' : 'unplayed', ...(heard != null ? {heard_chars: heard} : {}), ...(reason ? { reason } : {}) };
}

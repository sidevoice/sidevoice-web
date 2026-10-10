export type Identifier = string;

export interface RoomBinding {
  thread_id?: Identifier | null;
  title?: string | null;
  binding_id?: Identifier | null;
}

export interface Participant {
  thread_id: Identifier;
  title: string;
  harness?: string | null;
  available: boolean;
  selected: boolean;
  reach?: {
    state: "listening" | "holding" | "offline";
    detail?: string | null;
    remedy?: string | null;
  };
}

export interface VoiceSession {
  session_id: Identifier;
  resume?: { token: string; seconds: number };
  resumed?: boolean;
}

/* The call speaks text with the room (sidevoice/sidevoice-core#89): the page's voice hears and says, and the room
 * carries words. Every message the page sends names itself with `client_msg_id`, which the room acknowledges with
 * `voice-ack` or refuses with an `error` naming it. */

/** The person's turn: `started` is answered by the room with the turn's `revision`; its end carries that revision,
 *  or `offline: true` for words said while the call had no room. */
export interface VoiceUserTurn {
  client_msg_id: Identifier;
  turn_id: Identifier;
  phase: "started" | "finished" | "cancelled";
  revision?: number;
  text?: string;
  offline?: boolean;
  merged?: boolean;
  [key: string]: unknown;
}

/** How a reply sounded on this device. */
export interface VoicePlayback {
  client_msg_id: Identifier;
  utterance_id: Identifier;
  status: "playing" | "heard" | "interrupted" | "unplayed" | "failed";
  heard_chars: number;
  [key: string]: unknown;
}

/** A reply to say. */
export interface VoiceReply {
  session_id: Identifier;
  utterance_id: Identifier;
  revision: number;
  reply_revision: number;
  thread_id: Identifier;
  history_id: Identifier;
  text: string;
  language?: string | null;
  replay?: boolean;
  requested?: boolean;
}

export type RoomClientEvent =
  | { type: "voice-user-turn"; data: VoiceUserTurn & { session_id: Identifier } }
  | { type: "voice-playback"; data: VoicePlayback & { session_id: Identifier } }
  | { type: "voice-settings"; data: { session_id: Identifier; ui_language: string } }
  | { type: "voice-pong"; data: { session_id: Identifier } };

export type RoomServerEvent =
  | { type: "voice-session"; data: VoiceSession }
  | { type: "voice-reply"; data: VoiceReply }
  | { type: "voice-ack"; data: { client_msg_id: Identifier } }
  | { type: "voice-user-turn"; data: { session_id: Identifier; phase: "started"; revision: number; thread_id: Identifier } }
  | { type: "voice-input-receipt"; data: Record<string, unknown> }
  /* Is anybody still there? The browser answers `{type:"voice-pong",data:{session_id}}`, and a
   * browser that stops answering loses its seat: behind a tunnel a closed tab leaves its socket up. */
  | { type: "voice-ping"; data: { session_id: Identifier } }
  /* `reason` names what the sentence says, so a page refused can say it in its own language even
   * when nothing else about the refusal survived the trip. With `client_msg_id`, it refuses that message. */
  | { type: "error"; data: { message?: string; error?: string; reason?: string; key?: string; client_msg_id?: Identifier } }
  | { type: string; data?: Record<string, unknown> };

export const PRESENTATION_API = "/api/presentation" as const;
export const PRESENTATION_SOCKET = "/api/presentation/ws" as const;
export const CONNECTOR_PROTOCOL_VERSION = 1 as const;

/* ----- telemetry: the vocabulary the room and the page share -----
 *
 * The stages of a turn, and everything a span about one is allowed to say. Both halves implement
 * this list: `apps/web/src/services/telemetry-types.ts` imports it, and sidevoice-core's
 * `control/telemetry.py` repeats it because Python cannot read this file — a test there asserts the two
 * agree, so the contract has one owner and the copy cannot drift in silence.
 *
 * A stage name is the same thing three times over: the span, the histogram, and the row of the
 * connection-statistics dialog. Renaming one means renaming all three. */
export const TURN_STAGES = [
  "endpoint_silence",
  "recognition",
  "request_to_transcript",
  "transcript_to_delivery",
  "delivery_to_read",
  "read_to_reply",
  "input_queued_to_reply",
  "reply_to_dispatch",
  "provider_synthesis",
  "audio_received_to_playback",
] as const;

export type TurnStage = (typeof TURN_STAGES)[number];

/** Ids, revisions, states, counts and engine names. Never a transcript, a reply or a credential. */
export const TELEMETRY_ATTRIBUTES = [
  "sidevoice.session_id",
  "sidevoice.thread_id",
  "sidevoice.turn_revision",
  "sidevoice.reply_revision",
  "sidevoice.utterance_id",
  "sidevoice.status",
  "sidevoice.reason",
  "sidevoice.outcome",
  "sidevoice.kind",
  "sidevoice.stt_place",
  "sidevoice.stt_model",
  "sidevoice.stt_accelerator",
  "sidevoice.tts_provider",
  "sidevoice.tts_model",
  "sidevoice.turn_end_mode",
  "sidevoice.harness",
  "sidevoice.shared_audio",
  "sidevoice.synthesis_attempt",
  "sidevoice.stage",
  "sidevoice.duration_ms",
  "sidevoice.audio_output",
  "sidevoice.audio_context",
  "sidevoice.stalls",
  "sidevoice.build_id",
] as const;

export type TelemetryAttribute = (typeof TELEMETRY_ATTRIBUTES)[number];

/** Where the page posts its OTLP batches. The room forwards them; the page never sees a collector. */
export const TELEMETRY_API = "/api/telemetry" as const;

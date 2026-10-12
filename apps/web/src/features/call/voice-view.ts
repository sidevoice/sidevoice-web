import { reachNote, selectedThread, type SessionFacts, type VoiceOffReason } from "../../state/room-session-state.js";
import type { ParticipantView } from "../../state/room-types";
import type { CallTranslate } from "./call-i18n";
import type { CallMessageKey } from "./messages/en";
import { canHear } from "./conversation-state";

/* What call model B's bar, notes and line say (briefs/CALL-MODEL-B-SPEC.md §2), derived in one place from the
 * session's facts and the conversations' rows. No clock, no DOM: the components only paint it. */

/** How long the voice may go without a sign of the person before it turns itself off (room-session-controller.js
 *  IDLE_MS), as its note says it. */
export const IDLE_MINUTES = 15;

/** Where the voice switch is. */
export type VoicePosition = "off" | "starting" | "on";
export function voicePosition(facts: Pick<SessionFacts, "voiceOn" | "voiceStarting">): VoicePosition {
  return facts.voiceStarting ? "starting" : facts.voiceOn ? "on" : "off";
}

/** The one note above the switch (§2.3): the idle warning while the voice is on, else why it turned itself off — kept
 *  until it is on again; none when the person turned it off. A failure the person must act on is an alert. */
export type VoiceNoteKind = "idle-warning" | VoiceOffReason;
export function voiceNote(facts: Pick<SessionFacts, "voiceOn" | "voiceStarting" | "voiceOffReason" | "voiceIdleWarning">): { kind: VoiceNoteKind; role: "status" | "alert" } | null {
  if (facts.voiceOn) return facts.voiceIdleWarning ? { kind: "idle-warning", role: "status" } : null;
  if (facts.voiceStarting || !facts.voiceOffReason) return null;
  return { kind: facts.voiceOffReason, role: ["micBlocked", "micUnavailable", "failed"].includes(facts.voiceOffReason) ? "alert" : "status" };
}

const OFF_KEYS: Record<VoiceOffReason, CallMessageKey> = {
  idle: "voice.off.idle", micLost: "voice.off.micLost", micBlocked: "voice.off.micBlocked", micUnavailable: "voice.off.micUnavailable",
  failed: "voice.off.failed", reloaded: "voice.off.reloaded",
};
/** The note's words. */
export function voiceNoteText(kind: VoiceNoteKind, detail: string, t: CallTranslate): string {
  if (kind === "idle-warning") return t("voice.idle.warning");
  return t(OFF_KEYS[kind], { minutes: IDLE_MINUTES, detail });
}

/** The active conversation: the one looked at, which in call model B is always the one the person picked. */
export function activeKey(facts: SessionFacts): string | null {
  return facts.viewedThread || selectedThread(facts);
}

function titleOf(key: string | null, rows: ParticipantView[]): string {
  return rows.find((row) => row.threadId === key)?.title ?? "";
}

/** The microphone in call model B (§2.4): always named "Mute microphone" and pressed while muted; with the voice off it
 *  sets the preference. With the voice on, why it cannot be used, when it cannot: nobody to talk to, the active
 *  conversation cannot hear, or the session is still getting to it. */
export function voiceMicReason(facts: SessionFacts, rows: ParticipantView[], t: CallTranslate): string | null {
  if (!facts.voiceOn) return null;
  const key = activeKey(facts);
  if (!key) return t("mic.noConversation");
  const row = rows.find((candidate) => candidate.threadId === key);
  const title = row?.title ?? "";
  if (!row || !canHear(row)) return t("mic.cantHear", { title });
  if (facts.switching || facts.movingTo || facts.connecting || selectedThread(facts) !== key) return t("mic.connecting", { title });
  return null;
}

/** The line above the bar in call model B (§2.7): the voice getting ready, a move to another machine, the room being
 *  reconnected past its grace, the room's refusal, or the standing note of no machine to talk to. Never "joining the
 *  room": the room opens by itself. Why the voice failed is the switch's note, not this. */
export function voiceJoinLine(facts: SessionFacts, rows: ParticipantView[], t: CallTranslate): { text: string; state: "busy" | "note" | "failed"; details?: string } | null {
  if (facts.voiceStarting) {
    const step = t("voice.step.preparing");
    return { text: facts.joinProgress != null ? t("voice.step.progress", { step, percent: Math.round(facts.joinProgress) }) : step, state: "busy" };
  }
  if (facts.movingTo) return { text: t("room.switching", { title: titleOf(facts.movingTo, rows) }), state: "busy" };
  if (facts.reconnectShown) return { text: t("room.reconnecting"), state: "busy" };
  if (facts.joinFailure) return { text: facts.joinFailure, state: "failed", ...(facts.joinFailureDetails ? { details: facts.joinFailureDetails } : {}) };
  const note = !facts.ws && !facts.connecting ? reachNote(facts) : "";
  return note ? { text: note, state: "note" } : null;
}

/** "Hear it"'s name says each step it takes beyond asking (§2.10, D3): turning the voice on, unmuting the agents. Each
 *  contains the visible "Hear it". */
export function hearActionKey(facts: Pick<SessionFacts, "voiceOn" | "voiceStarting" | "agentsMuted">): CallMessageKey {
  const voiceOff = !facts.voiceOn && !facts.voiceStarting;
  return voiceOff && facts.agentsMuted ? "hear.itBoth" : voiceOff ? "hear.itVoice" : facts.agentsMuted ? "hear.itUnmute" : "hear.it";
}

/** The count on Mute agents, as its badge shows it. */
export function waitingBadge(n: number): string {
  return n > 9 ? "9+" : String(n);
}

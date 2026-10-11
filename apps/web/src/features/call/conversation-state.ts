import type { ParticipantView } from "../../state/room-types";
import type { AvatarMood } from "../avatar/avatar-spec";
import type { CallTranslate } from "./call-i18n";

/* What the call view says about a conversation, derived in one place from the room's own row (participantsView)
 * and whether this page is in the call: the dot beside its avatar, the line under its title, how its avatar moves,
 * and which ones earn a place in a phone's header. Nothing here reads a clock or the DOM. */

export type { AvatarMood };

/** The state a conversation's dot and line show. */
export type ConversationState = "in-call" | "working" | "waiting" | "idle";

/** The conversation hears the person right now. */
export function canHear(row: Pick<ParticipantView, "available" | "reach">) {
  return row.available && row.reach === "listening";
}

/** In call: the call's own conversation, while this page is in the call — the room keeps its binding before a join
 *  and after a hang-up, and that is not a call. Working: its harness says so (a room only knows this during a call).
 *  Waiting for you: it hears you and has nothing in hand. Idle: it cannot hear you (holding, offline, closed). */
export function conversationState(row: ParticipantView, inCall: boolean): ConversationState {
  if (inCall && row.selected && canHear(row)) return "in-call";
  if (row.working) return "working";
  if (!canHear(row)) return "idle";
  return "waiting";
}

/** A small avatar (sidebar, rail, header, panel): offline while the room cannot reach it (it sleeps), working while
 *  its harness says so, idle otherwise — waiting for you included: the row's dot and line say that it hears you. A small
 *  one never speaks or listens; the stage, and the header's copy of it, do. */
export function smallAvatarMood(row: Pick<ParticipantView, "reach" | "working">): AvatarMood {
  if (row.reach === "offline") return "offline";
  return row.working ? "working" : "idle";
}

export interface StageFacts {
  /** The page is in the call. */
  inCall: boolean;
  /** The conversation on the stage is the one the microphone talks to. */
  isTarget: boolean;
  canHear: boolean;
  /** How the room reaches it; null while the room has not listed it yet. */
  reach: ParticipantView["reach"] | null;
  /** Its reply is sounding. */
  speaking: boolean;
  /** The person's turn to it is open: they are talking, or it is being transcribed (ConversationView.pendingPhase). */
  personSpeaking: boolean;
  working: boolean;
}

/** The agent on the stage, by priority: offline (the room cannot reach it: the stage shows its wanted poster), then
 *  speaking, listening (the person is talking to it and it can hear them), working, and idle for everything else.
 *  Short of offline it is idle whenever it cannot hear the person: out of the call, not the one the microphone talks
 *  to, or holding what it is sent — a conversation that is holding does not react to the person at all. */
export function stageMood(facts: StageFacts): AvatarMood {
  if (facts.reach === "offline") return "offline";
  if (!facts.inCall || !facts.isTarget || !facts.canHear) return "idle";
  if (facts.speaking) return "speaking";
  if (facts.personSpeaking && (facts.reach === "listening" || facts.reach === null)) return "listening";
  if (facts.working) return "working";
  return "idle";
}

/** The person in the picture-in-picture. */
export function personMood({ inCall, speaking }: { inCall: boolean; speaking: boolean }): AvatarMood {
  if (!inCall) return "idle";
  return speaking ? "speaking" : "present";
}

const HEADER_RANK: Partial<Record<ConversationState, number>> = { waiting: 0, working: 1 };
const HEADER_LIMIT = 2;

/** A phone's header has room for two other conversations: those waiting for you first, then those working — the
 *  more unread first within each, the room's order otherwise. Idle ones, and the one on the stage, are not there;
 *  the pill beside them opens all of them. */
export function headerConversations(rows: ParticipantView[], onStage: string | null, inCall: boolean): ParticipantView[] {
  return rows
    .map((row, index) => ({ row, index, rank: HEADER_RANK[conversationState(row, inCall)] }))
    .filter((entry): entry is { row: ParticipantView; index: number; rank: number } => entry.rank !== undefined && entry.row.threadId !== onStage)
    .sort((a, b) => a.rank - b.rank || b.row.unread - a.row.unread || a.index - b.index)
    .slice(0, HEADER_LIMIT)
    .map((entry) => entry.row);
}

/** The words for a conversation's state, with what is waiting to be read when it is not the call's. */
export function stateText(row: ParticipantView, inCall: boolean, t: CallTranslate): string {
  const state = conversationState(row, inCall);
  const words = state === "in-call" ? t("state.inCall") : state === "working" ? t("state.working")
    : state === "waiting" ? t("state.waiting") : row.reach === "holding" && row.available ? t("state.holding") : t("state.offline");
  return row.unread && state !== "in-call" ? t("state.withUnread", { state: words, unread: t("state.unread", { n: row.unread }) }) : words;
}

/** The words for what an agent's avatar is acting out: the stage says them with its name. */
export function moodText(mood: AvatarMood, t: CallTranslate): string {
  if (mood === "offline") return t("state.offline");
  if (mood === "speaking") return t("state.speaking");
  if (mood === "listening") return t("state.listening");
  if (mood === "working") return t("state.working");
  return t("state.resting");
}

/** The conversations grouped by the machine they run on, in the order the room lists them. A machine is its id: two
 *  machines may share a name, or have none. */
export function machineGroups(rows: ParticipantView[]): { key: string; machine: string | null; rows: ParticipantView[] }[] {
  const groups = new Map<string, { key: string; machine: string | null; rows: ParticipantView[] }>();
  for (const row of rows) {
    const key = row.machineId ? "id:" + row.machineId : "name:" + (row.machine ?? "");
    const group = groups.get(key) ?? { key, machine: row.machine ?? null, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

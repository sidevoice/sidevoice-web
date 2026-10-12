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
/** With `everyone`, the others rank after those waiting and working: a header that has room shows them too. */
const OTHERS_RANK = 2;

/** A phone's header has room for two other conversations: those waiting for you first, then those working — the
 *  more unread first within each, the room's order otherwise. Idle ones, and the one on the stage, are not there;
 *  the pill beside them opens all of them. */
export function headerConversations(rows: ParticipantView[], onStage: string | null, inCall: boolean, limit = HEADER_LIMIT, everyone = false): ParticipantView[] {
  return rows
    .map((row, index) => ({ row, index, rank: HEADER_RANK[conversationState(row, inCall)] ?? (everyone ? OTHERS_RANK : undefined) }))
    .filter((entry): entry is { row: ParticipantView; index: number; rank: number } => entry.rank !== undefined && entry.row.threadId !== onStage)
    .sort((a, b) => a.rank - b.rank || b.row.unread - a.row.unread || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.row);
}

/** The words for a conversation's state, with what is waiting to be read when it is not the call's. */
export function stateText(row: ParticipantView, inCall: boolean, t: CallTranslate): string {
  const state = conversationState(row, inCall);
  const words = state === "in-call" ? t("state.inCall") : state === "working" ? t("state.working")
    : state === "waiting" ? t("state.waiting") : row.reach === "holding" && row.available ? t("state.holding") : t("state.offline");
  return row.unread && state !== "in-call" ? t("state.withUnread", { state: words, unread: t("state.unread", { n: row.unread }) }) : words;
}

/* ----- call model B (VARIANTS `call-model`, the voice switch): the same places, its own states -----
 * The room is always open, so "in call" goes; every row says whether its agent works (contract gap #33), and speech the
 * person could not hear is a mark on its conversation (gap #34): waiting for you, or wanting to talk. */

/** What a conversation's dot and line say in call model B (the spec's §2.8), the first that applies: it cannot be
 *  reached (idle: offline, or can't receive), a mark while its agent is idle, a mark while it works or nobody knows,
 *  the active one speaking, working, ready. */
export type VoiceSwitchState = "idle" | "waiting-for-you" | "wants-to-talk" | "speaking" | "working" | "ready";

export function voiceSwitchState(row: ParticipantView): VoiceSwitchState {
  if (!canHear(row)) return "idle";
  if (row.mark === "waiting-for-you") return "waiting-for-you";
  if (row.mark === "wants-to-talk") return "wants-to-talk";
  if (row.speaking) return "speaking";
  if (row.agentWorking) return "working";
  return "ready";
}

/** Its words, with what is waiting to be read: unread text and unheard speech are different things, and both show. */
export function voiceSwitchStateText(row: ParticipantView, t: CallTranslate): string {
  const state = voiceSwitchState(row);
  const words = state === "idle" ? (row.reach === "holding" && row.available ? t("state.holding") : t("state.offline"))
    : state === "waiting-for-you" ? t("state.waitingForYou") : state === "wants-to-talk" ? t("state.wantsToTalk")
    : state === "speaking" ? t("state.speaking") : state === "working" ? t("state.working") : t("state.ready");
  return row.unread ? t("state.withUnread", { state: words, unread: t("state.unread", { n: row.unread }) }) : words;
}

/** A small avatar in call model B: working on any row its agent works (gap #33). */
export function voiceSwitchAvatarMood(row: Pick<ParticipantView, "reach" | "agentWorking">): AvatarMood {
  if (row.reach === "offline") return "offline";
  return row.agentWorking ? "working" : "idle";
}

const VOICE_SWITCH_HEADER_RANK: Partial<Record<VoiceSwitchState, number>> = { "waiting-for-you": 0, "wants-to-talk": 1, working: 2 };

/** A phone's header in call model B: waiting for you, then wanting to talk, then working — the more unread first within
 *  each, the room's order otherwise — and, with `everyone`, the rest after them. Never the one on the stage. */
export function voiceSwitchHeader(rows: ParticipantView[], onStage: string | null, limit = HEADER_LIMIT, everyone = false): ParticipantView[] {
  return rows
    .map((row, index) => ({ row, index, rank: VOICE_SWITCH_HEADER_RANK[voiceSwitchState(row)] ?? (everyone ? 3 : undefined) }))
    .filter((entry): entry is { row: ParticipantView; index: number; rank: number } => entry.rank !== undefined && entry.row.threadId !== onStage)
    .sort((a, b) => a.rank - b.rank || b.row.unread - a.row.unread || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.row);
}

export interface VoiceSwitchStageFacts {
  voiceOn: boolean;
  reach: ParticipantView["reach"] | null;
  canHear: boolean;
  /** Its reply is sounding. */
  speaking: boolean;
  /** The person's turn to it is open. */
  personSpeaking: boolean;
  /** Its agent works (any voice state: the room says so for every conversation). */
  working: boolean;
}

/** The agent on the stage in call model B, by priority: offline, speaking and listening (with the voice on), working
 *  (whatever the voice), idle. */
export function voiceSwitchStageMood(facts: VoiceSwitchStageFacts): AvatarMood {
  if (facts.reach === "offline") return "offline";
  if (facts.voiceOn && facts.speaking) return "speaking";
  if (facts.voiceOn && facts.personSpeaking && facts.canHear) return "listening";
  if (facts.working) return "working";
  return "idle";
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

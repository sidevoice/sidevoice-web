import type { ParticipantView } from "../../state/room-types";
import { canHear } from "../../state/room-session-state.js";
import type { AvatarMood } from "../avatar/avatar-spec";
import type { CallTranslate } from "./call-i18n";

/* What the call view says about a conversation, derived in one place from the room's own row (participantsView)
 * and whether this page is in the call: the dot beside its avatar, the line under its title, and how its avatar moves.
 * Nothing here reads a clock or the DOM. */

export type { AvatarMood };
/* Whether a conversation hears the person, and the stage's mood for it, are the room's own projections
 * (state/room-session-state.js): the desktop card's snapshot takes its avatar's mood from them too, so the stage and the
 * card never disagree (FLOATING-CARD-SPEC FC4). */
export { canHear, stageMood } from "../../state/room-session-state.js";
export type { StageFacts } from "../../state/room-session-state.js";

/** The state a conversation's dot and line show. */
export type ConversationState = "in-call" | "working" | "waiting" | "idle";

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

/** The person in the picture-in-picture. */
export function personMood({ inCall, speaking }: { inCall: boolean; speaking: boolean }): AvatarMood {
  if (!inCall) return "idle";
  return speaking ? "speaking" : "present";
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

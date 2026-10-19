import type { ParticipantView } from "../../state/room-types";
import { canHear } from "../../state/room-session-state.js";
import type { AvatarMood } from "../avatar/avatar-spec";
import type { Translate } from "../../i18n/translator";

/* What the call view says about a conversation, derived in one place from the room's own row (participantsView)
 * and whether this page is in the call: the light beside its avatar, the line under its title, and how its avatar moves.
 * Nothing here reads a clock or the DOM. */

export type { AvatarMood };
/* Whether a conversation hears the person, and the stage's mood for it, are the room's own projections
 * (state/room-session-state.js): the desktop card's snapshot takes its avatar's mood from them too, so the stage and the
 * card never disagree (FLOATING-CARD-SPEC FC4). */
export { canHear, stageMood } from "../../state/room-session-state.js";
export type { StageFacts } from "../../state/room-session-state.js";

/** The state a conversation's dot and line show. */
export type ConversationState = "in-call" | "working" | "waiting" | "idle";

/** The call's own conversation, while this page is in the call — the room keeps its binding before a join and after a
 *  hang-up, and that is not a call. */
export function isCallRow(row: ParticipantView, inCall: boolean): boolean {
  return inCall && row.selected && canHear(row);
}

/** The states call model A defines for a row (CALL-MODEL-B-SPEC §6, A): Working, while its harness says so — a room
 *  only knows this during a call, for the call's own conversation, so it wins over In call (desktop trial, item 11); In
 *  call, the call's own; Waiting for you, it hears you and has nothing in hand; idle, it cannot hear you (holding,
 *  offline, closed), its words Can't receive or Offline. */
export function conversationState(row: ParticipantView, inCall: boolean): ConversationState {
  if (row.working) return "working";
  if (!canHear(row)) return "idle";
  if (isCallRow(row, inCall)) return "in-call";
  return "waiting";
}

/** A small avatar (sidebar, rail, header, panel): offline while the room cannot reach it (it sleeps), working while
 *  its harness says so, idle otherwise — waiting for you included: the row's dot and line say that it hears you. The
 *  conversation on the stage does not use this: its small avatar takes the stage's own mood (ConversationAvatar). */
export function smallAvatarMood(row: Pick<ParticipantView, "reach" | "working">): AvatarMood {
  if (row.reach === "offline") return "offline";
  return row.working ? "working" : "idle";
}

/** The person in the picture-in-picture. */
export function personMood({ inCall, speaking }: { inCall: boolean; speaking: boolean }): AvatarMood {
  if (!inCall) return "idle";
  return speaking ? "speaking" : "present";
}

/** The one quiet unread mark: the agent said something after the person left this conversation (the room's seen mark
 *  follows the conversation they view, so what arrived while they were in it never counts) and they are not in it now:
 *  not the focused one (`focused`, the stage's) nor the call's own. No count, anywhere. */
export function hasUnread(row: Pick<ParticipantView, "threadId" | "unread" | "selected">, focused: string | null): boolean {
  return row.unread > 0 && !row.selected && row.threadId !== focused;
}

/** The words for a conversation's state. */
export function stateText(row: ParticipantView, inCall: boolean, t: Translate): string {
  const state = conversationState(row, inCall);
  return state === "in-call" ? t("state.inCall") : state === "working" ? t("state.working")
    : state === "waiting" ? t("state.waiting") : row.reach === "holding" && row.available ? t("state.holding") : t("state.offline");
}

/** The words for what an agent's avatar is acting out: the stage says them with its name. */
export function moodText(mood: AvatarMood, t: Translate): string {
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

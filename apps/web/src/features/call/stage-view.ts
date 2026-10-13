import { useRoomStore, type RoomViewState } from "../../state/room-store";
import type { ConversationView, ParticipantView } from "../../state/room-types";
import type { AvatarMood } from "../avatar/avatar-spec";
import { canHear, stageMood } from "./conversation-state";

/* The conversation on the stage: the one the person is looking at, which is the call's own unless they picked one
 * that cannot hear them. The header and the stage both read it from here. */

/** This page is in the call: it has the room's socket, or is getting it back. Joining is not yet, and the binding
 *  the room keeps before a join and after a hang-up is not a call. */
export const selectInCall = (state: RoomViewState) => !!(state.facts.ws || state.facts.reconnecting);

export interface StageConversation {
  threadId: string | null;
  row: ParticipantView | null;
  title: string;
  /** The microphone talks to it. */
  isTarget: boolean;
  inCall: boolean;
  canHear: boolean;
  speaking: boolean;
  working: boolean;
  /** Its replies this browser has not seen yet (ParticipantView.unread); 0 when it is not listed. */
  unread: number;
  mood: AvatarMood;
}

type StageFacts = Pick<RoomViewState, "participants" | "title"> & {
  viewed: string | null; selected: string | null; inCall: boolean; botLive: boolean; working: boolean;
  /** The viewed conversation's open turn of the person's (ConversationView.pendingPhase). */
  pendingPhase?: ConversationView["pendingPhase"];
};

export function stageConversation({ participants, title, viewed, selected, inCall, botLive, working, pendingPhase }: StageFacts): StageConversation {
  const row = viewed ? participants.find((participant) => participant.threadId === viewed) ?? null : null;
  const isTarget = !!viewed && viewed === selected;
  // A conversation the room has bound to the call but not listed yet hears the call: it was just chosen for it.
  const hears = row ? canHear(row) : isTarget;
  const speaking = isTarget && botLive;
  const busy = isTarget && working;
  const personSpeaking = pendingPhase === "listening" || pendingPhase === "transcribing";
  const mood = stageMood({ inCall, isTarget, canHear: hears, reach: row?.reach ?? null, speaking, personSpeaking, working: busy });
  return { threadId: viewed, row, title: row?.title || title, isTarget, inCall, canHear: hears, speaking, working: busy, unread: row?.unread ?? 0, mood };
}

export function useStageConversation(): StageConversation {
  const participants = useRoomStore((state) => state.participants);
  const title = useRoomStore((state) => state.title);
  const viewed = useRoomStore((state) => state.session.viewed);
  const selected = useRoomStore((state) => state.session.selected);
  const inCall = useRoomStore(selectInCall);
  const botLive = useRoomStore((state) => state.facts.botLive);
  const working = useRoomStore((state) => state.session.working);
  const pendingPhase = useRoomStore((state) => state.conversation.pendingPhase);
  const preview = useRoomStore((state) => state.facts.avatarPreview);
  const stage = stageConversation({ participants, title, viewed, selected, inCall, botLive, working, pendingPhase });
  // The preview holding the avatar in a mood (the playground's card): that mood, and something unheard when it says.
  return preview ? { ...stage, mood: preview.mood, unread: preview.unread ? Math.max(1, stage.unread) : 0 } : stage;
}

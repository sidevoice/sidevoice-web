import { useRoomStore, type RoomViewState } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
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
  mood: AvatarMood;
}

type StageFacts = Pick<RoomViewState, "participants" | "title"> & {
  viewed: string | null; selected: string | null; inCall: boolean; botLive: boolean; working: boolean;
};

export function stageConversation({ participants, title, viewed, selected, inCall, botLive, working }: StageFacts): StageConversation {
  const row = viewed ? participants.find((participant) => participant.threadId === viewed) ?? null : null;
  const isTarget = !!viewed && viewed === selected;
  // A conversation the room has bound to the call but not listed yet hears the call: it was just chosen for it.
  const hears = row ? canHear(row) : isTarget;
  const speaking = isTarget && botLive;
  const busy = isTarget && working;
  return {
    threadId: viewed, row, title: row?.title || title, isTarget, inCall, canHear: hears, speaking, working: busy,
    mood: stageMood({ inCall, isTarget, canHear: hears, speaking, working: busy }),
  };
}

export function useStageConversation(): StageConversation {
  const participants = useRoomStore((state) => state.participants);
  const title = useRoomStore((state) => state.title);
  const viewed = useRoomStore((state) => state.session.viewed);
  const selected = useRoomStore((state) => state.session.selected);
  const inCall = useRoomStore(selectInCall);
  const botLive = useRoomStore((state) => state.facts.botLive);
  const working = useRoomStore((state) => state.session.working);
  return stageConversation({ participants, title, viewed, selected, inCall, botLive, working });
}

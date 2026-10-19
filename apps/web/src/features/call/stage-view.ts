import { useRoomStore, type RoomViewState } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import type { AvatarMood } from "../avatar/avatar-spec";
import { canHear, stageMood } from "./conversation-state";

/* The conversation on the stage: the one the person is looking at, which is the call's own unless they picked one
 * that cannot hear them. The header and the stage both read it from here. And the mood of any conversation's agent:
 * one projection for it wherever it is drawn (agentMood). */

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
  /** What its agent acts out (agentMood), before the stage holds it still under its balloon (conversation-avatars.ts). */
  mood: AvatarMood;
}

/** What a conversation's agent's mood is made of. */
export interface MoodFacts {
  participants: ParticipantView[];
  viewed: string | null;
  selected: string | null;
  inCall: boolean;
  botLive: boolean;
  /** The person's turn to the call's conversation, open (CallCardView.turn). */
  turn: RoomViewState["callCard"]["turn"];
  preview: RoomViewState["facts"]["avatarPreview"];
}

export const moodFacts = (state: RoomViewState): MoodFacts => ({
  participants: state.participants, viewed: state.session.viewed, selected: state.session.selected, inCall: selectInCall(state),
  botLive: state.facts.botLive, turn: state.callCard.turn, preview: state.facts.avatarPreview,
});

/** The mood of a conversation's agent: the one the stage, its row and the header all act out, whichever conversation is
 *  on the stage (the room's projection, stageMood). It speaks and listens only as the call's own; it works whenever its
 *  harness says so. The preview (the playground's card) holds the one on the stage in a mood of its own. */
export function agentMood({ participants, viewed, selected, inCall, botLive, turn, preview }: MoodFacts, threadId: string | null): AvatarMood {
  if (preview && threadId === viewed) return preview.mood;
  const row = threadId ? participants.find((participant) => participant.threadId === threadId) ?? null : null;
  const isTarget = !!threadId && threadId === selected;
  // A conversation the room has bound to the call but not listed yet hears the call: it was just chosen for it.
  const hears = row ? canHear(row) : isTarget;
  return stageMood({ inCall, isTarget, canHear: hears, reach: row?.reach ?? null, speaking: isTarget && botLive, personSpeaking: isTarget && !!turn,
    working: !!row?.working });
}

export function stageConversation(facts: MoodFacts & Pick<RoomViewState, "title"> & { working: boolean }): StageConversation {
  const { participants, title, viewed, selected, inCall, botLive, working } = facts;
  const row = viewed ? participants.find((participant) => participant.threadId === viewed) ?? null : null;
  const isTarget = !!viewed && viewed === selected;
  return { threadId: viewed, row, title: row?.title || title, isTarget, inCall, canHear: row ? canHear(row) : isTarget, speaking: isTarget && botLive,
    working: isTarget && working, mood: agentMood(facts, viewed) };
}

export function useStageConversation(): StageConversation {
  const participants = useRoomStore((state) => state.participants);
  const title = useRoomStore((state) => state.title);
  const viewed = useRoomStore((state) => state.session.viewed);
  const selected = useRoomStore((state) => state.session.selected);
  const inCall = useRoomStore(selectInCall);
  const botLive = useRoomStore((state) => state.facts.botLive);
  const working = useRoomStore((state) => state.session.working);
  const turn = useRoomStore((state) => state.callCard.turn);
  const preview = useRoomStore((state) => state.facts.avatarPreview);
  return stageConversation({ participants, title, viewed, selected, inCall, botLive, working, turn, preview });
}

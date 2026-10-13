import { useRoomStore, type RoomViewState } from "../../state/room-store";
import type { ConversationView, ParticipantView } from "../../state/room-types";
import type { AvatarMood } from "../avatar/avatar-spec";
import { useVoiceSwitch } from "../../state/call-model";
import { canHear, stageMood, voiceSwitchStageMood } from "./conversation-state";

/* The conversation on the stage: the one the person is looking at, which is the call's own unless they picked one
 * that cannot hear them. The header and the stage both read it from here. With the voice switch (call model B) it is
 * the active one, always the person's pick. */

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
  /** Call model B: the stage follows the voice switch (`voiceOn`), and its agent works whatever the voice (the room says
   *  so for every conversation: ParticipantView.agentWorking). */
  voiceSwitch?: boolean;
  voiceOn?: boolean;
};

export function stageConversation({ participants, title, viewed, selected, inCall, botLive, working, pendingPhase, voiceSwitch = false, voiceOn = false }: StageFacts): StageConversation {
  const row = viewed ? participants.find((participant) => participant.threadId === viewed) ?? null : null;
  const isTarget = !!viewed && viewed === selected;
  // A conversation the room has bound to the call but not listed yet hears the call: it was just chosen for it.
  const hears = row ? canHear(row) : isTarget;
  const speaking = isTarget && botLive;
  const busy = voiceSwitch ? !!row?.agentWorking : isTarget && working;
  const personSpeaking = pendingPhase === "listening" || pendingPhase === "transcribing";
  const mood = voiceSwitch
    ? voiceSwitchStageMood({ voiceOn, reach: row?.reach ?? null, canHear: hears && isTarget, speaking, personSpeaking, working: busy })
    : stageMood({ inCall, isTarget, canHear: hears, reach: row?.reach ?? null, speaking, personSpeaking, working: busy });
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
  const voiceSwitch = useVoiceSwitch();
  const voiceOn = useRoomStore((state) => state.facts.voiceOn);
  const preview = useRoomStore((state) => state.facts.avatarPreview);
  const stage = stageConversation({ participants, title, viewed, selected, inCall, botLive, working, pendingPhase, voiceSwitch, voiceOn });
  // The preview holding the avatar in a mood (the playground's card): that mood, and something unheard when it says.
  return preview ? { ...stage, mood: preview.mood, unread: preview.unread ? Math.max(1, stage.unread) : 0 } : stage;
}

/** Whether the voice is live: in a call (A), or the voice on or turning on (B). What keeps the "what's new" dialog
 *  waiting. */
export function useVoiceLive(): boolean {
  const voiceSwitch = useVoiceSwitch();
  return useRoomStore((state) => (voiceSwitch ? !!(state.facts.voiceOn || state.facts.voiceStarting) : selectInCall(state)));
}

/** Focus to the stage's heading (call model B, §3): where it goes when the "Hear it" that had it is answered, and after
 *  a phone's header avatar is picked. A desktop names the conversation above the tile, a phone on it. */
export function focusStageHeading() {
  const headings = [...document.querySelectorAll<HTMLElement>(".call-stage .stage-title h2, .call-stage .stage-name h2")];
  (headings.find((heading) => heading.getClientRects().length > 0) ?? headings[0])?.focus();
}

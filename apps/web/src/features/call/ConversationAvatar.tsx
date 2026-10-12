import { HandIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { useVoiceSwitch } from "../../state/call-model";
import { conversationState, smallAvatarMood, voiceSwitchAvatarMood, voiceSwitchState } from "./conversation-state";
import { selectInCall } from "./stage-view";

/** A conversation's agent, small, with the dot that says its state: the sidebar, its rail, a phone's header and its
 *  panel all draw a conversation with this, so the same state always looks the same. With the voice switch (call
 *  model B) a mark wears an amber hand in the dot's place: filled while it waits for you, outlined while it wants to
 *  talk. */
export function ConversationAvatar({ row }: { row: ParticipantView }) {
  const inCall = useRoomStore(selectInCall);
  const voiceSwitch = useVoiceSwitch();
  const state = voiceSwitch ? voiceSwitchState(row) : conversationState(row, inCall);
  const marked = state === "waiting-for-you" || state === "wants-to-talk";
  return (
    <span className="conversation-avatar" data-state={state}>
      <CharacterAvatar spec={avatarFor(row.threadId)} mood={voiceSwitch ? voiceSwitchAvatarMood(row) : smallAvatarMood(row)} size="small" unread={row.unread > 0} />
      <span className="state-dot" data-state={state} aria-hidden="true">{marked && <HandIcon size={10} filled={state === "waiting-for-you"} />}</span>
    </span>
  );
}

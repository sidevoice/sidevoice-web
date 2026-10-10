import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { conversationState, smallAvatarMood } from "./conversation-state";
import { selectInCall } from "./stage-view";

/** A conversation's agent, small, with the dot that says its state: the sidebar, its rail, a phone's header and its
 *  panel all draw a conversation with this, so the same state always looks the same. */
export function ConversationAvatar({ row }: { row: ParticipantView }) {
  const inCall = useRoomStore(selectInCall);
  const state = conversationState(row, inCall);
  return (
    <span className="conversation-avatar" data-state={state}>
      <CharacterAvatar spec={avatarFor(row.threadId)} mood={smallAvatarMood(row, inCall)} size="small" />
      <span className="state-dot" data-state={state} aria-hidden="true" />
    </span>
  );
}

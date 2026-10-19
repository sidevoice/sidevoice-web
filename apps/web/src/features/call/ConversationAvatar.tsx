import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { conversationState, hasUnread, smallAvatarMood } from "./conversation-state";
import { selectInCall, useStageConversation } from "./stage-view";

/** A conversation's agent, small, with the dot that says its state: the sidebar, its rail, a phone's header and its
 *  panel all draw a conversation with this, so the same state always looks the same. The one on the stage acts out the
 *  stage's own mood (speaking, listening, working), so its thumbnail never contradicts the main character. */
export function ConversationAvatar({ row }: { row: ParticipantView }) {
  const inCall = useRoomStore(selectInCall);
  const focused = useRoomStore((s) => s.session.viewed);
  const stage = useStageConversation();
  const state = conversationState(row, inCall);
  const onStage = stage.threadId === row.threadId;
  return (
    <span className="conversation-avatar" data-state={state}>
      <CharacterAvatar spec={avatarFor(row.threadId)} mood={onStage ? stage.mood : smallAvatarMood(row)} size="small" unread={hasUnread(row, focused)}
        mouth={onStage ? "playback" : undefined} playbackThreadId={onStage ? row.threadId : undefined} />
      <span className="state-dot" data-state={state} aria-hidden="true" />
    </span>
  );
}

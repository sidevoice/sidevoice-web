import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { useAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { useConversationAvatar, useConversationAvatars } from "./conversation-avatars";
import { conversationState } from "./conversation-state";
import { selectInCall } from "./stage-view";

/** A conversation's agent, small, with the dot that says its state: the sidebar, its rail, a phone's header and its
 *  panel all draw a conversation with this. The agent is the one on the stage, in the same state (conversation-avatars.ts):
 *  this only draws it smaller, and still: its mouth does not follow the voice (the light says what it does). Unless the
 *  developer option "Animate conversation thumbnails" is on: then it moves as the stage's does, in layers, lip-syncing. */
export function ConversationAvatar({ row }: { row: ParticipantView }) {
  const inCall = useRoomStore(selectInCall);
  const avatar = useConversationAvatar(row.threadId);
  const avatars = useConversationAvatars();
  const moves = useAnimatedThumbnails();
  const state = conversationState(row, inCall);
  return (
    <span className="conversation-avatar" data-state={state}>
      {moves
        ? <CharacterAvatar spec={avatarFor(row.threadId)} state={avatar} size="small" mouth="playback" mouthLevel={avatars.mouth(row.threadId)} live />
        : <CharacterAvatar spec={avatarFor(row.threadId)} state={avatar} size="small" mouth="still" />}
      <span className="state-dot" data-state={state} aria-hidden="true" />
    </span>
  );
}

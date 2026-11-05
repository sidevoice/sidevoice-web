import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { AttentionBurstIcon } from "../../components/ui/Icons";
import { useAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { useConversationAvatar, useConversationAvatars } from "./conversation-avatars";
import { conversationState, stateKind } from "./conversation-state";
import { selectInCall } from "./stage-view";

/** A conversation's agent, small, with the dot that says its state: the sidebar, its rail, a phone's header and its
 *  panel all draw a conversation with this. The agent is the one on the stage, in the same state (conversation-avatars.ts):
 *  this only draws it smaller, and still: its mouth does not follow the voice (the light says what it does). Unless the
 *  developer option "Animate conversation thumbnails" is on: then it moves as the stage's does, in layers, lip-syncing.
 *
 *  `pop`, a conversation's card in the sidebar and its rail: the creature stands in a rounded square and comes out of it
 *  (features/avatar/fit-pop.ts). Nothing sits on it but the dot at the square's foot-right and, while it needs the person
 *  (`attention`: it said something they have not seen), the burst with its "!" at the top-right. The dot is the connected
 *  green while the agent is reachable, blinks in the working colour while it works, and is not there when it is offline;
 *  the rest of the state is said by the card's words and the avatar's own face. */
export function ConversationAvatar({ row, pop = false, attention = false }: { row: ParticipantView; pop?: boolean; attention?: boolean }) {
  const inCall = useRoomStore(selectInCall);
  const avatar = useConversationAvatar(row.threadId);
  const avatars = useConversationAvatars();
  const moves = useAnimatedThumbnails();
  const state = conversationState(row, inCall);
  const kind = stateKind(state, avatar.mood);
  // A popping creature is always the still face: the animated thumbnails are a circle's (their canvas is the whole box).
  const animated = moves && !pop;
  return (
    <span className="conversation-avatar" data-state={state} data-kind={kind} data-pop={pop || undefined} data-attention={(pop && attention) || undefined}>
      {animated
        ? <CharacterAvatar spec={avatarFor(row.threadId)} state={avatar} size="small" mouth="playback" mouthLevel={avatars.mouth(row.threadId)} live />
        : <CharacterAvatar spec={avatarFor(row.threadId)} state={avatar} size="small" mouth="still" pop={pop} />}
      {(!pop || kind !== "offline") && <span className="state-dot" data-state={state} data-kind={kind} aria-hidden="true" />}
      {pop && attention && <AttentionBurstIcon className="attention-burst" />}
    </span>
  );
}

import { Avatar } from "../../components/ui/Avatar";
import { avatarFor } from "../avatar/avatar-spec";
import { stillAvatar } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { translator } from "../../i18n/translator";
import { speakerName, type MessageGroupView } from "./group-messages";
import { MessageBubble } from "./MessageBubble";
import { UnheardMark } from "./UnheardMark";
import { hearingOf } from "./UnheardReply";

/** The agent of a conversation wears the same face here as on the stage and in the list; a row from no known
 *  conversation keeps its initials. */
export function Speaker({ name, thread }: { name: string; thread?: string | null }) {
  if (!thread) return <Avatar name={name} decorative />;
  return <span className="ui-avatar chat-character" aria-hidden="true"><CharacterAvatar spec={avatarFor(thread)} state={stillAvatar("present")} size="small" /></span>;
}

/* A run of one side's messages, as a chat app draws it (2026-10-11): the agent's at the left with its face once, at
 * the run's foot, and a spacer beside the others so the run keeps one edge; the person's at the right, without one. */
export function MessageGroup({ group }: { group: MessageGroupView }) {
  const t = translator();
  const incoming = group.role === "assistant";
  const thread = group.messages[0]?.thread;
  // A reply that never played is a mark between the balloons, not one of them: the run's shape and its face follow the balloons.
  const marks = group.messages.map((message) => hearingOf(message).kind === "never");
  const balloons = group.messages.map((_, index) => index).filter((index) => !marks[index]);
  const last = balloons.at(-1) ?? -1;
  return (
    <section className="message-group" data-role={group.role} aria-label={t("messages.group", { name: speakerName(group, t) })}>
      {group.messages.map((message, index) => {
        if (marks[index]) return <div className="chat-message-row" key={message.segment || `${message.time}-${index}`}><span className="chat-avatar-spacer" aria-hidden="true" /><UnheardMark message={message} /></div>;
        const position = balloons.length === 1 ? "only" : index === balloons[0] ? "first" : index === last ? "last" : "middle";
        return (
          <div className="chat-message-row" key={message.segment || `${message.time}-${index}`}>
            {incoming && (index === last ? <Speaker name={speakerName(group, t)} thread={thread} /> : <span className="chat-avatar-spacer" aria-hidden="true" />)}
            <MessageBubble message={message} position={position} />
          </div>
        );
      })}
    </section>
  );
}

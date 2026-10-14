import { Avatar } from "../../components/ui/Avatar";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { translator } from "../../i18n/translator";
import { speakerName, type MessageGroupView } from "./group-messages";
import { MessageBubble } from "./MessageBubble";

/** The agent of a conversation wears the same face here as on the stage and in the list; a row from no known
 *  conversation keeps its initials. */
export function Speaker({ name, thread }: { name: string; thread?: string | null }) {
  if (!thread) return <Avatar name={name} decorative />;
  return <span className="ui-avatar chat-character" aria-hidden="true"><CharacterAvatar spec={avatarFor(thread)} mood="present" size="small" /></span>;
}

/* A run of one side's messages, as a chat app draws it (2026-10-11): the agent's at the left with its face once, at
 * the run's foot, and a spacer beside the others so the run keeps one edge; the person's at the right, without one. */
export function MessageGroup({ group }: { group: MessageGroupView }) {
  const t = translator();
  const incoming = group.role === "assistant";
  const thread = group.messages[0]?.thread;
  const last = group.messages.length - 1;
  return (
    <section className="message-group" data-role={group.role} aria-label={t("messages.group", { name: speakerName(group, t) })}>
      {group.messages.map((message, index) => {
        const position = last === 0 ? "only" : index === 0 ? "first" : index === last ? "last" : "middle";
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

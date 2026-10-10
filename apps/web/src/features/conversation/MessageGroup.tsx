import { Avatar } from "../../components/ui/Avatar";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import type { MessageGroupView } from "./group-messages";
import { MessageBubble } from "./MessageBubble";

/** The agent of a conversation wears the same face here as on the stage and in the list; a row from no known
 *  conversation keeps its initials. */
function Speaker({ name, thread }: { name: string; thread?: string | null }) {
  if (!thread) return <Avatar name={name} decorative />;
  return <span className="ui-avatar chat-character" aria-hidden="true"><CharacterAvatar spec={avatarFor(thread)} mood="present" size="small" /></span>;
}

export function MessageGroup({ group }: { group: MessageGroupView }) {
  const incoming = group.role === "assistant";
  const thread = group.messages[0]?.thread;
  return (
    <section className="message-group" data-role={group.role} aria-label={`Mensajes de ${group.name}`}>
      {group.messages.map((message, index) => {
        const last = group.messages.length - 1;
        const position = last === 0 ? "only" : index === 0 ? "first" : index === last ? "last" : "middle";
        return (
          <div className="chat-message-row" key={message.segment || `${message.time}-${index}`}>
            {incoming && (index === 0 ? <Speaker name={group.name} thread={thread} /> : <span className="chat-avatar-spacer" aria-hidden="true" />)}
            <MessageBubble message={message} position={position} showName={incoming && index === 0} />
          </div>
        );
      })}
    </section>
  );
}

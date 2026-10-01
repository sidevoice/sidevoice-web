import { Avatar } from "../../components/ui/Avatar";
import type { MessageGroupView } from "./group-messages";
import { MessageBubble } from "./MessageBubble";

import type { ReactNode } from "react";

/** `icon`: the sender's mark in place of its initials. */
export function MessageGroup({ group, icon }: { group: MessageGroupView; icon?: ReactNode }) {
  const incoming = group.role === "assistant";
  return (
    <section className="message-group" data-role={group.role} aria-label={`Mensajes de ${group.name}`}>
      {group.messages.map((message, index) => {
        const last = group.messages.length - 1;
        const position = last === 0 ? "only" : index === 0 ? "first" : index === last ? "last" : "middle";
        return (
          <div className="chat-message-row" key={message.segment || `${message.time}-${index}`}>
            {incoming && (index === 0 ? <Avatar name={group.name} icon={icon} decorative /> : <span className="chat-avatar-spacer" aria-hidden="true" />)}
            <MessageBubble message={message} position={position} showName={incoming && index === 0} />
          </div>
        );
      })}
    </section>
  );
}

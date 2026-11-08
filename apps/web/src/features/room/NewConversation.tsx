import { useContext } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { CallLayoutContext } from "../../state/call-layout";
import { translator } from "../../i18n/translator";
import { cn } from "../../lib/cn";
import { useVariant } from "../../lib/variants";
import { ConnectYourAgent, PANEL_VARIANTS } from "./ConnectYourAgent";
import "./new-conversation.css";

/* A new conversation, from the foot of the conversations: a button, a "+" in the rail, or, in a phone's header, a slot
 * of its row after the avatars — an empty avatar's dashed circle, never the chevron's "+3". The page cannot start one
 * yet — an agent joins the room when asked to in its own session — so it says that, and what to tell the agent.
 *
 * Two open decisions (sidevoice-web#463), each a VARIANTS switch (lib/variants.ts) whose default is today's:
 * `new-conversation-panel` — how the panel draws what to say (ConnectYourAgent's A, B, C, each with the phrase on one
 * line, wider than today's panel so the phrase has room); `new-conversation-button` — how the button looks in the list, the
 * rail and a phone's header: A an empty card (the next conversation's, its creature's place empty), B the accent's soft
 * fill, C a quiet row. Each option is this control's own (new-conversation.css), not a Button of the design system's;
 * the one chosen moves there. Once both are chosen, the switches and the others go. */
export const BUTTON_OPTIONS = ["current", "a", "b", "c"] as const;

export function NewConversation({ rail = false, header = false }: { rail?: boolean; header?: boolean }) {
  const t = translator();
  const panel = useVariant("new-conversation-panel", PANEL_VARIANTS);
  const option = useVariant("new-conversation-button", BUTTON_OPTIONS);
  // From the header with the list down, the list goes first.
  const layout = useContext(CallLayoutContext);
  const name = t("sidebar.new");
  const place = header ? "header" : rail ? "rail" : "list";
  const onClick = header ? () => layout?.getState().closeConversations() : undefined;
  const trigger = option !== "current"
    ? <button type="button" className={cn("new-conversation-option", header ? "header-new" : "new-conversation")} data-option={option} data-place={place}
      aria-label={place === "list" ? undefined : name} title={place === "list" ? undefined : name} onClick={onClick}>
      <span className="new-conversation-glyph" aria-hidden="true"><AddIcon size={place === "list" && option !== "a" ? 16 : 18} /></span>
      {place === "list" && <span className="new-conversation-label">{name}</span>}
    </button>
    : header
    ? <button type="button" className="header-new" aria-label={name} title={name} onClick={onClick}><AddIcon size={18} /></button>
    : rail
    ? <Button variant="ghost" tone="neutral" size="icon" className="new-conversation" aria-label={name} title={name}><AddIcon /></Button>
    : <Button variant="secondary" block className="new-conversation"><AddIcon />{name}</Button>;
  return (
    <Popover trigger={trigger} label={name} side={header ? "bottom" : rail ? "right" : "top"} align={rail ? "end" : "start"}
      className={panel === "current" ? undefined : "connect-popover connect-popover--" + panel}>
      <ConnectYourAgent why variant={panel} />
    </Popover>
  );
}

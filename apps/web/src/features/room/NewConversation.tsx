import { useContext } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { CallLayoutContext } from "../../state/call-layout";
import { translator } from "../../i18n/translator";
import { ConnectYourAgent } from "./ConnectYourAgent";

/* A new conversation, from the foot of the conversations: a button, a "+" in the rail, or, in a phone's header, a slot
 * of its row after the avatars — an empty avatar's dashed circle, never the chevron's "+3". The page cannot start one
 * yet — an agent joins the room when asked to in its own session — so it says that, and what to tell the agent. */
export function NewConversation({ rail = false, header = false }: { rail?: boolean; header?: boolean }) {
  const t = translator();
  // From the header with the list down, the list goes first.
  const layout = useContext(CallLayoutContext);
  const trigger = header
    ? <button type="button" className="header-new" aria-label={t("sidebar.new")} title={t("sidebar.new")} onClick={() => layout?.getState().closeConversations()}><AddIcon size={18} /></button>
    : rail
    ? <Button variant="ghost" tone="neutral" size="icon" className="new-conversation" aria-label={t("sidebar.new")} title={t("sidebar.new")}><AddIcon /></Button>
    : <Button variant="secondary" block className="new-conversation"><AddIcon />{t("sidebar.new")}</Button>;
  return (
    <Popover trigger={trigger} label={t("sidebar.new")} side={header ? "bottom" : rail ? "right" : "top"} align={rail ? "end" : "start"}>
      <ConnectYourAgent why />
    </Popover>
  );
}

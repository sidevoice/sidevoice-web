import { Button } from "../../components/ui/Button";
import { AddIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { callTranslator } from "../call/call-i18n";
import { ConnectYourAgent } from "./ConnectYourAgent";

/* A new conversation, from the foot of the conversations: a button, or a "+" in the rail. The page cannot start one
 * yet — an agent joins the room when asked to in its own session — so it says that, and what to tell the agent. */
export function NewConversation({ rail = false }: { rail?: boolean }) {
  const t = callTranslator();
  const trigger = rail
    ? <Button variant="ghost" tone="neutral" size="icon" className="new-conversation" aria-label={t("sidebar.new")} title={t("sidebar.new")}><AddIcon /></Button>
    : <Button variant="secondary" block className="new-conversation"><AddIcon />{t("sidebar.new")}</Button>;
  return (
    <Popover trigger={trigger} label={t("sidebar.new")} side={rail ? "right" : "top"} align={rail ? "end" : "start"}>
      <ConnectYourAgent why />
    </Popover>
  );
}

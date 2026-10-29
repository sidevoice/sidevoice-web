import { Button } from "../../components/ui/Button";
import { ListenAgainIcon } from "../../components/ui/Icons";
import type { ChatMessage } from "../../state/room-types";
import { translator } from "../../i18n/translator";

/** Plays a reply again: on its balloon, and on a never-played reply's opened mark. */
export function ListenAgain({ message }: { message: ChatMessage }) {
  const t = translator();
  return <Button variant="ghost" tone="neutral" size="icon-sm" className="listen-again" aria-label={t("messages.listenAgain")} title={t("messages.listenAgain")}
    onClick={() => void window.sidevoiceActions?.replayReply(message.segment)}><ListenAgainIcon size={12} /></Button>;
}

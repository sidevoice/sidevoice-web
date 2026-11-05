import { ReplayIcon } from "../../components/ui/Icons";
import type { ChatMessage } from "../../state/room-types";
import { translator } from "../../i18n/translator";

/** Plays a reply again: a 22px round button at the message's foot, beside its time (T42): on its bubble, and on a
 *  never-played reply's once it is opened (T56). */
export function ListenAgain({ message }: { message: ChatMessage }) {
  const t = translator();
  return <button type="button" className="listen-again" aria-label={t("messages.listenAgain")} title={t("messages.listenAgain")}
    onClick={() => void window.sidevoiceActions?.replayReply(message.segment)}><ReplayIcon /></button>;
}

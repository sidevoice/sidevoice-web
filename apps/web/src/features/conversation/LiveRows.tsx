import type { CSSProperties } from "react";
import { TurnMicIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import { CancelTurn, type BubblePosition } from "./MessageBubble";

/** A running ellipsis after a live row's word: drawn, so a language writes only the word. */
function Ellipsis() {
  return <span className="transcript-ell" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>;
}

/** The conversation working on the person's turn ('label', T51, T52): a quiet row in the agent's run, "Working…", its dot
 *  in the creature's accent blinking (1.2 s), in place of the thinking dots. */
export function WorkingRow({ position, accent }: { position: BubblePosition; accent?: string }) {
  const t = translator();
  return <div className="chat-bubble working" data-role="assistant" data-position={position} role="status" aria-label={t("messages.thinking")}>
    <span className="working-label" aria-hidden="true" style={accent ? { "--creature-accent": accent } as CSSProperties : undefined}>
      <i /><span>{t("messages.working")}<Ellipsis /></span>
    </span>
  </div>;
}

/** The person's open turn without STT streaming, as today (T36: the icon sits where the words will come): a pill with the
 *  microphone and its bars while they speak, "Transcribing…" while it is transcribed, and the round × that takes it back
 *  while that can be done. The words come as the message, once sent. */
export function TurnPill({ phase, cancellable }: { phase: "listening" | "transcribing"; cancellable: boolean }) {
  const t = translator();
  return <div className="chat-bubble turn-pill" data-role="user" data-phase={phase} translate="no">
    <span className="turn-lead"><TurnMicIcon />{phase === "transcribing"
      ? <span className="turn-label" role="status" aria-label={t("wave.transcribing")}>{t("messages.transcribing")}<Ellipsis /></span>
      : <span className="turn-bars" role="status" aria-label={t("wave.listening")}><i /><i /><i /><i /><i /></span>}</span>
    {cancellable && <CancelTurn />}
  </div>;
}

/** What the person is saying, still open, before it is sent: their words in a draft bubble, and the × while it can be
 *  taken back. */
export function DraftBubble({ text, cancellable }: { text: string; cancellable: boolean }) {
  return <div className="chat-bubble" data-role="user" data-position="only" data-draft="true">
    <span>{text}</span>
    {cancellable && <CancelTurn />}
  </div>;
}

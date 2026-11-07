import { StateGlyph } from "../../components/ui/Icons";
import { TurnPill } from "./TurnPill";
import { translator } from "../../i18n/translator";
import { CancelTurn, type BubblePosition } from "./MessageBubble";

/** A running ellipsis after a live row's word: drawn, so a language writes only the word. */
function Ellipsis() {
  return <span className="transcript-ell" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>;
}

/** The conversation working on the person's turn ('label', T51, T52): a quiet row in the agent's run, "Working…", led by the
 *  working glyph (three dots, in the working state's colour, blinking 1.2 s: as the conversations' dot says it everywhere
 *  else; StateGlyph), in place of the thinking dots. */
export function WorkingRow({ position }: { position: BubblePosition }) {
  const t = translator();
  return <div className="chat-bubble working" data-role="assistant" data-position={position} role="status" aria-label={t("messages.thinking")}>
    <span className="working-label" aria-hidden="true">
      <StateGlyph kind="working" /><span>{t("messages.working")}<Ellipsis /></span>
    </span>
  </div>;
}

/** The person's open turn without STT streaming, as today (T36: the icon sits where the words will come): a pill with the
 *  microphone and its bars while they speak, the same bars, pulsing, and no word while it is transcribed (a screen reader hears
 *  "Transcribing" once, from the stage's announcer: these bars are labelled, not live), and the round × that takes it back while that can be done. The words
 *  come as the message, once sent. */
export function OpenTurn({ phase, cancellable }: { phase: "listening" | "transcribing"; cancellable: boolean }) {
  return <TurnPill className="chat-bubble" data-role="user" phase={phase} action={cancellable && <CancelTurn />} />;
}

/** What the person is saying, still open, before it is sent: their words in a draft bubble, and the × while it can be
 *  taken back. */
export function DraftBubble({ text, cancellable }: { text: string; cancellable: boolean }) {
  return <div className="chat-bubble" data-role="user" data-position="only" data-draft="true">
    <span>{text}</span>
    {cancellable && <CancelTurn />}
  </div>;
}

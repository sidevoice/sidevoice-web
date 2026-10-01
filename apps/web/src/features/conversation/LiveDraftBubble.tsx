import { Button } from "../../components/ui/Button";
import { VoiceWaveform, type WaveformPhase } from "./VoiceWaveform";

/** The person's turn while it is being said: the microphone as a waveform, then transcribing, then the words so far.
 *  The call's own bubble, wherever a turn is live — the conversation, and trying a transcription model. */
export function LiveDraftBubble({ text, phase, onCancel }: { text?: string; phase?: WaveformPhase | "" | null; onCancel?: () => void }) {
  return (
    <div className="message-group live-draft" data-role="user">
      <div className="chat-message-row">
        <article className="chat-bubble" data-role="user" data-position="only" data-draft="true" data-live={text ? undefined : phase || undefined}>
          {text ? <span>{text}</span> : <VoiceWaveform phase={phase === "transcribing" ? "transcribing" : "listening"} />}
          {onCancel && <Button variant="ghost" size="compact" className="cancel-input" onClick={onCancel}>Cancelar envío</Button>}
        </article>
      </div>
    </div>
  );
}

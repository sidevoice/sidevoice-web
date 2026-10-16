import type { ReactNode, Ref } from "react";
import { VoiceWaveform, type WaveformPhase } from "../conversation/VoiceWaveform";
import { BalloonTail } from "./BalloonTail";
import "./call-view.css";

/* The person's balloon while they speak and while it is transcribed: the voice's bars, which freeze in shape and only
 * blink, over the way to take the turn back (`children`, its row kept whether or not it is offered, so the balloon never
 * changes size). One piece for the stage (PersonTurn) and the transcript's open turn, so the two never differ. */
export function LiveVoiceBalloon({ phase, children, balloonRef }: { phase: WaveformPhase; children?: ReactNode; balloonRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={balloonRef} className="speech-bubble person-bubble" data-live="" translate="no">
      <VoiceWaveform phase={phase} />
      <div className="person-live-actions">{children}</div>
      <BalloonTail shape="person" />
    </div>
  );
}

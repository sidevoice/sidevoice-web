import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, type ReactNode } from "react";
import type { VoiceTake } from "@sidevoice/voice";
import { VoiceWaveform } from "./VoiceWaveform";
import { TurnPill } from "./TurnPill";
import { MicWave } from "../call/CallIndicators";
import { TryTake } from "../settings/TryTake";
import { translator } from "../../i18n/translator";
import "../call/call-view.css";
import "../call/stage-voice.css";

/* The voice drawn as bars, by four components, each with its own code path, sizes and constants (DUPLICATES §4): the live
 * waveform's columns (VoiceWaveform), the pill's five bars (TurnPill), the call bar's five bars on the devices' button
 * (MicWave, its height from `--mic-level`, which the runtime writes on #mic-control on every reading) and a try's take, drawn
 * once as SVG (TryTake, which re-declares VoiceWaveform's pitch: 5px a column, 3px a bar, 2px floor). The same synthetic
 * voice feeds them all; the take is made in memory (a tone shaped like a turn: speech, a pause, speech) and plays from there. */

const speech = () => {
  const now = performance.now();
  return Math.max(0, Math.min(1, Math.abs(Math.sin(now / 190) * Math.sin(now / 610)) * 1.15));
};

/** Stands in for the runtime: writes the level as `--mic-level` on the element, every frame, as it does on #mic-control. */
function MicLevel({ children }: { children: ReactNode }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => { node.current?.style.setProperty("--mic-level", speech().toFixed(3)); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span ref={node} style={{ display: "inline-flex" }}>{children}</span>;
}

/** Three seconds at the call's rate: speech, a pause, speech again, a tone shaped by a syllable-like envelope. */
function syntheticTake(): VoiceTake {
  const sampleRate = 16000, seconds = 3.2;
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    const at = i / sampleRate;
    const speaking = (at > 0.3 && at < 1.3) || (at > 1.75 && at < 2.8);
    const syllable = Math.abs(Math.sin(at * Math.PI * 4.2)) * (0.5 + 0.5 * Math.sin(at * 7.3));
    samples[i] = speaking ? 0.4 * syllable * Math.sin(2 * Math.PI * 190 * at) : 0.002 * Math.sin(2 * Math.PI * 50 * at);
  }
  const started = Date.UTC(2026, 10, 7, 10);
  return { sampleRate, samples, started_at: started, ended_at: started + seconds * 1000,
    turns: [{ turn_id: "turn-1", speech_ms: 300, pauses: [{ from_ms: 1300, to_ms: 1750 }], end_ms: 2900 }] };
}
const TAKE = syntheticTake();

function Row({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <>
    <div><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{note}</span></div>
    <div className="catalogue-row">{children}</div>
  </>;
}

const meta = {
  title: "Product/Duplicates/Voice bars",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {
  render: () => {
    const t = translator();
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, max-content) minmax(0, 1fr)", gap: "22px 28px", alignItems: "center" }}>
        <Row name="VoiceWaveform" note="DOM columns from the level, 5px pitch, 3px bars (own size 13rem × 2.15rem)">
          <VoiceWaveform phase="listening" level={speech} />
        </Row>
        <Row name="TurnPill · inline" note="five bars, the brand mark's shape, scaled by transform; em of 13px">
          <div className="transcript"><TurnPill className="chat-bubble" data-role="user" phase="listening" level={speech} /></div>
        </Row>
        <Row name="TurnPill · stage" note="the same five bars at the stage's type step (here its floor, 16px)">
          <div className="docked-voice" style={{ justifyItems: "start" }}><TurnPill className="vcap card person pill" size="stage" phase="listening" level={speech} /></div>
        </Row>
        <Row name="MicWave · call bar" note="five <i><b/></i>, 2.6px wide, 3 to 22px from --mic-level; the accent">
          <MicLevel><MicWave /></MicLevel>
        </Row>
        <Row name="TryTake · a try's take" note="SVG rects, 40px tall; CELL 5, BAR 3, FLOOR 2 copied from VoiceWaveform">
          <div style={{ width: 320 }}><TryTake take={TAKE} id="voice-bars-take" t={t} /></div>
        </Row>
        <Row name="TryTake · inline" note="the same take in the try's first row: 24px tall, in a capsule">
          <div style={{ width: 320, display: "flex" }}><TryTake take={TAKE} id="voice-bars-take-inline" inline turns={false} t={t} /></div>
        </Row>
      </div>
    );
  },
};

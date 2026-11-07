import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { VoiceWaveform, type WaveformPhase } from "./VoiceWaveform";
import "../settings/model-prepare.css";
import "../settings/turn-try.css";

/* The live waveform: one column of history per ~55 ms from the microphone's level, the newest at the right; silence adds no
 * column, and transcribing keeps the last frame and only pulses. In the app it reads the call's level, or the try's own
 * (`level`); here a synthetic voice stands in. Under prefers-reduced-motion it is five still bars (`.voice-bars`): emulate
 * the media query in the browser's devtools to see them (the catalogue's Motion switch sets the page's `data-motion`, which
 * this component does not read). */

/** A voice-like level, 0 to 1, with pauses: two slow sines and a gate. */
const speech = () => {
  const now = performance.now();
  const gate = Math.sin(now / 1300) > -0.35 ? 1 : 0;
  return gate * Math.max(0, Math.min(1, Math.abs(Math.sin(now / 190) * Math.sin(now / 610)) * 1.15));
};

function Label({ children }: { children: ReactNode }) {
  return <p className="catalogue-label">{children}</p>;
}

/** Listening for a while, then transcribing: what a turn does (the shape freezes, then pulses), over and over. */
function Turn() {
  const [phase, setPhase] = useState<WaveformPhase>("listening");
  useEffect(() => {
    const timer = window.setTimeout(() => setPhase((now) => (now === "listening" ? "transcribing" : "listening")), phase === "listening" ? 4000 : 2500);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return <div><Label>{`Turn: ${phase}`}</Label><VoiceWaveform phase={phase} level={speech} /></div>;
}

const meta = {
  title: "Product/Conversation/VoiceWaveform",
  component: VoiceWaveform,
  args: { phase: "listening", announce: true },
  argTypes: {
    phase: { control: "inline-radio", options: ["listening", "transcribing"] },
    level: { control: false },
  },
  render: (args) => <VoiceWaveform {...args} level={speech} />,
} satisfies Meta<typeof VoiceWaveform>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Switch the phase while it listens: transcribing keeps the shape it closed on. */
export const Playground: Story = {};

export const Phases: Story = {
  render: () => (
    <div className="catalogue-stack">
      <Turn />
      <div><Label>Listening</Label><VoiceWaveform phase="listening" level={speech} /></div>
      <div><Label>Transcribing from the start (nothing heard yet: the floor line)</Label><VoiceWaveform phase="transcribing" level={speech} /></div>
      <div><Label>Listening to silence</Label><VoiceWaveform phase="listening" level={() => 0} /></div>
    </div>
  ),
};

/** The sizes it is given where it shows today: its own (13rem × 2.15rem), Settings' transcription try (9rem × 28px, in the
 *  accent) and the end-of-turn try's row (6rem × 20px). The wrappers carry the classes those screens give it. */
export const Sizes: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div><Label>Own size (.voice-wave)</Label><VoiceWaveform phase="listening" level={speech} /></div>
      <div><Label>Settings · transcription try (.model-try .model-try-wave)</Label>
        <div className="model-try"><span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={speech} /></span></div></div>
      <div><Label>Settings · end-of-turn try (.turn-try .model-try-wave)</Label>
        <div className="turn-try"><span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={speech} /></span></div></div>
    </div>
  ),
};

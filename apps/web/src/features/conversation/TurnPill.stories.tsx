import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { TurnPill } from "./TurnPill";
import { MessageGroup } from "./MessageGroup";
import type { LiveRow, RunView } from "./transcript-blocks";
import { PersonTurn } from "../call/PersonTurn";
import { voiceType } from "../avatar/creature/stage-frame";
import type { ConversationView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { CancelTurn } from "./MessageBubble";

/* The person's open turn, one component (TurnPill) at every place that shows it. The stage's copy is drawn by PersonTurn
 * (the stage's card look), the transcript's by MessageGroup's live row (OpenTurn): both rendered here as the app renders
 * them, so the two can be compared side by side. Neither reads a level in the catalogue (there is no call), so their bars
 * rest at the brand mark's shape; "With a level" feeds TurnPill one, as a voice try does. */

const THREAD = "fp-nuc|t-web";

/** A voice-like level, 0 to 1: two slow sines, so the bars ripple as speech does. */
const speech = () => {
  const now = performance.now();
  return Math.max(0, Math.min(1, Math.abs(Math.sin(now / 210) * Math.sin(now / 670)) * 1.1));
};

function Label({ children }: { children: ReactNode }) {
  return <p className="catalogue-label">{children}</p>;
}

/** The stage's pill (PersonTurn, look "card"), in the floating card's docked column so it lays in the flow instead of
 *  under a creature. `person` is the stage's person type in px (StageVoice sets it from the tile, voiceType). */
function Stage({ phase, cancellable = true, person }: { phase: "listening" | "transcribing"; cancellable?: boolean; person?: number }) {
  const conversation: ConversationView = { thread: THREAD, messages: [], pendingText: "", pendingCancellable: cancellable, pendingPhase: phase };
  const style = person ? ({ "--fsP": `${person}px`, "--lhP": `${Math.round(person * 1.4286)}px` } as CSSProperties) : undefined;
  return <div className="docked-voice" style={{ ...style, justifyItems: "start" }}><PersonTurn conversation={conversation} t={translator()} look="card" /></div>;
}

/** The transcript's pill: a run of the person's with the open turn at its foot (MessageGroup), in the transcript's colours. */
function Transcript({ live }: { live: LiveRow[] }) {
  const run: RunView = { id: "you", role: "user", name: "", messages: [], thread: null, live };
  return <div className="transcript" style={{ width: 320 }}><MessageGroup run={run} sig={JSON.stringify(live)} /></div>;
}

const meta = {
  title: "Product/Conversation/TurnPill",
  component: TurnPill,
  args: { phase: "listening", size: "inline" },
  argTypes: {
    phase: { control: "inline-radio", options: ["listening", "transcribing"] },
    size: { control: "inline-radio", options: ["inline", "stage"] },
    level: { control: false },
    action: { control: false },
    children: { control: false },
    frozen: { control: "boolean" },
  },
} satisfies Meta<typeof TurnPill>;
export default meta;
type Story = StoryObj<typeof meta>;

/** TurnPill as the transcript draws it (OpenTurn: its class, and the × that takes the turn back), fed a level so its bars
 *  follow it. The transcript's column is 320px wide, and the pill keeps to its content inside it. */
export const Playground: Story = {
  args: { cancellable: true } as never,
  argTypes: { cancellable: { control: "boolean", description: "Catalogue only: whether the × (CancelTurn) is given as `action`." } } as never,
  render: ({ cancellable, ...args }: Parameters<typeof TurnPill>[0] & { cancellable?: boolean }) => (
    <div className="transcript" style={{ width: 320, display: "grid", justifyItems: "end" }}>
      <TurnPill {...args} className="chat-bubble" data-role="user" level={speech} action={cancellable ? <CancelTurn /> : undefined} />
    </div>
  ),
};

/** The two copies the audit flagged (DUPLICATES §1), now one component: the stage's pill and the transcript's, in each phase,
 *  with the × that takes the turn back and without it. */
export const StageAndTranscript: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "max-content max-content", gap: "20px 40px", alignItems: "center" }}>
      <Label>Stage pill (PersonTurn, look card)</Label><Label>Transcript pill (MessageGroup, OpenTurn)</Label>
      <Stage phase="listening" /><Transcript live={[{ kind: "turn", phase: "listening", cancellable: true }]} />
      <Stage phase="transcribing" /><Transcript live={[{ kind: "turn", phase: "transcribing", cancellable: true }]} />
      <Stage phase="listening" cancellable={false} /><Transcript live={[{ kind: "turn", phase: "listening", cancellable: false }]} />
      <Stage phase="transcribing" cancellable={false} /><Transcript live={[{ kind: "turn", phase: "transcribing", cancellable: false }]} />
    </div>
  ),
};

/** The stage's pill grows with the tile (its type is `voiceType`'s person size, 16 to 28px); the transcript's stays at 13px.
 *  At the stage's floor (the floating card's docked column) the stage pill is the smaller of the two. */
export const StageSizes: Story = {
  render: () => {
    const tiles: [string, number, number][] = [["Floating card (floor)", 0, 0], ["Tile 640 × 420", 640, 420], ["Tile 900 × 600", 900, 600], ["Tile 1280 × 860", 1280, 860]];
    return (
      <div className="catalogue-stack">
        {tiles.map(([name, w, h]) => {
          const person = w ? voiceType(w, h).person : 16;
          return <div key={name}><Label>{`${name}: person type ${Math.round(person * 10) / 10}px`}</Label><Stage phase="listening" person={person} /></div>;
        })}
        <div><Label>Transcript (fixed)</Label><Transcript live={[{ kind: "turn", phase: "listening", cancellable: true }]} /></div>
      </div>
    );
  },
};

/** The bars following a level (a voice try passes one; in a call they read the call's own). Still under reduced motion. */
export const WithLevel: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div><Label>Stage size, the stage card&apos;s surface</Label>
        <div className="docked-voice" style={{ justifyItems: "start" }}><TurnPill className="vcap card person pill" size="stage" phase="listening" level={speech} /></div></div>
      <div><Label>Inline size, the transcript&apos;s surface</Label>
        <div className="transcript"><TurnPill className="chat-bubble" data-role="user" phase="listening" level={speech} /></div></div>
      <div><Label>Frozen (the stage&apos;s measuring copy)</Label>
        <div className="transcript"><TurnPill className="chat-bubble" data-role="user" phase="listening" frozen level={speech} /></div></div>
    </div>
  ),
};

/** What the transcript shows around the pill: the draft of a written turn, with the same × (CancelTurn). */
export const TranscriptLiveRows: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div><Label>Open turn, listening</Label><Transcript live={[{ kind: "turn", phase: "listening", cancellable: true }]} /></div>
      <div><Label>Open turn, transcribing</Label><Transcript live={[{ kind: "turn", phase: "transcribing", cancellable: true }]} /></div>
      {/* The person's own words (fixture data, not the product's). */}
      <div><Label>Draft (being said, not sent yet)</Label><Transcript live={[{ kind: "draft", text: "Can you run the release checklist again", cancellable: true }]} /></div>
    </div>
  ),
};

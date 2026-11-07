import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { CancelTurn } from "./MessageBubble";
import { ListenAgain } from "./ListenAgain";
import { MessageGroup } from "./MessageGroup";
import type { LiveRow, RunView } from "./transcript-blocks";
import { PersonTurn } from "../call/PersonTurn";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { CloseIcon } from "../../components/ui/Icons";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { translator } from "../../i18n/translator";

/* The small round buttons on a turn, each its own component with its own class, glyph and focus ring (DUPLICATES §1.2):
 * the transcript's × (CancelTurn, `.turn-cancel`, 24px, TurnCancelIcon), the stage pill's × (PersonTurn's own `<button
 * class="cancel">`, 24px, CancelGlyph at 11px, a raw rgb() fill) and the replay on a reply (ListenAgain, `.listen-again`,
 * 22px, ReplayIcon); last, the primitive the audit points to (Button icon-sm, ghost, neutral, with a Tooltip). Not shown:
 * the "New" mark's dismiss × (`.new-mark-dismiss`, 24px, a square radius): NewMark only draws while a highlight is new, and
 * highlights are off in this release (HIGHLIGHTS_ON). Pressing them does nothing here (there is no call to cancel or replay). */

const THREAD = "fp-nuc|t-web";

const reply: ChatMessage = {
  segment: "h-1", thread: THREAD, role: "assistant", name: "sidevoice-web", time: Date.UTC(2026, 10, 7, 10, 24),
  text: "The release checklist passed: every language has its catalogue and the build is green.", replayable: true, playback: "complete", hearing: "heard",
};

function Row({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <>
    <div><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{note}</span></div>
    <div className="catalogue-row">{children}</div>
  </>;
}

function Run({ run }: { run: RunView }) {
  return <div className="transcript" style={{ width: 340 }}><MessageGroup run={run} sig={run.id} /></div>;
}
const userRun = (live: LiveRow[]): RunView => ({ id: "you-" + JSON.stringify(live), role: "user", name: "", messages: [], thread: null, live });

const meta = {
  title: "Product/Duplicates/Round buttons",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Alone, at their own size, each on the surface it is drawn on. */
export const SideBySide: Story = {
  render: () => {
    const t = translator();
    const turn: ConversationView = { thread: THREAD, messages: [], pendingText: "", pendingCancellable: true, pendingPhase: "listening" };
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, max-content) minmax(0, 1fr)", gap: "20px 28px", alignItems: "center" }}>
        <Row name=".turn-cancel · CancelTurn" note="24px circle, TurnCancelIcon, --tr-cancel-bg, ::after hit area 36px">
          <div className="transcript"><CancelTurn /></div>
        </Row>
        <Row name=".vcap .cancel · PersonTurn" note="24px circle, CancelGlyph 11px, rgb(27 20 40 / 7%); fixed px on an em pill">
          <div className="docked-voice" style={{ justifyItems: "start" }}><PersonTurn conversation={turn} t={t} look="card" /></div>
        </Row>
        <Row name=".listen-again · ListenAgain" note="22px circle, ReplayIcon, --tr-play-bg, ::after hit area 44px">
          <div className="transcript"><ListenAgain message={reply} /></div>
        </Row>
        <Row name="Button icon-sm ghost neutral" note="the primitive (components/ui), with its Tooltip">
          <Tooltip action content={t("messages.cancel")}><Button size="icon-sm" variant="ghost" tone="neutral" aria-label={t("messages.cancel")}><CloseIcon /></Button></Tooltip>
        </Row>
      </div>
    );
  },
};

/** Where the transcript's draw them: on the open turn's pill, on a draft, and at a reply's foot beside its time. */
export const InTheTranscript: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div><p className="catalogue-label">Open turn (CancelTurn)</p><Run run={userRun([{ kind: "turn", phase: "listening", cancellable: true }])} /></div>
      {/* The person's own words: fixture data. */}
      <div><p className="catalogue-label">Draft (CancelTurn)</p><Run run={userRun([{ kind: "draft", text: "Can you run the release checklist again", cancellable: true }])} /></div>
      <div><p className="catalogue-label">Reply (ListenAgain)</p><Run run={{ id: "reply", role: "assistant", name: "sidevoice-web", messages: [reply], thread: THREAD, live: [] }} /></div>
    </div>
  ),
};

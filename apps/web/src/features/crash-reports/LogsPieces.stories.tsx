import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { FiltersPanel, LogControls, PIECE_KEY, piecesOf } from "./LogFilters";
import { LogRow } from "./LogsViewer";
import { filterEvents, type LogEvent, type LogFilters } from "./log-model";
import { fixtureEvents } from "../../journeys/log-fixtures";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { ChoiceCard } from "../../components/ui/Card";
import { ExternalLinkIcon, InfoIcon, ToLatestArrowIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import "../conversation/transcript.css";
import "../settings/settings.css";
import "./crash-reports.css";

/* The pieces the crash reports' and logs' screens drew beside the design system: each is a class of crash-reports.css (or, for the
 * way back to the latest, of the chat's transcript.css) written for the screen, with a primitive or another screen that does
 * nearly the same thing. They are the "missing from the design system" list of the tracing follow-up's handoff, on what is on main.
 * Every specimen is the real component that draws it (the viewer's controls, its filters panel, one line of the log), so a change to
 * the piece shows here. Decisions for the person, per row in the PR (web#530): which become a component, which fold into one that
 * exists. Nothing here is decided. */

const label = (piece: keyof typeof PIECE_KEY) => translator()(PIECE_KEY[piece]);
const EVENTS = fixtureEvents({ kind: "device" }, 200);

function Controls({ initial }: { initial: LogFilters }) {
  const [filters, setFilters] = useState(initial);
  return <LogControls filters={filters} onChange={setFilters} events={EVENTS} shown={filterEvents(EVENTS, filters, label).length} />;
}

function Panel({ initial }: { initial: LogFilters }) {
  const [filters, setFilters] = useState(initial);
  return <div className="ui-popover logs-pop" style={{ position: "static" }}>
    <FiltersPanel filters={filters} onChange={setFilters} events={EVENTS} shown={filterEvents(EVENTS, filters, label).length} pieces={piecesOf(EVENTS, filters.pieces)} />
  </div>;
}

const LINES: LogEvent[] = [
  { id: "a", piece: "app", text: "14:41:09.240  INFO audio: Microphone opened and listening  stream=microphone sample_rate=48000" },
  { id: "b", piece: "connector", text: "14:41:10.012  WARN pairing: The app disconnected after going silent  device=d-3a91 reason=timeout" },
  { id: "c", piece: "core", text: "14:41:11.377 ERROR room: The audio track closed unexpectedly; the app lost the voice  error.type=core.track-closed" },
];

function Spec({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <>
    <div><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{note}</span></div>
    <div className="catalogue-row" style={{ alignItems: "flex-start" }}>{children}</div>
  </>;
}

const meta = { title: "Product/Duplicates/Logs viewer pieces" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)", gap: "20px 28px", alignItems: "start" }}>
      <Spec name="Badge (primitive), for reference" note="22px, pill, --sv-font-xs, a tone: a label, never a control">
        <Badge>Connector</Badge><Badge tone="accent">2</Badge>
      </Spec>
      <Spec name="SearchField · .logs-search" note="Input (sm) with a 16px magnifier laid over its start and a ghost × laid over its end; Escape clears. The only search field in the app: Input has no leading/trailing slot">
        <div style={{ width: 360 }}><Controls initial={{ query: "room", level: "all", pieces: [] }} /></div>
      </Spec>
      <Spec name="Chip, removable · .logs-chip--on" note="26px pill, accent border and fill, a 22px ghost × inside its end. What is on, under the search. Not Badge (22px, no control) nor the conversations' count chip">
        <div style={{ width: 360 }}><Controls initial={{ query: "", level: "warn", pieces: ["connector", "core"] }} /></div>
      </Spec>
      <Spec name="Chip, toggle, with count · .logs-chip + .logs-chip-n; ChoiceCard, compact, with count · .logs-level-card" note="the pieces' chips (aria-pressed, a check when on, the count after a hairline) and the level's cards (the ChoiceCard primitive's radio and selected look, written again at 40px with the check in its own slot and a count at the end), in the filters panel">
        <Panel initial={{ query: "", level: "warn", pieces: ["connector"] }} />
      </Spec>
      <Spec name="ChoiceCard (primitive), for reference" note="padded, a check at the corner when selected: the shape the level cards copy">
        <div style={{ display: "grid", gap: 8, width: 260 }}>
          <ChoiceCard selected onSelect={() => undefined}>Warnings and errors</ChoiceCard>
          <ChoiceCard selected={false} onSelect={() => undefined}>Errors only</ChoiceCard>
        </div>
      </Spec>
      <Spec name="PieceTag · .logs-piece" note="a pill per log line (App, Connector, Core), min-width 5.7em, 10.5px semibold: a neutral label like Badge, with its own size, border and fill">
        <div className="logview" style={{ height: "auto", overflow: "visible", width: "min(100%, 640px)" }}>
          {LINES.map((event) => <LogRow key={event.id} event={event} query="" label={label(event.piece)} />)}
        </div>
      </Spec>
      <Spec name="Jump to latest · .latest-jump" note="one class (transcript.css), two copies of its button: the chat's (MessageList.tsx) and the logs' (LogsViewer.tsx), which takes the chat's --tr-* colours through .logs-wrap. Shown forced visible, with the new-lines dot">
        <div className="transcript" style={{ position: "relative", display: "block", width: 200, height: 80, border: "1px dashed var(--sv-border)", borderRadius: 12 }}>
          <button type="button" className="latest-jump" data-show data-new aria-label="Back to the latest"><ToLatestArrowIcon /></button>
        </div>
        <div className="logs-wrap" style={{ width: 200, height: 80, border: "1px dashed var(--sv-border)", borderRadius: 12, background: "var(--sv-bg-subtle)" }}>
          <button type="button" className="latest-jump" data-show data-new aria-label="Back to the latest"><ToLatestArrowIcon /></button>
        </div>
      </Spec>
      <Spec name="Inline link in a sentence · .crash-link" note="a button that reads as a link: inline, semibold, accent, always underlined; the provider key's link (.provider-key-link) is a link with an icon, underlined on hover only">
        <span style={{ fontSize: "var(--sv-font-sm)" }}>Sidevoice sends crash reports. <button type="button" className="crash-link">Turn this off in Settings</button>.</span>
        <a className="provider-key-link" href="#get-key" onClick={(event) => event.preventDefault()}>Get an API key<ExternalLinkIcon size={14} /></a>
      </Spec>
      <Spec name="Quiet note with an icon · .logs-note" note="an icon and a sentence, no fill and no border, beside Alert (a message with a tone) and the Row's description">
        <div style={{ display: "grid", gap: 12, width: 360 }}>
          <p className="logs-note"><InfoIcon size={16} /><span>Logs are redacted at their source: tokens, keys and the content of your conversations never get written.</span></p>
          <Alert tone="accent">Logs are redacted at their source.</Alert>
        </div>
      </Spec>
    </div>
  ),
};

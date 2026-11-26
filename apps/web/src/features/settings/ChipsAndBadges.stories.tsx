import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { HardwareChip } from "./model-facts";
import { DownloadedModels } from "./DownloadedModels";
import { MachineState } from "./MachineState";
import { machineStatus } from "./machine-status";
import { NewBadge, GearNewMark } from "../highlights/highlights";
import { MicrophoneBadge, microphoneView } from "../permissions/permission-view";
import { ConversationSidebar } from "../room/ConversationSidebar";
import { MessageGroup } from "../conversation/MessageGroup";
import type { RunView } from "../conversation/transcript-blocks";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { CallLayoutContext, createCallLayoutStore } from "../../state/call-layout";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { translator } from "../../i18n/translator";
import "./settings.css";

/* The small rounded label: the Badge primitive (22px, pill, --sv-font-xs, a tone) and the ones built beside it, each with
 * its own height, padding, type and colours (DUPLICATES §2). Every specimen is the real component in the place that draws
 * it; where the chip is not a component of its own (the conversations' count, PurposeChip, the transcript's tags) its
 * parent is rendered (the sidebar cut to its heading). Not shown: the stage's harness badge (`.stage-tag.stage-badge`, the
 * call's stage) and the transcript's day divider (`.day-chip`, the whole transcript). */

const NUC = { fp: "fp-nuc", host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const person = (thread_id: string, title: string) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: NUC.fp, machine: { host: "NUC", id: "connector-nuc" }, harness: "claude-code" });
const ROOM = {
  machinesReady: true, pairings: [NUC], callNode: NUC.fp, machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } },
  people: [person("t-web", "sidevoice-web"), person("t-release", "Release notes for 0.3"), person("t-notes", "notes")],
  roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
  voiceSettings: defaultVoiceSettings(), modelsRemovable: false,
  voiceCatalogue: { state: "ready", error: "", catalogs: [{ id: "local", name: null, status: { stale: false }, models: [
    { id: "whisper-base", family: "whisper", capabilities: ["stt"], parametersM: 74, license: "MIT", languages: ["en"], voices: [], installed: true, recommendedBuild: "whisper-base/int8",
      builds: [{ id: "whisper-base/int8", backend: "sherpa-onnx", precision: "int8", acceleratorClass: "cpu", downloadBytes: 148e6, memoryMb: 300, available: true, reasons: [], installed: true }] },
  ] }] },
};

function Room({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch(ROOM as never);
    return store;
  });
  const [layout] = useState(() => createCallLayoutStore(null));
  return <RoomStoreContext.Provider value={store}><CallLayoutContext.Provider value={layout}>{children}</CallLayoutContext.Provider></RoomStoreContext.Provider>;
}

/** Only the top of `children`, `height` px of it: the part of a parent that holds the chip. */
function Cut({ height, width, children }: { height: number; width: number; children: ReactNode }) {
  return <div style={{ height, width, overflow: "hidden", display: "flex", border: "1px dashed var(--sv-border)" }}>{children}</div>;
}

const REPLIES: RunView = { id: "replies", role: "assistant", name: "sidevoice-web", thread: "fp-nuc|t-web", live: [], messages: [
  { segment: "c-1", thread: "fp-nuc|t-web", role: "assistant", name: "sidevoice-web", time: Date.UTC(2026, 10, 7, 10, 20), interrupted: true,
    text: "The build is green. I also looked at the flaky test and found where it waits.", hearing: "partial", heard_chars: 19, playback: "complete" },
  { segment: "c-2", thread: "fp-nuc|t-web", role: "assistant", name: "sidevoice-web", time: Date.UTC(2026, 10, 7, 10, 22),
    text: "Release notes are drafted.", hearing: "not_heard", playback: "complete" },
] };

const mic = (state: MicrophoneSnapshot["state"]): MicrophoneSnapshot => ({ state, asker: "page", known: true, dismissed: false, unchanged: false, from: null });

function Row({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <>
    <div><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{note}</span></div>
    <div className="catalogue-row">{children}</div>
  </>;
}

const meta = {
  title: "Product/Duplicates/Chips and badges",
  // The transcript's never-played reply shows its "Not played" tag once opened, as a person opens it.
  play: async ({ canvasElement }) => { canvasElement.querySelectorAll<HTMLButtonElement>(".unheard-toggle").forEach((toggle) => toggle.click()); },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {
  render: () => {
    const t = translator();
    const tones: BadgeTone[] = ["neutral", "accent", "positive", "warning", "danger"];
    const connected = machineStatus({ id: NUC.fp, pairingId: NUC.fp, host: "NUC", revoked: false, reach: "direct", state: "connected" }, { state: "absent" }, false, t);
    const unpaired = machineStatus({ id: NUC.fp, pairingId: NUC.fp, host: "NUC", revoked: true, reach: "revoked", state: "revoked" }, { state: "absent" }, false, t);
    return (
      <Room>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)", gap: "18px 28px", alignItems: "center" }}>
          <Row name="Badge (primitive)" note="22px, pill, --sv-font-xs; tone by data-tone; optional 6px dot">
            {tones.map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}<Badge tone="positive" dot>dot</Badge>
          </Row>
          <Row name="Badge tag (primitive)" note="20px, weight 500, a 1px border in its own colour; a provider's and an agent's state in Settings (was a copy in settings.css until 0.29)">
            {tones.map((tone) => <Badge key={tone} tag tone={tone}>{tone}</Badge>)}<Badge tag dot>dot</Badge>
          </Row>
          <Row name="HardwareChip" note="Badge accent + .model-hardware (the one that uses the primitive)">
            <HardwareChip build={{ id: "b", backend: "mlx", precision: "int8", acceleratorClass: "gpu", accelerator: "metal", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: false }} t={t} />
          </Row>
          <Row name="MachineState · NewBadge · MicrophoneBadge" note="Badge positive dot (size inherited) · Badge accent · Badge with a check">
            <MachineState status={connected} /><MachineState status={unpaired} /><NewBadge /><MicrophoneBadge view={microphoneView(mic("granted"))} t={t} /><MicrophoneBadge view={microphoneView(mic("denied"))} t={t} />
          </Row>
          <Row name=".model-purpose · PurposeChip (DownloadedModels)" note="hand-made: 1px × space-2 padding, sunken fill, 13px icon; beside the In use Badge">
            <div style={{ width: 460, maxWidth: "100%" }}><DownloadedModels /></div>
          </Row>
          <Row name=".conversations-chip · ConversationSidebar" note="hand-made: 20px tall, 8px radius, 12.5px semibold, 8% text tint">
            <Cut height={56} width={288}><ConversationSidebar /></Cut>
          </Row>
          <Row name=".cut-tag · .unheard-badge · transcript" note="two copies of one tag in transcript.css: 11.5px, 999px radius, --tr-tag-*">
            <div className="transcript" style={{ width: 340 }}><MessageGroup run={REPLIES} sig="replies" /></div>
          </Row>
          <Row name=".settings-notice count · GearNewMark" note="16px pill, accent fill (positioned on the gear)">
            <span style={{ position: "relative", display: "inline-block", width: 28, height: 22 }}><GearNewMark count={3} /></span>
          </Row>
        </div>
      </Room>
    );
  },
};

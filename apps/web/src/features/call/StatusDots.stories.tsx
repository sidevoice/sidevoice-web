import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ConversationAvatar } from "./ConversationAvatar";
import { JoinStatus } from "./JoinStatus";
import { ScreenLock } from "./CallIndicators";
import { StateOnIcon, MachineState } from "../settings/MachineState";
import { machineStatus } from "../settings/machine-status";
import { GearNewMark, NewAtEnd, NewOnIcon } from "../highlights/highlights";
import { Button } from "../../components/ui/Button";
import { OtherMachineIcon, SettingsIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { createRoomStore, RoomStoreContext, useRoomStore } from "../../state/room-store";
import type { MachineView, ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import "../room/room.css";
import "./call-view.css";
import "../settings/settings.css";

/* One idea, a small round mark that says a state, drawn by several components, each with its own class, size and ring
 * (DUPLICATES §3). Every specimen is the real component; the label names its class and size as its CSS sets them.
 * Not shown: `.host-status-dot` (10px, the service card on This computer's page, which needs the whole machine page) and
 * the floating card's `.card-unread` and `.person-state .dot` (6 and 8px: the card page's own stylesheet, call-card.css,
 * restyles the whole document and its token layer, so it cannot be loaded beside the room's). */

const NODE = "fp-nuc";
const KEY = `${NODE}|t-web`;
const person = (reach = "listening", available = true) =>
  ({ thread_id: "t-web", title: "sidevoice-web", available, reach: { state: reach }, node: NODE, machine: { host: "NUC", id: "connector-nuc" }, harness: "claude-code" });
const BASE = {
  machinesReady: true, callNode: NODE, machineLinks: { [NODE]: { reach: "ok", via: "node" } },
  pairings: [{ fp: NODE, host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false }],
  roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
};
const IN_CALL = { ws: {}, sessionId: "s1" };
const AVATAR_FACTS = {
  listening: { ...IN_CALL, people: [person()], userTurn: { thread: KEY, segment: "turn-1" }, pendingPhase: "listening" },
  working: { ...IN_CALL, people: [person()], harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 10_000 },
  holding: { ...IN_CALL, people: [person("holding")] },
  offline: { people: [person("offline", false)] },
};

function Seeded({ facts, children }: { facts: Record<string, unknown>; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch({ ...BASE, ...facts } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

function Avatar({ pop }: { pop?: boolean }) {
  const row = useRoomStore((state) => state.participants.find((participant) => participant.threadId === KEY)) as ParticipantView;
  return <ConversationAvatar row={row} pop={pop} />;
}

const machine = (state: MachineView["state"]): MachineView =>
  ({ id: NODE, pairingId: NODE, host: "NUC", revoked: false, reach: state === "connected" ? "direct" : "offline", state, local: false });

/** A row of the comparison: what draws it, then the specimens. */
function Row({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <>
    <div><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{note}</span></div>
    <div className="catalogue-row">{children}</div>
  </>;
}

const meta = {
  title: "Product/Duplicates/Status dots",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {
  render: () => {
    const t = translator();
    const connected = machineStatus(machine("connected"), { state: "absent" }, false, t);
    const away = machineStatus(machine("offline"), { state: "absent" }, false, t);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, max-content) 1fr", gap: "18px 28px", alignItems: "center" }}>
        <Row name=".state-dot · ConversationAvatar" note="12px, 2px ring (--dot-ring); listening, working (blinks), holding, offline">
          {Object.entries(AVATAR_FACTS).map(([kind, facts]) => <Seeded key={kind} facts={facts}><Avatar /></Seeded>)}
        </Row>
        <Row name=".state-dot · ConversationAvatar pop" note="10px; green while reachable, working's colour, none offline">
          {Object.entries(AVATAR_FACTS).map(([kind, facts]) => <Seeded key={kind} facts={facts}><Avatar pop /></Seeded>)}
        </Row>
        <Row name=".state-on-icon-dot · StateOnIcon" note="7px, 2px ring (--new-ground); connected only">
          <StateOnIcon icon={<OtherMachineIcon size={18} />} status={connected} />
          <StateOnIcon icon={<ThisComputerIcon size={18} />} status={connected} />
          <StateOnIcon icon={<OtherMachineIcon size={18} />} status={away} />
        </Row>
        <Row name=".ui-badge-dot · MachineState (Badge dot)" note="6px, currentColor; the models' Ready badge">
          <MachineState status={connected} />
          <MachineState status={away} />
        </Row>
        <Row name=".new-on-icon-dot · NewOnIcon" note="8px, 2px ring; dormant (HIGHLIGHTS_ON is false)">
          <NewOnIcon icon={<OtherMachineIcon size={18} />} isNew />
          <NewOnIcon icon={<SettingsIcon size={18} />} isNew />
        </Row>
        <Row name=".new-end-dot · NewAtEnd" note="8px in its CSS; draws nothing: its place is always the icon's corner (useSectionNewDot)">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 120 }}>NUC<NewAtEnd isNew spoken={t("highlights.navNew")} /></span>
        </Row>
        <Row name=".settings-notice · GearNewMark" note="count 16px pill; update and attention 9px (attention's colour is in settings.css)">
          {([{ count: 2 }, { count: 0, update: true }, { count: 0, attention: true }] as const).map((mark, index) => (
            <Button key={index} variant="ghost" tone="neutral" size="icon" aria-label={t("header.settings")}><SettingsIcon size={20} /><GearNewMark {...mark} /></Button>
          ))}
        </Row>
        <Row name=".join-status-dot · JoinStatus" note="8px, accent, pulsing; while a join goes step by step">
          <Seeded facts={{ joinStep: "room", connecting: true }}><JoinStatus /></Seeded>
        </Row>
        <Row name=".screen-lock-dot · ScreenLock" note="no CSS anywhere and no screen mounts it: it draws nothing">
          <Seeded facts={{ screenLock: { state: "locked", note: "" } }}><span style={{ display: "inline-flex", minWidth: 24, minHeight: 12, outline: "1px dashed var(--sv-border)" }}><ScreenLock /></span></Seeded>
        </Row>
      </div>
    );
  },
};

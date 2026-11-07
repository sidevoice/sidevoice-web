import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { fn } from "storybook/test";
import { ConversationRows, type ConversationRowsProps } from "./ConversationRows";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { hasUnread, stateText } from "../call/conversation-state";
import { selectInCall } from "../call/stage-view";
import { createRoomStore, RoomStoreContext, useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import "./room.css";

/* The conversations as rows to choose from, shared by the room's sidebar and the floating card's list: each caller gives
 * the rows its words (`sub`), its lead, its class and its actions. The rows are the room's own projection
 * (participantsView) of a seeded room in a call: the call's own conversation (selected), one working, one that can't
 * receive, one with a reply not seen yet, one offline. "Sidebar look" passes what the sidebar passes (its class, the
 * popping avatar, the state in words); "Default lead" passes nothing, and the initials and dot it then draws are styled
 * only in the floating card's page (call-card.css `.card-panel`), which the room does not load. */

const NUC = { fp: "fp-nuc", host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: NUC.fp, machine: { host: "NUC", id: "connector-nuc" }, harness: "claude-code", ...extra });
const ROOM = {
  machinesReady: true, pairings: [NUC], callNode: NUC.fp, machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } },
  ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
  people: [
    person("t-web", "sidevoice-web"),
    person("t-release", "Release notes for 0.3", { harness: "codex" }),
    person("t-notes", "notes", { harness: "cursor", reach: { state: "holding" } }),
    person("t-review", "Review of PR #109"),
    person("t-old", "Old experiment", { available: false, reach: { state: "offline" } }),
  ],
  harness: { "fp-nuc|t-release": true }, workingSince: { "fp-nuc|t-release": 0 }, now: 10_000,
  history: [{ segment: "r-1", thread: "fp-nuc|t-review", role: "assistant", text: "The review is done.", name: "Review of PR #109", time: Date.UTC(2026, 10, 7, 10), session: "s1", seq: 1 }],
  roomSeen: {},
};

function Room({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch(ROOM as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

/** The rows as the room projects them, given what the sidebar gives them (`look` "sidebar") or nothing (`look` "default"). */
function Rows({ look, onSelect }: { look: "sidebar" | "default"; onSelect: ConversationRowsProps["onSelect"] }) {
  const rows = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const t = translator();
  const sub = (row: ParticipantView) => stateText(row, inCall, t);
  return look === "sidebar"
    ? <ConversationRows className="sidebar-rows" rows={rows} onSelect={onSelect} sub={sub} lead={(row) => <ConversationAvatar row={row} pop attention={hasUnread(row, null)} />} />
    : <ConversationRows rows={rows} onSelect={onSelect} sub={sub} />;
}

const meta = {
  title: "Product/Room/ConversationRows",
  component: ConversationRows,
  args: { rows: [], onSelect: fn(), sub: () => null },
  argTypes: { rows: { control: false }, sub: { control: false } },
} satisfies Meta<typeof ConversationRows>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The sidebar's rows: selected (the call's own), working, can't receive, a reply not seen yet (the burst), offline. */
export const SidebarLook: Story = {
  render: (args) => <Room><div style={{ width: 272, padding: 8, background: "var(--sv-bg-subtle)" }}><Rows look="sidebar" onSelect={args.onSelect} /></div></Room>,
};

/** No lead, class or actions given: the initials and the state dot, unstyled in the room (their CSS is the card page's). */
export const DefaultLead: Story = {
  render: (args) => <Room><div style={{ width: 272 }}><Rows look="default" onSelect={args.onSelect} /></div></Room>,
};

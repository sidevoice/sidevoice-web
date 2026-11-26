import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ConversationSidebar } from "./ConversationSidebar";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { CallLayoutContext, createCallLayoutStore } from "../../state/call-layout";

/* The room's conversations on a desktop: a column grouped by machine (its connected mark on the machine's icon), each
 * conversation a card with its agent popping out of a square, its harness, its state in words; the heading's chip with
 * how many there are, which is also the rail's expand button. Seeded with a room in a call on the NUC: the call's own
 * conversation, one working, one that can't receive, one with a reply not seen yet, and one on a machine that is away.
 * The layout store is the catalogue's own (nothing read from or saved to this browser's storage). Pressing a row asks
 * the runtime, which is not here: nothing happens. */

const NUC = { fp: "fp-nuc", host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const WORKSTATION = { fp: "fp-ws", host: "Workstation", urls: [], device_id: "d-ws", paired_at: 1_700_000_000, revoked: false };
const person = (node: typeof NUC, thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: node.fp, machine: { host: node.host, id: "connector-" + node.fp },
    harness: "claude-code", engine: { model: "claude-opus-5-5", effort: "high" }, ...extra });

const ROOM = {
  machinesReady: true, pairings: [NUC, WORKSTATION], callNode: NUC.fp,
  machineLinks: { [NUC.fp]: { reach: "ok", via: "node" }, [WORKSTATION.fp]: { reach: "offline", via: "node" } },
  ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
  people: [
    person(NUC, "t-web", "sidevoice-web"),
    person(NUC, "t-release", "Release notes for 0.3", { harness: "codex", engine: { model: "gpt-6-astra", effort: "medium" } }),
    person(NUC, "t-notes", "notes", { harness: "cursor", reach: { state: "holding" } }),
    person(NUC, "t-review", "Review of PR #109"),
    person(WORKSTATION, "t-old", "Old experiment"),
  ],
  harness: { "fp-nuc|t-release": true }, workingSince: { "fp-nuc|t-release": 0 }, now: 10_000,
  history: [{ segment: "r-1", thread: "fp-nuc|t-review", role: "assistant", text: "The review is done.", name: "Review of PR #109", time: Date.UTC(2026, 10, 7, 10), session: "s1", seq: 1 }],
  roomSeen: {},
};

/** The room's store seeded with `facts`, and a layout store of the catalogue's own (`collapsed`: the rail). */
function Room({ facts, collapsed = false, children }: { facts: Record<string, unknown>; collapsed?: boolean; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch(facts as never);
    return store;
  });
  const [layout] = useState(() => {
    const layout = createCallLayoutStore(null);
    layout.setState({ sidebarCollapsed: collapsed });
    return layout;
  });
  return <RoomStoreContext.Provider value={store}><CallLayoutContext.Provider value={layout}>
    <div style={{ display: "flex", height: 560, border: "1px solid var(--sv-border)", width: "max-content" }}>{children}</div>
  </CallLayoutContext.Provider></RoomStoreContext.Provider>;
}

const meta = {
  title: "Product/Room/ConversationSidebar",
  component: ConversationSidebar,
  parameters: { layout: "padded" },
  args: { blocked: false },
} satisfies Meta<typeof ConversationSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  render: (args) => <Room facts={ROOM}><ConversationSidebar {...args} /></Room>,
};

/** Collapsed to its rail: the avatars, the machines' icons, and the heading's chip as the expand button. */
export const Rail: Story = {
  render: (args) => <Room facts={ROOM} collapsed><ConversationSidebar {...args} /></Room>,
};

/** No conversation yet on a paired machine. */
export const Empty: Story = {
  render: (args) => <Room facts={{ ...ROOM, people: [], roomBinding: null }}><ConversationSidebar {...args} /></Room>,
};

/** Nothing set up to talk to (the setup put off, or no machine): only the brand and Settings. */
export const Blocked: Story = {
  args: { blocked: true },
  render: (args) => <Room facts={{ machinesReady: true }}><ConversationSidebar {...args} /></Room>,
};

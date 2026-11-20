import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps, type ReactNode } from "react";
import { ConversationAvatar } from "./ConversationAvatar";
import { stateText } from "./conversation-state";
import { selectInCall } from "./stage-view";
import { createRoomStore, RoomStoreContext, useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import "../room/room.css";

/* A conversation's agent, small, with the dot of its state. Its face and its dot are worked out from the room's store, as
 * on the page: each specimen gets a store seeded with the facts that put one conversation in that state (in a call or not,
 * the agent speaking, the person's turn open, its harness working, holding, offline). The creature is drawn where WebGL is
 * available; elsewhere its fallback stands in. */

type Kind = "listening" | "speaking" | "working" | "holding" | "idle" | "offline";
const KINDS: Kind[] = ["listening", "speaking", "working", "holding", "idle", "offline"];

const NODE = "fp-nuc";
const THREAD = "t-web";
const KEY = `${NODE}|${THREAD}`;
const person = (reach = "listening", available = true) =>
  ({ thread_id: THREAD, title: "sidevoice-web", available, reach: { state: reach }, node: NODE, machine: { host: "NUC", id: "connector-nuc" }, harness: "claude-code" });
const BASE = {
  machinesReady: true, callNode: NODE, machineLinks: { [NODE]: { reach: "ok", via: "node" } },
  pairings: [{ fp: NODE, host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false }],
  roomBinding: { thread_id: THREAD, title: "sidevoice-web", binding_id: "b1" },
};
const IN_CALL = { ws: {}, sessionId: "s1" };
/** The room's facts that put the conversation in each state. */
const FACTS: Record<Kind, Record<string, unknown>> = {
  listening: { ...IN_CALL, people: [person()], userTurn: { thread: KEY, segment: "turn-1" }, pendingPhase: "listening" },
  speaking: { ...IN_CALL, people: [person()], botLive: true },
  working: { ...IN_CALL, people: [person()], harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 10_000 },
  holding: { ...IN_CALL, people: [person("holding")] },
  idle: { people: [person()] },
  offline: { people: [person("offline", false)] },
};

/** A room whose one conversation is in `kind`. */
function Seeded({ kind, children }: { kind: Kind; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch({ ...BASE, ...FACTS[kind] } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

/** The conversation's row as the room projects it, its avatar, and (`words`) the line its row says under the title. */
function Avatar({ pop, attention, words = false }: { pop?: boolean; attention?: boolean; words?: boolean }) {
  const row = useRoomStore((state) => state.participants.find((participant) => participant.threadId === KEY)) as ParticipantView;
  const inCall = useRoomStore(selectInCall);
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <ConversationAvatar row={row} pop={pop} attention={attention} />
      {words && <span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{stateText(row, inCall, translator())}</span>}
    </div>
  );
}

function Specimen({ kind, pop, attention }: { kind: Kind; pop?: boolean; attention?: boolean }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 4, minWidth: 92 }}>
      <p className="catalogue-label">{kind}</p>
      <Seeded kind={kind}><Avatar pop={pop} attention={attention} words /></Seeded>
    </div>
  );
}

type Args = ComponentProps<typeof ConversationAvatar> & { kind: Kind };

const ROW: ParticipantView = { threadId: KEY, title: "sidevoice-web", selected: true, available: true, switching: false, unread: 0, reach: "listening", working: false };

const meta = {
  title: "Product/Call/ConversationAvatar",
  component: ConversationAvatar,
  args: { row: ROW, kind: "listening", pop: false, attention: false },
  argTypes: {
    row: { control: false, description: "The conversation's row (participantsView). In these stories it comes from the seeded store." },
    kind: { control: "select", options: KINDS, description: "Story only: the state the seeded room puts the conversation in." },
  },
  render: ({ kind, pop, attention }) => <Seeded key={kind} kind={kind}><Avatar pop={pop} attention={attention} words /></Seeded>,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Every state, in a circle (the header's, a phone's panel: `.state-dot`, 12px) and popping out of its square (the
 *  sidebar's card and rail: 10px, connected green or working, none offline). Under each, the words its row says. */
export const States: Story = {
  render: () => (
    <div className="catalogue-stack" style={{ maxWidth: "none" }}>
      <div><p className="catalogue-label">Circle (pop off)</p><div className="catalogue-row">{KINDS.map((kind) => <Specimen key={kind} kind={kind} />)}</div></div>
      <div><p className="catalogue-label">Pop (sidebar card and rail)</p><div className="catalogue-row">{KINDS.map((kind) => <Specimen key={kind} kind={kind} pop />)}</div></div>
    </div>
  ),
};

/** It said something the person has not seen (`attention`, only with `pop`): the burst with its "!" at the top-right. */
export const Attention: Story = {
  render: () => <div className="catalogue-row">{(["listening", "working", "holding", "idle"] as Kind[]).map((kind) => <Specimen key={kind} kind={kind} pop attention />)}</div>,
};

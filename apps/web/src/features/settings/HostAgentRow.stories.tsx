import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { HostAgentRow, HostAgentsPanel } from "./HostAgentsPanel";
import { Button } from "../../components/ui/Button";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import type { AgentManualStep, DetectedAgent, HostAgentsState } from "../../state/room-types";

/* A machine's coding agent, one row of its Agents panel (Settings › Machines, the setup's agents step): the agent's mark,
 * its name and version, where it stands as a Badge `tag` beside the name (Providers' tones: neutral while busy or not
 * connected, positive connected, warning needs attention, danger an action that failed), a line under the name only when
 * there is more to say, and its actions at the row's end — Connect and Disconnect as `secondary` buttons with the Link
 * and Unlink icons (Update, a fix to what is there, without one), and doing it by hand as a disclosure. Each specimen is
 * the real row on a room store seeded as the connector reports the agent: its registration and what it can do (the
 * `agent` the panel passes), and what the row reads from the store (`busy`, `actionErrors`). A failed action opens the
 * steps by hand under the row, as the page does. The buttons do nothing here (no `sidevoiceActions`). Two moments are
 * the row's own state, reached as a person reaches them: Connected a moment ago (the listing turning Connected; it lasts
 * 5 s, Replay draws it again) and Disconnect's question (the button pressed). */

const FP = "fp-nuc";
const CONNECTOR = "/opt/sidevoice/bin/connector";
/** The connector's steps for each harness, as it writes them: connecting, updating, disconnecting, replacing. */
const STEPS: Record<string, NonNullable<DetectedAgent["manual"]>> = {
  codex: {
    connect: [{ command: `codex mcp add sidevoice -- ${CONNECTOR} mcp --stdio` }],
    update: [{ command: "codex mcp remove sidevoice" }, { command: `codex mcp add sidevoice -- ${CONNECTOR} mcp --stdio` }],
    disconnect: [{ command: "codex mcp remove sidevoice" }],
  },
  claude: {
    connect: [{ command: `claude mcp add sidevoice -- ${CONNECTOR} mcp --stdio` }],
    disconnect: [{ command: "claude mcp remove sidevoice" }],
    replace: [{ command: "claude mcp remove sidevoice" }, { command: `claude mcp add sidevoice -- ${CONNECTOR} mcp --stdio` }],
  },
};
const CURSOR_FILE: AgentManualStep = { file: "~/.cursor/mcp.json", snippet: `"sidevoice": { "command": "${CONNECTOR}", "args": ["mcp", "--stdio"] }` };
const AGENTS: Record<string, Pick<DetectedAgent, "id" | "label" | "version" | "manual" | "instructions">> = {
  codex: { id: "codex", label: "Codex", version: "0.157.0", manual: STEPS.codex },
  claude: { id: "claude", label: "Claude Code", version: "2.0.14", manual: STEPS.claude },
  cursor: { id: "cursor", label: "Cursor", version: "1.7.2", manual: { connect: [CURSOR_FILE] }, instructions: CURSOR_FILE },
};

/** An agent as the connector reports it: installed, Sidevoice not added yet, everything doable by the connector itself. */
const agent = (id: keyof typeof AGENTS, changes: Partial<DetectedAgent> = {}): DetectedAgent => ({
  ...AGENTS[id], present: true, registration: "not-connected", connect: "auto", can: { connect: true, update: true, disconnect: true }, ...changes,
});

type RowFacts = Partial<Pick<HostAgentsState, "busy" | "actionErrors">>;
/** The machine's listing as the store keeps it: searched two minutes ago, what the row reads on top. */
const listing = (agents: DetectedAgent[], facts: RowFacts = {}): HostAgentsState => ({
  status: "ready", error: null, busy: {}, actionErrors: {}, ...facts,
  value: { agents, scanned_at: new Date(Date.now() - 120_000).toISOString(),
    custom: { command: `${CONNECTOR} mcp --stdio`, snippet: JSON.stringify({ mcpServers: { sidevoice: { command: CONNECTOR, args: ["mcp", "--stdio"] } } }) } },
});

function Seeded({ state, children }: { state: HostAgentsState; children: ReactNode }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch({ hostAgents: { [FP]: state } } as never);
    return store;
  });
  return <RoomStoreContext.Provider value={store}>{children}</RoomStoreContext.Provider>;
}

interface Specimen {
  name: string;
  note: string;
  agent: DetectedAgent;
  facts?: RowFacts;
  /** What a person presses on it once it is drawn (the story's play): its disclosure, or Disconnect. */
  press?: "howto" | "disconnect";
}

function Labelled({ name, note, press, children }: { name: string; note: string; press?: Specimen["press"]; children: ReactNode }) {
  return (
    <div data-press={press}>
      <p className="catalogue-label" style={{ margin: 0 }}>{name}</p>
      <span className="muted" style={{ display: "block", marginBottom: 6, fontSize: "var(--sv-font-xs)" }}>{note}</span>
      {children}
    </div>
  );
}

function Row({ specimen: { agent, facts } }: { specimen: Specimen }) {
  return <Seeded state={listing([agent], facts)}><ul className="host-agent-rows"><HostAgentRow fp={FP} agent={agent} /></ul></Seeded>;
}

function Rows({ specimens, children }: { specimens: Specimen[]; children?: ReactNode }) {
  return (
    <div className="catalogue-stack" style={{ maxWidth: 600 }}>
      {specimens.map((specimen) => <Labelled key={specimen.name} {...specimen}><Row specimen={specimen} /></Labelled>)}
      {children}
    </div>
  );
}

/** Connected a moment ago: the row drawn Not connected, then its listing says Connected, as after Connect. */
function JustConnected() {
  const [registration, setRegistration] = useState<DetectedAgent["registration"]>("not-connected");
  useEffect(() => setRegistration("connected"), []);
  const codex = agent("codex", { registration });
  return <Seeded state={listing([codex])}><ul className="host-agent-rows"><HostAgentRow fp={FP} agent={codex} /></ul></Seeded>;
}

function Replayed({ children }: { children: (round: number) => ReactNode }) {
  const [round, setRound] = useState(0);
  return <div style={{ display: "grid", gap: 6 }}>
    {children(round)}
    <Button variant="ghost" tone="neutral" size="sm" style={{ justifySelf: "start" }} onClick={() => setRound((value) => value + 1)}>Replay</Button>
  </div>;
}

/** Presses what each specimen asks to be pressed, in every theme's copy; then a press elsewhere, as the person moves on,
 *  so the hint a click keeps open (Tooltip) goes. */
async function press({ canvasElement }: { canvasElement: HTMLElement }) {
  const pressed = [
    ...canvasElement.querySelectorAll<HTMLButtonElement>("[data-press=howto] .host-agent-actions .ui-disclosure"),
    ...canvasElement.querySelectorAll<HTMLButtonElement>("[data-press=disconnect] .host-agent-actions .ui-button:not(.ui-disclosure)"),
  ];
  if (!pressed.length) return;
  pressed.forEach((button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 50));
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

const meta = {
  title: "Product/Settings/HostAgentRow",
  component: HostAgentRow,
  args: { fp: FP, agent: agent("codex") },
  argTypes: { fp: { control: false }, agent: { control: false } },
  play: async (context) => press(context),
} satisfies Meta<typeof HostAgentRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The rows in their panel, as Settings › Machines shows a machine's agents: the heading with when it was searched and
 *  searching again, one agent not connected, one connected, one set up by an older Sidevoice; under them, the way to
 *  connect an agent the list does not show. */
export const InItsPanel: Story = {
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <Seeded state={listing([agent("codex"), agent("claude", { registration: "connected" }), agent("cursor", { registration: "outdated" })])}>
        <HostAgentsPanel fp={FP} />
      </Seeded>
    </div>
  ),
};

/** Where it stands with nothing going on: Not connected (and its steps by hand opened), Connected (and a moment after
 *  Connect), a connector that can only say how to do it by hand, and a registration this app does not know. */
export const AtRest: Story = {
  render: () => (
    <Rows specimens={[
      { name: "Not connected", note: "Badge tag neutral + dot · I’ll do it myself · Connect (secondary, Link)", agent: agent("codex") },
      { name: "Not connected · steps by hand open", note: "the disclosure pressed: the connector’s steps, each to copy", agent: agent("codex"), press: "howto" },
      { name: "Connected", note: "Badge tag positive, no dot · I’ll do it myself (remove) · Disconnect (secondary, Unlink)", agent: agent("claude", { registration: "connected" }) },
      { name: "Manual only", note: "the connector can’t add it: no Connect, “Connect it manually” under the name", agent: agent("codex", { can: { connect: false, update: false, disconnect: true } }) },
      { name: "Unknown (the connector’s)", note: "registration “unknown”: neutral + dot, no Connect; its disclosure opens nothing", agent: agent("codex", { registration: "unknown" }) },
      { name: "Unrecognised registration", note: "one this app doesn’t know (core#112): read as unknown, no steps by hand; Connect as the connector can",
        agent: agent("codex", { registration: "needs-restart" as DetectedAgent["registration"] }) },
    ]}>
      <Labelled name="Connected · a moment after Connect" note="the row’s own 5 s: positive tag, “ready for new conversations” in the positive ink">
        <Replayed>{(round) => <JustConnected key={round} />}</Replayed>
      </Labelled>
    </Rows>
  ),
};

/** What it is doing meanwhile, in a neutral tag without a dot, the button it pressed loading; and Disconnect, which asks
 *  first. */
export const Busy: Story = {
  render: () => (
    <Rows specimens={[
      { name: "Connecting…", note: "busy connect: Connect loading, the disclosure disabled", agent: agent("codex"), facts: { busy: { codex: "connect" } } },
      { name: "Disconnecting…", note: "busy disconnect: Disconnect loading", agent: agent("claude", { registration: "connected" }), facts: { busy: { claude: "disconnect" } } },
      { name: "Disconnect asked first", note: "Disconnect pressed: what it does, Cancel and Remove (danger)", agent: agent("claude", { registration: "connected" }), press: "disconnect" },
    ]} />
  ),
};

/** An action that failed: danger tag with its dot, why under the name (an alert, its Details where there are any), and the
 *  steps by hand opened under the row. A change applied but not checked afterwards did not fail: unknown until searched. */
export const Failed: Story = {
  render: () => (
    <Rows specimens={[
      { name: "Couldn’t connect", note: "actionErrors connect", agent: agent("codex"), facts: { actionErrors: { codex: { key: "connect-failed", action: "connect" } } } },
      { name: "Couldn’t update", note: "an older Sidevoice’s entry, Update failed", agent: agent("codex", { registration: "outdated" }), facts: { actionErrors: { codex: { key: "connect-failed", action: "connect" } } } },
      { name: "Couldn’t disconnect", note: "actionErrors disconnect (Sidevoice not running there)", agent: agent("claude", { registration: "connected" }), facts: { actionErrors: { claude: { key: "no-connector", action: "disconnect" } } } },
      { name: "Applied, not checked", note: "scan-failed-after: neutral + dot, unknown; the line says why", agent: agent("codex"),
        facts: { actionErrors: { codex: { key: "agents.scan-failed-after", params: { agent: "Codex" }, action: "connect" } } } },
    ]} />
  ),
};

/** Needs attention, in a warning tag with its dot: why in a short line, what it means and what to do in its (i). Another
 *  ‘sidevoice’ entry and unreadable settings are left alone (no Connect); an older Sidevoice’s entry reads Update. And the
 *  connector’s delivery readiness, a chip of its own in the line, opening its reasons. */
export const NeedsAttention: Story = {
  render: () => (
    <Rows specimens={[
      { name: "Foreign", note: "another ‘sidevoice’ entry: read-only, Replace manually", agent: agent("claude", { registration: "foreign" }) },
      { name: "Outdated", note: "an older Sidevoice’s entry: Update (secondary, no icon)", agent: agent("codex", { registration: "outdated" }) },
      { name: "Invalid", note: "its MCP settings can’t be read: read-only, the file in its (i)", agent: agent("cursor", { registration: "invalid" }) },
      { name: "Connected · readiness needs attention", note: "readiness needs_attention: a warning Badge in a disclosure",
        agent: agent("claude", { registration: "connected", readiness: { state: "needs_attention", reasons: [{ code: "other.future", message: "Restart Claude Code to load the new MCP server." }] } }) },
    ]} />
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { MachineEntryCopy, MachineState, StateOnIcon } from "./MachineState";
import { machineStatus, type MachineStatus } from "./machine-status";
import type { LocalHostStatus } from "../../host";
import type { MachineView } from "../../state/room-types";
import { OtherMachineIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";

/* A machine's state, in one set of words wherever it shows (machine-status.ts): a remote machine says whether this device
 * reaches it; This device, where the app reads its service, says where the service stands. Connected wears the models'
 * Ready badge; what needs the person is words in its tone (amber, red); the rest is muted. In a list (Settings' nav, a
 * phone's machine list) only the connected dot shows on the icon (StateOnIcon), and words only when the person has
 * something to do (MachineEntryCopy). */

const remote = (state: MachineView["state"], revoked = false): MachineView =>
  ({ id: "fp-nuc", pairingId: "fp-nuc", host: "NUC", revoked, reach: state === "connected" ? "direct" : "offline", state });
const local = (state: MachineView["state"]): MachineView =>
  ({ id: "local-host", pairingId: "fp-local", host: "MacBook", revoked: false, reach: state === "connected" ? "direct" : "checking", state, local: true });

function statuses(): [string, MachineStatus, boolean][] {
  const t = translator();
  const absent: LocalHostStatus = { state: "absent" };
  const service = (state: LocalHostStatus["state"], machine: MachineView["state"]) => machineStatus(local(machine), { state, reachable: machine === "connected" }, true, t);
  return [
    ["Remote · connected", machineStatus(remote("connected"), absent, false, t), false],
    ["Remote · checking", machineStatus(remote("checking"), absent, false, t), false],
    ["Remote · not connected", machineStatus(remote("offline"), absent, false, t), false],
    ["Remote · pairing revoked", machineStatus(remote("revoked", true), absent, false, t), false],
    ["This device · not prepared", machineStatus(null, absent, true, t), true],
    ["This device · starting", service("starting", "checking"), true],
    ["This device · not working", service("service-failed", "failed"), true],
    ["This device · stopped", service("stopped-by-person", "checking"), true],
    ["This device · running", service("running", "connected"), true],
  ];
}

function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "max-content max-content max-content max-content", gap: "12px 28px", alignItems: "center" }}>{children}</div>;
}

const meta = {
  title: "Product/Settings/MachineState",
  component: MachineState,
  args: { status: { key: "direct", tone: "positive", short: "", long: "" }, form: "short", live: false },
  argTypes: { status: { control: false } },
} satisfies Meta<typeof MachineState>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Each state: its short form (an entry's second line), its long form (the machine's page), and its icon in a list. */
export const States: Story = {
  render: () => (
    <Grid>
      {["State", "Short", "Long", "On its icon"].map((head) => <p key={head} className="catalogue-label" style={{ margin: 0 }}>{head}</p>)}
      {statuses().map(([name, status, own]) => <div key={name} style={{ display: "contents" }}>
        <span className="muted" style={{ fontSize: "var(--sv-font-xs)" }}>{name}</span>
        <span><MachineState status={status} /></span>
        <span><MachineState status={status} form="long" /></span>
        <span><StateOnIcon icon={own ? <ThisComputerIcon size={18} /> : <OtherMachineIcon size={18} />} status={status} /></span>
      </div>)}
    </Grid>
  ),
};

/** An entry's words in a list: the name (cut short when long), and its state on a line of its own only when it needs the
 *  person. */
export const EntryCopy: Story = {
  render: () => (
    <div className="catalogue-stack" style={{ maxWidth: 240, ["--new-ground" as string]: "var(--sv-bg)" }}>
      {statuses().map(([name, status, own]) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StateOnIcon icon={own ? <ThisComputerIcon size={18} /> : <OtherMachineIcon size={18} />} status={status} />
          <MachineEntryCopy name={own ? "MacBook" : "Workstation in the office upstairs"} status={status} isNew={false} />
        </div>
      ))}
    </div>
  ),
};

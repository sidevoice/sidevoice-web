import type { LocalHostStatus } from "../../services/desktop-host";
import type { MachineView } from "../../state/room-types";
import type { Translate } from "../../i18n/translator";

/* A machine's state, in one set of words wherever it shows: its entry in Settings' nav, a phone's machine list, its
 * page's header, this computer's service card, the design system. Nothing else words a machine's state.
 *
 * A remote machine says whether this device reaches it: connected (how — directly or through the room — is not said
 * while the relay is not shipping), still being checked,
 * not connected, or no longer paired. Not connected is grey, not red: a laptop asleep is not something to fix, and the
 * conversations say the same fact in grey; red is for what is (This device not working), amber for what needs the
 * person (pairing it again). This device, where the app reads its service (its own section), says where the service
 * stands instead — not prepared, starting, not working, stopped, running — and, running, how it answers as any
 * machine would. Whether it was paired with encryption is never said: a machine is connected or not. */

export type MachineTone = "positive" | "neutral" | "warning" | "danger";

export type MachineStateKey = "unpaired" | "checking" | "direct" | "unreachable"
  | "unprepared" | "starting" | "failed" | "stopped" | "running";

export interface MachineStatus {
  key: MachineStateKey;
  tone: MachineTone;
  /** In lists and names (an entry, its accessible name): 17 characters at most, never cut short. */
  short: string;
  /** On the machine's page, where it has the room: the same, or with how it is reached. */
  long: string;
  /** What to do about it, under the page's header, where there is something to say. */
  hint?: string;
}

/** Not connected's tone: grey, pending the operator's word (spec §1); it was red ("danger") before. */
const UNREACHABLE_TONE: MachineTone = "neutral";

const STARTING = new Set(["installing", "starting", "backoff"]);
const FAILED = new Set(["failed", "service-failed", "refused", "incompatible"]);
const STOPPED = new Set(["not-installed", "stopped-by-person"]);

/** How this device reaches `machine`: the first that holds of not paired, checking, connected, not connected. With no machine (this computer's, not projected yet), it is being checked. */
function reachStatus(machine: MachineView | null, t: Translate): MachineStatus {
  if (machine?.revoked || machine?.state === "revoked") return { key: "unpaired", tone: "warning", short: t("hosts.machineState.unpaired"),
    long: t("hosts.machineState.unpaired.long"), hint: t("hosts.machineState.unpaired.hint") };
  if (!machine || machine.state === "checking") return { key: "checking", tone: "neutral", short: t("hosts.machineState.checking"), long: t("hosts.machineState.checking") };
  // Connected, however it is reached: directly or through the room is not said while the relay is not shipping.
  if (machine.state === "connected") return { key: "direct", tone: "positive", short: t("hosts.machineState.direct"), long: t("hosts.machineState.direct") };
  return { key: "unreachable", tone: UNREACHABLE_TONE, short: t("hosts.machineState.unreachable"), long: t("hosts.machineState.unreachable"), hint: t("hosts.reach.none") };
}

/** Where this computer's service stands, the first that holds; running, it answers as any machine would. Short and long
 *  are the same. */
function serviceStatus(machine: MachineView | null, status: LocalHostStatus, t: Translate): MachineStatus {
  const said = (key: MachineStateKey & ("unprepared" | "starting" | "failed" | "stopped" | "running"), tone: MachineTone) =>
    ({ key, tone, short: t(`hosts.machineState.${key}`), long: t(`hosts.machineState.${key}`) });
  if (!machine && status.state === "absent") return said("unprepared", "neutral");
  if (STARTING.has(status.state)) return said("starting", "neutral");
  if (FAILED.has(status.state)) return said("failed", "danger");
  if (STOPPED.has(status.state)) return said("stopped", "neutral");
  if (status.state === "running" && machine?.state === "connected") return said("running", "positive");
  // Running and not answering yet (or a pairing left without its service): as any machine, checking or not connected.
  return reachStatus(machine, t);
}

/** `machine`'s state in words and tone. `readsService`: where the app reads this computer's service (its own section,
 *  useThisComputerSection), this computer says where its service stands; anywhere else it reads as any machine. */
export function machineStatus(machine: MachineView | null, localStatus: LocalHostStatus, readsService: boolean, t: Translate): MachineStatus {
  const local = !machine || !!machine.local;
  return local && readsService ? serviceStatus(machine, localStatus, t) : reachStatus(machine, t);
}

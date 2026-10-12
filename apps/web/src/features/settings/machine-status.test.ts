import { expect, test } from "vitest";
import { machineStatus } from "./machine-status";
import { hostTranslator } from "./host-i18n";
import type { LocalHostStatus, LocalHostStatusName } from "../../services/desktop-host";
import type { MachineView } from "../../state/room-types";

/* One function words a machine's state everywhere (spec R5): a remote machine by how it is reached, this computer by
 * its service where the app reads it. */

const en = hostTranslator("en");
const es = hostTranslator("es");

const machine = (changes: Partial<MachineView> = {}): MachineView => ({
  id: "fp-nuc", pairingId: "fp-nuc", host: "NUC", revoked: false, reach: "direct", state: "connected", pairedLabel: "", ...changes,
});
const local = (changes: Partial<MachineView> = {}) => machine({ id: "local-host", pairingId: "fp-local", host: "MacBook", local: true, ...changes });
const status = (state: LocalHostStatusName): LocalHostStatus => ({ state, reachable: state === "running" });
const running = status("running");
/** The parts a person meets: its key, tone, short and long words, and hint. */
const said = (value: ReturnType<typeof machineStatus>) => [value.key, value.tone, value.short, value.long, value.hint];

test("a remote machine: the first that holds of not paired, checking, through the room, connected, not connected", () => {
  expect(said(machineStatus(machine({ revoked: true, state: "connected" }), running, false, en)))
    .toEqual(["unpaired", "warning", "Not paired", "No longer paired", "Pair it again, or forget it below."]);
  expect(said(machineStatus(machine({ state: "revoked", reach: "revoked" }), running, false, en))[0]).toBe("unpaired");
  expect(said(machineStatus(machine({ state: "checking", reach: "checking" }), running, false, en)))
    .toEqual(["checking", "neutral", "Checking…", "Checking…", undefined]);
  expect(said(machineStatus(machine({ reach: "room" }), running, false, en)))
    .toEqual(["room", "positive", "Through the room", "Connected through the room", undefined]);
  expect(said(machineStatus(machine(), running, false, en)))
    .toEqual(["direct", "positive", "Connected", "Connected directly", undefined]);
  // Connected another way than directly or through the room: no how.
  expect(said(machineStatus(machine({ reach: "away" }), running, false, en)).slice(2, 4)).toEqual(["Connected", "Connected"]);
  // Not connected is grey, not red: a machine asleep is not something to fix.
  for (const state of ["offline", "failed"] as const) {
    expect(said(machineStatus(machine({ state, reach: "offline" }), running, false, en)))
      .toEqual(["unreachable", "neutral", "Not connected", "Not connected", "Not reachable from here now"]);
  }
});

test("not encrypted is said on top of any state, never instead of it", () => {
  for (const changes of [{}, { state: "checking" as const }, { state: "offline" as const }, { revoked: true }]) {
    const plain = machineStatus(machine(changes), running, false, en);
    const insecure = machineStatus(machine({ ...changes, insecure: true }), running, false, en);
    expect(insecure).toEqual({ ...plain, insecure: true });
    expect(plain.insecure).toBe(false);
  }
});

test("This device, where the app reads its service: not prepared, starting, not working, not running, running", () => {
  const device = (state: LocalHostStatusName, row: MachineView | null = local()) => said(machineStatus(row, status(state), true, en));
  expect(device("absent", null)).toEqual(["unprepared", "neutral", "Not prepared", "Not prepared", undefined]);
  for (const state of ["installing", "starting", "backoff"] as const) expect(device(state)).toEqual(["starting", "neutral", "Starting…", "Starting…", undefined]);
  for (const state of ["failed", "service-failed", "refused", "incompatible"] as const) expect(device(state, local({ state: "failed" }))).toEqual(["failed", "danger", "Not working", "Not working", undefined]);
  for (const state of ["not-installed", "stopped-by-person"] as const) expect(device(state)).toEqual(["stopped", "neutral", "Not running", "Not running", undefined]);
  expect(device("running")).toEqual(["running", "positive", "Running", "Running", undefined]);
  // Preparing it, before its row exists: where the service stands, all the same.
  expect(device("installing", null)[0]).toBe("starting");
});

test("This device running but not answering yet reads as any machine: checking, or not connected", () => {
  expect(said(machineStatus(null, running, true, en)).slice(0, 3)).toEqual(["checking", "neutral", "Checking…"]);
  expect(said(machineStatus(local({ state: "offline", reach: "checking" }), running, true, en)).slice(0, 3)).toEqual(["unreachable", "neutral", "Not connected"]);
  // A pairing left without its service (none installed now): as any machine, not connected.
  expect(said(machineStatus(local({ state: "offline" }), status("absent"), true, en))[0]).toBe("unreachable");
});

test("anywhere the app does not read the service, this computer's row reads as any machine", () => {
  expect(said(machineStatus(local(), status("stopped-by-person"), false, en)).slice(0, 3)).toEqual(["direct", "positive", "Connected"]);
  expect(said(machineStatus(local({ state: "failed", reach: "offline" }), status("failed"), false, en)).slice(0, 3)).toEqual(["unreachable", "neutral", "Not connected"]);
  // A remote machine is never worded by this computer's service, wherever it shows.
  expect(said(machineStatus(machine(), status("failed"), true, en)).slice(0, 3)).toEqual(["direct", "positive", "Connected"]);
});

test("no state is ever the accent, and every short form fits a nav entry (17 characters at most), in English and Spanish", () => {
  const rows: [MachineView | null, LocalHostStatusName, boolean][] = [
    [machine({ revoked: true }), "running", false], [machine({ state: "checking" }), "running", false], [machine({ reach: "room" }), "running", false],
    [machine(), "running", false], [machine({ state: "offline" }), "running", false], [null, "absent", true], [local(), "starting", true],
    [local(), "failed", true], [local(), "stopped-by-person", true], [local(), "running", true],
  ];
  for (const t of [en, es]) {
    const keys = new Set<string>();
    for (const [row, state, reads] of rows) {
      const value = machineStatus(row, status(state), reads, t);
      keys.add(value.key);
      expect(["positive", "neutral", "warning", "danger"]).toContain(value.tone);
      expect(value.short.length, value.short).toBeLessThanOrEqual(17);
    }
    expect(keys.size).toBe(rows.length);
  }
});

test("in Spanish, the words the spec gives", () => {
  expect(said(machineStatus(machine(), running, false, es)).slice(2, 4)).toEqual(["Conectada", "Conectada directamente"]);
  expect(said(machineStatus(machine({ reach: "room" }), running, false, es)).slice(2, 4)).toEqual(["Por la sala", "Conectada a través de la sala"]);
  expect(said(machineStatus(machine({ state: "offline" }), running, false, es)).slice(2, 5)).toEqual(["No conectada", "No conectada", "Ahora no se llega desde aquí"]);
  expect(said(machineStatus(machine({ revoked: true }), running, false, es)).slice(2, 5))
    .toEqual(["Sin emparejar", "Ya no está emparejada", "Vuelve a emparejarla u olvídala abajo."]);
  expect(machineStatus(local(), status("stopped-by-person"), true, es).short).toBe("No está en marcha");
  expect(machineStatus(null, status("absent"), true, es).short).toBe("Sin preparar");
});

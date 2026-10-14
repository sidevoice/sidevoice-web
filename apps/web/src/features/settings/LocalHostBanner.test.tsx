import { expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LocalHostBanner } from "./LocalHostBanner";
import { hostStatusText, knownLocalHostState, safeLocalHostStatusDetails } from "./local-host-status";
import { translator } from "../../i18n/translator";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));

const local: PairingSummary = { fp: "fp-local", host: "MacBook", urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local",
  paired_at: 1_700_000_000, revoked: false, local: true };

function bridge() {
  const restart = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "failed" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), restart,
    start: vi.fn(), serviceInstall: vi.fn(), reconnect: vi.fn(),
  } } } });
  return restart;
}

// ----- a state a newer desktop app reports (sidevoice-core#112) -----
test("this computer's service in a state this app does not know says so, and offers no action", () => {
  bridge();
  const store = createRoomStore();
  const newer = { state: "migrating", reachable: false, progress: { done: 1, total: 3 } } as unknown as LocalHostStatus;
  act(() => { store.patch({ pairings: [local], localHostStatus: newer }); });
  render(<RoomProvider store={store}><LocalHostBanner /></RoomProvider>);
  expect(screen.getByText("This computer is unavailable: The service on this computer reports a state this app doesn't recognize.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  // A state it knows keeps its action.
  act(() => { store.patch({ localHostStatus: { state: "failed", reachable: false } }); });
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("stopped, the banner says only that, and offers Start", async () => {
  const restart = vi.fn().mockResolvedValue(undefined), start = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "stopped-by-person" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), restart, start,
  } } } });
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostStatus: { state: "stopped-by-person", reachable: false } }); });
  render(<RoomProvider store={store}><LocalHostBanner /></RoomProvider>);
  expect(screen.getByText("This computer is unavailable: The service is stopped.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  await act(async () => { screen.getByRole("button", { name: "Start" }).click(); });
  expect(start).toHaveBeenCalledOnce();
  expect(restart).not.toHaveBeenCalled();
});

test("a state this app does not know is never worded as one it knows; extra fields are not copied into the details", () => {
  const t = translator();
  const status = (state: string) => ({ state, reachable: false, future: "x" }) as unknown as LocalHostStatus;
  expect(hostStatusText(status("migrating"), t)).toBe(t("hosts.status.unknown"));
  expect(hostStatusText(status("absent"), t)).toBe(t("hosts.status.absent"));
  expect(knownLocalHostState("migrating")).toBe(false);
  expect(knownLocalHostState("running")).toBe(true);
  expect(safeLocalHostStatusDetails(status("migrating"))).toEqual({ state: "unknown", reachable: false });
});

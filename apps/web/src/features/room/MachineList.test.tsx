import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { MachineList } from "./MachineList";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-mac", host: "macbook-pro", urls: ["http://127.0.0.1:8768"], rv: { url: "https://room.example", node: "c-1" },
  device_id: "d-1", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const linux = paired({ fp: "fp-linux", host: "linux-box", urls: [], device_id: "d-2" });

function room(pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  act(() => { store.patch({ pairings, pairingInUse: pairings[0]?.fp ?? null, machinesAt: 1_700_086_400_000, ...facts }); });
  return store;
}
function actions() {
  const done = { chooseMachine: vi.fn(), forgetMachine: vi.fn().mockResolvedValue(undefined), openPairing: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  return done;
}

test("each machine this device is paired with reads as a row: its name, whether it is in use, and where it is reached", () => {
  actions();
  room([paired(), linux], { node: "fp-mac", rendezvous: "room", nodeReach: "ok" });
  const [mac, other] = [...document.querySelectorAll(".machine-row")];
  expect(mac.textContent).toMatch(/macbook-pro/);
  expect(mac.textContent).toMatch(/En uso · A través de la sala · Emparejada hace 1 día/);
  expect(mac.getAttribute("data-state")).toBe("connected");
  expect(other.textContent).toMatch(/linux-box/);
  expect(other.textContent).not.toMatch(/En uso/);
  expect(other.textContent).toMatch(/Conexión por la sala/);   // the ways it can be reached, until it is in use
  // The one in use has nothing to switch to; the other one does. Both can be forgotten.
  expect(screen.queryByRole("button", { name: "Usar macbook-pro" })).toBeNull();
  expect(screen.getByRole("button", { name: "Usar linux-box" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Olvidar macbook-pro" })).toBeInTheDocument();
  // Switching with a call up hangs it up: said before anybody taps.
  expect(document.getElementById("machines")!.textContent).toMatch(/cuelga la llamada/);
});

test("reached directly, not answering, or revoked: each says so in the row", () => {
  actions();
  const store = room([paired()], { node: "fp-mac", rendezvous: "node", nodeReach: "ok" });
  const row = () => document.querySelector(".machine-row")!;
  expect(row().textContent).toMatch(/Conexión directa/);
  act(() => { store.patch({ rendezvous: "", nodeReach: "away" }); });
  expect(row().textContent).toMatch(/No responde/);
  expect(row().getAttribute("data-state")).toBe("offline");
  act(() => { store.patch({ nodeReach: "offline" }); });
  expect(row().textContent).toMatch(/Desconectada de la sala/);
  act(() => { store.patch({ pairings: [paired({ revoked: true })], nodeReach: "revoked" }); });
  expect(row().getAttribute("data-state")).toBe("revoked");
  expect(row().textContent).toMatch(/Revocada/);
  expect(document.getElementById("machines")!.textContent).toMatch(/emparéjalo de nuevo con un código/);
});

test("Usar acts at once; forgetting asks first — in the row, never in a browser dialog", async () => {
  const done = actions();
  room([paired(), linux]);
  await act(async () => { screen.getByRole("button", { name: "Usar linux-box" }).click(); });
  expect(done.chooseMachine).toHaveBeenCalledWith("fp-linux");

  const confirmSpy = vi.spyOn(window, "confirm");
  await act(async () => { screen.getByRole("button", { name: "Olvidar macbook-pro" }).click(); });
  expect(done.forgetMachine).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "Confirmar para macbook-pro" }).textContent).toMatch(/código nuevo/);
  await act(async () => { screen.getByRole("button", { name: "Cancelar" }).click(); });
  expect(done.forgetMachine).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("button", { name: "Olvidar macbook-pro" }).click(); });
  await act(async () => { screen.getByRole("button", { name: "Sí, olvidar" }).click(); });
  expect(done.forgetMachine).toHaveBeenCalledWith("fp-mac");
  expect(confirmSpy).not.toHaveBeenCalled();
});

test("paired with nothing yet it says so, and pairing starts here", async () => {
  const done = actions();
  room([]);
  expect(document.getElementById("machines")!.textContent).toMatch(/no está emparejado con ninguna máquina/);
  await act(async () => { screen.getByRole("button", { name: "Emparejar una máquina" }).click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
  // The room's own list, revoke and code are gone from the page.
  expect(screen.queryByRole("button", { name: /Revocar/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Emparejar máquina" })).toBeNull();
});

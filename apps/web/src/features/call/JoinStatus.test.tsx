import { expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { JoinStatus } from "./JoinStatus";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../../state/room-store";
import type { JoinStatusView } from "../../state/room-types";
import type { MachineLink, SessionFacts } from "../../state/room-session-state.js";

function renderJoin(join: JoinStatusView | null) {
  const store = createRoomStore();
  store.patch({joinStep:join?.step??null,joinProgress:join?.progress??null,joinFailure:join?.failed?join.text:''});
  installRoomBridge(store);
  render(
    <RoomStoreContext.Provider value={store}>
      <JoinStatus />
    </RoomStoreContext.Provider>,
  );
  return store;
}

test("no join, no line", () => {
  renderJoin(null);
  expect(document.getElementById("join-status")).not.toBeVisible();
});

test("a step is one quiet line, and a failure takes its place as an alert", () => {
  renderJoin({ step: "voice", text: "Preparando la voz (42 %)", progress: 42, failed: false });
  expect(screen.getByRole("status")).toHaveTextContent("Preparando la voz (42 %)");
  expect(document.getElementById("join-status")?.dataset.state).toBe("busy");

  act(() => {
    window.sidevoiceUI?.store?.patch({joinFailure:"El micrófono está bloqueado para esta página."});
  });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("El micrófono está bloqueado para esta página.");
  expect(document.getElementById("join-status")?.dataset.state).toBe("failed");
  expect(screen.getByRole("alert").querySelector("details")).toBeNull();

  // What was raw about it is closed behind Details, after the line: never the line itself.
  act(() => {
    window.sidevoiceUI?.store?.patch({joinFailure:"Something went wrong with the machine.",joinFailureDetails:"TypeError\nFailed to fetch"});
  });
  const line = screen.getByRole("alert");
  expect(line.querySelector("span")).toHaveTextContent(/^Something went wrong with the machine\.$/);
  expect(line.querySelector("details:not([open]) > summary")).toHaveTextContent("Details");
  expect(line.querySelector("details > pre")!.textContent).toBe("TypeError\nFailed to fetch");
});

test("the line goes away once the call is up", () => {
  const store = renderJoin({ step: "room", text: "Entrando en la llamada", progress: null, failed: false });
  act(() => store.patch({ joinStep: null }));
  expect(document.getElementById("join-status")).not.toBeVisible();
});

const pairing = { fp: "fp-mac", host: "mac", urls: ["http://127.0.0.1:8768"], rv: { url: "https://room.example", node: "m-1" }, device_id: "d-1", paired_at: null, revoked: false };

test("with no machine to talk to the line says why before any tap, as a note, and goes when it answers", () => {
  const store = renderJoin(null);
  const link = (reach: MachineLink["reach"], via: MachineLink["via"] = ""): Partial<SessionFacts> => ({ machineLinks: { "fp-mac": { reach, via } } });
  // While the machine is still being looked for nothing is known, and nothing is said.
  act(() => store.patch({ pairings: [pairing], machinesReady: true, ...link("checking") }));
  expect(document.getElementById("join-status")).not.toBeVisible();
  act(() => store.patch(link("offline")));
  const line = document.getElementById("join-status")!;
  expect(line).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/«mac» no está conectada ahora mismo\. Comprueba que está encendida\.$/);
  expect(line.dataset.state).toBe("note");
  expect(line.querySelector(".join-status-dot")).toBeNull();   // a standing note, not a step in progress
  act(() => store.patch(link("away")));
  expect(screen.getByRole("status")).toHaveTextContent(/No se llega a «mac» por ningún camino/);

  // A join that found no machine says it as an alert; the machine answering takes both away.
  act(() => store.patch({ joinFailure: "No se llega a «mac»." }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  act(() => store.patch({ joinFailure: "", ...link("ok", "room") }));
  expect(line).not.toBeVisible();
});

test("a device paired with nothing, or with a machine that revoked it, says so and what to do", () => {
  const store = renderJoin(null);
  act(() => store.patch({ pairings: [], machinesReady: true }));
  expect(screen.getByRole("status")).toHaveTextContent(/no está emparejado con ninguna máquina/);
  act(() => store.patch({ pairings: [{ ...pairing, revoked: true }], machineLinks: { "fp-mac": { reach: "revoked", via: "" } } }));
  expect(screen.getByRole("status")).toHaveTextContent(/«mac» ya no reconoce este dispositivo.*código nuevo/);
});

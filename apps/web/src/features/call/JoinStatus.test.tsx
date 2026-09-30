import { expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { JoinStatus } from "./JoinStatus";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../../state/room-store";
import type { JoinStatusView } from "../../state/room-types";

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
  renderJoin({ step: "voice", text: "Cargando el modelo de voz (42 %)", progress: 42, failed: false });
  expect(screen.getByRole("status")).toHaveTextContent("Cargando el modelo de voz (42 %)");
  expect(document.getElementById("join-status")?.dataset.state).toBe("busy");

  act(() => {
    window.sidevoiceUI?.store?.patch({joinFailure:"El micrófono está bloqueado para esta página."});
  });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("El micrófono está bloqueado para esta página.");
  expect(document.getElementById("join-status")?.dataset.state).toBe("failed");
});

test("the line goes away once the call is up", () => {
  const store = renderJoin({ step: "room", text: "Entrando en la sala", progress: null, failed: false });
  act(() => store.patch({ joinStep: null }));
  expect(document.getElementById("join-status")).not.toBeVisible();
});

const pairing = { fp: "fp-mac", host: "mac", urls: ["http://127.0.0.1:8768"], rv: { url: "https://room.example", node: "m-1" }, device_id: "d-1", paired_at: null, revoked: false };

test("with no machine to talk to the line says why before any tap, as a note, and goes when it answers", () => {
  const store = renderJoin(null);
  // While the machine is still being looked for nothing is known, and nothing is said.
  act(() => store.patch({ pairings: [pairing], pairingInUse: "fp-mac", node: "fp-mac", nodeReach: "" }));
  expect(document.getElementById("join-status")).not.toBeVisible();
  act(() => store.patch({ nodeReach: "offline" }));
  const line = document.getElementById("join-status")!;
  expect(line).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/«mac» no está conectada a la sala/);
  expect(line.dataset.state).toBe("note");
  expect(line.querySelector(".join-status-dot")).toBeNull();   // a standing note, not a step in progress
  act(() => store.patch({ nodeReach: "away" }));
  expect(screen.getByRole("status")).toHaveTextContent(/No se llega a «mac» ni directamente ni a través de la sala/);

  // A join that found no machine says it as an alert; the machine answering takes both away.
  act(() => store.patch({ joinFailure: "No se llega a «mac»." }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  act(() => store.patch({ joinFailure: "", nodeReach: "ok", rendezvous: "room" }));
  expect(line).not.toBeVisible();
});

test("a device paired with nothing, or with a machine that revoked it, says so and what to do", () => {
  const store = renderJoin(null);
  act(() => store.patch({ nodeReach: "unpaired" }));
  expect(screen.getByRole("status")).toHaveTextContent(/no está emparejado con ninguna máquina/);
  act(() => store.patch({ pairings: [{ ...pairing, revoked: true }], pairingInUse: "fp-mac", node: "fp-mac", nodeReach: "revoked" }));
  expect(screen.getByRole("status")).toHaveTextContent(/«mac» ya no reconoce este dispositivo.*código nuevo/);
});

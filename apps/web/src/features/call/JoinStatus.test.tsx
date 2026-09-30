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

test("with no machine connected the line says so before any tap, as a note, and goes when one connects", () => {
  const store = renderJoin(null);
  // Before the target has answered nothing is known, and nothing is said.
  expect(document.getElementById("join-status")).not.toBeVisible();
  act(() => store.patch({ rendezvous: "room", nodes: [{ id: "m-1", host: "mac", connected: false }] }));
  const line = document.getElementById("join-status")!;
  expect(line).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(/Ninguna máquina conectada a la sala/);
  expect(line.dataset.state).toBe("note");
  expect(line.querySelector(".join-status-dot")).toBeNull();   // a standing note, not a step in progress

  // A join that found no machine says it as an alert; a machine connecting takes both away.
  act(() => store.patch({ joinFailure: "Ninguna máquina conectada a la sala." }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  act(() => store.patch({ joinFailure: "", nodes: [{ id: "m-1", host: "mac", connected: true }], node: "m-1" }));
  expect(line).not.toBeVisible();
});

test("a room from before this version, or a node, never reads as a room without machines", () => {
  const store = renderJoin(null);
  act(() => store.patch({ rendezvous: "legacy" }));
  expect(document.getElementById("join-status")).not.toBeVisible();
  act(() => store.patch({ rendezvous: "node", node: "m-1" }));
  expect(document.getElementById("join-status")).not.toBeVisible();
});

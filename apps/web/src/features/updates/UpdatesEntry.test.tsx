import { afterEach, expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { UpdatesEntry } from "./UpdatesEntry";
import { updateLater, useUpdates } from "./useUpdates";

afterEach(() => localStorage.removeItem("sidevoice.updates-later"));

/* The updates waiting: none, nothing shown; a newer build of the page held during a call, one entry; put off, gone. */

function Items() {
  const { items, inCall } = useUpdates();
  return <p data-testid="items">{items.map((item) => item.id).join(",")}|{String(inCall)}</p>;
}

test("nothing waits: no entry; a newer build held in a call is one, and Later puts it off", () => {
  const store = createRoomStore();
  render(<RoomProvider store={store}><UpdatesEntry /><Items /></RoomProvider>);
  expect(screen.queryByRole("button", { name: /^Updates/ })).toBeNull();
  act(() => store.patch({ ws: {}, webUpdate: "b2" } as never));
  expect(screen.getByRole("button", { name: "Updates, 1 waiting" })).toBeInTheDocument();
  expect(screen.getByTestId("items")).toHaveTextContent("web|true");
  act(() => updateLater({ id: "web", kind: "web", version: "b2", required: false }));
  expect(screen.queryByRole("button", { name: /^Updates/ })).toBeNull();
  // A newer version than the one put off comes back.
  act(() => store.patch({ webUpdate: "b3" } as never));
  expect(screen.getByTestId("items")).toHaveTextContent("web|true");
});

/** This computer with an update for its Sidevoice, as the desktop app's bridge says it. */
function withMachineUpdate() {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null,
    version: async () => ({ update: "available", bundled: { version: "0.9.0" } }), update: async () => undefined,
  } } } });
}
const local = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1, revoked: false };

test("this computer's update opens This device where it has a section of its own, else its page under Machines", async () => {
  withMachineUpdate();
  for (const app of [true, false]) {
    const store = createRoomStore();
    act(() => store.patch({ inApp: app, localHostAvailable: true, localHostStatus: { state: "running" }, pairings: [local], machinesReady: true } as never));
    const { unmount } = render(<RoomProvider store={store}><UpdatesEntry /></RoomProvider>);
    const entry = await screen.findByRole("button", { name: "Updates, 1 waiting" });
    await act(async () => { entry.click(); });
    await act(async () => { screen.getByRole("button", { name: app ? "Open This device" : "Open This computer in Machines" }).click(); });
    const facts = store.getState().facts;
    expect([facts.settingsSection, facts.settingsLevel]).toEqual([app ? "this-computer" : "machines", "page"]);
    if (!app) expect(facts.machinesView.machine).toBe(store.getState().machines.find((machine) => machine.local)?.id);
    unmount();
  }
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

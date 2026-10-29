import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { resetUpdateSeen } from "./update-mark";
import { GearNewMark } from "../highlights/highlights";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  resetUpdateSeen();
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* The Updates entry in Settings' navigation wears the update's mark while the app has an update the room's notice says
 * (manual: available; either mode: ready) and the person has not seen Updates for that version. */

function open(updater: Parameters<typeof fakeUpdater>[0]) {
  const fake = fakeUpdater(updater);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater } } });
  window.sidevoiceActions = { openPairing: vi.fn(), loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ machinesReady: true, inApp: true, settingsSection: "general" } as never); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  const dialog = document.getElementById("language-settings")!;
  return { store, fake, dialog };
}
const entry = () => document.getElementById("settings-updates")!;
const marked = () => !!entry().querySelector(".new-on-icon-dot") && /update available/.test(entry().textContent ?? "");
const settle = () => act(async () => {});

test("the Updates entry is marked while the app's update waits, unseen; seeing Updates clears it for that version", async () => {
  const { store, fake, dialog } = open({ status: { state: "available", version: "0.4.0" }, mode: "manual" });
  await settle();
  expect(marked()).toBe(true);
  // Open but on another section: still unseen.
  act(() => { dialog.setAttribute("open", ""); });
  await settle();
  expect(marked()).toBe(true);
  act(() => { store.patch({ settingsSection: "updates" } as never); });
  await settle();
  expect(marked()).toBe(false);
  // A newer version marks again.
  act(() => { store.patch({ settingsSection: "general" } as never); fake.push({ state: "available", version: "0.5.0" }); });
  await settle();
  expect(marked()).toBe(true);
});

test("a closed Settings does not see Updates, and no update means no mark", async () => {
  const { store } = open({ status: { state: "available", version: "0.4.0" }, mode: "manual" });
  act(() => { store.patch({ settingsSection: "updates" } as never); });
  await settle();
  expect(marked()).toBe(true);
  cleanup();
  const none = open({ status: { state: "idle" } });
  await settle();
  expect(none.dialog.querySelector(".new-on-icon-dot")).toBeNull();
});

test("an update gone (installed) takes the mark with it", async () => {
  const { fake } = open({ status: { state: "ready", version: "0.4.0" } });
  await settle();
  expect(marked()).toBe(true);
  act(() => { fake.push({ state: "idle" }); });
  await settle();
  expect(marked()).toBe(false);
});

test("the gear wears the update's dot after attention and a count", () => {
  const mark = (props: { count: number; attention?: boolean; update?: boolean }) => { const view = render(<GearNewMark {...props} />); const found = view.container.querySelector("[data-mark]")?.getAttribute("data-mark") ?? null; view.unmount(); return found; };
  expect(mark({ count: 0, update: true })).toBe("update");
  expect(mark({ count: 2, update: true })).toBe("count");
  expect(mark({ count: 0, attention: true, update: true })).toBe("attention");
  expect(mark({ count: 0 })).toBeNull();
});

test("an update without a version is acknowledged only while it lasts: the next one without a version marks again", async () => {
  const { store, fake, dialog } = open({ status: { state: "ready" } });
  act(() => { dialog.setAttribute("open", ""); });
  await settle();
  expect(marked()).toBe(true);
  act(() => { store.patch({ settingsSection: "updates" } as never); });
  await settle();
  expect(marked()).toBe(false);
  expect(localStorage.getItem("sidevoice.updateSeen")).toBeNull();
  // It is installed, and a later one arrives, also unidentified.
  act(() => { store.patch({ settingsSection: "general" } as never); fake.push({ state: "idle" }); });
  await settle();
  act(() => { fake.push({ state: "ready" }); });
  await settle();
  expect(marked()).toBe(true);
});

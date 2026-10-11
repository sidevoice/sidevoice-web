import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { VARIANTS_KEY } from "../../lib/variants";
import { createRoomStore } from "../../state/room-store";
import { ConversationSidebar } from "./ConversationSidebar";
import { RoomHeader } from "./RoomHeader";

vi.mock("../../services/room-session-controller.js", () => ({}));

const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, machine: { host: "Laptop", id: "m1" }, harness: "claude", ...extra });

function room() {
  const store = createRoomStore();
  act(() => store.patch({
    machinesReady: true, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    pairingInUse: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
    people: [person("t-login", "Fix the slow login"), person("t-backup", "Review the nightly backups"), person("t-pay", "Migrate the payments API", { harness: "codex" })],
    harness: { "t-pay": true },
  }));
  render(<RoomProvider store={store}><RoomHeader /><main><ConversationSidebar /></main></RoomProvider>);
  return store;
}
const header = () => document.querySelector(".room-header")!;

let selectParticipant: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  selectParticipant = vi.fn();
  window.sidevoiceActions = { selectParticipant } as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; localStorage.clear(); });

test("a phone header's avatars sit where the preview's variant says, after the mark unless it says otherwise", () => {
  room();
  expect(header()).toHaveAttribute("data-avatars", "left");
  // The preview's panel writes the choice from another document: this one hears it as a storage event.
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "header-avatars": "centre" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(header()).toHaveAttribute("data-avatars", "centre");
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "header-avatars": "right" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(header()).toHaveAttribute("data-avatars", "right");
  // A value it does not know is the default.
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "header-avatars": "top" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(header()).toHaveAttribute("data-avatars", "left");
});

test("while the list is down the header stays above it, and an avatar there switches the call and puts the list away", async () => {
  room();
  const sidebar = document.getElementById("conversations")!;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (3)" })); });
  expect(sidebar).toHaveAttribute("data-open");
  expect(header()).toHaveAttribute("data-list-down");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review the nightly backups · Waiting for you" })); });
  expect(selectParticipant).toHaveBeenCalledWith("t-backup");
  expect(sidebar).not.toHaveAttribute("data-open");
  expect(header()).not.toHaveAttribute("data-list-down");
});

test("a row says its state in words beside its dot, and what is unread as a badge of its own", () => {
  const store = room();
  const reply = (segment: string, seq: number) => ({ segment, thread: "t-backup", role: "assistant" as const, text: segment, name: "x", time: seq, session: "s1", seq });
  act(() => store.patch({ history: [reply("r-1", 1), reply("r-2", 2)], roomSeen: {} }));
  const row = [...document.querySelectorAll(".conversation-sidebar .person")].find((button) => button.textContent?.includes("Review the nightly backups"))!;
  expect(row.querySelector(".state-dot")).toHaveAttribute("data-state", "waiting");
  expect(row.querySelector(".sidebar-state-text")).toHaveTextContent(/^Waiting for you$/);
  expect(row.querySelector(".sidebar-unread")).toHaveTextContent("2 new");
  // The tooltip still says both.
  expect(row.getAttribute("title")).toMatch(/^Review the nightly backups · Waiting for you · 2 new/);
});

test("Settings sits at the conversations' foot: it opens Settings through the header's own button, and a new conversation follows the list", () => {
  room();
  const opened = vi.fn();
  document.getElementById("settings-open")!.onclick = opened;
  fireEvent.click(document.querySelector(".sidebar-foot .sidebar-settings")!);
  expect(opened).toHaveBeenCalledOnce();
  expect(document.querySelector(".sidebar-body .sidebar-new")).toHaveTextContent("New conversation");
  expect(document.querySelectorAll("#settings-open")).toHaveLength(1);
});

test("the chevron after the header's avatars drops the conversations and puts them away again, turning with them", () => {
  room();
  const chevron = document.querySelector<HTMLButtonElement>(".header-conversations .conversations-toggle")!;
  expect(chevron).toHaveAttribute("aria-expanded", "false");
  expect(chevron).toHaveAttribute("aria-controls", "conversations");
  act(() => { fireEvent.click(chevron); });
  expect(chevron).toHaveAttribute("aria-expanded", "true");
  act(() => { fireEvent.click(chevron); });
  expect(chevron).toHaveAttribute("aria-expanded", "false");
  // No handle to drag, and Settings at the list's foot, not in the header.
  expect(document.querySelector(".conversations-grab")).toBeNull();
  expect(document.querySelector("#conversations .sidebar-foot .sidebar-settings")).toBeInTheDocument();
});

test("a phone may hide the brand (VARIANTS phone-brand), and the page keeps its heading", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "phone-brand": "hidden" }));
  room();
  expect(header()).toHaveAttribute("data-brand", "hidden");
  expect(screen.getByRole("heading", { level: 1, name: "Sidevoice" })).toBeInTheDocument();
});

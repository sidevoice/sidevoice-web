import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import { NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, SIDEBAR_COLLAPSED_KEY } from "../../state/call-layout";
import { OPEN_CONVERSATIONS } from "../room/ConversationSidebar";
import type { SessionFacts } from "../../state/room-session-state.js";
import { markSetUp } from "../../test/onboarding";

vi.mock("../../services/room-session-controller.js", () => ({}));

const REPLY = "Okay. I'll start with the login and then look at the cart tests. I'll tell you as soon as I have something.";
const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, machine: { host: "Laptop", id: "m1" }, harness: "claude", ...extra });

function room(extra: Partial<SessionFacts> = {}) {
  const store = createRoomStore();
  act(() => store.patch({
    machinesReady: true, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    pairingInUse: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
    people: [
      person("t-login", "Fix the slow login"),
      person("t-pay", "Migrate the payments API", { harness: "codex" }),
      person("t-backup", "Review the nightly backups", { machine: { host: "Home server", id: "m2" } }),
      person("t-week", "Plan the week", { available: false, reach: { state: "offline" }, machine: { host: "Home server", id: "m2" } }),
    ],
    harness: { "t-pay": true },
    history: [{ segment: "h-2", thread: "t-login", role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" }],
    ...extra,
  }));
  render(<App store={store} />);
  return store;
}
const patch = (store: RoomStore, facts: Partial<SessionFacts>) => act(() => store.patch(facts));
const stageAgent = () => document.querySelector(".stage-agent")!;
const rowOf = (title: string) => [...document.querySelectorAll(".conversation-sidebar .person")].find((button) => button.textContent?.includes(title))!;

let selectParticipant: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  markSetUp();
  selectParticipant = vi.fn();
  window.sidevoiceActions = { selectParticipant, cancelInput: vi.fn().mockResolvedValue(undefined), closeParticipant: vi.fn() } as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

/** A window of a given kind: a phone, or a desktop too narrow for the open sidebar beside the docked transcript. */
function viewport({ narrow = false, crowded = false }) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: (media === NARROW_QUERY && narrow) || (media === RAIL_WITH_TRANSCRIPT_QUERY && (narrow || crowded)), onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
const escape = () => act(() => { fireEvent.keyDown(document, { key: "Escape" }); });

test("the stage plays what the agent says as a karaoke bubble, the chunk before dim above it", () => {
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 57, to: 57 } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "speaking");
  expect(stageAgent()).toHaveAttribute("data-mood", "speaking");
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "speaking");
  const bubble = document.querySelector(".stage-bubble")!;
  expect(bubble).toHaveAttribute("data-visible");
  expect(bubble.querySelector(".stage-bubble-previous")?.textContent).toBe("…I'll start with the login and");
  expect(bubble.querySelector(".karaoke-played")?.textContent).toBe("then look at the cart");
  expect(bubble.querySelector(".karaoke-upcoming")?.textContent).toBe(" tests.");
  // Each spoken word is a beat of the mouth, "a" and "b" in turn.
  expect(stageAgent().getAttribute("data-beat")).toMatch(/^[ab]$/);
  expect(stageAgent()).toHaveAccessibleName("Fix the slow login · Speaking");

  // Between turns the bubble goes, and what the agent is doing stands in its place.
  patch(store, { botLive: false, karaokeState: null, harness: { "t-login": true } });
  expect(document.querySelector(".stage-bubble")).not.toHaveAttribute("data-visible");
  expect(document.querySelector(".stage-activity")).toHaveTextContent("Working…");
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "working");
  // It works at the desk that slid in, a tool in hand, the cogs turning.
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "working");
  expect(document.querySelector(".stage-desk svg.desk")).toBeInTheDocument();
  expect(stageAgent()).toHaveAttribute("data-desk");
  expect(stageAgent().getAttribute("data-work")).toMatch(/^(crank|hammer|read|type)$/);
  expect(stageAgent().querySelector(".cogs")).toBeInTheDocument();
  expect(stageAgent()).not.toHaveAttribute("data-idle");

  // With nothing to do and its turn over, it rests: waiting for you is idle now.
  patch(store, { harness: { "t-login": false } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
  expect(stageAgent()).not.toHaveAttribute("data-work");
  expect(stageAgent()).not.toHaveAttribute("data-desk");
  // Resting goes in steps, quiet first, then its pastimes.
  expect(stageAgent()).toHaveAttribute("data-idle", "quiet");
  expect(document.querySelector(".stage-activity")).toBeNull();

  // Out of the call the agent is idle.
  patch(store, { ws: null });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
});

test("the person has no picture on the stage, only a bubble of their own while they speak", async () => {
  const store = room();
  expect(document.querySelector(".stage-pip")).toBeNull();
  expect(document.querySelector(".person-bubble")).toBeNull();
  patch(store, { userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "t-login" }, pendingPhase: "listening", pendingUserText: "Split it into two commits." });
  expect(document.querySelector(".person-bubble")).toHaveTextContent("Split it into two commits.");
  // The agent listens to the person meanwhile, and goes on listening while it is transcribed.
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "listening");
  expect(stageAgent()).toHaveAttribute("data-mood", "listening");
  patch(store, { userLive: false, pendingPhase: "transcribing" });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "listening");
  // The transcript's live draft has the same button: this is the stage's.
  const stage = document.querySelector<HTMLElement>(".call-stage")!;
  await act(async () => { within(stage).getByRole("button", { name: "Cancel sending" }).click(); });
  expect(window.sidevoiceActions?.cancelInput).toHaveBeenCalledOnce();
});

test("state dots and small avatars follow each conversation's state, grouped by machine", () => {
  room();
  const dot = (title: string) => rowOf(title).querySelector(".state-dot")!.getAttribute("data-state");
  const mood = (title: string) => rowOf(title).querySelector(".sv-avatar")!.getAttribute("data-avatar-state");
  // The dot says whether it hears you; the bicho is offline, working or resting.
  expect([dot("Fix the slow login"), mood("Fix the slow login")]).toEqual(["in-call", "idle"]);
  expect([dot("Migrate the payments API"), mood("Migrate the payments API")]).toEqual(["working", "working"]);
  expect([dot("Review the nightly backups"), mood("Review the nightly backups")]).toEqual(["waiting", "idle"]);
  expect([dot("Plan the week"), mood("Plan the week")]).toEqual(["idle", "offline"]);
  expect(rowOf("Plan the week").querySelector(".sv-avatar")).toHaveAttribute("data-offline");
  // Offline sleeps: no pastimes. A resting one goes in steps.
  expect(rowOf("Plan the week").querySelector(".sv-avatar")).not.toHaveAttribute("data-idle");
  expect(rowOf("Review the nightly backups").querySelector(".sv-avatar")).toHaveAttribute("data-idle", "quiet");
  expect(rowOf("Plan the week").querySelector(".sv-avatar")).toHaveAttribute("data-size", "sidebar");
  expect([...document.querySelectorAll(".sidebar-group-label")].map((label) => label.textContent)).toEqual(["Laptop", "Home server"]);
  expect(rowOf("Migrate the payments API")).toHaveTextContent("Working");
  expect(rowOf("Plan the week")).toHaveTextContent("Offline");
});

test("an offline conversation on the stage is a wanted poster, in the interface's language", () => {
  const store = room({ viewedThread: "t-week" });
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "offline");
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "offline");
  expect(stageAgent()).toHaveAttribute("data-mood", "idle");
  expect(stageAgent()).toHaveAccessibleName("Plan the week · Offline");
  const poster = document.querySelector(".wanted")!;
  expect(poster).toHaveAttribute("aria-hidden", "true");
  expect(poster).toHaveTextContent("WANTED");
  expect(poster).toHaveTextContent("ONLINE OR PAUSED");
  expect(poster).toHaveTextContent("IF SEEN, PLEASE TELL ITS HUMAN.");
  expect(poster.querySelector(".w-bounty")?.textContent).toMatch(/^\d{3},000,000-$/);
  // Its portrait is the same bicho, laughing.
  expect(poster.querySelector(".w-photo .sv-avatar")).toHaveAttribute("data-mood", "speaking");
  expect(document.querySelector(".stage-desk")).toBeInTheDocument();
  // Back within reach, the poster goes.
  patch(store, { viewedThread: "t-login" });
  expect(document.querySelector(".wanted")).toBeNull();
});

test("the poster speaks Spanish on a device set to it", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  room({ viewedThread: "t-week" });
  expect(document.querySelector(".wanted")).toHaveTextContent("VIVO O EN PAUSA");
  expect(document.querySelector(".wanted .w-bounty")?.textContent).toMatch(/^\d{3}\.000\.000-$/);
  expect(stageAgent()).toHaveAccessibleName("Plan the week · Desconectada");
});

test("a conversation that is holding does not react to the person talking", () => {
  room({
    people: [person("t-login", "Fix the slow login", { reach: { state: "holding" } })],
    userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "t-login" }, pendingPhase: "listening",
  });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
});

test("replies this browser has not seen put the unread cue on that conversation's avatar", () => {
  room({ history: [
    { segment: "h-2", thread: "t-login", role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" },
    { segment: "p-1", thread: "t-backup", role: "assistant", text: "The backups ran.", name: "Review the nightly backups", time: 2, session: "s1", seq: 4 },
  ] });
  expect(rowOf("Review the nightly backups").querySelector(".sv-avatar")).toHaveAttribute("data-unread");
  expect(rowOf("Migrate the payments API").querySelector(".sv-avatar")).not.toHaveAttribute("data-unread");
});

test("a phone's header avatars switch the call at a tap, and the chevron brings the whole list down", async () => {
  viewport({ narrow: true });
  room();
  const others = [...document.querySelectorAll(".header-avatar")];
  // From the left as many as fit (three on this phone): the one waiting for you, the one working, then the rest; none
  // left over, so the chevron counts none.
  expect(others.map((button) => button.getAttribute("aria-label")?.split(" · ")[0])).toEqual([
    "Review the nightly backups", "Migrate the payments API", expect.any(String),
  ]);
  expect(others[1].getAttribute("aria-label")).toBe("Migrate the payments API · Working");
  expect(document.querySelector(".conversations-rest")).toBeNull();
  const sidebar = document.getElementById("conversations")!;
  // A tap on one moves the call to it, without the list.
  await act(async () => { fireEvent.click(others[0]); });
  expect(selectParticipant).toHaveBeenCalledWith("t-backup");
  expect(sidebar).not.toHaveAttribute("data-open");
  // The whole list comes down from the chevron after them; picking one there switches too.
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (4)" })); });
  expect(sidebar).toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(rowOf("Migrate the payments API")); });
  expect(selectParticipant).toHaveBeenLastCalledWith("t-pay");
  expect(sidebar).not.toHaveAttribute("data-open");

  // The close button, a tap outside and Escape put it away too.
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (4)" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close conversations" })); });
  expect(sidebar).not.toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (4)" })); });
  await act(async () => { fireEvent.click(document.querySelector(".conversations-scrim")!); });
  expect(sidebar).not.toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (4)" })); });
  await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
  expect(sidebar).not.toHaveAttribute("data-open");
});

test("the transcript opens and closes from the call bar, and is inert while closed", async () => {
  room();
  const transcript = document.getElementById("transcript")!;
  expect(transcript).not.toHaveAttribute("data-open");
  expect(transcript).toHaveAttribute("inert");
  // The runtime binds the text box by id, so it is there even while the panel is closed.
  expect(document.getElementById("text-composer")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  expect(transcript).toHaveAttribute("data-open");
  expect(transcript).not.toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "Hide transcript" })).toHaveAttribute("aria-expanded", "true");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close transcript" })); });
  expect(transcript).not.toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
  expect(transcript).not.toHaveAttribute("data-open");
});

test("the desktop sidebar collapses to a rail and expands, and a reload keeps the choice", async () => {
  const { unmount } = (() => { const store = createRoomStore(); return render(<App store={store} />); })();
  const sidebar = () => document.getElementById("conversations")!;
  expect(sidebar()).not.toHaveAttribute("data-collapsed");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Collapse conversations" })); });
  expect(sidebar()).toHaveAttribute("data-collapsed");
  expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
  unmount();
  render(<App store={createRoomStore()} />);
  expect(sidebar()).toHaveAttribute("data-collapsed");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Expand conversations" })); });
  expect(sidebar()).not.toHaveAttribute("data-collapsed");
  expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
});

test("the header holds Settings, and the call bar's ⋯ the statistics, under the runtime's ids", async () => {
  room();
  expect(document.querySelector(".room-header #settings-open")).toHaveAccessibleName("Settings");
  expect(document.querySelector(".call-bar #call-menu #stats-open")).toHaveTextContent("Connection statistics");
  expect(document.querySelector(".room-header #call-menu")).toBeNull();
});

test("out of a call the room's binding is not a call: no conversation is in call", () => {
  const store = room({ ws: null, sessionId: null });
  expect(rowOf("Fix the slow login").querySelector(".state-dot")).toHaveAttribute("data-state", "waiting");
  expect(rowOf("Fix the slow login")).toHaveTextContent("Waiting for you");
  patch(store, { ws: {}, sessionId: "s1" });
  expect(rowOf("Fix the slow login").querySelector(".state-dot")).toHaveAttribute("data-state", "in-call");
});

test("the transcript opens on its latest message, whatever arrived while it was closed", async () => {
  const lines = Array.from({ length: 30 }, (_, index) => ({ segment: "m-" + index, thread: "t-login", role: index % 2 ? "assistant" as const : "user" as const,
    text: "Line " + index, name: "x", time: index + 1, session: "s1", audio: "heard" }));
  const store = room({ history: lines.slice(0, 5) });
  patch(store, { history: lines });
  const scrolls = vi.spyOn(HTMLElement.prototype, "scrollTo");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  expect(scrolls.mock.contexts).toContain(document.getElementById("messages"));
});

test("two machines with the same name, or none, are two groups, each with its own conversations", () => {
  const errors = vi.spyOn(console, "error");
  room({ people: [
    person("t-a", "On the laptop"), person("t-b", "On the other laptop", { machine: { host: "Laptop", id: "m3" } }),
    person("t-c", "Nameless one", { machine: { host: null, id: "m4" } }), person("t-d", "Nameless two", { machine: { host: null, id: "m5" } }),
  ], roomBinding: { thread_id: "t-a", title: "On the laptop", binding_id: "b" } });
  const groups = [...document.querySelectorAll(".sidebar-group")].map((group) => [group.querySelector(".sidebar-group-label")?.textContent,
    [...group.querySelectorAll(".person-name")].map((name) => name.textContent)]);
  expect(groups).toEqual([["Laptop", ["On the laptop"]], ["Laptop", ["On the other laptop"]], ["Unknown machine", ["Nameless one"]], ["Unknown machine", ["Nameless two"]]]);
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
});

test("the bubble lights whole words, and its tooltip speaks the interface's language", () => {
  room({ botLive: true, karaokeState: { segment: "h-2", from: 42, to: 42 } });
  // What was heard ends inside "look": the word lights whole.
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("then look");
  expect(document.querySelector(".stage-bubble .karaoke-text")).toHaveAttribute("title", "Playing this reply");
});

test("a whole sentence sounding is read clause by clause at a speaking pace, never past its end", () => {
  vi.useFakeTimers();
  // The voice's chunk is the reply's first sentence and a half: "Okay. I'll start with the login".
  room({ botLive: true, karaokeState: { segment: "h-2", from: 0, to: 31 } });
  // The sentence has just started: its first clause is up, nothing lit yet.
  expect(document.querySelector(".stage-bubble .stage-bubble-previous")).toBeNull();
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("");
  act(() => { vi.advanceTimersByTime(1000); });
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent?.length).toBeGreaterThan(0);
  // Long after the voice would have got there, the bubble waits at the end of the part sounding.
  act(() => { vi.advanceTimersByTime(20000); });
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("Okay. I'll start with the login");
  expect(document.querySelector(".stage-bubble .karaoke-upcoming")?.textContent).toBe(" and");
});

test("without a cue from the voice, the bubble reads on at a speaking pace instead of staying dim", () => {
  vi.useFakeTimers();
  room({ botLive: true, karaokeState: null });
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("");
  act(() => { vi.advanceTimersByTime(3000); });
  expect(document.querySelector(".stage-bubble .stage-bubble-previous")).toHaveTextContent("…I'll start with the login and");
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("then look");
});

test("Escape closes only the topmost: a dialog, a menu or a handler above the transcript answers it first", async () => {
  room();
  const transcript = document.getElementById("transcript")!;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  escape();
  expect(transcript).toHaveAttribute("data-open");
  dialog.remove();
  const menu = document.getElementById("call-menu") as HTMLDetailsElement;
  menu.open = true;
  escape();
  expect(transcript).toHaveAttribute("data-open");
  menu.open = false;
  const handled = (event: KeyboardEvent) => event.preventDefault();
  window.addEventListener("keydown", handled, true);
  escape();
  expect(transcript).toHaveAttribute("data-open");
  window.removeEventListener("keydown", handled, true);
  escape();
  expect(transcript).not.toHaveAttribute("data-open");
});

test("on a phone the conversations panel is a dialog: focus goes in, and back to what opened it", async () => {
  viewport({ narrow: true });
  room();
  const sidebar = document.getElementById("conversations")!;
  const pill = screen.getByRole("button", { name: "All conversations (4)" });
  expect(sidebar).not.toHaveAttribute("role");
  pill.focus();
  await act(async () => { fireEvent.click(pill); });
  expect(sidebar).toHaveAttribute("role", "dialog");
  expect(sidebar).toHaveAttribute("aria-modal", "true");
  expect(document.activeElement).toBe(rowOf("Fix the slow login"));
  escape();
  expect(sidebar).not.toHaveAttribute("data-open");
  expect(sidebar).not.toHaveAttribute("role");
  expect(document.activeElement).toBe(pill);
  // Picking a conversation gives focus back too.
  await act(async () => { fireEvent.click(pill); });
  await act(async () => { fireEvent.click(rowOf("Review the nightly backups")); });
  expect(selectParticipant).toHaveBeenCalledWith("t-backup");
  expect(document.activeElement).toBe(pill);
});

test("on a phone the transcript is a dialog too, and gives focus back to its button", async () => {
  viewport({ narrow: true });
  room();
  const transcript = document.getElementById("transcript")!;
  const toggle = screen.getByRole("button", { name: /^Show transcript/ });
  toggle.focus();
  await act(async () => { fireEvent.click(toggle); });
  expect(transcript).toHaveAttribute("role", "dialog");
  expect(transcript).toHaveAttribute("aria-modal", "true");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close transcript" }));
  escape();
  expect(transcript).not.toHaveAttribute("data-open");
  expect(document.activeElement).toBe(toggle);
});

test("a desktop too narrow for both shows the rail while the transcript is docked, and opening it makes room", async () => {
  viewport({ crowded: true });
  room();
  const sidebar = document.getElementById("conversations")!;
  expect(sidebar).not.toHaveAttribute("data-collapsed");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  expect(sidebar).toHaveAttribute("data-collapsed");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Expand conversations" })); });
  expect(sidebar).not.toHaveAttribute("data-collapsed");
  expect(document.getElementById("transcript")).not.toHaveAttribute("data-open");
  // The person's own choice was not touched.
  expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
});

test("the phone sheet keeps Tab inside, and steps aside for a dialog opened over it", async () => {
  viewport({ narrow: true });
  // jsdom lays nothing out; here every control counts as on screen.
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as unknown as DOMRectList);
  room();
  const toggle = screen.getByRole("button", { name: /^Show transcript/ });
  toggle.focus();
  await act(async () => { fireEvent.click(toggle); });
  // In the room the runtime enables the text box, the sheet's last stop: from its first, Shift+Tab wraps to it.
  const box = document.getElementById("text-message") as HTMLTextAreaElement;
  box.disabled = false;
  const close = screen.getByRole("button", { name: "Close transcript" });
  expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(box);
  // The runtime opens its pairing dialog over the sheet: Tab is the dialog's now.
  const dialog = document.createElement("dialog");
  const inside = document.createElement("button");
  dialog.setAttribute("open", "");
  dialog.append(inside);
  document.body.append(dialog);
  inside.focus();
  expect(fireEvent.keyDown(inside, { key: "Tab" })).toBe(true);
  expect(document.activeElement).toBe(inside);
  dialog.remove();
});

test("on a phone the runtime's call to open the list puts the transcript away: one dialog at a time", async () => {
  viewport({ narrow: true });
  room();
  const toggle = screen.getByRole("button", { name: /^Show transcript/ });
  toggle.focus();
  await act(async () => { fireEvent.click(toggle); });
  await act(async () => { window.dispatchEvent(new Event(OPEN_CONVERSATIONS)); });
  const panel = document.getElementById("conversations")!;
  expect(panel).toHaveAttribute("data-open");
  expect(document.getElementById("transcript")).not.toHaveAttribute("data-open");
  expect(panel.contains(document.activeElement)).toBe(true);
});

test("the header menu gives focus back to its button however it closes, unless a dialog took it", async () => {
  room();
  const menu = document.getElementById("call-menu") as HTMLDetailsElement;
  const button = menu.querySelector("summary")!;
  menu.open = true;
  document.getElementById("stats-open")!.focus();
  menu.open = false;
  await waitFor(() => expect(document.activeElement).toBe(button));
});

test("exactly one way into the transcript, the button in the tile, on a phone and a desktop, with or without a conversation on the stage", () => {
  for (const narrow of [false, true]) for (const binding of [{ thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" }, null]) {
    viewport({ narrow });
    room({ roomBinding: binding });
    const ways = document.querySelectorAll("#transcript-toggle");
    expect([narrow, !!binding, ways.length]).toEqual([narrow, !!binding, 1]);
    expect(ways[0].closest(".stage-tile")).not.toBeNull();
    cleanup();
    vi.restoreAllMocks();
  }
});

test("the transcript button wears a dot for what arrives while it is closed; opening it reads them", async () => {
  const store = room();
  const button = document.getElementById("transcript-toggle")!;
  expect(button).toHaveAccessibleName("Show transcript");
  expect(button.querySelector(".transcript-entry-dot")).toBeNull();
  patch(store, { history: [...store.getState().facts.history,
    { segment: "h-3", thread: "t-login", role: "assistant", text: "Shall I also add a retry?", name: "Fix the slow login", time: 2, session: "s1" }] });
  expect(button).toHaveAccessibleName("Show transcript, 1 unread");
  expect(button.querySelector(".transcript-entry-dot")).not.toBeNull();
  await act(async () => { fireEvent.click(button); });
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAccessibleName("Show transcript");
});

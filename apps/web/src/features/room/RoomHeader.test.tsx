import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { NARROW_QUERY } from "../../state/call-layout";
import { headerRowWidth } from "../../test/header-row";
import { ConversationSidebar } from "./ConversationSidebar";
import { RoomHeader } from "./RoomHeader";

vi.mock("../../services/room-session-controller.js", () => ({}));

const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: "fp-1", machine: { host: "Laptop", id: "m1" }, harness: "claude", ...extra });

const PEOPLE = [person("t-login", "Fix the slow login"), person("t-backup", "Review the nightly backups"), person("t-pay", "Migrate the payments API", { harness: "codex" }),
  person("t-week", "Plan the week")];

function room(people = PEOPLE) {
  const store = createRoomStore();
  act(() => store.patch({
    machinesReady: true, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-1": { reach: "ok", via: "node" } }, callNode: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
    people, harness: { "fp-1|t-pay": true },
  }));
  render(<RoomProvider store={store}><RoomHeader /><main><ConversationSidebar /></main></RoomProvider>);
  return store;
}
const header = () => document.querySelector(".room-header")!;
const avatars = () => [...document.querySelectorAll<HTMLElement>(".room-header .header-avatar")];
const titles = () => avatars().map((avatar) => avatar.getAttribute("aria-label")!.split(" · ")[0]);
const chevron = () => document.querySelector<HTMLButtonElement>(".header-conversations .conversations-toggle");
const plus = () => document.querySelector<HTMLButtonElement>(".room-header .header-new")!;
/** A phone: its header's row of conversations, measured this wide. */
function phone(width: number) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === NARROW_QUERY, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  headerRowWidth(width);
}

let selectParticipant: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  selectParticipant = vi.fn();
  window.sidevoiceActions = { selectParticipant } as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; localStorage.clear(); vi.restoreAllMocks(); });

test("while the list is down the header stays above it, and an avatar there switches the call and puts the list away", async () => {
  headerRowWidth(190);
  room();
  const sidebar = document.getElementById("conversations")!;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "All conversations (4)" })); });
  expect(sidebar).toHaveAttribute("data-open");
  expect(header()).toHaveAttribute("data-list-down");
  await act(async () => { fireEvent.click(within(header() as HTMLElement).getByRole("button", { name: "Review the nightly backups · Waiting for you" })); });
  expect(selectParticipant).toHaveBeenCalledWith("fp-1|t-backup");
  expect(sidebar).not.toHaveAttribute("data-open");
  expect(header()).not.toHaveAttribute("data-list-down");
});

test("a row says its state in words beside its dot, and what is unread as a badge of its own", () => {
  const store = room();
  const reply = (segment: string, seq: number) => ({ segment, thread: "fp-1|t-backup", role: "assistant" as const, text: segment, name: "x", time: seq, session: "s1", seq });
  act(() => store.patch({ history: [reply("r-1", 1), reply("r-2", 2)], roomSeen: {} }));
  const row = [...document.querySelectorAll(".conversation-sidebar .person")].find((button) => button.textContent?.includes("Review the nightly backups"))!;
  expect(row.querySelector(".state-dot")).toHaveAttribute("data-state", "waiting");
  expect(row.querySelector(".sidebar-state-text")).toHaveTextContent(/^Waiting for you$/);
  expect(row.querySelector(".sidebar-unread")).toHaveTextContent("2 new");
  // The tooltip still says both.
  expect(row.getAttribute("title")).toMatch(/^Review the nightly backups · Waiting for you · 2 new/);
});
test("T06 a read but unheard conversation names its audio attention on phone and rail, then clears it", () => {
  phone(360);
  const store=room([person("t-login","Fix the slow login"),person("t-backup","Review the nightly backups",{unheard:{count:2}})]);
  const phoneButton=avatars().find(button=>button.getAttribute("data-thread")==="fp-1|t-backup")!;
  const railButton=[...document.querySelectorAll<HTMLButtonElement>(".conversation-sidebar .person")].find(button=>button.textContent?.includes("Review the nightly backups"))!;
  expect(phoneButton).toHaveAccessibleName(/2 unheard/);
  expect(railButton).toHaveAccessibleName(/2 unheard/);
  act(()=>fireEvent.click(document.querySelector(".sidebar-collapse")!));
  expect(document.querySelector("#conversations")).toHaveAttribute("data-collapsed");
  expect(railButton).toHaveAccessibleName(/2 unheard/);
  act(()=>store.patch({people:[person("t-login","Fix the slow login"),person("t-backup","Review the nightly backups",{unheard:{count:0}})]}));
  expect(phoneButton).not.toHaveAccessibleName(/unheard/);
  expect(railButton).not.toHaveAccessibleName(/unheard/);
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

test("an update waiting: nothing by the brand, nothing at the conversations' foot — Settings alone, named as ever (the room's notice is over the stage: UpdateNotice.test.tsx)", () => {
  const store = room();
  const foot = document.querySelector(".conversation-sidebar .sidebar-foot")!;
  const alone = () => {
    expect(within(document.querySelector<HTMLElement>(".sidebar-brand")!).queryByRole("button")).toBeNull();
    expect([...foot.children]).toHaveLength(1);
    expect(foot.firstElementChild).toHaveClass("sidebar-settings");
    expect(foot.firstElementChild).toHaveAccessibleName("Settings");
    expect(foot.firstElementChild).toHaveTextContent("Settings");
  };
  alone();
  act(() => store.patch({ webUpdate: "b2" } as never));
  alone();
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("a phone has no updates entry: none in the header, none in the dropped list, no dot on the chevron", async () => {
  phone(190);
  const store = room();
  act(() => store.patch({ webUpdate: "b2" } as never));
  expect(header().querySelector(".update-notice")).toBeNull();
  await act(async () => { fireEvent.click(chevron()!); });
  expect(document.getElementById("conversations")).toHaveAttribute("data-open");
  expect(document.querySelector(".update-notice")).toBeNull();
  expect(screen.queryByRole("button", { name: /Reload to update|^Updates, / })).toBeNull();
  expect(chevron()).not.toHaveAttribute("data-updates");
});

test("the chevron after the header's avatars drops the conversations and puts them away again, turning with them", () => {
  headerRowWidth(190);
  room();
  const chevron = document.querySelector<HTMLButtonElement>(".header-conversations .conversations-toggle")!;
  expect(chevron).toHaveAttribute("aria-expanded", "false");
  expect(chevron).toHaveAttribute("aria-controls", "conversations");
  act(() => { fireEvent.click(chevron); });
  expect(chevron).toHaveAttribute("aria-expanded", "true");
  act(() => { fireEvent.click(chevron); });
  expect(chevron).toHaveAttribute("aria-expanded", "false");
  // No handle to drag.
  expect(document.querySelector(".conversations-grab")).toBeNull();
});


/* A phone's header (PHONE-SETTINGS-SPEC part 2): as many avatars as fit, the one on the stage marked in place, "+", and
 * the chevron, always (2026-10-15), with how many are not in the row when some are not. */

test("a phone's row: the room's order with the one on the stage marked where it is, \"+\", and the chevron with no count while all of them fit", () => {
  phone(284);
  room();
  expect(titles()).toEqual(["Fix the slow login", "Review the nightly backups", "Migrate the payments API", "Plan the week"]);
  expect(avatars().map((avatar) => avatar.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
  expect(plus()).toHaveAccessibleName("New conversation");
  expect(plus()).toHaveAttribute("title", "New conversation");
  // Every conversation in the row: the chevron still there (the operator's decision; CHEVRON_ALWAYS), with no "+N".
  expect(chevron()).toHaveAccessibleName("All conversations (4)");
  expect(chevron()!.querySelector(".conversations-rest")).toBeNull();
});

test("the chevron when more exist than fit, with how many are behind it; one with something new there marks it, said in words", () => {
  phone(190);
  const store = room();
  expect(titles()).toEqual(["Fix the slow login", "Review the nightly backups"]);
  expect(chevron()).toHaveAccessibleName("All conversations (4)");
  expect(chevron()!.querySelector(".conversations-rest")).toHaveTextContent(/^\+2$/);
  expect(chevron()!.querySelector(".conversations-cue")).toBeNull();
  // A reply unread in one behind the chevron: its dot on it, and said.
  const reply = { segment: "r-1", thread: "fp-1|t-week", role: "assistant" as const, text: "Done", name: "x", time: 1, session: "s1", seq: 1 };
  act(() => store.patch({ history: [reply], roomSeen: {} }));
  expect(chevron()!.querySelector(".conversations-cue")).toHaveAttribute("data-cue", "unread");
  expect(chevron()).toHaveAccessibleName("All conversations (4), 1 hidden with something new");
});

test("nothing reorders the row: one that joins goes last, and one chosen from the sheet takes the last slot until another is", async () => {
  phone(190);
  const store = room();
  selectParticipant.mockImplementation((threadId: string) => store.patch({ viewedThread: threadId }));
  // A new conversation, listed by the room before the others: last in the row's order, behind the chevron.
  act(() => store.patch({ people: [person("t-new", "Answer the support ticket"), ...PEOPLE] }));
  expect(titles()).toEqual(["Fix the slow login", "Review the nightly backups"]);
  expect(chevron()!.querySelector(".conversations-rest")).toHaveTextContent(/^\+3$/);
  // Chosen from the sheet: in the row's last slot, marked, and focus on it there.
  await act(async () => { fireEvent.click(chevron()!); });
  const sheet = document.getElementById("conversations")!;
  await act(async () => { fireEvent.click([...sheet.querySelectorAll(".person")].find((row) => row.textContent?.includes("Plan the week"))!); });
  expect(titles()).toEqual(["Fix the slow login", "Plan the week"]);
  expect(avatars()[1]).toHaveAttribute("aria-pressed", "true");
  expect(document.activeElement).toBe(avatars()[1]);
  // An avatar in the row tapped: the row stays as it is, and so does the focus.
  avatars()[0].focus();
  await act(async () => { fireEvent.click(avatars()[0]); });
  expect(titles()).toEqual(["Fix the slow login", "Plan the week"]);
  expect(document.activeElement).toBe(avatars()[0]);
  // The one on the stage tapped: nothing.
  selectParticipant.mockClear();
  await act(async () => { fireEvent.click(avatars()[0]); });
  expect(selectParticipant).not.toHaveBeenCalled();
});

test("while the call switches an avatar stays focusable, its tooltip with it, and a tap does nothing", async () => {
  phone(284);
  const store = room();
  act(() => store.patch({ switching: true }));
  const other = avatars()[1];
  expect(other).not.toBeDisabled();
  expect(other).toHaveAttribute("aria-disabled", "true");
  await act(async () => { fireEvent.click(other); });
  expect(selectParticipant).not.toHaveBeenCalled();
});

test("the focused avatar's conversation leaves: focus on the one now in its place, else on \"+\"", () => {
  phone(284);
  const store = room();
  avatars()[3].focus();
  act(() => store.patch({ people: PEOPLE.slice(0, 3) }));
  expect(document.activeElement).toBe(plus());
  avatars()[1].focus();
  act(() => store.patch({ people: [PEOPLE[0], PEOPLE[2]] }));
  expect(document.activeElement).toBe(avatars()[1]);
  expect(titles()).toEqual(["Fix the slow login", "Migrate the payments API"]);
});

test("\"+\" opens what a new conversation needs, below it; with the list down, the list goes first", async () => {
  phone(190);
  room();
  await act(async () => { fireEvent.click(chevron()!); });
  expect(document.getElementById("conversations")).toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(plus()); });
  expect(document.getElementById("conversations")).not.toHaveAttribute("data-open");
  expect(plus()).toHaveAttribute("aria-expanded", "true");
  const panel = document.querySelector<HTMLElement>(".ui-popover")!;
  expect(within(panel).getByText("Tell your agent to connect")).toBeInTheDocument();
  expect(panel).toHaveAttribute("data-side", "bottom");
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import { COMPACT_QUERY, NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, SIDEBAR_COLLAPSED_KEY } from "../../state/call-layout";
import { OPEN_CONVERSATIONS } from "../room/ConversationSidebar";
import { WORKING_SHOWN_AFTER_MS, type SessionFacts } from "../../state/room-session-state.js";
import { markSetUp } from "../../test/onboarding";
import { headerRowWidth } from "../../test/header-row";
import { VARIANTS_KEY } from "../../lib/variants";
import { AGENT_LINGER_MS, SENT_LEAVING_MS } from "./speech-reading";
import { PAGE_MS } from "./PagedText";
import { ENTER_MS } from "../avatar/engine/styles/bichos";

vi.mock("../../services/room-session-controller.js", () => ({}));

/** The whole App rendered and taken through several steps: about a second on its own, and several times that with the
 *  rest of the suite on a busy machine — past vitest's five seconds (2026-10-11, load 25 on 8 cores). Only the tests
 *  seen to run that close get it. */
const WHOLE_APP_MS = 15_000;

const REPLY = "Okay. I'll start with the login and then look at the cart tests. I'll tell you as soon as I have something.";
// Each row comes from the machine it runs on (`node`); the page knows it by machine and thread ("fp-1|t-login").
const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: "fp-1", machine: { host: "Laptop", id: "m1" }, harness: "claude", ...extra });
/** The room's reply in the transcript, already played: no balloon over the agent. */
const played = { segment: "h-2", thread: "fp-1|t-login", role: "assistant" as const, text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "played" };
const pairing = (fp: string, host: string | null) => ({ fp, host, urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false });
/** These conversations busy for as long as Working waits before it shows (the runtime's start and clock facts). */
const lasted = (...keys: string[]) => ({ workingSince: Object.fromEntries(keys.map((key) => [key, 0])), now: WORKING_SHOWN_AFTER_MS });
const live = (...fps: string[]) => Object.fromEntries(fps.map((fp) => [fp, { reach: "ok" as const, via: "node" as const }]));

function room(extra: Partial<SessionFacts> = {}) {
  const store = createRoomStore();
  act(() => store.patch({
    machinesReady: true, pairings: [pairing("fp-1", "Laptop"), pairing("fp-2", "Home server")], machineLinks: live("fp-1", "fp-2"),
    callNode: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
    people: [
      person("t-login", "Fix the slow login"),
      person("t-pay", "Migrate the payments API", { harness: "codex" }),
      person("t-backup", "Review the nightly backups", { node: "fp-2", machine: { host: "Home server", id: "m2" } }),
      person("t-week", "Plan the week", { available: false, reach: { state: "offline" }, node: "fp-2", machine: { host: "Home server", id: "m2" } }),
    ],
    harness: { "fp-1|t-pay": true }, ...lasted("fp-1|t-pay"),
    history: [{ segment: "h-2", thread: "fp-1|t-login", role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" }],
    ...extra,
  }));
  render(<App store={store} />);
  return store;
}
const patch = (store: RoomStore, facts: Partial<SessionFacts>) => act(() => store.patch(facts));
const stageAgent = () => document.querySelector(".stage-agent")!;
/** The stage's "Working…" line over the agent: a status for assistive tech only (the sidebar shows it to the eye). */
const workingLine = () => document.querySelector<HTMLElement>(".stage-top > p[role='status']");
const rowOf = (title: string) => [...document.querySelectorAll(".conversation-sidebar .person")].find((button) => button.textContent?.includes(title))!;

let selectParticipant: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  markSetUp();
  selectParticipant = vi.fn();
  // The stage's model badges read the voice catalogue as they first show.
  window.sidevoiceActions = { selectParticipant, cancelInput: vi.fn().mockResolvedValue(undefined), closeParticipant: vi.fn(),
    loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined) } as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

/** A window of a given kind: a phone, a compact desktop window, or a desktop too narrow for the open sidebar beside the
 *  docked transcript. */
function viewport({ narrow = false, compact = false, crowded = false }) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: (media === NARROW_QUERY && narrow) || (media === COMPACT_QUERY && compact) || (media === RAIL_WITH_TRANSCRIPT_QUERY && (narrow || compact || crowded)),
    onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
const escape = () => act(() => { fireEvent.keyDown(document, { key: "Escape" }); });

test("the stage plays what the agent says as a karaoke bubble, the whole reply in pages that follow the voice", () => {
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 57, to: 57 } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "speaking");
  expect(stageAgent()).toHaveAttribute("data-mood", "speaking");
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "speaking");
  const bubble = document.querySelector(".stage-bubble")!;
  expect(bubble).toHaveAttribute("data-visible");
  expect(bubble).not.toHaveAttribute("data-leaving");
  // The whole reply, lit as far as it was heard, in a window of three lines (PagedText): no chunk, nothing dim above.
  expect(bubble.querySelector(".paged-text > .paged-text-run > .karaoke-text")).not.toBeNull();
  expect(bubble.querySelector(".karaoke-played")?.textContent).toBe("Okay. I'll start with the login and then look at the cart");
  expect(bubble.querySelector(".karaoke-upcoming")?.textContent).toBe(" tests. I'll tell you as soon as I have something.");
  expect(document.querySelectorAll(".stage-bubble")).toHaveLength(1);
  // Karaoke progress never makes the mouth move without a speaker level.
  expect(stageAgent()).toHaveAttribute("data-mouth", "playback");
  expect(stageAgent()).not.toHaveAttribute("data-beat");
  expect(stageAgent()).not.toHaveAttribute("data-mouth-active");
  const output = window.sidevoiceUI?.playbackLevel;
  act(() => output?.publish(0.8, "fp-1|t-login"));
  expect(stageAgent()).toHaveAttribute("data-mouth-active");
  act(() => output?.publish(0, "fp-1|t-login"));
  expect(stageAgent()).not.toHaveAttribute("data-mouth-active");
  expect(stageAgent()).toHaveAccessibleName("Fix the slow login · Speaking");

  // Its last words said, it stays a moment, whole; what the agent is doing stands under it.
  vi.useFakeTimers();
  patch(store, { botLive: false, karaokeState: null, harness: { "fp-1|t-login": true }, ...lasted("fp-1|t-login"),
    history: [{ ...store.getState().facts.history[0], audio: "played" }] } as Partial<SessionFacts>);
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe(REPLY);
  expect(document.querySelector(".stage-bubble")).not.toHaveAttribute("data-leaving");
  // The balloon is the decided look: its place is the stored one (centre by default), always three lines.
  expect(document.querySelector(".stage-bubble")).not.toHaveAttribute("data-lines");
  // Said to assistive tech only: no badge over the agent (the sidebar shows it).
  expect(workingLine()).toHaveClass("sr-only");
  expect(workingLine()).toHaveTextContent("Working…");
  expect(document.querySelector(".stage-activity")).toBeNull();
  // Under its balloon the agent holds still and shows as speaking: the work waits for the balloon to go.
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "speaking");
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "speaking");
  expect(document.querySelector(".stage-desk svg.desk")).toBeInTheDocument();
  // The balloon gone, it works at the desk that slid in, a tool in hand, the cogs turning.
  tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
  expect(document.querySelector(".stage-bubble")).toBeNull();
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "working");
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "working");
  expect(document.querySelector(".stage-desk svg.desk")).toBeInTheDocument();
  expect(stageAgent()).toHaveAttribute("data-desk");
  expect(stageAgent().getAttribute("data-work")).toMatch(/^(crank|hammer|read|type)$/);
  expect(stageAgent().querySelector(".cogs")).toBeInTheDocument();
  expect(stageAgent()).not.toHaveAttribute("data-idle");

  // With nothing to do and its turn over, it rests: waiting for you is idle now.
  patch(store, { harness: { "fp-1|t-login": false } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
  expect(stageAgent()).not.toHaveAttribute("data-work");
  expect(stageAgent()).not.toHaveAttribute("data-desk");
  // Resting goes in steps, quiet first, then its pastimes.
  expect(stageAgent()).toHaveAttribute("data-idle", "quiet");
  expect(workingLine()).toBeNull();

  // Out of the call the agent is idle.
  patch(store, { ws: null });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
}, WHOLE_APP_MS);

test("the person has no picture on the stage, only a bubble of their own while they speak", async () => {
  const store = room();
  expect(document.querySelector(".stage-pip")).toBeNull();
  expect(document.querySelector(".person-bubble")).toBeNull();
  patch(store, { userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "fp-1|t-login" }, pendingPhase: "listening", pendingUserText: "Split it into two commits." });
  // What they say is not on the stage while they say it: only the voice's bars (the transcript has the words).
  expect(document.querySelector(".person-bubble")).not.toHaveTextContent("Split it into two commits.");
  expect(document.querySelector(".person-bubble .voice-wave")).toHaveAttribute("data-phase", "listening");
  // The agent listens to the person meanwhile, and goes on listening while it is transcribed.
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "listening");
  expect(stageAgent()).toHaveAttribute("data-mood", "listening");
  // Its thumbnail in the sidebar acts out the same mood (never the idle step it would otherwise keep).
  expect(rowOf("Fix the slow login").querySelector(".sv-avatar")).toHaveAttribute("data-mood", "listening");
  patch(store, { userLive: false, pendingPhase: "transcribing" });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "listening");
  // The transcript's live draft has the same button: this is the stage's.
  const stage = document.querySelector<HTMLElement>(".call-stage")!;
  await act(async () => { within(stage).getByRole("button", { name: "Cancel sending" }).click(); });
  expect(window.sidevoiceActions?.cancelInput).toHaveBeenCalledOnce();
});

const said = (segment: string, text: string, time: number) =>
  ({ segment, thread: "fp-1|t-login", role: "user" as const, text, name: "You", time, session: "s1" });
const personBubble = () => document.querySelector<HTMLElement>(".person-bubble");
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

test("while the person speaks and while it is transcribed, their bubble holds only the voice's bars", () => {
  const store = room();
  patch(store, { userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "fp-1|t-login" }, pendingPhase: "listening", pendingUserText: "Split it" });
  expect(personBubble()!.querySelector(".voice-wave")).toHaveAttribute("data-phase", "listening");
  expect(personBubble()).not.toHaveTextContent("Split it");
  expect(personBubble()).not.toHaveAttribute("data-sent");
  patch(store, { userLive: false, pendingPhase: "transcribing" });
  expect(personBubble()!.querySelector(".voice-wave")).toHaveAttribute("data-phase", "transcribing");
  expect(personBubble()).not.toHaveTextContent("Split it");
}, WHOLE_APP_MS);

test("what a spoken turn sent stays a moment, then leaves, then is gone", () => {
  const store = room();
  vi.useFakeTimers();
  patch(store, { userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "fp-1|t-login" }, pendingPhase: "listening" });
  patch(store, { userLive: false, pendingPhase: "transcribing" });
  patch(store, { pendingPhase: "", userTurn: null, history: [...store.getState().facts.history, said("u-1", "Split it into two commits.", 2)] } as Partial<SessionFacts>);
  expect(personBubble()).toHaveAttribute("data-sent");
  expect(personBubble()).toHaveTextContent("Split it into two commits.");
  expect(personBubble()!.querySelector(".voice-wave")).toBeNull();
  expect(personBubble()).not.toHaveAttribute("data-leaving");
  tick(PAGE_MS - 1);
  expect(personBubble()).not.toHaveAttribute("data-leaving");
  tick(1);
  expect(personBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS - 1);
  expect(personBubble()).toHaveTextContent("Split it into two commits.");
  tick(1);
  expect(personBubble()).toBeNull();
}, WHOLE_APP_MS);

test("a message typed, with no spoken turn before it, is not shown as sent", () => {
  const store = room();
  vi.useFakeTimers();
  patch(store, { history: [...store.getState().facts.history, said("u-1", "Typed in the composer.", 2)] });
  expect(personBubble()).toBeNull();
  tick(3000);
  expect(personBubble()).toBeNull();
}, WHOLE_APP_MS);

test("a second spoken turn arriving while the first leaves starts over cleanly, and a typed one meanwhile does not stop it", () => {
  const store = room();
  vi.useFakeTimers();
  const speak = (segment: string, text: string, time: number) => {
    patch(store, { userLive: true, userTurn: { id: segment, segment: "turn:" + segment, thread: "fp-1|t-login" }, pendingPhase: "listening" });
    patch(store, { userLive: false, pendingPhase: "transcribing" });
    patch(store, { pendingPhase: "", userTurn: null, history: [...store.getState().facts.history, said(segment, text, time)] } as Partial<SessionFacts>);
  };
  speak("u-1", "First thing.", 2);
  tick(PAGE_MS + 200);
  expect(personBubble()).toHaveAttribute("data-leaving");
  // The next turn: the bars while spoken, below the first as it goes on leaving; then what it sent, from the start of
  // its moment.
  patch(store, { userLive: true, userTurn: { id: "u-2", segment: "turn:u-2", thread: "fp-1|t-login" }, pendingPhase: "listening" });
  const live = () => document.querySelector<HTMLElement>(".person-bubble:not([data-sent])");
  expect(live()!.querySelector(".voice-wave")).not.toBeNull();
  expect(live()).not.toHaveAttribute("data-leaving");
  expect(document.querySelector(".person-bubble[data-sent]")).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(document.querySelector(".person-bubble[data-sent]")).toBeNull();
  patch(store, { userLive: false, pendingPhase: "" , userTurn: null, history: [...store.getState().facts.history, said("u-2", "Second thing.", 3)] } as Partial<SessionFacts>);
  expect(personBubble()).toHaveTextContent("Second thing.");
  expect(personBubble()).not.toHaveAttribute("data-leaving");
  tick(1000);
  // A message typed meanwhile neither shows nor holds it on the stage.
  patch(store, { history: [...store.getState().facts.history, said("u-3", "Typed meanwhile.", 4)] });
  expect(personBubble()).toHaveTextContent("Second thing.");
  tick(PAGE_MS - 1000);
  expect(personBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(personBubble()).toBeNull();
}, WHOLE_APP_MS);

test("the preview holds the stage avatar in a mood, with something unheard when it asks, and null gives it back to the room", () => {
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 57, to: 57 } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "speaking");
  for (const mood of ["idle", "listening", "working", "present", "offline"] as const) {
    patch(store, { avatarPreview: { mood } });
    // Its reply's balloon is up here, and under it a working agent shows as speaking.
    expect(stageAgent()).toHaveAttribute("data-avatar-state", mood === "working" ? "speaking" : mood);
    expect(stageAgent()).not.toHaveAttribute("data-unread");
  }
  patch(store, { avatarPreview: { mood: "present", unread: true } });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "present");
  expect(stageAgent()).toHaveAttribute("data-unread");
  patch(store, { avatarPreview: null });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "speaking");
  expect(stageAgent()).not.toHaveAttribute("data-unread");
}, WHOLE_APP_MS);

test("state dots and small avatars follow each conversation's state, grouped by machine", () => {
  // Its reply already played: no balloon holds the agent still here (the stage's own test follows that).
  const store = room({ history: [played] });
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
  // The light is the dot: green while it hears you, blinking while it works (room.css); a card hides the one of a
  // conversation that cannot hear you, whose words say so. A dot carries no mark of its own.
  const cardDots = [...document.querySelectorAll(".sidebar-rows .state-dot")];
  expect(cardDots.map((d) => d.getAttribute("data-state"))).toEqual(["in-call", "working", "waiting", "idle"]);
  expect(cardDots.every((d) => d.childElementCount === 0)).toBe(true);
  // The call's own conversation at work says Working, on its line and its light (desktop trial, item 11).
  // At work for a minute: past any wait before Working shows (#112).
  patch(store, { harness: { "fp-1|t-pay": true, "fp-1|t-login": true }, workingSince: { "fp-1|t-pay": 0, "fp-1|t-login": 0 }, now: 60_000 } as Partial<SessionFacts>);
  expect([dot("Fix the slow login"), mood("Fix the slow login")]).toEqual(["working", "working"]);
  expect(rowOf("Fix the slow login").querySelector(".sidebar-state-text")).toHaveTextContent(/^Working$/);
  patch(store, { harness: { "fp-1|t-pay": true, "fp-1|t-login": false } });
  expect(rowOf("Fix the slow login").querySelector(".sidebar-state-text")).toHaveTextContent(/^In call$/);
});

/* One creature in one state (#166): the stage's agent and every thumbnail of its conversation — its row in the list, its
 * avatar in the header — render the same state, from one source, on one clock. */
const SHOWN = ["data-avatar-state", "data-mood", "data-work", "data-idle", "data-enter", "data-offline", "data-unread"];
const shown = (avatar: Element | null | undefined) => avatar ? SHOWN.map((name) => name + "=" + avatar.getAttribute(name)) : null;
const headerAvatarOf = (title: string) =>
  [...document.querySelectorAll(".room-header .header-avatar")].find((button) => button.getAttribute("aria-label")?.startsWith(title))?.querySelector(".sv-avatar");
/** What the stage's agent shows, after checking that its row's and its header's avatars show exactly that. */
function inStep(title: string) {
  const stage = shown(stageAgent());
  expect(shown(rowOf(title).querySelector(".sv-avatar"))).toEqual(stage);
  expect(shown(headerAvatarOf(title))).toEqual(stage);
  return stage!;
}

test("the stage's agent and its thumbnails are one creature in one state: rest and pastimes, startle, tool, balloon, offline (#166)", () => {
  viewport({ narrow: true });
  headerRowWidth(190);
  vi.useFakeTimers();
  const store = room({ history: [played] });
  const login = "Fix the slow login";
  const attr = (name: string) => stageAgent().getAttribute(name);
  // Resting: quiet, then its steps, every copy on the same step at every moment.
  expect(inStep(login)).toContain("data-idle=quiet");
  const steps = new Set<string | null>();
  for (let second = 0; second < 30; second += 1) {
    tick(1000);
    inStep(login);
    steps.add(attr("data-idle"));
  }
  expect([...steps].some((step) => step && step !== "quiet")).toBe(true);
  // The person speaks to it: startled into listening everywhere at once, and landing everywhere at once.
  patch(store, { userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "fp-1|t-login" }, pendingPhase: "listening" } as Partial<SessionFacts>);
  expect(inStep(login)).toEqual(expect.arrayContaining(["data-avatar-state=listening", "data-enter=idle"]));
  tick(ENTER_MS);
  expect(inStep(login)).toContain("data-enter=null");
  // It works: the same tool in every hand, swapped in every hand.
  patch(store, { userLive: false, userTurn: null, pendingPhase: "", harness: { "fp-1|t-login": true }, ...lasted("fp-1|t-login") } as Partial<SessionFacts>);
  expect(attr("data-work")).toMatch(/^(crank|hammer|read|type)$/);
  inStep(login);
  tick(31_000);
  inStep(login);
  // It replies; once its voice ends, it holds still under its balloon until the balloon goes: the thumbnails too.
  patch(store, { botLive: true, karaokeState: { segment: "h-2", from: 0, to: 0 }, history: [{ ...played, audio: "playing" }] } as Partial<SessionFacts>);
  expect(inStep(login)).toContain("data-avatar-state=speaking");
  patch(store, { botLive: false, karaokeState: null, history: [played] } as Partial<SessionFacts>);
  expect(stageBubbles()).toHaveLength(1);
  expect(inStep(login)).toEqual(expect.arrayContaining(["data-avatar-state=speaking", "data-work=null"]));
  tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
  expect(stageBubbles()).toHaveLength(0);
  expect(inStep(login)).toContain("data-avatar-state=working");
  // Its machine stops answering mid-reply: it says the reply to its end (#220), on the stage and in every thumbnail;
  // then the stage hangs its wanted poster, and every copy sleeps.
  patch(store, { botLive: true, karaokeState: { segment: "h-2", from: 0, to: 0 }, history: [{ ...played, audio: "playing" }],
    machineLinks: { ...live("fp-2"), "fp-1": { reach: "offline", via: "node" } } } as Partial<SessionFacts>);
  expect(document.querySelector(".wanted")).toBeNull();
  expect(inStep(login)).toContain("data-avatar-state=speaking");
  patch(store, { botLive: false, karaokeState: null, history: [played] } as Partial<SessionFacts>);
  expect(document.querySelector(".wanted")).not.toBeNull();
  expect(inStep(login)).toEqual(expect.arrayContaining(["data-avatar-state=offline", "data-offline=true", "data-idle=null", "data-work=null"]));
}, WHOLE_APP_MS);

test("a conversation coming on the stage brings its state: the stage shows what its thumbnails already showed, the same tool in hand (#166)", () => {
  viewport({ narrow: true });
  headerRowWidth(190);
  const store = room({ history: [played] });
  const pay = "Migrate the payments API";
  const before = shown(rowOf(pay).querySelector(".sv-avatar"))!;
  expect(before).toContain("data-avatar-state=working");
  // Looked at, not called: it is still at work, on the stage as in its row (its harness says so, whoever it talks to).
  patch(store, { viewedThread: "fp-1|t-pay" });
  expect(inStep(pay)).toEqual(before);
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "working");
}, WHOLE_APP_MS);

test("an offline conversation on the stage is a wanted poster, in the interface's language", () => {
  const store = room({ viewedThread: "fp-2|t-week" });
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
  patch(store, { viewedThread: "fp-1|t-login" });
  expect(document.querySelector(".wanted")).toBeNull();
});

test("the poster speaks Spanish on a device set to it", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  room({ viewedThread: "fp-2|t-week" });
  expect(document.querySelector(".wanted")).toHaveTextContent("VIVO O EN PAUSA");
  expect(document.querySelector(".wanted .w-bounty")?.textContent).toMatch(/^\d{3}\.000\.000-$/);
  expect(stageAgent()).toHaveAccessibleName("Plan the week · Desconectada");
});

test("a conversation that is holding does not react to the person talking", () => {
  room({
    people: [person("t-login", "Fix the slow login", { reach: { state: "holding" } })],
    userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: "fp-1|t-login" }, pendingPhase: "listening",
  });
  expect(stageAgent()).toHaveAttribute("data-avatar-state", "idle");
});

test("replies that arrived after leaving put the unread cue on that conversation's avatar, never the one in view", () => {
  room({ history: [
    { segment: "h-2", thread: "fp-1|t-login", role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" },
    { segment: "p-1", thread: "fp-2|t-backup", role: "assistant", text: "The backups ran.", name: "Review the nightly backups", time: 2, session: "s1", seq: 4 },
  ] });
  expect(rowOf("Review the nightly backups").querySelector(".sv-avatar")).toHaveAttribute("data-unread");
  expect(rowOf("Migrate the payments API").querySelector(".sv-avatar")).not.toHaveAttribute("data-unread");
});

test("a phone's header avatars switch the call at a tap, and the chevron brings the whole list down", async () => {
  viewport({ narrow: true });
  // A row with room for two avatars beside "+" and the chevron.
  headerRowWidth(190);
  room();
  const avatars = [...document.querySelectorAll(".header-avatar")];
  // From the left, in the room's order, as many as fit: the one on the stage marked where it is; the chevron counts
  // the rest.
  expect(avatars.map((button) => button.getAttribute("aria-label")?.split(" · ")[0])).toEqual(["Fix the slow login", "Migrate the payments API"]);
  expect(avatars.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  expect(avatars[1].getAttribute("aria-label")).toBe("Migrate the payments API · Working");
  expect(document.querySelector(".conversations-rest")).toHaveTextContent("+2");
  const sidebar = document.getElementById("conversations")!;
  // Asked of the header alone: a role query over the whole page costs a third of a second each under jsdom.
  const chevron = () => within(document.querySelector<HTMLElement>(".room-header")!).getByRole("button", { name: "All conversations (4)" });
  // A tap on one moves the call to it, without the list.
  await act(async () => { fireEvent.click(avatars[1]); });
  expect(selectParticipant).toHaveBeenCalledWith("fp-1|t-pay");
  expect(sidebar).not.toHaveAttribute("data-open");
  // The whole list comes down from the chevron after them; picking one there switches too.
  await act(async () => { fireEvent.click(chevron()); });
  expect(sidebar).toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(rowOf("Review the nightly backups")); });
  expect(selectParticipant).toHaveBeenLastCalledWith("fp-2|t-backup");
  expect(sidebar).not.toHaveAttribute("data-open");

  // The close button, a tap outside and Escape put it away too.
  await act(async () => { fireEvent.click(chevron()); });
  await act(async () => { fireEvent.click(within(sidebar).getByRole("button", { name: "Close conversations" })); });
  expect(sidebar).not.toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(chevron()); });
  await act(async () => { fireEvent.click(document.querySelector(".conversations-scrim")!); });
  expect(sidebar).not.toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(chevron()); });
  await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
  expect(sidebar).not.toHaveAttribute("data-open");
}, WHOLE_APP_MS);

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
  const lines = Array.from({ length: 30 }, (_, index) => ({ segment: "m-" + index, thread: "fp-1|t-login", role: index % 2 ? "assistant" as const : "user" as const,
    text: "Line " + index, name: "x", time: index + 1, session: "s1", audio: "heard" }));
  const store = room({ history: lines.slice(0, 5) });
  patch(store, { history: lines });
  const scrolls = vi.spyOn(HTMLElement.prototype, "scrollTo");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  expect(scrolls.mock.contexts).toContain(document.getElementById("messages"));
});

test("two machines with the same name, or none, are two groups, each with its own conversations", () => {
  const errors = vi.spyOn(console, "error");
  room({ pairings: [pairing("fp-1", "Laptop"), pairing("fp-3", "Laptop"), pairing("fp-4", null), pairing("fp-5", null)], machineLinks: live("fp-1", "fp-3", "fp-4", "fp-5"), people: [
    person("t-a", "On the laptop"), person("t-b", "On the other laptop", { node: "fp-3", machine: { host: "Laptop", id: "m3" } }),
    person("t-c", "Nameless one", { node: "fp-4", machine: { host: null, id: "m4" } }), person("t-d", "Nameless two", { node: "fp-5", machine: { host: null, id: "m5" } }),
  ], roomBinding: { thread_id: "t-a", title: "On the laptop", binding_id: "b" } });
  const groups = [...document.querySelectorAll(".sidebar-group")].map((group) => [group.querySelector(".sidebar-group-label")?.textContent,
    [...group.querySelectorAll(".person-name")].map((name) => name.textContent)]);
  expect(groups).toEqual([["Laptop", ["On the laptop"]], ["Laptop", ["On the other laptop"]], ["Unknown machine", ["Nameless one"]], ["Unknown machine", ["Nameless two"]]]);
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
});

test("the bubble lights whole words, and its tooltip speaks the interface's language", () => {
  room({ botLive: true, karaokeState: { segment: "h-2", from: 42, to: 42 } });
  // What was heard ends inside "look": the word lights whole.
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("Okay. I'll start with the login and then look");
  expect(document.querySelector(".stage-bubble .karaoke-text")).toHaveAttribute("title", "Playing this reply");
});

test("a whole sentence sounding is read at a speaking pace, never past its end", () => {
  vi.useFakeTimers();
  // The voice's chunk is the reply's first sentence and a half: "Okay. I'll start with the login".
  room({ botLive: true, karaokeState: { segment: "h-2", from: 0, to: 31 } });
  // The sentence has just started: the whole reply is up, nothing lit yet.
  expect(document.querySelector(".stage-bubble .karaoke-upcoming")?.textContent).toBe(REPLY);
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("");
  act(() => { vi.advanceTimersByTime(1000); });
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent?.length).toBeGreaterThan(0);
  // Long after the voice would have got there, the bubble waits at the end of the part sounding.
  act(() => { vi.advanceTimersByTime(20000); });
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("Okay. I'll start with the login");
  expect(document.querySelector(".stage-bubble .karaoke-upcoming")?.textContent).toBe(REPLY.slice("Okay. I'll start with the login".length));
});

const stageBubbles = () => [...document.querySelectorAll<HTMLElement>(".stage-bubble")];
/** The reply `segment` as the room has it, its voice `audio` ("playing", or "played" once said). */
const reply = (segment: string, text: string, audio: string, time: number) =>
  ({ segment, thread: "fp-1|t-login", role: "assistant" as const, text, name: "Fix the slow login", time, session: "s1", audio });
const NEXT = "Done: the login is fast again.";

test("the balloon is what this page plays: none for a reply the room lists as playing or queued while the voice says neither (#221)", () => {
  room({ botLive: true, karaokeState: null, history: [reply("h-2", REPLY, "playing", 1), reply("h-3", NEXT, "queued", 2)] });
  expect(stageBubbles()).toHaveLength(0);
});

test("a reply cut short and still listed as playing by the room leaves, and a newer one played does not bring it back (#221)", () => {
  // Cut halfway when its machine restarted: the restarted room still lists it as playing.
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 20, to: 20 } });
  vi.useFakeTimers();
  patch(store, { botLive: false, karaokeState: null });
  tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
  expect(stageBubbles()).toHaveLength(0);
  // A newer reply plays, then ends.
  patch(store, { botLive: true, karaokeState: { segment: "h-3", from: 0, to: 0 }, history: [reply("h-2", REPLY, "playing", 1), reply("h-3", NEXT, "playing", 2)] } as Partial<SessionFacts>);
  expect(stageBubbles()).toHaveLength(1);
  patch(store, { botLive: false, karaokeState: null, history: [reply("h-2", REPLY, "playing", 1), reply("h-3", NEXT, "played", 2)] } as Partial<SessionFacts>);
  tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
  expect(stageBubbles()).toHaveLength(0);
}, WHOLE_APP_MS);

test("its last words said, a reply stays whole AGENT_LINGER_MS, then lifts away; the next one sends it away at once", () => {
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 20, to: 20 } });
  vi.useFakeTimers();
  patch(store, { botLive: false, karaokeState: null, history: [reply("h-2", REPLY, "played", 1)] } as Partial<SessionFacts>);
  expect(stageBubbles()).toHaveLength(1);
  expect(stageBubbles()[0].querySelector(".karaoke-played")?.textContent).toBe(REPLY);
  tick(AGENT_LINGER_MS - 1);
  expect(stageBubbles()[0]).not.toHaveAttribute("data-leaving");
  tick(1);
  expect(stageBubbles()[0]).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(stageBubbles()).toHaveLength(0);
  // Two replies, one after the other: the first lifts away the moment the next sounds, the next from its start.
  patch(store, { botLive: true, karaokeState: { segment: "h-3", from: 0, to: 0 }, history: [reply("h-2", REPLY, "played", 1), reply("h-3", "Okay.", "playing", 2)] } as Partial<SessionFacts>);
  expect(stageBubbles()).toHaveLength(1);
  patch(store, { karaokeState: { segment: "h-4", from: 0, to: 0 },
    history: [reply("h-2", REPLY, "played", 1), reply("h-3", "Okay.", "played", 2), reply("h-4", NEXT, "playing", 3)] } as Partial<SessionFacts>);
  const [before, now] = stageBubbles();
  expect(before).toHaveAttribute("data-leaving");
  expect(before).toHaveTextContent(/^Okay\.$/);
  expect(now).not.toHaveAttribute("data-leaving");
  expect(now.querySelector(".karaoke-upcoming")?.textContent).toBe(NEXT);
  tick(SENT_LEAVING_MS);
  expect(stageBubbles()).toEqual([now]);
}, WHOLE_APP_MS);

test("another conversation on the stage takes no reply of the one before with it", () => {
  const store = room({ botLive: true, karaokeState: { segment: "h-2", from: 20, to: 20 } });
  vi.useFakeTimers();
  patch(store, { botLive: false, karaokeState: null, history: [reply("h-2", REPLY, "played", 1)] } as Partial<SessionFacts>);
  expect(stageBubbles()).toHaveLength(1);
  patch(store, { viewedThread: "fp-1|t-pay" });
  expect(document.querySelector(".stage-title h2")).toHaveTextContent("Migrate the payments API");
  expect(stageBubbles()).toHaveLength(0);
  // Back on the one that spoke, its reply is over: nothing comes back.
  patch(store, { viewedThread: "fp-1|t-login" });
  expect(stageBubbles()).toHaveLength(0);
  tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
  expect(stageBubbles()).toHaveLength(0);
}, WHOLE_APP_MS);

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

test("on a phone the conversations panel is a dialog: focus goes in, and back to what opened it, or to the one chosen", async () => {
  viewport({ narrow: true });
  headerRowWidth(190);
  const store = room();
  selectParticipant.mockImplementation((threadId: string) => store.patch({ viewedThread: threadId }));
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
  // A conversation picked there is in the header's row (its last slot), and focus goes to its avatar.
  await act(async () => { fireEvent.click(pill); });
  await act(async () => { fireEvent.click(rowOf("Review the nightly backups")); });
  expect(selectParticipant).toHaveBeenCalledWith("fp-2|t-backup");
  const chosen = [...document.querySelectorAll<HTMLElement>(".room-header .header-avatar")].at(-1)!;
  expect(chosen.getAttribute("aria-label")).toMatch(/^Review the nightly backups · /);
  expect(chosen).toHaveAttribute("aria-pressed", "true");
  expect(document.activeElement).toBe(chosen);
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

test("a compact desktop window keeps the rail, whose toggle opens the whole list over the stage as a dialog; the transcript opens over the call too", async () => {
  viewport({ compact: true });
  const store = room();
  selectParticipant.mockImplementation((threadId: string) => store.patch({ viewedThread: threadId }));
  const sidebar = document.getElementById("conversations")!;
  const toggle = screen.getByRole("button", { name: "Expand conversations" });
  expect(sidebar).toHaveAttribute("data-collapsed");
  expect(sidebar).not.toHaveAttribute("role");
  // A desktop's way into the transcript, at the bar's right end; a desktop's foot, Settings in the rail.
  expect(document.getElementById("transcript-toggle")!.closest(".call-bar-end")).not.toBeNull();
  expect(sidebar.querySelector(".sidebar-settings")).not.toBeNull();
  toggle.focus();
  await act(async () => { fireEvent.click(toggle); });
  expect(sidebar).toHaveAttribute("data-open");
  expect(sidebar).not.toHaveAttribute("data-collapsed");
  expect(sidebar).toHaveAttribute("role", "dialog");
  expect(sidebar).toHaveAttribute("aria-modal", "true");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveAccessibleName("Collapse conversations");
  expect(document.activeElement).toBe(rowOf("Fix the slow login"));
  escape();
  expect(sidebar).toHaveAttribute("data-collapsed");
  expect(sidebar).not.toHaveAttribute("role");
  expect(document.activeElement).toBe(toggle);
  // One chosen there: the list goes, and focus goes to its avatar in the rail.
  await act(async () => { fireEvent.click(toggle); });
  await act(async () => { fireEvent.click(rowOf("Review the nightly backups")); });
  expect(selectParticipant).toHaveBeenCalledWith("fp-2|t-backup");
  expect(sidebar).not.toHaveAttribute("data-open");
  expect(document.activeElement).toBe(rowOf("Review the nightly backups"));
  // The transcript is a dialog over the call as well, and opening it puts the list away.
  await act(async () => { fireEvent.click(toggle); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Show transcript/ })); });
  expect(sidebar).not.toHaveAttribute("data-open");
  expect(document.getElementById("transcript")).toHaveAttribute("role", "dialog");
  expect(document.getElementById("transcript")).toHaveAttribute("aria-modal", "true");
  // None of it touched the person's own choice for a wide window.
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

test("exactly one way into the transcript: on a phone in the tile, on a desktop at the bar's right end; with or without a conversation on the stage", () => {
  for (const narrow of [false, true]) for (const binding of [{ thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" }, null]) {
    viewport({ narrow });
    room({ roomBinding: binding });
    const ways = document.querySelectorAll("#transcript-toggle");
    expect([narrow, !!binding, ways.length]).toEqual([narrow, !!binding, 1]);
    if (narrow) {
      expect(ways[0].closest(".stage-tile")).not.toBeNull();
      expect(ways[0].closest(".call-bar")).toBeNull();
    } else {
      expect(ways[0].closest(".call-bar-end")).not.toBeNull();
      expect(ways[0].closest(".call-bar-card")).toBeNull();
      expect(ways[0].closest(".stage-tile")).toBeNull();
    }
    cleanup();
    vi.restoreAllMocks();
  }
});

test("on a desktop the bar's transcript button opens and closes the panel without a message notice", async () => {
  viewport({ narrow: false });
  const store = room();
  const button = document.querySelector(".call-bar-end #transcript-toggle")!;
  expect(button).not.toBeNull();
  patch(store, { history: [...store.getState().facts.history,
    { segment: "h-3", thread: "fp-1|t-login", role: "assistant", text: "Shall I also add a retry?", name: "Fix the slow login", time: 2, session: "s1" }] });
  expect(button).toHaveAccessibleName("Show transcript");
  expect(button.querySelector(".transcript-entry-dot")).toBeNull();
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById("transcript")).toHaveAttribute("data-open");
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("transcript")).not.toHaveAttribute("data-open");
  expect(button.querySelector(".transcript-entry-dot")).toBeNull();
  expect(document.querySelectorAll("#transcript-toggle")).toHaveLength(1);
}, WHOLE_APP_MS);

test("the transcript button stays directly accessible without an unread count", async () => {
  const store = room();
  const button = document.getElementById("transcript-toggle")!;
  expect(button).toHaveAccessibleName("Show transcript");
  expect(button.querySelector(".transcript-entry-dot")).toBeNull();
  patch(store, { history: [...store.getState().facts.history,
    { segment: "h-3", thread: "fp-1|t-login", role: "assistant", text: "Shall I also add a retry?", name: "Fix the slow login", time: 2, session: "s1" }] });
  expect(button).toHaveAccessibleName("Show transcript");
  expect(button.querySelector(".transcript-entry-dot")).toBeNull();
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAccessibleName("Hide transcript");
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAccessibleName("Show transcript");
});

/* The stage's "Working…" line over the agent while it works is only for assistive tech: the sidebar and the desk say it
 * to the eye. It stays a status, so a screen reader hears it. */
test("the Working… line over the agent is an sr-only status, with no visible badge in its place", () => {
  // A reply this page is saying, its balloon up.
  const store = room({ karaokeState: { segment: "h-2", from: 0, to: 0 } });
  expect(workingLine()).toBeNull();
  vi.useFakeTimers();
  patch(store, { harness: { "fp-1|t-login": true }, ...lasted("fp-1|t-login") });
  // While the reply's balloon is up the stage shows speaking; the sr-only status still follows the real mood.
  expect(document.querySelector(".stage-bubble")).not.toBeNull();
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "speaking");
  expect(stageAgent()).toHaveAttribute("data-mood", "speaking");
  expect(workingLine()).toHaveClass("sr-only");
  expect(workingLine()).toHaveTextContent("Working…");
  expect(workingLine()!.querySelector(".ui-spinner")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("status")).toContain(workingLine());
  expect(document.querySelector(".stage-activity")).toBeNull();
  // The desk waits for the balloon to go (the first test follows it out).
  expect(document.querySelector(".stage-desk svg.desk")).toBeInTheDocument();
  // The work over, the line goes.
  patch(store, { harness: { "fp-1|t-login": false } });
  expect(workingLine()).toBeNull();
}, WHOLE_APP_MS);

test("a working-badge choice left in storage changes nothing: the line stays sr-only", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "working-badge": "show" }));
  const store = room();
  patch(store, { harness: { "fp-1|t-login": true }, ...lasted("fp-1|t-login") });
  expect(workingLine()).toHaveClass("sr-only");
  expect(document.querySelector(".stage-activity")).toBeNull();
}, WHOLE_APP_MS);

test("the voice error lies over the stage's top as one alert, outside the tile; its close clears it", () => {
  const store = room();
  patch(store, { bootError: { text: "Algo falló con la voz.", details: "TypeError\nFailed to fetch" } });
  expect(document.querySelectorAll("#error")).toHaveLength(1);
  expect(document.querySelector(".stage-tile #error")).toBeNull();
  const card = document.querySelector<HTMLElement>(".call-stage > #error")!;
  expect(card).toHaveAttribute("role", "alert");
  expect(card).toHaveTextContent("Algo falló con la voz.");
  expect(card.querySelector("details, summary, button")).not.toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Close" }));
  expect(store.getState().facts.bootError).toBeNull();
  expect(document.querySelector("#error")).toBeEmptyDOMElement();
}, WHOLE_APP_MS);

test("each machine's group in the conversations wears the connected mark Machines wears, from that machine's own reach", () => {
  const store = room();
  const group = (host: string) => [...document.querySelectorAll<HTMLElement>(".conversation-sidebar .sidebar-group")].find((section) => section.textContent?.includes(host))!;
  const dot = (host: string) => group(host).querySelector(".state-on-icon-dot");
  expect(dot("Laptop")).not.toBeNull();
  expect(dot("Home server")).not.toBeNull();
  expect(group("Home server")).toHaveAttribute("aria-label", "Home server, Online");
  // The reach of one machine changes: only its group does.
  patch(store, { machineLinks: { ...live("fp-1"), "fp-2": { reach: "offline", via: "" } } });
  expect(dot("Laptop")).not.toBeNull();
  expect(dot("Home server")).toBeNull();
  expect(group("Home server")).toHaveAttribute("aria-label", "Home server, Offline");
});

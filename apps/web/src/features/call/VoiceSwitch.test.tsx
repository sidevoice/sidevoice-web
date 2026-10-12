import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import { NARROW_QUERY } from "../../state/call-layout";
import type { SessionFacts } from "../../state/room-session-state.js";
import { VARIANTS_KEY } from "../../lib/variants";
import { markSetUp } from "../../test/onboarding";
import { headerRowWidth } from "../../test/header-row";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* Call model B, the voice switch (VARIANTS `call-model` "b"; briefs/CALL-MODEL-B-SPEC.md), as the whole room renders it
 * from the session's facts: the bar, its notes, the rows, the stage, the box and the phone's header. */
const WHOLE_APP_MS = 15_000;
const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: "fp-1", machine: { host: "Laptop", id: "m1" }, harness: "claude", ...extra });
const pairing = (fp: string, host: string) => ({ fp, host, urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false });

function room(extra: Partial<SessionFacts> = {}) {
  const store = createRoomStore();
  act(() => store.patch({
    machinesReady: true, pairings: [pairing("fp-1", "Laptop")], machineLinks: { "fp-1": { reach: "ok", via: "node" } },
    callNode: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
    people: [
      person("t-login", "Fix the slow login", { working: false }),
      person("t-pay", "Migrate the payments API", { working: true }),
      person("t-docs", "Write the docs", { working: false, unheard: { count: 2, since: 1000 } }),
      person("t-week", "Plan the week", { reach: { state: "holding" } }),
    ],
    ...extra,
  } as Partial<SessionFacts>));
  render(<App store={store} />);
  return store;
}
const patch = (store: RoomStore, facts: Partial<SessionFacts>) => act(() => store.patch(facts));
const bar = () => document.getElementById("call-controls")!;
const voice = () => screen.getByRole("switch", { name: "Voice" });
const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>(".conversation-sidebar .participant-row")].find((row) => row.textContent?.includes(title))!;

function phone(narrow: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === NARROW_QUERY && narrow, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  localStorage.clear();
  markSetUp();
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "call-model": "b" }));
  actions = { setVoice: vi.fn().mockResolvedValue(undefined), setAgentsMuted: vi.fn(), hearIt: vi.fn().mockResolvedValue(undefined), keepVoiceOn: vi.fn(),
    toggleMic: vi.fn(), selectParticipant: vi.fn(), cancelInput: vi.fn(), closeParticipant: vi.fn() };
  window.sidevoiceActions = actions as unknown as typeof window.sidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

test("A is untouched: the call button, no voice switch; B puts the switch in the call's slot", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "call-model": "a" }));
  const { unmount } = render(<App store={createRoomStore()} />);
  expect(document.getElementById("connect")).toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Voice" })).toBeNull();
  unmount();
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "call-model": "b" }));
  room();
  expect(document.getElementById("connect")).toBeNull();
  expect(voice()).toHaveAttribute("id", "voice-switch");
}, WHOLE_APP_MS);

test("the voice switch: named Voice in every state, checked and busy while it turns on, never the call's red", async () => {
  const store = room();
  expect(voice()).toHaveAttribute("aria-checked", "false");
  expect(voice()).toHaveTextContent("Voice");
  expect(voice()).toHaveAttribute("title", "Turn on voice to talk and listen");
  expect(voice()).toHaveAttribute("data-position", "off");
  await act(async () => { voice().click(); });
  expect(actions.setVoice).toHaveBeenLastCalledWith(true);
  patch(store, { voiceStarting: true });
  expect(voice()).toHaveAttribute("aria-checked", "true");
  expect(voice()).toHaveAttribute("aria-busy", "true");
  expect(document.getElementById("join-status")).toHaveTextContent("Preparing voice");
  // Pressed while it starts, it is cancelled.
  await act(async () => { voice().click(); });
  expect(actions.setVoice).toHaveBeenLastCalledWith(false);
  patch(store, { voiceStarting: false, voiceOn: true });
  expect(voice()).toHaveAttribute("aria-checked", "true");
  expect(voice()).not.toHaveAttribute("aria-busy");
  expect(voice()).toHaveAttribute("title", "Voice is on. Turn it off to release the microphone and speaker");
  // A reconnection never touches it: the line says it.
  patch(store, { reconnecting: true, reconnectShown: true, ws: null });
  expect(voice()).toHaveAttribute("aria-checked", "true");
  expect(document.getElementById("join-status")).toHaveTextContent("Reconnecting to the room…");
}, WHOLE_APP_MS);

test("the bar in Tab order: devices, microphone, Mute agents, skip, the note's Keep voice on, Voice, then ⋮ on a desktop", () => {
  room({ voiceOn: true, voiceIdleWarning: true });
  // What a closed ⋮ holds is not in the order until it opens.
  const order = [...bar().querySelectorAll<HTMLElement>("button, summary")].filter((element) => !element.closest(".call-menu-panel")).map((element) => element.id || element.getAttribute("aria-label") || element.textContent);
  expect(order).toEqual(["Microphone and speaker", "mute", "mute-agents", "skip-reply", "Keep voice on", "voice-switch", "More options"]);
}, WHOLE_APP_MS);

test("a phone: no ⋮ in the bar, the switch is its rightmost control, and the statistics are at the conversations' foot", () => {
  phone(true);
  room();
  expect(document.getElementById("call-menu")).toBeNull();
  const controls = [...bar().querySelectorAll(".call-actions > *")];
  expect(controls.at(-1)).toContainElement(voice());
  const stats = document.getElementById("stats-open")!;
  expect(stats).toHaveTextContent("Connection statistics");
  expect(document.getElementById("conversations")).toContainElement(stats);
}, WHOLE_APP_MS);

test("the voice note: why it turned itself off, until it is on again; the idle warning keeps it on; nothing when the person turned it off", async () => {
  const store = room();
  expect(document.querySelector(".voice-note")).toBeNull();
  patch(store, { voiceOffReason: "micLost" });
  expect(document.querySelector(".voice-note")).toHaveTextContent("Voice turned off: your microphone was disconnected.");
  expect(document.querySelector(".voice-note")).toHaveAttribute("role", "status");
  patch(store, { voiceOffReason: "micBlocked" });
  expect(document.querySelector(".voice-note")).toHaveAttribute("role", "alert");
  patch(store, { voiceOffReason: "failed", voiceOffDetail: "Ese modelo no está en el catálogo de la voz." });
  expect(document.querySelector(".voice-note")).toHaveTextContent("Voice couldn't start: Ese modelo no está en el catálogo de la voz.");
  // It comes right before the switch.
  expect(document.querySelector(".voice-note")!.nextElementSibling).toBe(voice());
  patch(store, { voiceOn: true, voiceOffReason: null });
  expect(document.querySelector(".voice-note")).toBeNull();
  patch(store, { voiceIdleWarning: true });
  const warning = document.querySelector(".voice-note")!;
  expect(warning).toHaveTextContent("Still there? Voice turns off in 1 minute.");
  await act(async () => { within(warning as HTMLElement).getByRole("button", { name: "Keep voice on" }).click(); });
  expect(actions.keepVoiceOn).toHaveBeenCalledOnce();
}, WHOLE_APP_MS);

test("the microphone: one name, pressed while muted; with the voice on and nobody to hear, unusable and saying why, still focusable", async () => {
  const store = room({ micEnabled: false });
  const mic = () => document.getElementById("mute")!;
  expect(mic()).toHaveAccessibleName("Mute microphone");
  expect(mic()).toHaveAttribute("aria-pressed", "true");
  expect(mic()).not.toBeDisabled();
  await act(async () => { mic().click(); });
  expect(actions.toggleMic).toHaveBeenCalledOnce(); // a preference with the voice off
  patch(store, { micEnabled: true, voiceOn: true, viewedThread: "fp-1|t-week", roomBinding: null });
  expect(mic()).toHaveAccessibleName("Mute microphone");
  expect(mic()).toHaveAttribute("aria-pressed", "false");
  expect(mic()).toHaveAttribute("aria-disabled", "true");
  expect(mic()).not.toBeDisabled();
  expect(mic()).toHaveAccessibleDescription("Plan the week can't hear you right now");
  await act(async () => { mic().click(); });
  expect(actions.toggleMic).toHaveBeenCalledOnce();
}, WHOLE_APP_MS);

test("Mute agents: pressed, the count of conversations that want to talk on its corner; muted by a lost speaker, a note says so", async () => {
  const store = room();
  const agents = () => document.getElementById("mute-agents")!;
  expect(agents()).toHaveAccessibleName("Mute agents");
  expect(agents()).toHaveAttribute("aria-pressed", "false");
  expect(agents().querySelector(".mute-agents-badge")).toBeNull(); // audible: no badge, whatever is marked
  await act(async () => { agents().click(); });
  expect(actions.setAgentsMuted).toHaveBeenLastCalledWith(true);
  patch(store, { agentsMuted: true, agentsMutedBy: "person" });
  expect(agents()).toHaveAttribute("aria-pressed", "true");
  expect(agents().querySelector(".mute-agents-badge")).toHaveTextContent("1");
  expect(agents()).toHaveAccessibleDescription("1 conversation wants to talk");
  expect(document.querySelector(".agents-note")).toBeNull();
  const many = Array.from({ length: 11 }, (_, i) => person("t-" + i, "Task " + i, { unheard: { count: 1, since: i } }));
  patch(store, { people: many, agentsMutedBy: "output-lost" });
  expect(agents().querySelector(".mute-agents-badge")).toHaveTextContent("9+");
  expect(document.querySelector(".agents-note")).toHaveTextContent("Speaker disconnected. Agents muted.");
}, WHOLE_APP_MS);

test("rows say B's states, a mark wears an amber hand, and Hear it asks the conversation, naming each step it takes first", async () => {
  const store = room();
  expect(rowOf("Fix the slow login")).toHaveTextContent("Ready");
  expect(rowOf("Migrate the payments API")).toHaveTextContent("Working"); // working on every row, not only the active one
  expect(rowOf("Write the docs")).toHaveTextContent("Waiting for you");
  expect(rowOf("Plan the week")).toHaveTextContent("Can't receive");
  expect(rowOf("Write the docs").querySelector(".state-dot")).toHaveAttribute("data-state", "waiting-for-you");
  expect(rowOf("Write the docs").querySelector(".state-dot svg")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("In call");
  const hear = () => rowOf("Write the docs").querySelector<HTMLElement>(".row-hear")!;
  expect(hear()).toHaveAccessibleName("Turn on voice and hear it: Write the docs");
  patch(store, { voiceOn: true, agentsMuted: true });
  expect(hear()).toHaveAccessibleName("Unmute agents and hear it: Write the docs");
  patch(store, { voiceOn: false });
  expect(hear()).toHaveAccessibleName("Turn on voice, unmute agents and hear it: Write the docs");
  // Its place: after the row's own button, before ⋯.
  const controls = [...rowOf("Write the docs").querySelectorAll("button")].map((button) => button.className);
  expect(controls.findIndex((name) => name.includes("row-hear"))).toBe(1);
  await act(async () => { hear().click(); });
  expect(actions.hearIt).toHaveBeenCalledWith("fp-1|t-docs");
  // Asking: busy, and saying so; once answered it goes, and focus goes to the row's own button.
  patch(store, { hearing: { thread: "fp-1|t-docs", state: "asking" } });
  expect(hear()).toHaveAccessibleName("Asking Write the docs…");
  expect(hear()).toHaveAttribute("aria-disabled", "true");
  hear().focus();
  vi.useFakeTimers();
  patch(store, { hearing: null, people: store.getState().facts.people.map((p) => ({ ...(p as object), unheard: null })) as never });
  expect(rowOf("Write the docs").querySelector(".row-hear")).toBeNull();
  act(() => { vi.runAllTimers(); });
  expect(document.activeElement).toBe(rowOf("Write the docs").querySelector(".person"));
}, WHOLE_APP_MS);

test("the stage is the active conversation's: its mark notice offers Hear it, asks, and says when there was no answer by voice", async () => {
  const store = room({ viewedThread: "fp-1|t-docs", roomBinding: { thread_id: "t-docs", title: "Write the docs", binding_id: "b2" } });
  expect(screen.getByRole("region", { name: "Active conversation" })).toBeInTheDocument();
  const notice = () => document.querySelector(".stage-mark")!;
  expect(notice()).toHaveTextContent("Write the docs has something to say");
  const button = () => within(notice() as HTMLElement).getByRole("button");
  expect(button()).toHaveTextContent("Hear it");
  expect(button()).toHaveAccessibleName("Turn on voice and hear it");
  await act(async () => { button().click(); });
  expect(actions.hearIt).toHaveBeenCalledWith("fp-1|t-docs");
  // Hidden while the agent speaks to it (D9): that reply carries it.
  patch(store, { botLive: true });
  expect(document.querySelector(".stage-mark")).toBeNull();
  patch(store, { botLive: false, hearing: { thread: "fp-1|t-docs", state: "asking" } });
  expect(notice()).toHaveTextContent("Asking Write the docs…");
  patch(store, { hearing: { thread: "fp-1|t-docs", state: "no-answer" } });
  expect(notice()).toHaveTextContent("Write the docs didn't answer by voice.");
  // The notice itself is not a live region: the announcer says it.
  expect(notice()).not.toHaveAttribute("role");
}, WHOLE_APP_MS);

test("working shows on the stage with the voice off; the box writes without voice and says why when it cannot", () => {
  const store = room({ viewedThread: "fp-1|t-pay", roomBinding: { thread_id: "t-pay", title: "Migrate the payments API", binding_id: "b3" } });
  expect(document.querySelector(".stage-tile")).toHaveAttribute("data-mood", "working");
  const box = () => document.getElementById("text-message")!;
  expect(box()).toHaveAttribute("placeholder", "Send a message");
  patch(store, { viewedThread: "fp-1|t-week", roomBinding: null });
  expect(box()).toHaveAttribute("placeholder", "Plan the week can't receive messages right now");
  patch(store, { viewedThread: null, roomBinding: null });
  expect(box()).toHaveAttribute("placeholder", "Choose a conversation to write to");
}, WHOLE_APP_MS);

test("a phone's header keeps the room's order and names B's states; a tap leaves focus on it; a mark behind the chevron is on it", async () => {
  phone(true);
  headerRowWidth(190);
  room();
  const avatars = [...document.querySelectorAll<HTMLElement>(".header-avatar")];
  // No ranking: the room's order, the one on the stage marked where it is.
  expect(avatars.map((avatar) => avatar.getAttribute("aria-label"))).toEqual(["Fix the slow login · Ready", "Migrate the payments API · Working"]);
  expect(avatars[0]).toHaveAttribute("aria-pressed", "true");
  // Waiting for you behind the chevron: its filled hand on it, and said.
  const chevron = document.querySelector<HTMLElement>(".conversations-toggle")!;
  expect(chevron.querySelector(".conversations-cue")).toHaveAttribute("data-cue", "waiting-for-you");
  expect(chevron).toHaveAccessibleName("All conversations (4), 1 hidden with something new");
  // A tap selects it in place: it stays in the row, and the focus with it.
  avatars[1].focus();
  await act(async () => { avatars[1].click(); });
  expect(actions.selectParticipant).toHaveBeenCalledWith("fp-1|t-pay");
  expect(document.activeElement).toBe(avatars[1]);
}, WHOLE_APP_MS);

test("a reply unheard because the agents were muted says so in the transcript", () => {
  room({ history: [{ segment: "r1", thread: "fp-1|t-login", role: "assistant", text: "Done.", name: "Fix the slow login", time: 1, audio: "text_only", audio_reason: "agents_muted" }] as never });
  expect(document.querySelector(".chat-audio-note")).toHaveTextContent("Sin audio · Agents were muted");
}, WHOLE_APP_MS);

test("the announcer is one polite region, there only in B", () => {
  room();
  const region = document.getElementById("room-announcer")!;
  expect(region).toHaveAttribute("role", "status");
  expect(region).toHaveAttribute("aria-live", "polite");
  expect(region).toHaveClass("sr-only");
}, WHOLE_APP_MS);

const said = (segment: string, time: number) => ({ segment, thread: "fp-1|t-login", role: "assistant", text: "Done.", name: "Fix the slow login", time, session: "s1" });

test("B: the transcript's one button is at the bar's right end on a desktop, in the tile on a phone", async () => {
  for (const narrow of [false, true]) {
    phone(narrow);
    const store = room({ history: [said("r1", 1)] } as never);
    const ways = document.querySelectorAll("#transcript-toggle");
    expect([narrow, ways.length]).toEqual([narrow, 1]);
    const button = ways[0];
    if (narrow) {
      expect(button.closest(".stage-tile")).not.toBeNull();
      expect(button.closest(".call-bar")).toBeNull();
    } else {
      expect(button.closest(".call-bar-end")).not.toBeNull();
      expect(button.closest(".call-bar-card")).toBeNull();
      expect(button.closest(".stage-tile")).toBeNull();
      patch(store, { history: [said("r1", 1), said("r2", 2)] } as never);
      expect(button.querySelector(".transcript-entry-dot")).not.toBeNull();
      await act(async () => { fireEvent.click(button); });
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById("transcript")).toHaveAttribute("data-open");
      await act(async () => { fireEvent.click(button); });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button.querySelector(".transcript-entry-dot")).toBeNull();
    }
    cleanup();
    vi.restoreAllMocks();
  }
}, WHOLE_APP_MS);

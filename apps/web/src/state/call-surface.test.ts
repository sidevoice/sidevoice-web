import { afterEach, expect, test, vi } from "vitest";
import { createRoomSessionStore, speakWith, WORKING_SHOWN_AFTER_MS } from "./room-session-state.js";
import { spokenPage, stillId, SURFACE_PAGE_CHARS, STILL_PX, FACE_PX } from "./call-surface.js";
import { startCallSurface, PAGE_SURFACE_MS, type SurfaceClock } from "./call-surface-publisher";
import { readOn } from "../features/call/speech-chunks";
import { PAGE_MS } from "../features/call/PagedText";

speakWith((key, params) => key + (params ? " " + JSON.stringify(params) : ""));
afterEach(() => vi.useRealTimers());

const people = [
  { thread_id: "a", node: "n", title: "Call A", available: true, engine: { model: "claude-opus-5-5", effort: "high" } },
  { thread_id: "b", node: "n", title: "B", available: true },
  { thread_id: "c", node: "n", title: "C", available: true },
  { thread_id: "d", node: "n", title: "D", available: true },
  { thread_id: "e", node: "n", title: "E", available: true },
];
const base = { ws: {}, sessionId: "s", callNode: "n", roomBinding: { thread_id: "a", title: "Call A" }, people };
const surface = (facts: Record<string, unknown> = {}) => createRoomSessionStore({ ...base, ...facts } as never).getState().callSurface;

test("the projection's shape and defaults: nothing live, nothing pending, the words resolved", () => {
  const view = surface();
  expect(view).toMatchObject({ pendingCancellable: false, reach: "listening", page: null, said: null, still: null, workingSince: null });
  expect(view.words).toMatchObject({ state: "state.resting", mute: "card.mute", skip: "liveActivity.skipShort", skipName: "card.skip", cancelSend: "stage.cancelTurn", hangUp: "card.hangUp" });
  expect(view.words.route).toBe('liveActivity.routeName {"route":"{route}"}');
});

test("model as the connector reports it, effort in the data; the others as up to three faces; the count is of all conversations", () => {
  const view = surface({ pairings: [] });
  expect(view.model).toBe("claude-opus-5-5");
  expect(view.effort).toBe("high");
  expect(view.conversationCount).toBe(5);
  expect(view.others.map((item) => item.threadId)).toEqual(["n|b", "n|c", "n|d"]);
  expect(view.words.conversations).toBe('card.conversationsCount {"n":5}');
  expect(view.words.offline).toBe("state.offline");
});

test("pendingCancellable is the open turn's, and the state line follows the turn, the reach and the mood", () => {
  const turn = { userTurn: { id: "t", segment: "t", thread: "n|a" } };
  expect(surface({ ...turn, pendingPhase: "transcribing" })).toMatchObject({ pendingCancellable: true, words: { state: "wave.transcribingTitle" } });
  expect(surface({ ...turn, pendingPhase: "listening" }).words.state).toBe("state.listening");
  expect(surface({ botLive: true }).words.state).toBe("state.speaking");
  expect(surface({ reconnectShown: true }).words.state).toBe("state.offline");
});

test("holding takes idle's place and nothing else's: the person's turn, speaking, working and offline all win over it", () => {
  const hold = people.map((p) => p.thread_id === "a" ? { ...p, reach: { state: "holding" } } : p);
  const turn = { userTurn: { id: "t", segment: "t", thread: "n|a" } };
  const state = (facts: Record<string, unknown>) => createRoomSessionStore({ ...base, people: hold, ...facts } as never).getState().callSurface.words.state;
  expect(state({})).toBe("state.holding");
  expect(state({ ...turn, pendingPhase: "listening" })).toBe("state.listening");
  expect(state({ ...turn, pendingPhase: "transcribing" })).toBe("wave.transcribingTitle");
  expect(state({ botLive: true })).toBe("state.speaking");
  expect(state({ harness: { "n|a": true }, workingSince: { "n|a": 0 }, now: WORKING_SHOWN_AFTER_MS })).toBe("state.working");
  expect(state({ reconnectShown: true })).toBe("state.offline");
  // The person's turn over speaking, speaking over working.
  expect(state({ ...turn, pendingPhase: "listening", botLive: true })).toBe("state.listening");
  expect(state({ botLive: true, harness: { "n|a": true }, workingSince: { "n|a": 0 }, now: WORKING_SHOWN_AFTER_MS })).toBe("state.speaking");
});

test("the spoken page: about 160 characters, cut after a whole word, an ellipsis where more follows", () => {
  expect(spokenPage("", 0)).toBeNull();
  expect(spokenPage("Hello there", 0)).toEqual({ text: "Hello there", lit: 0, more: false });
  const text = Array.from({ length: 60 }, (_, i) => "word" + i).join(" ");
  const first = spokenPage(text, 5)!;
  expect(first.text.length).toBeLessThanOrEqual(SURFACE_PAGE_CHARS + 1);
  expect(first.text.endsWith("…")).toBe(true);
  expect(first.text.slice(0, -1)).toMatch(/word\d+$/); // never inside a word
  expect(first.more).toBe(true);
  // Once the page's last word is lit, the next page.
  const next = spokenPage(text, first.text.length)!;
  expect(next.text.startsWith("word")).toBe(true);
  expect(next.text).not.toBe(first.text);
  expect(spokenPage(text, text.length)!.more).toBe(false);
});

test("lit rounds down to a word's start, never ahead of the voice", () => {
  expect(spokenPage("Hello there", 3)).toMatchObject({ lit: 0 });
  expect(spokenPage("Hello there", 5)).toMatchObject({ lit: 5 });
  expect(spokenPage("Hello there", 8)).toMatchObject({ lit: 6 });
  expect(spokenPage("Hello there", 11)).toMatchObject({ lit: 11 });
});

test("a sentence end in the last 40 characters is the better cut", () => {
  const sentence = "This sentence ends well before the limit of a page.";
  const text = sentence + " " + Array.from({ length: 30 }, () => "filler").join(" ");
  const first = spokenPage(text, 0)!;
  const plain = spokenPage(text.replace(".", ""), 0)!;
  // The page is cut where the first sentence ends only when that falls in the window: build one that does.
  const long = "a ".repeat(60) + "Done here. " + "b ".repeat(40);
  const page = spokenPage(long, 0)!;
  expect(page.text).toBe(("a ".repeat(60) + "Done here.").trimEnd() + "…");
  expect(first.text.length).toBeLessThanOrEqual(SURFACE_PAGE_CHARS + 1);
  expect(plain.more).toBe(true);
});

test.each([
  ["ja", "今日はいい天気ですね。散歩に行きましょう。".repeat(12)],
  ["zh-Hans", "今天天气很好,我们去公园散步吧。".repeat(14)],
])("%s captions: one heard character does not light the whole run, and the page does not jump to the last", (locale, text) => {
  const none = spokenPage(text, 0, undefined, locale)!;
  const one = spokenPage(text, 1, undefined, locale)!;
  expect(one.text).toBe(none.text);
  expect(one.lit).toBeLessThan(5);
  expect(one.text.length).toBeLessThanOrEqual(SURFACE_PAGE_CHARS + 1);
  expect(none.more).toBe(true);
  // Heard up to the middle of the first page: still the first page, lit never past what was heard.
  const half = spokenPage(text, 40, undefined, locale)!;
  expect(half.text).toBe(none.text);
  expect(half.lit).toBeLessThanOrEqual(40);
  expect(half.lit).toBeGreaterThan(0);
});

function clock() {
  let now = 1000;
  const timers: { at: number; run: () => void; id: number }[] = [];
  let id = 0;
  const api: SurfaceClock & { advance(ms: number): void } = {
    now: () => now,
    setTimeout: (run, ms) => { timers.push({ at: now + ms, run, id: ++id }); return id; },
    clearTimeout: (timer) => { const i = timers.findIndex((t) => t.id === timer); if (i >= 0) timers.splice(i, 1); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        now = due.at;
        due.run();
      }
      now = end;
    },
  };
  return api;
}

const saying = (text: string, to = 0, thread = "n|a") => ({ role: "assistant" as const, segment: "s1", thread, text, time: 1, karaoke: { from: 0, to }, playback: "playing" });

function room(extra: Record<string, unknown> = {}) {
  return createRoomSessionStore({ ...base, botLive: true, karaokeState: { segment: "s1", from: 0, to: 0 },
    history: [saying("A reply the agent is saying right now.")], ...extra } as never);
}

function host(on = true) {
  const api = { on, active: () => api.on, still: vi.fn(), forget: vi.fn() };
  return api;
}
const options = (api: ReturnType<typeof host>, time = clock(), draw: (id: string, px: number) => Promise<{ png: string; px: number; k: number } | null> = async () => null) => ({ clock: time, bridge: () => api, draw });
const userMessage = (text: string, segment = "u1", thread = "n|a") => ({ role: "user" as const, name: "You", segment, thread, text, time: 5 });

test("an app without a surface gets nothing published", () => {
  const store = room();
  const api = host(false);
  const draw = vi.fn(async () => null);
  startCallSurface(store, options(api, clock(), draw));
  expect(store.getState().callSurface.page).toBeNull();
  expect(draw).not.toHaveBeenCalled();
});

test("the page is sent at most every two seconds, and follows the voice", () => {
  const time = clock();
  const store = room();
  const pages: unknown[] = [];
  store.subscribe((now, before) => { if (now.callSurface.page !== before.callSurface.page) pages.push(now.callSurface.page); });
  startCallSurface(store, options(host(), time));
  const first = store.getState().callSurface.page;
  expect(first).toMatchObject({ text: "A reply the agent is saying right now.", lit: 0 });
  const sent = pages.length;
  // Cues arrive faster than that: none of them is sent before the time is up.
  store.patch({ karaokeState: { segment: "s1", from: 0, to: 8 } });
  time.advance(500);
  store.patch({ karaokeState: { segment: "s1", from: 0, to: 20 } });
  time.advance(500);
  expect(store.getState().callSurface.page).toEqual(first);
  expect(pages.length).toBe(sent);
  time.advance(PAGE_SURFACE_MS);
  expect(store.getState().callSurface.page!.lit).toBeGreaterThan(0);
});

/** A call whose person has just sent "Run the tests" (the said text is up), the conversation busy since `busy`. */
function sent(facts: Record<string, unknown> = {}, busy = 1000) {
  const time = clock();
  const store = room({ botLive: false, karaokeState: null, history: [], userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "listening",
    harness: { "n|a": true }, workingSince: { "n|a": busy }, now: busy + 500, ...facts });
  startCallSurface(store, options(host(), time));
  store.patch({ pendingPhase: "", userTurn: null, history: [userMessage("Run the tests")] });
  return { store, time, view: () => store.getState().callSurface };
}

test("while the person's words show, the native surface says working at once, with its timer: not after the 3 s the stage waits", () => {
  const { store, view } = sent();
  // Busy for half a second: the stage and the card do not say working yet, the native surface's line and timer do.
  expect(store.getState().callCard.mood).not.toBe("working");
  expect(view()).toMatchObject({ said: "Run the tests", words: { state: "state.working" }, workingSince: 1000 });
  // Nothing busy: no time is made up.
  const idle = sent({ harness: {}, workingSince: {} });
  expect(idle.view()).toMatchObject({ said: "Run the tests", words: { state: "state.working" }, workingSince: null });
});

test("the working line is carried past the said text until the stage's Working takes over, with the same timer", () => {
  const { store, time, view } = sent();
  time.advance(PAGE_MS + 1);
  expect(view().said).toBeNull();
  // Busy for 2.5 s: said is over, the stage's Working is not due yet. The line and the timer do not drop.
  store.patch({ now: 3500 });
  expect(view()).toMatchObject({ said: null, words: { state: "state.working" }, workingSince: 1000 });
  store.patch({ now: 1000 + WORKING_SHOWN_AFTER_MS });
  expect(store.getState().callCard.mood).toBe("working");
  expect(view()).toMatchObject({ words: { state: "state.working" }, workingSince: 1000 });
  // The work ends: resting, and no timer.
  store.patch({ harness: { "n|a": false }, workingSince: {} });
  expect(view()).toMatchObject({ words: { state: "state.resting" }, workingSince: null });
});

test("the carried working line ends with the work, and is not made from nothing", () => {
  const { store, time, view } = sent();
  time.advance(PAGE_MS + 1);
  store.patch({ harness: { "n|a": false }, workingSince: {} });
  expect(view()).toMatchObject({ said: null, words: { state: "state.resting" }, workingSince: null });
  // Busy with no said text before: the stage's wait, as ever.
  const quiet = room({ botLive: false, karaokeState: null, history: [], harness: { "n|a": true }, workingSince: { "n|a": 1000 }, now: 1500 });
  startCallSurface(quiet, options(host(), clock()));
  quiet.patch({ now: 2000 });
  expect(quiet.getState().callSurface).toMatchObject({ words: { state: "state.resting" }, workingSince: null });
});

test("what is happening wins over the said text's working line, and over its carry", () => {
  const lines = (facts: Record<string, unknown>) => sent(facts).view().words.state;
  const turn = { userTurn: { id: "u", segment: "u", thread: "n|a" } };
  // The said text is up, and then the person speaks again, the agent speaks, the call drops, or the conversation holds.
  const again = sent();
  again.store.patch({ ...turn, pendingPhase: "listening" });
  expect(again.view().words.state).toBe("state.listening");
  again.store.patch({ pendingPhase: "transcribing" });
  expect(again.view().words.state).toBe("wave.transcribingTitle");
  again.store.patch({ pendingPhase: "", userTurn: null, botLive: true });
  expect(again.view().words.state).toBe("state.speaking");
  again.store.patch({ botLive: false, reconnectShown: true });
  expect(again.view().words.state).toBe("state.offline");
  const hold = people.map((p) => p.thread_id === "a" ? { ...p, reach: { state: "holding" } } : p);
  expect(lines({ people: hold })).toBe("state.holding");
  // Carried: the same, once the said text is over.
  const carried = sent();
  carried.time.advance(PAGE_MS + 1);
  carried.store.patch({ botLive: true });
  expect(carried.view().words.state).toBe("state.speaking");
  carried.store.patch({ botLive: false, ...turn, pendingPhase: "listening" });
  expect(carried.view().words.state).toBe("state.listening");
});

test("another conversation does not inherit the carried working line", () => {
  const { store, time, view } = sent({ harness: { "n|a": true, "n|b": true }, workingSince: { "n|a": 1000, "n|b": 1200 } });
  time.advance(PAGE_MS + 1);
  expect(view().words.state).toBe("state.working");
  store.patch({ roomBinding: { thread_id: "b", title: "B" } });
  expect(view()).toMatchObject({ said: null, words: { state: "state.resting" }, workingSince: null });
});

test("browsing another conversation, the call's own surface goes on: its captions, its Cancel Send, its said text", () => {
  const time = clock();
  const store = room({ viewedThread: "n|b", botLive: true });
  startCallSurface(store, options(host(), time));
  expect(store.getState().conversation.thread).toBe("n|b");
  expect(store.getState().callSurface.page).toMatchObject({ text: "A reply the agent is saying right now." });
  store.patch({ userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "transcribing" });
  expect(store.getState().callSurface.pendingCancellable).toBe(true);
  expect(store.getState().conversation.pendingCancellable).toBe(false);
  store.patch({ pendingPhase: "", userTurn: null, history: [...store.getState().facts.history, userMessage("Run the tests")] });
  expect(store.getState().callSurface.said).toBe("Run the tests");
});

test("the said text stays for three seconds", () => {
  const time = clock();
  const store = room({ botLive: false, karaokeState: null, history: [], userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "listening" });
  startCallSurface(store, options(host(), time));
  store.patch({ pendingPhase: "", userTurn: null, history: [userMessage("Run the tests")] });
  expect(store.getState().callSurface.said).toBe("Run the tests");
  time.advance(PAGE_MS - 1);
  expect(store.getState().callSurface.said).toBe("Run the tests");
  time.advance(2);
  expect(store.getState().callSurface.said).toBeNull();
});

test("a message typed, not spoken, is not said", () => {
  const store = room({ botLive: false, karaokeState: null, history: [] });
  startCallSurface(store, options(host()));
  store.patch({ history: [userMessage("typed")] });
  expect(store.getState().callSurface.said).toBeNull();
});

test("switching the call's conversation within the three seconds drops the said text of the last one", () => {
  const time = clock();
  const store = room({ botLive: false, karaokeState: null, history: [], userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "listening" });
  startCallSurface(store, options(host(), time));
  store.patch({ pendingPhase: "", userTurn: null, history: [userMessage("Run the tests")] });
  expect(store.getState().callSurface.said).toBe("Run the tests");
  time.advance(1000);
  store.patch({ roomBinding: { thread_id: "b", title: "B" } });
  expect(store.getState().callSurface.said).toBeNull();
  time.advance(5000);
  expect(store.getState().callSurface.said).toBeNull();
});

test("a surface opened during a pending spoken turn does not say the last message as new", () => {
  const store = room({ botLive: false, karaokeState: null, history: [userMessage("An older message", "u0")], userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "listening" });
  startCallSurface(store, options(host()));
  expect(store.getState().callSurface.said).toBeNull();
  store.patch({ pendingPhase: "", userTurn: null, history: [userMessage("An older message", "u0"), userMessage("The new one", "u1")] });
  expect(store.getState().callSurface.said).toBe("The new one");
});

test("when the surface closes it stops: no more pages, nothing kept, the host told to forget", async () => {
  const time = clock();
  const store = room();
  const api = host();
  const draw = async (id: string, px: number) => ({ png: "png-" + id, px, k: 1 });
  startCallSurface(store, options(api, time, draw));
  await vi.waitFor(() => expect(Object.keys(store.getState().facts.surfaceLive!.stills).length).toBe(4));
  api.on = false;
  time.advance(PAGE_SURFACE_MS);
  expect(store.getState().facts.surfaceLive).toBeNull();
  expect(store.getState().callSurface.page).toBeNull();
  expect(api.forget).toHaveBeenCalledWith(expect.arrayContaining([stillId("n|a", STILL_PX)]));
  const before = store.getState();
  time.advance(PAGE_SURFACE_MS * 5);
  expect(store.getState()).toBe(before);
});

test("stills go by reference: the bytes cross once per id, before the snapshot that names it, and the snapshot holds only { id, k }", async () => {
  const store = room();
  const api = host();
  const draw = vi.fn(async (id: string, px: number) => ({ png: "png-" + id, px, k: 1 }));
  const seen: string[] = [];
  store.subscribe((now) => { const ref = now.callSurface.still; if (ref && !seen.includes(ref.id)) { seen.push(ref.id); expect(api.still).toHaveBeenCalledWith(expect.objectContaining({ id: ref.id })); } });
  startCallSurface(store, options(api, clock(), draw));
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(4));
  const view = store.getState().callSurface;
  expect(view.still).toEqual({ id: stillId("n|a", STILL_PX), k: 1 });
  expect(view.others.map((o) => o.still)).toEqual(["n|b", "n|c", "n|d"].map((id) => ({ id: stillId(id, FACE_PX), k: 1 })));
  expect(JSON.stringify(view)).not.toContain("png-");
  expect(api.still).toHaveBeenCalledWith({ id: stillId("n|a", STILL_PX), png: "png-n|a", px: STILL_PX });
  expect(api.still).toHaveBeenCalledWith({ id: stillId("n|b", FACE_PX), png: "png-n|b", px: FACE_PX });
  // More activity does not send them again.
  store.patch({ botLive: false });
  store.patch({ history: [...store.getState().facts.history, userMessage("x")] });
  expect(draw).toHaveBeenCalledTimes(4);
  expect(api.still).toHaveBeenCalledTimes(4);
});

test("a still that cannot be drawn is not drawn again with every word", async () => {
  const store = room();
  const api = host();
  const draw = vi.fn(async (id: string, px: number) => (id === "n|b" ? null : { png: "png-" + id, px, k: 1 }));
  startCallSurface(store, options(api, clock(), draw));
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(3));
  for (const to of [1, 2, 3]) {
    store.patch({ karaokeState: { segment: "s1", from: 0, to } });
    await new Promise((resolve) => setTimeout(resolve, 0)); // the draws of this word settle
  }
  expect(draw).toHaveBeenCalledTimes(4);
  expect(Object.keys(store.getState().facts.surfaceLive!.stills)).not.toContain(stillId("n|b", FACE_PX));
});

test("stills of a removed conversation are given back and no longer kept", async () => {
  const store = room();
  const api = host();
  startCallSurface(store, options(api, clock(), async (id, px) => ({ png: "png-" + id, px, k: 1 })));
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(4));
  store.patch({ people: people.filter((p) => p.thread_id !== "b") });
  expect(api.forget).toHaveBeenCalledWith([stillId("n|b", FACE_PX)]);
  expect(Object.keys(store.getState().facts.surfaceLive!.stills)).not.toContain(stillId("n|b", FACE_PX));
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(5)); // "e" takes the third face
  expect(Object.keys(store.getState().facts.surfaceLive!.stills).length).toBe(4);
});

test("switching conversation keeps the last state line until the new one lands", () => {
  const store = createRoomSessionStore({ ...base, botLive: true } as never);
  expect(store.getState().callSurface.words.state).toBe("state.speaking");
  store.patch({ botLive: false, switching: true });
  expect(store.getState().callCard.busyReason).toBe("switching");
  expect(store.getState().callSurface.words.state).toBe("state.speaking");
  store.patch({ switching: false });
  expect(store.getState().callSurface.words.state).toBe("state.resting");
});

test("workingSince is the call's conversation's busy start while it shows as working, and absent otherwise", () => {
  const store = createRoomSessionStore({ ...base, harness: { "n|a": true }, workingSince: { "n|a": 1000 }, now: 1000 + 60_000 } as never);
  expect(store.getState().callSurface).toMatchObject({ workingSince: 1000, words: { state: "state.working" } });
  const idle = createRoomSessionStore({ ...base } as never);
  expect(idle.getState().callSurface.workingSince).toBeNull();
});

test("workingSince is sent while the state shows as working: a busy conversation that cannot receive is still working", () => {
  const holding = people.map((p) => p.thread_id === "a" ? { ...p, reach: { state: "holding" } } : p);
  const store = createRoomSessionStore({ ...base, people: holding, harness: { "n|a": true }, workingSince: { "n|a": 1000 }, now: 1000 + 60_000 } as never);
  expect(store.getState().callSurface).toMatchObject({ workingSince: 1000, words: { state: "state.working" } });
});

test("the estimated reading rounds down when asked: never a character ahead of the voice", () => {
  const first = readOn(null, "s", true, null, 0, Math.floor)!;
  const later = readOn(first, "s", true, null, 99, Math.floor)!; // 0.099 s x 15 = 1.485 characters
  expect(later.position).toBe(1);
  expect(readOn(first, "s", true, null, 99)!.position).toBe(1);
  expect(readOn(first, "s", true, null, 120, Math.floor)!.position).toBe(1); // 1.8 -> 1, where round gives 2
  expect(readOn(first, "s", true, null, 120)!.position).toBe(2);
});

test("a host that reloads holds none of the stills: the refs go, then every PNG is sent to the new one", async () => {
  const store = room();
  const first = host(), second = host();
  let current = first;
  startCallSurface(store, { clock: clock(), bridge: () => current, draw: async (id, px) => ({ png: "png-" + id, px, k: 1 }) });
  await vi.waitFor(() => expect(first.still).toHaveBeenCalledTimes(4));
  current = second;
  store.patch({ botLive: false });
  await vi.waitFor(() => expect(second.still).toHaveBeenCalledTimes(4));
  expect(store.getState().callSurface.still).toEqual({ id: stillId("n|a", STILL_PX), k: 1 });
  expect(second.still).toHaveBeenCalledWith({ id: stillId("n|a", STILL_PX), png: "png-n|a", px: STILL_PX });
});

test("a still is let go of only after the snapshot stops naming it: on removal, on close and on stop", async () => {
  const store = room();
  const api = host();
  const named = () => { const view = store.getState().callSurface; return [view.still?.id, ...view.others.map((o) => o.still?.id)].filter(Boolean); };
  const forgotten: string[][] = [];
  api.forget.mockImplementation((ids: string[]) => { forgotten.push(ids.filter((id) => named().includes(id))); });
  const stop = startCallSurface(store, options(api, clock(), async (id, px) => ({ png: "png-" + id, px, k: 1 })));
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(4));
  store.patch({ people: people.filter((p) => p.thread_id !== "b") });
  expect(api.forget).toHaveBeenCalledWith([stillId("n|b", FACE_PX)]);
  await vi.waitFor(() => expect(api.still).toHaveBeenCalledTimes(5));
  stop();
  expect(store.getState().facts.surfaceLive).toBeNull();
  expect(api.forget).toHaveBeenCalledTimes(2);
  expect(forgotten).toEqual([[], []]);
});

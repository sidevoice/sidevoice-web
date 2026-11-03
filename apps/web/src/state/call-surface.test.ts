import { afterEach, expect, test, vi } from "vitest";
import { createRoomSessionStore, speakWith } from "./room-session-state.js";
import { spokenPage, SURFACE_PAGE_CHARS } from "./call-surface.js";
import { startCallSurface, PAGE_SURFACE_MS, STILL_PX, FACE_PX, type SurfaceClock } from "./call-surface-publisher";
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
  expect(view).toMatchObject({ pendingCancellable: false, reach: "listening", page: null, said: null, stills: {} });
  expect(view.words).toMatchObject({ state: "state.resting", mute: "card.mute", skip: "liveActivity.skipShort", skipName: "card.skip", cancelSend: "stage.cancelTurn", hangUp: "card.hangUp" });
  expect(view.words.route).toBe('liveActivity.routeName {"route":"{route}"}');
});

test("model and machine come with the current conversation, the others as up to three faces and their total", () => {
  const view = surface({ pairings: [] });
  expect(view.model).toBe("claude-opus-5-5");
  expect(view.effort).toBe("high");
  expect(view.others.total).toBe(4);
  expect(view.others.items.map((item) => item.threadId)).toEqual(["n|b", "n|c", "n|d"]);
  expect(view.words.conversations).toBe('card.conversationsCount {"n":4}');
});

test("pendingCancellable is the open turn's, and the state line follows the turn, the reach and the mood", () => {
  const turn = { userTurn: { id: "t", segment: "t", thread: "n|a" } };
  expect(surface({ ...turn, pendingPhase: "transcribing" })).toMatchObject({ pendingCancellable: true, words: { state: "wave.transcribingTitle" } });
  expect(surface({ ...turn, pendingPhase: "listening" }).words.state).toBe("wave.listeningTitle");
  expect(surface({ botLive: true }).words.state).toBe("state.speaking");
  expect(surface({ reconnectShown: true }).words.state).toBe("state.offline");
});

test("the spoken page: at most 160 characters, cut after a word, the lit count within it, an ellipsis where more follows", () => {
  expect(spokenPage("", 0)).toBeNull();
  expect(spokenPage("Hello there", 0)).toEqual({ text: "Hello there", lit: 0, more: false });
  expect(spokenPage("Hello there", 3)).toEqual({ text: "Hello there", lit: 5, more: false }); // a word lights whole
  const text = Array.from({ length: 60 }, (_, i) => "word" + i).join(" ");
  const first = spokenPage(text, 5)!;
  expect(first.text.length).toBeLessThanOrEqual(SURFACE_PAGE_CHARS + 1);
  expect(first.text.endsWith("…")).toBe(true);
  expect(first.more).toBe(true);
  // Once the page's last word is lit, the next page.
  const next = spokenPage(text, first.text.length)!;
  expect(next.text.startsWith("word")).toBe(true);
  expect(next.text).not.toBe(first.text);
  expect(next.lit).toBeLessThanOrEqual(next.text.length);
  expect(spokenPage(text, text.length)!.more).toBe(false);
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

const saying = (text: string, to = 0) => ({ role: "assistant", segment: "s1", thread: "n|a", text, time: 1, karaoke: { from: 0, to }, playback: "playing" });

function room(extra: Record<string, unknown> = {}) {
  const store = createRoomSessionStore({ ...base, botLive: true, karaokeState: { segment: "s1", from: 0, to: 0 },
    history: [saying("A reply the agent is saying right now.")], ...extra } as never);
  return store;
}

test("an app without a surface gets nothing published", () => {
  const store = room();
  const draw = vi.fn(async () => null);
  startCallSurface(store, { clock: clock(), wanted: () => false, draw });
  expect(store.getState().callSurface.page).toBeNull();
  expect(draw).not.toHaveBeenCalled();
});

test("the page is sent at most every two seconds, and follows the voice", () => {
  const time = clock();
  const store = room();
  const pages: unknown[] = [];
  store.subscribe((now, before) => { if (now.callSurface.page !== before.callSurface.page) pages.push(now.callSurface.page); });
  startCallSurface(store, { clock: time, wanted: () => true, draw: async () => null });
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

test("the said text stays for three seconds", () => {
  const time = clock();
  const store = room({ botLive: false, karaokeState: null, history: [], userTurn: { id: "t", segment: "t", thread: "n|a" }, pendingPhase: "listening" });
  startCallSurface(store, { clock: time, wanted: () => true, draw: async () => null });
  store.patch({ pendingPhase: "", userTurn: null, history: [{ role: "user", name: "You", segment: "u1", thread: "n|a", text: "Run the tests", time: 5 }] });
  expect(store.getState().callSurface.said).toBe("Run the tests");
  time.advance(PAGE_MS - 1);
  expect(store.getState().callSurface.said).toBe("Run the tests");
  time.advance(2);
  expect(store.getState().callSurface.said).toBeNull();
});

test("a message typed, not spoken, is not said", () => {
  const time = clock();
  const store = room({ botLive: false, karaokeState: null, history: [] });
  startCallSurface(store, { clock: time, wanted: () => true, draw: async () => null });
  store.patch({ history: [{ role: "user", name: "You", segment: "u1", thread: "n|a", text: "typed", time: 5 }] });
  expect(store.getState().callSurface.said).toBeNull();
});

test("stills: the current conversation at 3x its slot, up to three faces, k 1 by default, and only for the ones shown", async () => {
  const store = room();
  const draw = vi.fn(async (id: string, px: number) => ({ png: "png-" + id, px, k: 1 }));
  startCallSurface(store, { clock: clock(), wanted: () => true, draw });
  await vi.waitFor(() => expect(Object.keys(store.getState().callSurface.stills).length).toBe(4));
  const { stills } = store.getState().callSurface;
  expect(stills["n|a"]).toEqual({ png: "png-n|a", px: STILL_PX, k: 1 });
  expect(stills["n|b"]!.px).toBe(FACE_PX);
  expect(stills["n|e"]).toBeUndefined();
  expect(draw).toHaveBeenCalledTimes(4);
});

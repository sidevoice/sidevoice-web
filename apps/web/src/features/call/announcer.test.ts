import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import type { SessionFacts } from "../../state/room-session-state.js";
import { callTranslator } from "./call-i18n";
import { WAITING_COALESCE_MS, watchAnnouncements } from "./announcer";

// Call model B's announcer (briefs/CALL-MODEL-B-SPEC.md §4): only what it lists, each once, the marks gathered.
const person = (thread_id: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title: thread_id.toUpperCase(), available: true, reach: { state: "listening" }, node: "m", working: false, ...extra });
const unheard = (since: number) => ({ unheard: { count: 1, since } });

let store: RoomStore, said: string[], stop: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  store = createRoomStore();
  store.patch({ ws: {}, sessionId: "s", callNode: "m", roomBinding: { thread_id: "a", binding_id: "b" }, machineLinks: { m: { reach: "ok", via: "node" } },
    people: [person("a"), person("b"), person("c")] } as Partial<SessionFacts>);
  said = [];
  stop = watchAnnouncements(store, (text) => said.push(text), callTranslator("en"));
});
afterEach(() => { stop(); vi.useRealTimers(); });
const patch = (facts: Partial<SessionFacts>) => store.patch(facts);

test("other conversations waiting for you are gathered for a few seconds and said once each", () => {
  patch({ people: [person("a"), person("b", unheard(1)), person("c")] } as never);
  expect(said).toEqual([]);
  patch({ people: [person("a"), person("b", unheard(1)), person("c", unheard(2))] } as never);
  vi.advanceTimersByTime(WAITING_COALESCE_MS);
  expect(said).toEqual(["2 conversations are waiting for you"]);
  // The same marks again (a poll) are not said again; a new mark on one is.
  patch({ people: [person("a"), person("b", unheard(1)), person("c", unheard(2)), person("d")] } as never);
  patch({ people: [person("a"), person("b"), person("c", unheard(2))] } as never);
  patch({ people: [person("a"), person("b", unheard(9)), person("c", unheard(2))] } as never);
  vi.advanceTimersByTime(WAITING_COALESCE_MS);
  expect(said).toEqual(["2 conversations are waiting for you", "B is waiting for you"]);
});

test("not the active conversation's marks, nor wanting to talk", () => {
  patch({ people: [person("a", unheard(1)), person("b", { ...unheard(1), working: true })] } as never);
  vi.advanceTimersByTime(WAITING_COALESCE_MS);
  expect(said).toEqual([]);
});

test("held while the person speaks or a reply plays, then said in the next gap", () => {
  patch({ botLive: true });
  patch({ people: [person("a"), person("b", unheard(1))] } as never);
  vi.advanceTimersByTime(WAITING_COALESCE_MS);
  expect(said).toEqual([]);
  patch({ botLive: false, userLive: true });
  expect(said).toEqual([]);
  patch({ userLive: false });
  expect(said).toEqual(["B is waiting for you"]);
});

test("the voice turning itself off, the idle warning, a lost speaker and a Hear it with no answer: once each", () => {
  patch({ voiceOn: true });
  patch({ voiceIdleWarning: true });
  patch({ voiceIdleWarning: true, now: 1 });
  patch({ voiceOn: false, voiceIdleWarning: false, voiceOffReason: "idle" });
  patch({ agentsMuted: true, agentsMutedBy: "output-lost" });
  patch({ hearing: { thread: "m|b", state: "asking" } });
  patch({ hearing: { thread: "m|b", state: "no-answer" } });
  expect(said).toEqual([
    "Still there? Voice turns off in 1 minute.",
    "Voice turned off after 15 minutes without activity.",
    "Speaker disconnected. Agents muted.",
    "B didn't answer by voice.",
  ]);
});

test("not what the person did, nor what an alert already says", () => {
  patch({ voiceOn: true });
  patch({ agentsMuted: true, agentsMutedBy: "person" });
  patch({ voiceOn: false });
  patch({ voiceOffReason: "micBlocked" });
  expect(said).toEqual([]);
});

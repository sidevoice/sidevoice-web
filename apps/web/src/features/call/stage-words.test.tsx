import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { RoomStoreContext, createRoomStore } from "../../state/room-store";
import type { SessionFacts } from "../../state/room-session-state.js";
import { CAPTIONS_KEY, setCaptions } from "../../state/captions";
import { PACE } from "./speech-chunks";
import { StageTile } from "./CallStage";

/* The words go on five times a second while the voice says them (speech-reading.ts): that draws the balloon, never the
 * tile around it (its title, its badge, the creature, which hold Radix popovers and tooltips) — desktop#149. */

// What draws the tile's title is counted; it still draws what it drew.
const headings = vi.hoisted(() => ({ renders: 0 }));
vi.mock("./CallDetails", async (original) => {
  const module = await original<typeof import("./CallDetails")>();
  return { ...module, StageHeading: (props: Parameters<typeof module.StageHeading>[0]) => { headings.renders += 1; return module.StageHeading(props); } };
});
vi.mock("../../services/room-session-controller.js", () => ({}));

const REPLY = "Okay. I'll start with the login and then look at the cart tests. I'll tell you as soon as I have something.";
const facts = (extra: Partial<SessionFacts> = {}): Partial<SessionFacts> => ({
  machinesReady: true, callNode: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
  people: [{ thread_id: "t-login", title: "Fix the slow login", available: true, reach: { state: "listening" }, node: "fp-1", machine: { host: "Laptop", id: "m1" }, harness: "claude" }],
  history: [{ segment: "h-2", thread: "fp-1|t-login", role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" }],
  botLive: true, karaokeState: { segment: "h-2", from: 0, to: REPLY.length },
  ...extra,
} as Partial<SessionFacts>);

beforeEach(() => { vi.useFakeTimers(); headings.renders = 0; localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

function tile(extra: Partial<SessionFacts> = {}) {
  const store = createRoomStore();
  act(() => store.patch(facts(extra)));
  render(<RoomStoreContext.Provider value={store}><StageTile /></RoomStoreContext.Provider>);
  return store;
}
const lit = () => document.querySelector(".stage-bubble .karaoke-played")?.textContent ?? "";

test("the balloon's words go on and the tile around it is not drawn again", () => {
  tile();
  const before = headings.renders;
  expect(before).toBeGreaterThan(0);
  act(() => { vi.advanceTimersByTime(400); });
  const early = lit();
  act(() => { vi.advanceTimersByTime(2000); });
  expect(lit().length).toBeGreaterThan(early.length);
  expect(headings.renders).toBe(before);
});

test("with captions off nothing ticks, and turned on mid-reply they find the words where the voice is", () => {
  localStorage.setItem(CAPTIONS_KEY, "off");
  tile();
  act(() => { vi.advanceTimersByTime(3000); });
  expect(document.querySelector(".stage-bubble")).toBeNull();
  // Nothing is drawn, nothing keeps time: no interval for the words.
  expect(vi.getTimerCount()).toBe(0);
  act(() => setCaptions(true));
  // Three seconds in, at a speaking pace (PACE characters a second): not the start of the reply again.
  expect(lit().length).toBeGreaterThanOrEqual(PACE * 2);
  expect(lit().length).toBeLessThanOrEqual(PACE * 4);
});

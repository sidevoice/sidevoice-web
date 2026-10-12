import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RoomProvider } from "../../app/RoomProvider";
import type { SessionFacts } from "../../state/room-session-state.js";
import { createRoomStore, type RoomStore } from "../../state/room-store";
import { cardCaption, CardCaptionFeed, ENDED_SHOWN_MS } from "./CardCaptionFeed";
import { SENT_LEAVING_MS, SENT_SHOWN_MS } from "./speech-reading";

// The desktop card's caption (FLOATING-CARD-SPEC FC8): what the room publishes on its caption channel, read on the
// stage's own clocks, for the conversation the call is on.
const REPLY = "Okay. I'll start with the login and then look at the cart tests.";

test("the first that applies: your turn (even over a reply it talks over), what it sent, the reply, one in writing, one that ended", () => {
  const live = { current: { start: 0, end: 5, text: "Okay." }, previous: null, spoken: 3 };
  const none = { open: false, sent: null, live: null, written: null, ended: null };
  expect(cardCaption({ ...none, open: true, live })).toEqual({ who: "you", previous: "", current: "", spoken: null, source: "voice" });
  expect(cardCaption({ ...none, sent: "Run the tests", live })).toMatchObject({ who: "you", current: "Run the tests" });
  expect(cardCaption({ ...none, live, written: "In writing" })).toEqual({ who: "agent", previous: "", current: "Okay.", spoken: 3, source: "voice" });
  expect(cardCaption({ ...none, written: "Pushed.", ended: "Okay." })).toMatchObject({ source: "written", current: "Pushed.", spoken: null });
  expect(cardCaption({ ...none, ended: "Okay." })).toMatchObject({ source: "voice", current: "Okay.", spoken: null });
  expect(cardCaption(none)).toBeNull();
});

let store: RoomStore;
const seen: unknown[] = [];
function room(facts: Partial<SessionFacts> = {}) {
  store = createRoomStore();
  store.patch({
    callNode: "fp-1", ws: {}, sessionId: "s1", roomBinding: { thread_id: "t", title: "Login", binding_id: "b1" },
    people: [{ thread_id: "t", title: "Login", available: true, reach: { state: "listening" }, node: "fp-1" }], ...facts,
  } as Partial<SessionFacts>);
  render(<RoomProvider store={store} runtime={false}><CardCaptionFeed /></RoomProvider>);
  window.sidevoiceUI!.caption!.subscribe((caption) => seen.push(caption));
}
const patch = (facts: Partial<SessionFacts>) => act(() => store.patch(facts));
const last = () => window.sidevoiceUI!.caption!.current();
const reply = (audio: string) => ({ segment: "h-1", thread: "fp-1|t", role: "assistant", text: REPLY, name: "Login", time: 1, session: "s1", audio }) as never;

beforeEach(() => { vi.useFakeTimers(); seen.length = 0; });
afterEach(() => { vi.useRealTimers(); });

test("a reply the call's conversation says: its chunk and the words said, then its last chunk a while, dim", () => {
  room({ history: [reply("playing")], botLive: true, karaokeState: { segment: "h-1", from: 0, to: 5 } });
  act(() => { vi.advanceTimersByTime(1000); });
  expect(last()).toMatchObject({ who: "agent", source: "voice", current: "Okay. I'll start with the login and" });
  expect(last()!.spoken).toBeGreaterThan(0);
  patch({ history: [reply("played")], botLive: false, karaokeState: null });
  expect(last()).toMatchObject({ who: "agent", source: "voice", spoken: null });
  act(() => { vi.advanceTimersByTime(ENDED_SHOWN_MS + 10); });
  expect(last()).toBeNull();
});

test("your turn: open while you talk and it is transcribed, then what it sent for its moment", () => {
  room();
  const turn = { userTurn: { id: "u", segment: "u-1", thread: "fp-1|t" } };
  patch({ ...turn, pendingPhase: "listening" });
  expect(last()).toEqual({ who: "you", previous: "", current: "", spoken: null, source: "voice" });
  patch({ pendingPhase: "transcribing" });
  expect(last()).toMatchObject({ who: "you", current: "" });
  patch({ userTurn: null, pendingPhase: "", history: [{ segment: "u-1", thread: "fp-1|t", role: "user", text: "Run the tests", time: 2, session: "s1" } as never] });
  expect(last()).toMatchObject({ who: "you", current: "Run the tests" });
  act(() => { vi.advanceTimersByTime(SENT_SHOWN_MS + SENT_LEAVING_MS + 10); });
  expect(last()).toBeNull();
});

test("call model B with the agents muted: the reply that came in writing, while its conversation's mark stays", () => {
  const written = { ...(reply("text_only") as object), audio_reason: "agents_muted" } as never;
  room({ callModel: "voice-switch", voiceOn: true, agentsMuted: true, history: [written],
    people: [{ thread_id: "t", title: "Login", available: true, reach: { state: "listening" }, node: "fp-1", working: false, unheard: { count: 1, since: 1 } }] } as Partial<SessionFacts>);
  patch({ now: 1 });
  expect(last()).toMatchObject({ who: "agent", source: "written", current: REPLY, spoken: null });
  patch({ people: [{ thread_id: "t", title: "Login", available: true, reach: { state: "listening" }, node: "fp-1" }] } as Partial<SessionFacts>);
  expect(last()).toBeNull();
});

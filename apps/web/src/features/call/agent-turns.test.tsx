import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ChatMessage } from "../../state/room-types";
import { AGENT_LINGER_MS, SENT_LEAVING_MS, useAgentTurns } from "./speech-reading";

/* The agent's replies on the stage (useAgentTurns): the one sounding, as far as the voice is into it; once its last
 * words are said, it stays AGENT_LINGER_MS whole, then leaves for SENT_LEAVING_MS; a new reply sends the one before
 * away at once. The same reply sounding again — after a pause, or heard again — is the one sounding, at once. */

const A = "Okay. I'll start with the login and then look at the cart tests.";
const B = "Done: the login is fast again.";
const reply = (segment: string, text: string) => ({ segment, role: "assistant", text, time: 1 }) as unknown as ChatMessage;
const a = reply("a", A), b = reply("b", B);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

for (const strict of [false, true]) {
  describe(strict ? "in StrictMode" : "as rendered", () => {
    const wrapper = strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined;
    /** The stage's replies, `sounding` into the one sounding; each turn as [key, how much is lit, leaving]. */
    function stage(sounding: ChatMessage | null = a, spokenTo: number | null = 0) {
      const view = renderHook(({ reply: now, spoken }: { reply: ChatMessage | null; spoken: number | null }) => useAgentTurns(now, spoken),
        { initialProps: { reply: sounding, spoken: spokenTo }, wrapper });
      return {
        to: (now: ChatMessage | null, spoken: number | null = now ? 0 : null) => view.rerender({ reply: now, spoken }),
        turns: () => view.result.current.map((turn) => [turn.key, turn.spoken, turn.leaving]),
        unmount: view.unmount,
      };
    }

    test("the one sounding, as far as the voice is", () => {
      const view = stage(a, 12);
      expect(view.turns()).toEqual([["a", 12, false]]);
      view.to(a, 30);
      expect(view.turns()).toEqual([["a", 30, false]]);
      expect(stage(null).turns()).toEqual([]);
    });

    test("its last words said, it stays AGENT_LINGER_MS whole, then leaves for SENT_LEAVING_MS, then is gone", () => {
      const view = stage(a, 40);
      view.to(null);
      expect(view.turns()).toEqual([["a", A.length, false]]);
      tick(AGENT_LINGER_MS - 1);
      expect(view.turns()).toEqual([["a", A.length, false]]);
      tick(1);
      expect(view.turns()).toEqual([["a", A.length, true]]);
      tick(SENT_LEAVING_MS - 1);
      expect(view.turns()).toEqual([["a", A.length, true]]);
      tick(1);
      expect(view.turns()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });

    test("it leaves with all of it, grown while it sounded", () => {
      const view = stage(reply("a", "Okay."), 5);
      view.to(a, 20);
      view.to(null);
      expect(view.turns()).toEqual([["a", A.length, false]]);
    });

    test("A to B: B sounds, A lifts away at once, and is gone SENT_LEAVING_MS later", () => {
      const view = stage(a, 40);
      view.to(b, 0);
      expect(view.turns()).toEqual([["a", A.length, true], ["b", 0, false]]);
      tick(SENT_LEAVING_MS);
      expect(view.turns()).toEqual([["b", 0, false]]);
    });

    test("B starting while A lingers sends A away at once", () => {
      const view = stage(a, 40);
      view.to(null);
      tick(1000);
      view.to(b, 3);
      expect(view.turns()).toEqual([["a", A.length, true], ["b", 3, false]]);
      tick(SENT_LEAVING_MS);
      expect(view.turns()).toEqual([["b", 3, false]]);
      // A's lingering clock went with it: nothing leaves B.
      tick(AGENT_LINGER_MS);
      expect(view.turns()).toEqual([["b", 3, false]]);
    });

    test("a moment without the voice's place (a pause): back where the voice is, never lit whole meanwhile once it is back, and nothing leaves", () => {
      const view = stage(a, 20);
      view.to(null);
      view.to(a, 22);
      expect(view.turns()).toEqual([["a", 22, false]]);
      // The linger it began has stopped: it stays as long as it sounds.
      tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
      expect(view.turns()).toEqual([["a", 22, false]]);
      // Its end, later: it lingers its own time from then.
      view.to(null);
      tick(AGENT_LINGER_MS - 1);
      expect(view.turns()).toEqual([["a", A.length, false]]);
      tick(1);
      expect(view.turns()).toEqual([["a", A.length, true]]);
    });

    test("heard again while it lingers: from the start, the one sounding, at once", () => {
      const view = stage(a, A.length);
      view.to(null);
      tick(2000);
      view.to(a, 0);
      expect(view.turns()).toEqual([["a", 0, false]]);
      tick(AGENT_LINGER_MS + SENT_LEAVING_MS);
      expect(view.turns()).toEqual([["a", 0, false]]);
    });

    test("heard again while it leaves: back at once, from the start, and not cut short by its leaving's clock", () => {
      const view = stage(a, A.length);
      view.to(null);
      tick(AGENT_LINGER_MS + 100);
      expect(view.turns()).toEqual([["a", A.length, true]]);
      view.to(a, 0);
      expect(view.turns()).toEqual([["a", 0, false]]);
      // Its end again, then B over it: it leaves a whole SENT_LEAVING_MS from then, not when the first leaving would end.
      view.to(b, 0);
      tick(SENT_LEAVING_MS - 1);
      expect(view.turns()).toEqual([["a", A.length, true], ["b", 0, false]]);
      tick(1);
      expect(view.turns()).toEqual([["b", 0, false]]);
    });

    test("no clock is left once the stage goes: lingering, or leaving", () => {
      const lingering = stage(a, 10);
      lingering.to(null);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      lingering.unmount();
      expect(vi.getTimerCount()).toBe(0);
      const leaving = stage(a, 10);
      leaving.to(b, 0);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      leaving.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
}

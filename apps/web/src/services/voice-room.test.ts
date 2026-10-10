import { expect, test } from "vitest";
import { characters, playbackReport, ROOM_PLAYBACK_REASONS, turnMessage } from "./voice-room.js";

/* The voice's events in the room's words. */

test("a turn's phases become the room's voice-user-turn data, the timings under the room's name", () => {
  expect(turnMessage({ phase: "started", turn_id: "t", started_at: 5 })).toEqual({ turn_id: "t", phase: "started", started_at: 5 });
  expect(turnMessage({ phase: "cancelled", turn_id: "t", merged: true })).toEqual({ turn_id: "t", phase: "cancelled", merged: true });
  expect(turnMessage({
    phase: "finished", turn_id: "t", text: "hola", language: "es", started_at: 5, ended_at: 9, merged: false,
    timings: { audio_ms: 1, endpoint_silence_ms: 2, recognition_ms: 3 },
  })).toEqual({
    turn_id: "t", phase: "finished", text: "hola", language: "es", started_at: 5, ended_at: 9, merged: false,
    timings_ms: { audio_ms: 1, endpoint_silence_ms: 2, recognition_ms: 3 },
  });
});

test("how something said ended becomes the room's playback report, with only the room's reasons", () => {
  expect(playbackReport({ status: "heard" }, "héllo 👋")).toEqual({ status: "heard", heard_chars: 7 });
  expect(characters("héllo 👋")).toBe(7);
  const cases: [Parameters<typeof playbackReport>, ReturnType<typeof playbackReport>][] = [
    [[{ status: "heard-up-to", heard_chars: 3, reason: "barge-in" }, "hola"], { status: "interrupted", heard_chars: 3, reason: "user_interrupted" }],
    [[{ status: "not-played", reason: "barge-in" }, "hola"], { status: "unplayed", heard_chars: 0, reason: "newer_turn" }],
    [[{ status: "not-played", reason: "cancelled" }, "hola", "newer_turn"], { status: "unplayed", heard_chars: 0, reason: "newer_turn" }],
    [[{ status: "heard-up-to", heard_chars: 2, reason: "cancelled" }, "hola", "focus_changed"], { status: "interrupted", heard_chars: 2, reason: "focus_changed" }],
    [[{ status: "not-played", reason: "cancelled" }, "hola"], { status: "unplayed", heard_chars: 0, reason: "user_skipped" }],
    [[{ status: "not-played", reason: "stopped" }, "hola"], { status: "unplayed", heard_chars: 0, reason: "call_ended" }],
    [[{ status: "heard-up-to", heard_chars: 1, reason: "failed", code: "x" }, "hola"], { status: "failed", heard_chars: 1 }],
    [[{ status: "not-played", reason: "failed", code: "credential-missing" }, "hola"], { status: "failed", heard_chars: 0 }],
  ];
  for (const [args, report] of cases) {
    expect(playbackReport(...args)).toEqual(report);
    if ("reason" in report) expect(ROOM_PLAYBACK_REASONS).toContain(report.reason);
  }
});

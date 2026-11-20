import { expect, test } from "vitest";
import { carriedTurnEvents } from "./carried-turns.js";

test("a carried turn is said as a start and an end with its words", () => {
  const events = carriedTurnEvents([{ turn_id: "t1", text: "hola", language: "es", started_at: 10, ended_at: 20 }]);
  expect(events).toEqual([[
    { phase: "started", turn_id: "t1", started_at: 10 },
    { phase: "finished", turn_id: "t1", text: "hola", language: "es", started_at: 10, ended_at: 20, merged: false },
  ]]);
});

test("what is not a turn with words is dropped, and a turn is never said twice", () => {
  const events = carriedTurnEvents([null, "x", { turn_id: "", text: "a" }, { turn_id: "a", text: "  " }, { turn_id: "b" },
    { turn_id: "c", text: "one" }, { turn_id: "c", text: "again" }], () => 5);
  expect(events.map(([, end]) => end.text)).toEqual(["one"]);
  expect(events[0][0].started_at).toBe(5);
  expect(carriedTurnEvents(undefined)).toEqual([]);
});

test("a turn the old page had started, or one older than the resume window, is not started again on the wire", () => {
  const events = carriedTurnEvents([
    { turn_id: "told", text: "a", started_at: 1, ended_at: 2, started_told: true },
    { turn_id: "old", text: "b", started_at: 1, ended_at: 2, age_ms: 61000 },
    { turn_id: "fresh", text: "c", started_at: 1, ended_at: 2, age_ms: 5000 },
  ]);
  expect(events.map(([start]) => start.local_only === true)).toEqual([true, true, false]);
});

import { expect, test } from "vitest";
import { createTurnRelay } from "./turn-relay.js";

/* The relay between the voice's turn ids and the room's revisions. */

const turn = (turn_id: string, phase: string, extra: Record<string, unknown> = {}) => ({ client_msg_id: turn_id + phase, turn_id, phase, ...extra });

test("an end waits for its start's answer, then carries the revision the room gave", () => {
  const relay = createTurnRelay();
  expect(relay.route(turn("a", "started"))).toEqual({ send: turn("a", "started") });
  relay.sent("a");
  expect(relay.route(turn("a", "finished", { text: "hola" }))).toEqual({ wait: true });
  expect(relay.answered(4)).toBe("a");
  expect(relay.route(turn("a", "finished", { text: "hola" }))).toEqual({ send: turn("a", "finished", { text: "hola", revision: 4 }) });
});

test("answers go to starts in the order they were sent", () => {
  const relay = createTurnRelay();
  relay.sent("a");
  relay.sent("b");
  expect(relay.answered(1)).toBe("a");
  expect(relay.answered(2)).toBe("b");
  expect(relay.answered(3)).toBeNull();
  expect(relay.revision("b")).toBe(2);
});

test("words whose start the room never answered go offline, and an unheard cancel is nothing", () => {
  const relay = createTurnRelay();
  expect(relay.route(turn("a", "started", { offline: true }))).toEqual({ drop: true });
  expect(relay.route(turn("a", "finished", { text: "sin sala", offline: true }))).toEqual({ send: turn("a", "finished", { text: "sin sala", offline: true }) });
  expect(relay.route(turn("b", "finished", { text: " " }))).toEqual({ drop: true });
  expect(relay.route(turn("c", "cancelled"))).toEqual({ drop: true });
  relay.sent("d");
  relay.refused("d");
  expect(relay.route(turn("d", "finished", { text: "rechazado" }))).toEqual({ send: turn("d", "finished", { text: "rechazado", offline: true }) });
});

test("another session forgets every revision", () => {
  const relay = createTurnRelay();
  relay.sent("a");
  relay.answered(1);
  relay.reset();
  expect(relay.revision("a")).toBeNull();
  expect(relay.route(turn("a", "cancelled"))).toEqual({ drop: true });
});

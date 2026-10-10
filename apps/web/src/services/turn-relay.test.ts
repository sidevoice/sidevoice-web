import { expect, test } from "vitest";
import { createTurnRelay } from "./turn-relay.js";

/* The relay between the voice's named turns and the room, which knows a turn by its name on the session that took its
 * start. Nothing waits for the room's answers. */

const turn = (turn_id: string, phase: string, extra: Record<string, unknown> = {}) => ({ client_msg_id: turn_id + phase, turn_id, phase, ...extra });

test("an end follows its start sent on this session, as it is, with no answer awaited", () => {
  const relay = createTurnRelay();
  expect(relay.route(turn("a", "started"))).toEqual({ send: turn("a", "started") });
  relay.sent("a", "m-a");
  expect(relay.route(turn("a", "finished", { text: "hola" }))).toEqual({ send: turn("a", "finished", { text: "hola" }) });
  expect(relay.route(turn("a", "cancelled"))).toEqual({ send: turn("a", "cancelled") });
});

test("a start sent again (a reload, a resume) is the same turn: its end still goes as it is", () => {
  const relay = createTurnRelay();
  relay.sent("a", "m-a");
  relay.sent("a", "m-a");
  expect(relay.route(turn("a", "finished", { text: "hola" }))).toEqual({ send: turn("a", "finished", { text: "hola" }) });
});

test("a turn started offline is only its finished words, and an unheard cancel is nothing", () => {
  const relay = createTurnRelay();
  expect(relay.route(turn("a", "finished", { text: "sin sala", offline: true }))).toEqual({ send: turn("a", "finished", { text: "sin sala", offline: true }) });
  expect(relay.route(turn("b", "finished", { text: " ", offline: true }))).toEqual({ drop: true });
  expect(relay.route(turn("c", "cancelled"))).toEqual({ drop: true });
});

test("words whose start the room refused, or another session took, go offline", () => {
  const relay = createTurnRelay();
  relay.sent("a", "m-a");
  relay.refusedMessage("m-a");
  expect(relay.route(turn("a", "finished", { text: "rechazado" }))).toEqual({ send: turn("a", "finished", { text: "rechazado", offline: true }) });
  relay.sent("b", "m-b");
  relay.reset();
  expect(relay.route(turn("b", "finished", { text: "otra sesión" }))).toEqual({ send: turn("b", "finished", { text: "otra sesión", offline: true }) });
  expect(relay.route(turn("b", "cancelled"))).toEqual({ drop: true });
  relay.refusedMessage("unknown");
});

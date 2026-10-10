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

test("a start the room has no room for is held with its words, and said again after another turn's end", () => {
  const relay = createTurnRelay();
  const start = turn("b", "started", { started_at: 1 });
  relay.sent("a", "m-a", turn("a", "started"));
  relay.sent("b", "m-b", start);
  relay.refusedMessage("m-b", "room.turns_full");
  expect(relay.route(turn("b", "finished", { text: "espera" }))).toEqual({ hold: true });
  expect(relay.route(turn("b", "cancelled"))).toEqual({ hold: true });
  // `a` ends: `b`'s start is the one to say again; once it went, its words go as they are.
  expect(relay.ended("a", "m-a-end", turn("a", "finished", { text: "a" }))).toEqual(start);
  expect(relay.sent("b", "m-b-again", start)).toBe(true);
  expect(relay.route(turn("b", "finished", { text: "espera" }))).toEqual({ send: turn("b", "finished", { text: "espera" }) });
  expect(relay.ended("b", "m-b-end", turn("b", "finished", { text: "espera" }))).toBeNull();
});

test("an end the room refused because its start was is handed back, and goes as the start now allows", () => {
  const relay = createTurnRelay();
  const words = turn("b", "finished", { text: "palabras" });
  relay.sent("b", "m-b", turn("b", "started"));
  relay.ended("b", "m-b-end", words);
  // The start's refusal arrives first, then the end's.
  relay.refusedMessage("m-b", "room.turns_full");
  expect(relay.refusedMessage("m-b-end", "room.input_ended")).toEqual(words);
  expect(relay.route(words)).toEqual({ hold: true });
  // Any other refused start: the words go as said while away.
  relay.sent("c", "m-c", turn("c", "started"));
  relay.ended("c", "m-c-end", turn("c", "finished", { text: "otra" }));
  relay.refusedMessage("m-c", "room.no_conversation");
  const back = relay.refusedMessage("m-c-end", "room.input_ended");
  expect(relay.route(back)).toEqual({ send: { ...back, offline: true } });
  // An end refused for its own reason, its start taken, is not the relay's to say again.
  relay.sent("d", "m-d", turn("d", "started"));
  relay.ended("d", "m-d-end", turn("d", "finished", { text: "x" }));
  expect(relay.refusedMessage("m-d-end", "room.text_too_long")).toBeNull();
});

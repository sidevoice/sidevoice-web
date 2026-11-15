import { describe, expect, test } from "vitest";
import { activeFilterCount, copyText, facets, filterEvents, headOf, levelOf, NO_FILTERS, segments, tokens, type LogEvent, type LogPiece } from "./log-model";

/* The log as the viewer holds it: events exactly as the file has them, narrowed by level, piece and search. */

const label = (piece: LogPiece) => ({ app: "App", connector: "Connector", core: "Core" })[piece];
const event = (id: string, piece: LogPiece, text: string): LogEvent => ({ id, piece, text });
const BACKTRACE = "14:32:11.205 ERROR panic{thread=tokio}: The core crashed  event=crash_backtrace code.lineno=97\n   0: sidevoice_core::room::mixer::Mixer::push\n             at ./rust/room/mixer.rs:97:13";
const EVENTS = [
  event("1", "app", "14:32:07.412  INFO audio: Microphone opened and listening  stream=microphone"),
  event("2", "app", "14:32:09.031  WARN call{call=c-7f3a}: Lost the connection to the core; trying again  attempt=2"),
  event("3", "connector", "14:32:09.538  INFO delivery{harness=claude}: Received a message from you; its text is not logged  text=<redacted> chars=84"),
  event("4", "core", BACKTRACE),
];

describe("level and head", () => {
  test("the level is the word after the time, padded or not; a line that does not read so is INFO", () => {
    expect(levelOf(EVENTS[0].text)).toBe("INFO");
    expect(levelOf(EVENTS[1].text)).toBe("WARN");
    expect(levelOf(BACKTRACE)).toBe("ERROR");
    expect(levelOf("2026-11-14T14:32:07Z DEBUG x: y")).toBe("DEBUG");
    expect(levelOf("something else entirely")).toBe("INFO");
    // Only the first line decides: a backtrace line saying ERROR is not the event's level.
    expect(levelOf("14:32:07 INFO x: y\n  ERROR in a frame")).toBe("INFO");
  });

  test("the head puts the time, the gap and the level back into the line", () => {
    const head = headOf(EVENTS[1].text)!;
    expect(head).toMatchObject({ time: "14:32:09.031", level: "WARN" });
    expect(head.time + head.gap + head.level + head.rest).toBe(EVENTS[1].text);
    expect(headOf("no time or level")).toBeNull();
  });
});

describe("filters", () => {
  test("no filter keeps every event, in its order", () => {
    expect(filterEvents(EVENTS, NO_FILTERS, label).map((e) => e.id)).toEqual(["1", "2", "3", "4"]);
  });

  test("a level keeps that level and above: warnings and errors, or errors alone", () => {
    expect(filterEvents(EVENTS, { ...NO_FILTERS, level: "warn" }, label).map((e) => e.id)).toEqual(["2", "4"]);
    expect(filterEvents(EVENTS, { ...NO_FILTERS, level: "error" }, label).map((e) => e.id)).toEqual(["4"]);
  });

  test("none chosen is every piece; some chosen is only those", () => {
    expect(filterEvents(EVENTS, { ...NO_FILTERS, pieces: ["app"] }, label).map((e) => e.id)).toEqual(["1", "2"]);
    expect(filterEvents(EVENTS, { ...NO_FILTERS, pieces: ["app", "core"] }, label).map((e) => e.id)).toEqual(["1", "2", "4"]);
  });

  test("the search is not case-sensitive and looks in the whole event, a backtrace included, and in the piece's name", () => {
    expect(filterEvents(EVENTS, { ...NO_FILTERS, query: "MIXER" }, label).map((e) => e.id)).toEqual(["4"]);
    expect(filterEvents(EVENTS, { ...NO_FILTERS, query: "  lost the connection " }, label).map((e) => e.id)).toEqual(["2"]);
    expect(filterEvents(EVENTS, { ...NO_FILTERS, query: "connector" }, label).map((e) => e.id)).toEqual(["3"]);
    expect(filterEvents(EVENTS, { ...NO_FILTERS, query: "nothing like it" }, label)).toEqual([]);
  });

  test("the filters narrow together", () => {
    expect(filterEvents(EVENTS, { query: "call", level: "warn", pieces: ["app"] }, label).map((e) => e.id)).toEqual(["2"]);
    expect(filterEvents(EVENTS, { query: "call", level: "error", pieces: ["app"] }, label)).toEqual([]);
  });

  test("the counts say what each choice would leave under the others: a level's under the pieces and search, a piece's under the level and search", () => {
    expect(facets(EVENTS, NO_FILTERS, label)).toEqual({ level: { all: 4, warn: 2, error: 1 }, piece: { app: 2, connector: 1, core: 1 } });
    expect(facets(EVENTS, { ...NO_FILTERS, pieces: ["app"] }, label)).toEqual({ level: { all: 2, warn: 1, error: 0 }, piece: { app: 2, connector: 1, core: 1 } });
    expect(facets(EVENTS, { ...NO_FILTERS, level: "warn" }, label).piece).toEqual({ app: 1, connector: 0, core: 1 });
    expect(facets(EVENTS, { ...NO_FILTERS, query: "core" }, label).level.all).toBe(2);
  });

  test("the badge counts the level and each piece, not the search", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ query: "x", level: "warn", pieces: ["app", "core"] })).toBe(3);
  });
});

describe("what Copy puts on the clipboard", () => {
  test("each event led by its piece in brackets, as the file has it, a backtrace under its first line", () => {
    const lowercase = (piece: LogPiece) => label(piece).toLowerCase();
    expect(copyText(EVENTS, lowercase)).toBe([
      "[app] " + EVENTS[0].text, "[app] " + EVENTS[1].text, "[connector] " + EVENTS[2].text, "[core] " + BACKTRACE].join("\n"));
    expect(copyText([], lowercase)).toBe("");
  });

  test("the piece is said as the language names it", () => {
    expect(copyText([EVENTS[2]], () => "conector")).toBe("[conector] " + EVENTS[2].text);
  });
});

describe("what a line holds that is not plain text", () => {
  test("the search's matches and the log's redaction markers are marked; joined, the parts are the text", () => {
    const text = "14:32:09 INFO delivery: Received text=<redacted> and [redacted] later";
    expect(segments(text, "RECEIVED").map((s) => [s.text, s.kind])).toEqual([
      ["14:32:09 INFO delivery: ", undefined], ["Received", "hit"], [" text=", undefined], ["<redacted>", "redacted"], [" and ", undefined], ["[redacted]", "redacted"], [" later", undefined]]);
    expect(segments(text, "").filter((s) => s.kind === "hit")).toEqual([]);
    expect(segments(text, "a.b*").map((s) => s.text).join("")).toBe(text);
  });

  test("a query that is regular-expression syntax is only text", () => {
    expect(segments("a (b) [c] a.b", "(b)").map((s) => [s.text, s.kind])).toEqual([["a ", undefined], ["(b)", "hit"], [" [c] a.b", undefined]]);
    expect(segments("a.b axb", ".").filter((s) => s.kind === "hit")).toHaveLength(1);
  });

  test("the first line's time, level and target take their tone, a backtrace is plain, and nothing is lost", () => {
    const parts = tokens(BACKTRACE, "");
    expect(parts.map((p) => p.text).join("")).toBe(BACKTRACE);
    expect(parts.filter((p) => p.tone).map((p) => [p.tone, p.text])).toEqual([["time", "14:32:11.205"], ["level", "ERROR"], ["target", "panic{thread=tokio}"]]);
    expect(parts.filter((p) => p.text.includes("mixer")).every((p) => !p.tone)).toBe(true);
  });

  test("a line with thousands of matches is cut in one pass and is still the text", () => {
    const text = "14:32:07.412  INFO audio: " + "ab ".repeat(20000);
    const started = performance.now();
    const parts = tokens(text, "ab");
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.kind === "hit")).toHaveLength(20000);
    expect(parts.filter((p) => p.tone).map((p) => p.tone)).toEqual(["time", "level", "target"]);
    // Quadratic in the matches this took seconds; one pass takes a few milliseconds.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a match across the tones keeps both: the hit and the tone it sits on", () => {
    const parts = tokens(EVENTS[0].text, "INFO audio");
    expect(parts.map((p) => p.text).join("")).toBe(EVENTS[0].text);
    expect(parts.filter((p) => p.kind === "hit").map((p) => p.text).join("")).toBe("INFO audio");
    expect(parts.some((p) => p.kind === "hit" && p.tone === "level")).toBe(true);
  });
});

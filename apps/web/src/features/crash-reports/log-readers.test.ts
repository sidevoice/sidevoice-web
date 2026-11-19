import { describe, expect, test, vi } from "vitest";
import { appLogSource } from "./app-log-source";
import { coreLogPath, coreLogSource } from "./core-log-source";
import { LogUnreadable, MIN_FOLLOW_INTERVAL_MS } from "./log-reader";
import { LogCursorExpired, type LogBatch } from "./log-sources";

const page = (ids: string[], cursor: string, more = false) => ({ lines: ids.map((id) => ({ id, text: "t " + id })), cursor, more });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const signal = () => new AbortController().signal;

describe("the core's log", () => {
  test("asks with only what it was given", () => {
    expect(coreLogPath({ limit: 200 })).toBe("/api/logs?limit=200");
    expect(coreLogPath({ after: "a.b-1", limit: 1000, wait: 20 })).toBe("/api/logs?limit=1000&after=a.b-1&wait=20");
  });

  test("tail reads the latest lines, tagged core, with the cursor at the end", async () => {
    const request = vi.fn(async (_path: string, _signal: AbortSignal) => json(page(["1", "2"], "c2")));
    const batch = await coreLogSource(request).tail({ limit: 50 }, signal());
    expect(request).toHaveBeenCalledWith("/api/logs?limit=50", expect.anything());
    expect(batch).toEqual({ lines: [{ id: "1", piece: "core", text: "t 1" }, { id: "2", piece: "core", text: "t 2" }], cursor: "c2" });
  });

  test("tail clamps the limit to the contract's 1..1000", async () => {
    const request = vi.fn(async (_path: string, _signal: AbortSignal) => json(page([], "c0")));
    await coreLogSource(request).tail({ limit: 5000 }, signal());
    await coreLogSource(request).tail({ limit: 0 }, signal());
    expect(request.mock.calls.map((call) => call[0])).toEqual(["/api/logs?limit=1000", "/api/logs?limit=1"]);
  });

  test("an empty log answers no lines and the start cursor", async () => {
    expect(await coreLogSource(async () => json(page([], "start"))).tail({ limit: 10 }, signal())).toEqual({ lines: [], cursor: "start" });
  });

  test("follow loops read({after, wait}) from the cursor, one onLines per non-empty page, none for an empty one, no onEnd", async () => {
    const answers = [page(["3"], "c3", true), page([], "c3"), page(["4", "5"], "c5")];
    const calls: string[] = [];
    let stop = () => {};
    const request = vi.fn(async (path: string) => {
      calls.push(path);
      const next = answers.shift();
      if (!next) { stop(); return new Promise<Response>(() => {}); }
      return json(next);
    });
    const batches: LogBatch[] = [];
    const onEnd = vi.fn(), onError = vi.fn();
    stop = coreLogSource(request).follow!({ sinceCursor: "c2" }, (batch) => batches.push(batch), onError, onEnd);
    await vi.waitFor(() => expect(calls.length).toBe(4), { timeout: 3000 });
    expect(calls.slice(0, 3)).toEqual(["/api/logs?limit=1000&after=c2&wait=20", "/api/logs?limit=1000&after=c3&wait=20", "/api/logs?limit=1000&after=c3&wait=20"]);
    expect(batches.map((batch) => [batch.cursor, batch.lines.map((line) => line.id)])).toEqual([["c3", ["3"]], ["c5", ["4", "5"]]]);
    expect(calls[3]).toContain("after=c5");
    expect(onEnd).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test("follow starts at most four requests a second", async () => {
    const starts: number[] = [];
    const request = vi.fn(async () => { starts.push(Date.now()); return json(page(["x"], "c" + starts.length, true)); });
    const stop = coreLogSource(request).follow!({ sinceCursor: "c0" }, () => {}, undefined);
    await vi.waitFor(() => expect(starts.length).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    stop();
    for (let i = 1; i < 3; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(MIN_FOLLOW_INTERVAL_MS - 5);
  });

  test("a 410 is LogCursorExpired, in a tail and in a follow, and the follow ends", async () => {
    const request = vi.fn(async () => json({ detail: "gone" }, 410));
    await expect(coreLogSource(request).tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogCursorExpired);
    const onError = vi.fn();
    coreLogSource(request).follow!({ sinceCursor: "old" }, () => {}, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toBeInstanceOf(LogCursorExpired);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  test.each([400, 401, 403, 429, 503])("a %i is a log that cannot be read, not an expired cursor", async (status) => {
    const error = await coreLogSource(async () => json({ detail: "no" }, status)).tail({ limit: 5 }, signal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LogUnreadable);
    expect(error).not.toBeInstanceOf(LogCursorExpired);
  });

  test("an unreachable machine and an answer that is no page are unreadable", async () => {
    await expect(coreLogSource(async () => { throw new Error("unreachable"); }).tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogUnreadable);
    await expect(coreLogSource(async () => json({ lines: "no" })).tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogUnreadable);
    await expect(coreLogSource(async () => json({ lines: [{ id: 1, text: "x" }], cursor: "c" })).tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogUnreadable);
    await expect(coreLogSource(async () => new Response("<html>", { status: 200 })).tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogUnreadable);
  });

  test("stopping the follow aborts the request in flight and says nothing more", async () => {
    let seen: AbortSignal | undefined;
    const request = vi.fn((_: string, abort: AbortSignal) => new Promise<Response>((_, reject) => { seen = abort; abort.addEventListener("abort", () => reject(Object.assign(new Error("a"), { name: "AbortError" }))); }));
    const onError = vi.fn();
    const stop = coreLogSource(request).follow!({ sinceCursor: "c" }, () => {}, onError);
    await vi.waitFor(() => expect(seen).toBeDefined());
    stop();
    await flush();
    expect(seen!.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("the app's own log", () => {
  test("tail and follow go through the bridge with the same page shape, tagged app", async () => {
    const answers = [page(["a", "b"], "c2"), page(["c"], "c3")];
    let stop = () => {};
    const read = vi.fn(async () => { const next = answers.shift(); if (!next) { stop(); return new Promise(() => {}); } return next; });
    const source = appLogSource({ read });
    const batch = await source.tail({ limit: 100 }, signal());
    expect(read).toHaveBeenCalledWith({ limit: 100 });
    expect(batch.lines.map((line) => line.piece)).toEqual(["app", "app"]);
    const got: LogBatch[] = [];
    stop = source.follow!({ sinceCursor: batch.cursor }, (b) => got.push(b));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3), { timeout: 3000 });
    expect(read).toHaveBeenNthCalledWith(2, { after: "c2", limit: 1000, wait: 5 });
    expect(got).toHaveLength(1);
    expect(got[0].cursor).toBe("c3");
  });

  test("log.cursor_expired is LogCursorExpired; other refusals are unreadable", async () => {
    const refusing = (key: string) => appLogSource({ read: async () => { throw { key, message: "m" }; } });
    await expect(refusing("log.cursor_expired").tail({ limit: 5 }, signal())).rejects.toBeInstanceOf(LogCursorExpired);
    for (const key of ["log.unreadable", "log.request_invalid", "not_room_page"]) {
      const error = await refusing(key).tail({ limit: 5 }, signal()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LogUnreadable);
    }
    const onError = vi.fn();
    refusing("log.cursor_expired").follow!({ sinceCursor: "x" }, () => {}, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toBeInstanceOf(LogCursorExpired);
  });

  test("an abort ends the wait for a bridge that cannot be cancelled", async () => {
    const controller = new AbortController();
    const tail = appLogSource({ read: () => new Promise(() => {}) }).tail({ limit: 5 }, controller.signal);
    controller.abort();
    await expect(tail).rejects.toMatchObject({ name: "AbortError" });
  });
});

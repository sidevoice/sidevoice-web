import { expect, test, vi } from "vitest";
import { proveIdentity } from "./device-pairing.js";
import { createReachLog, hostOf, reachOutcome, REACH_WHY } from "./reach-log.js";

const subtle = globalThis.crypto.subtle;
const answering = (response: () => Response | Promise<Response>) => (async () => response()) as unknown as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const pinned = { fp: "f", public_key: "k" };
const why = async (get: typeof fetch) => (await proveIdentity("https://m.example", pinned, { get, subtle, timeoutMs: 5 }) as { why?: string; status?: number; errorName?: string });

test("a failed identity question says why, as a closed reason", async () => {
  expect(await why(answering(() => { throw new TypeError("Load failed"); }))).toMatchObject({ why: "fetch_failed", errorName: "TypeError" });
  expect(await why((() => new Promise(() => {})) as unknown as typeof fetch)).toMatchObject({ why: "timeout" });
  expect(await why(answering(() => json({}, 503)))).toMatchObject({ why: "http_status", status: 503 });
  expect(await why(answering(() => new Response("<html>", { status: 200 })))).toMatchObject({ why: "bad_json" });
  expect(await why(answering(() => json({ public_key: "k" })))).toMatchObject({ why: "missing_fields" });
  expect(await why(answering(() => json({ public_key: "k", signature: "s" })))).toMatchObject({ why: "bad_signature" });
  const unpinned = await proveIdentity("https://m.example", { fp: "f" }, { get: answering(() => json({ public_key: "AAAA", signature: "s" })), subtle });
  expect(unpinned).toMatchObject({ ok: false, reason: "impostor", why: "fingerprint_mismatch" });
});

test("an outcome keeps the host of the address and nothing else of it", () => {
  expect(hostOf("https://mac.example:8443/nodes/c-1?nonce=secret")).toBe("mac.example:8443");
  expect(hostOf("/nodes/c-1")).toBe("same-origin");
  const outcome = reachOutcome({ base: "https://mac.example/nodes/c-1" }, { ok: false, reason: "unreachable", why: "http_status", status: 502 });
  expect(outcome).toEqual({ host: "mac.example", why: "http_status", status: 502 });
  expect(reachOutcome({ base: "http://a" }, { ok: false, reason: "unreachable", why: "free text from nowhere" })).toMatchObject({ why: "unknown" });
  expect(reachOutcome({ base: "http://a" }, { ok: false, reason: "error" })).toMatchObject({ why: "error" });
  expect(REACH_WHY).toContain("fingerprint_mismatch");
});

test("a machine that cannot be located is told once per change, and again after it answered", () => {
  const warn = vi.fn();
  const log = createReachLog(warn);
  const down = [reachOutcome({ base: "https://mac.example" }, { ok: false, reason: "unreachable", why: "fetch_failed", errorName: "TypeError" })];
  log.located("fp1", down);
  log.located("fp1", down);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith("A machine could not be located.", { code: "app.reach.locate_failed" }, "mac.example", { code: "app.reach.fetch_failed" }, { name: "TypeError" });
  log.located("fp1", [reachOutcome({ base: "https://mac.example" }, { ok: false, reason: "unreachable", why: "http_status", status: 404 })]);
  expect(warn).toHaveBeenCalledTimes(2);
  log.recovered("fp1");
  log.located("fp1", down);
  expect(warn).toHaveBeenCalledTimes(3);
  log.located("fp2", []);
  expect(warn.mock.calls[3][1]).toEqual({ code: "app.reach.no_candidates" });
  const code = /^app\.[a-z0-9_]{1,32}(\.[a-z0-9_]{1,32}){0,3}$/;
  for (const call of warn.mock.calls) for (const item of call.slice(1)) if (item?.code) expect(item.code).toMatch(code);
});

test("a failed pairing is one line with the failure's code, and a log that throws is silent", () => {
  const warn = vi.fn();
  createReachLog(warn).pairing([{ host: "mac.example", why: "timeout" }], Object.assign(new Error("No se pudo"), { code: "identity-mismatch" }));
  expect(warn).toHaveBeenCalledWith("A pairing attempt failed.", { code: "app.pairing.failed.identity_mismatch" }, "mac.example", { code: "app.reach.timeout" });
  createReachLog(warn).pairing([], Object.assign(new Error("x"), { code: "Free text, with spaces" }));
  expect(warn.mock.calls[1][1]).toEqual({ code: "app.pairing.failed.other" });
  expect(() => createReachLog(() => { throw new Error("x"); }).located("fp", [])).not.toThrow();
});

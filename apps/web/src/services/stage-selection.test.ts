import { expect, test, vi } from "vitest";
import { createStageSelection, type Stage, type StageCheck } from "./stage-selection.js";
import type { CheckResult } from "./load-and-verify.js";

/* Selecting a model (#124 §6, D11–D12), driven through its hooks: the previous stage is touched only by `activate`,
 * and `activate` runs only after a passed check — and, for a slow one, the person's yes. */
const BASE: Stage = { place: "device", model: "whisper-base", options: { language: "es" }, build: null };
const TINY: Stage = { place: "device", model: "whisper-tiny", options: { language: "es" }, build: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function selection({ consent = null as { size: number } | null, outcome = { ok: true, step: "done", passes: [], latency_ms: 800, slow: false } as CheckResult } = {}) {
  const published: (StageCheck | null)[] = [];
  const order: string[] = [];
  const running = deferred<CheckResult>();
  let signal: AbortSignal | null = null;
  const hooks = {
    publish: vi.fn((_task: string, check: StageCheck | null) => { published.push(check); }),
    consent: vi.fn(async () => consent),
    verify: vi.fn(async (_task: string, _stage: Stage, options: { signal: AbortSignal; onProgress(progress: unknown): void }) => {
      signal = options.signal;
      options.onProgress({ step: "download", done: 10, total: 100 });
      order.push("verify");
      const result = await running.promise;
      order.push("verified");
      return result;
    }),
    activate: vi.fn(async () => { order.push("activate"); }),
    discard: vi.fn(() => { order.push("discard"); }),
  };
  const it = createStageSelection(hooks);
  const finish = async (result: CheckResult = outcome) => { running.resolve(result); await new Promise((r) => setTimeout(r, 0)); };
  return { it, hooks, published, order, finish, signal: () => signal, last: () => published.at(-1) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("a model takes effect only after its check passed, and the previous one is unloaded only then", async () => {
  const s = selection();
  const done = s.it.select("stt", BASE);
  await settle();
  expect(s.last()).toMatchObject({ phase: "running", progress: { step: "download", done: 10, total: 100 } });
  expect(s.hooks.activate).not.toHaveBeenCalled();
  await s.finish();
  await done;
  expect(s.order).toEqual(["verify", "verified", "activate"]);
  expect(s.hooks.activate).toHaveBeenCalledWith("stt", BASE, expect.objectContaining({ ok: true }), { signal: expect.any(AbortSignal), commit: expect.any(Function) });
  expect(s.hooks.discard).not.toHaveBeenCalled();
  expect(s.last()).toMatchObject({ phase: "done" });
});

test("a failure keeps the previous model: nothing is activated, the candidate is let go, the step is named", async () => {
  const s = selection();
  const done = s.it.select("stt", BASE);
  await settle();
  await s.finish({ ok: false, step: "download", reason: { key: "download_failed", message: "reset" }, passes: [] });
  await done;
  expect(s.hooks.activate).not.toHaveBeenCalled();
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
  expect(s.last()).toMatchObject({ phase: "failed", step: "download", reason: { key: "download_failed" }, stage: BASE });
});

test("a slow model is not a failure: its latency is shown and the person decides", async () => {
  const yes = selection({ outcome: { ok: true, step: "done", passes: [], latency_ms: 2800, slow: true } });
  const done = yes.it.select("stt", BASE);
  await settle(); await yes.finish();
  expect(yes.last()).toMatchObject({ phase: "slow", result: { latency_ms: 2800 } });
  expect(yes.hooks.activate).not.toHaveBeenCalled();
  yes.it.decide("stt", true);
  await done;
  expect(yes.hooks.activate).toHaveBeenCalledTimes(1);
  expect(yes.last()).toMatchObject({ phase: "done" });

  const no = selection({ outcome: { ok: true, step: "done", passes: [], latency_ms: 2800, slow: true } });
  const declined = no.it.select("stt", BASE);
  await settle(); await no.finish();
  no.it.decide("stt", false);   // "Elegir otro"
  await declined;
  expect(no.hooks.activate).not.toHaveBeenCalled();
  expect(no.hooks.discard).toHaveBeenCalledTimes(1);
  expect(no.last()).toBeNull();
});

test("a download is asked for first, with its size; declining it checks nothing", async () => {
  const s = selection({ consent: { size: 79_664_191 } });
  const done = s.it.select("stt", BASE);
  await settle();
  expect(s.last()).toEqual({ phase: "consent", stage: BASE, size: 79_664_191 });
  expect(s.hooks.verify).not.toHaveBeenCalled();
  s.it.decide("stt", false);
  await done;
  expect(s.hooks.verify).not.toHaveBeenCalled();
  expect(s.last()).toBeNull();

  const accepted = selection({ consent: { size: 1 } });
  const going = accepted.it.select("stt", BASE);
  await settle();
  accepted.it.decide("stt", true);
  await settle();
  expect(accepted.hooks.verify).toHaveBeenCalledTimes(1);
  await accepted.finish();
  await going;
  expect(accepted.hooks.activate).toHaveBeenCalledTimes(1);
});

test("cancelling stops the check, lets the candidate go and changes nothing", async () => {
  const s = selection();
  const done = s.it.select("tts", BASE);
  await settle();
  s.it.cancel("tts");
  expect(s.signal()?.aborted).toBe(true);
  expect(s.last()).toBeNull();
  await s.finish({ ok: false, cancelled: true, step: "download", passes: [] });
  await done;
  expect(s.hooks.activate).not.toHaveBeenCalled();
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
  expect(s.last()).toBeNull();
});

test("a newer selection of the same stage replaces the one in flight; the older one never takes effect", async () => {
  const s = selection();
  const first = s.it.select("stt", BASE);
  await settle();
  const older = s.signal();
  const replaced = s.it.select("stt", TINY);
  expect(older?.aborted).toBe(true);
  await settle();
  expect(s.signal()?.aborted).toBe(false);
  await s.finish();
  await Promise.all([first, replaced]);
  expect(s.hooks.activate).toHaveBeenCalledTimes(1);
  expect(s.hooks.activate).toHaveBeenCalledWith("stt", TINY, expect.anything(), expect.anything());
});

test("a recheck measures what is in use and changes nothing", async () => {
  const s = selection();
  const done = s.it.select("stt", BASE, { recheck: true });
  await settle();
  expect(s.hooks.consent).not.toHaveBeenCalled();
  await s.finish({ ok: true, step: "done", passes: [], latency_ms: 2900, slow: true });
  await done;
  expect(s.hooks.activate).not.toHaveBeenCalled();
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
  expect(s.last()).toMatchObject({ phase: "done", recheck: true });
});

test("an activation the call refuses is a failure with its reason; the candidate is let go (review R01)", async () => {
  const s = selection();
  s.hooks.activate.mockImplementationOnce(async () => { throw Object.assign(new Error("refused"), { reason: { key: "switch_refused", message: "x", detail: "no key" } }); });
  const done = s.it.select("stt", BASE);
  await settle(); await s.finish(); await done;
  expect(s.published).toContainEqual(expect.objectContaining({ phase: "running", progress: { step: "apply" } }));
  expect(s.last()).toMatchObject({ phase: "failed", step: "apply", reason: { key: "switch_refused", detail: "no key" } });
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
});

test("cancelling while it takes effect reaches the activation, and says nothing after", async () => {
  const s = selection();
  let signal: AbortSignal | null = null;
  s.hooks.activate.mockImplementationOnce(async (...args: unknown[]) => {
    signal = (args[3] as { signal: AbortSignal }).signal;
    await new Promise((resolve) => signal!.addEventListener("abort", resolve));
    throw new Error("cancelled");
  });
  const done = s.it.select("stt", BASE);
  await settle(); await s.finish();
  s.it.cancel("stt");
  await done;
  expect(signal!.aborted).toBe(true);
  expect(s.last()).toBeNull();
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
});

test("a check the desktop app cancelled itself ends the selection quietly: nothing shown, nothing running (N03)", async () => {
  const s = selection();
  const done = s.it.select("stt", BASE);
  await settle();
  await s.finish({ ok: false, cancelled: true, step: "download", passes: [] });
  await done;
  expect(s.last()).toBeNull();
  expect(s.it.busy("stt")).toBe(false);
  expect(s.hooks.discard).toHaveBeenCalledTimes(1);
  expect(s.hooks.activate).not.toHaveBeenCalled();
});

test("past its commit point an activation is finished: a cancel then changes nothing and it ends done (R01)", async () => {
  const s = selection();
  let release!: () => void;
  s.hooks.activate.mockImplementationOnce(async (...args: unknown[]) => {
    const { signal, commit } = args[3] as { signal: AbortSignal; commit(): void };
    commit();
    await new Promise<void>((resolve) => { release = resolve; });
    expect(signal.aborted).toBe(false);
  });
  const done = s.it.select("stt", BASE);
  await settle(); await s.finish();
  s.it.cancel("stt");
  release();
  await done;
  expect(s.last()).toMatchObject({ phase: "done" });
  expect(s.hooks.discard).not.toHaveBeenCalled();
});

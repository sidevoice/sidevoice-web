import { expect, test, vi } from "vitest";
import { byteCounter, createDownloads, type DownloadItem } from "./downloads.js";
import { downloadsView } from "../state/downloads-view.js";

/* The room's downloads: one record per download, its speed and time left, how it ended, and its own cancel. */
function registry() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  let items: DownloadItem[] = [];
  const it = createDownloads({ publish: (next) => { items = next; }, now: () => now, keepMs: 8000, schedule: (fn, ms) => timers.push({ at: now + ms, fn }) });
  const advance = (ms: number) => { now += ms; for (const timer of timers.splice(0)) if (timer.at <= now) timer.fn(); else timers.push(timer); };
  return { it, items: () => items, advance };
}

test("a page download's speed is measured here and smoothed, and its time left follows", () => {
  const { it, items, advance } = registry();
  it.start({ id: "a", label: "Whisper base", task: "stt", kind: "page", total: 80e6 });
  it.update("a", { done: 0 });
  advance(1000); it.update("a", { done: 4e6 });
  expect(items()[0]).toMatchObject({ state: "running", done: 4e6, total: 80e6, bytes_per_s: 4e6, eta_s: 19 });
  advance(1000); it.update("a", { done: 6e6 });
  expect(items()[0].bytes_per_s).toBe(3.2e6);   // 0.6 × 4 MB/s + 0.4 × 2 MB/s: one slow second does not halve it
});

test("the desktop app's own speed is used as it comes, and a total it learns replaces the guess", () => {
  const { it, items } = registry();
  it.start({ id: "n", label: "Whisper base", task: "stt", kind: "native", total: 200e6 });
  it.update("n", { done: 10e6, total: 216e6, bytes_per_s: 5e6 });
  expect(items()[0]).toMatchObject({ total: 216e6, bytes_per_s: 5e6, eta_s: 41 });
});

test("an ended download says how it ended for a few seconds, then goes; one that ended is not updated", () => {
  const { it, items, advance } = registry();
  it.start({ id: "a", label: "A", task: "stt", kind: "page", total: 10 });
  it.start({ id: "b", label: "B", task: "tts", kind: "page", total: 10 });
  it.end("a", "done");
  it.end("b", "failed", "La descarga se interrumpió.");
  it.update("a", { done: 3 });
  expect(items().map((item) => [item.state, item.done, item.error])).toEqual([["done", 10, ""], ["failed", 0, "La descarga se interrumpió."]]);
  advance(7999);
  expect(items()).toHaveLength(2);
  advance(1);
  expect(items()).toHaveLength(0);
});

test("Cancel asks the download's starter to stop it, once, and says it cancelled at once", () => {
  const { it, items } = registry();
  const stop = vi.fn();
  it.start({ id: "a", label: "A", task: "stt", kind: "native", total: 10, cancel: stop });
  expect(it.cancel("a")).toBe(true);
  expect(it.cancel("a")).toBe(false);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(items()[0].state).toBe("cancelled");
});

test("bytes add up across a load's files, and the app's speed passes through", () => {
  const count = byteCounter(100);
  count({ status: "initiate", file: "config.json" });
  count({ status: "progress", file: "a.onnx", loaded: 30, total: 60 });
  expect(count({ status: "progress", file: "b.onnx", loaded: 10, total: 70 })).toEqual({ done: 40, total: 130, bytes_per_s: null });
  expect(count({ status: "done", file: "a.onnx" })).toEqual({ done: 70, total: 130, bytes_per_s: null });
  expect(byteCounter(0)({ status: "progress", job: "install-1", loaded: 5, total: 9, bytes_per_s: 2048 })).toEqual({ done: 5, total: 9, bytes_per_s: 2048 });
  expect(count({ status: "loading" })).toBeNull();
});

test("the view says each download's bytes, speed and time left, and what the indicator sums up", () => {
  const view = downloadsView([
    { id: "a", label: "Whisper base", task: "stt", kind: "page", state: "running", done: 20e6, total: 80e6, bytes_per_s: 4e6, eta_s: 15, error: "", started: 0, ended: null },
    { id: "b", label: "Kokoro", task: "tts", kind: "native", state: "failed", done: 1e6, total: 90e6, bytes_per_s: null, eta_s: null, error: "La descarga se interrumpió.", started: 0, ended: 1 },
  ]);
  expect(view.rows[0]).toMatchObject({ task: "Transcripción", status: "Descargando", amount: "20 MB / 80 MB", speed: "4,0 MB/s", left: "15 s", fraction: 0.25, cancellable: true });
  expect(view.rows[1]).toMatchObject({ status: "Falló", speed: "", left: "", error: "La descarga se interrumpió.", cancellable: false });
  expect([view.running, view.fraction, view.failed]).toEqual([1, 0.25, true]);
});

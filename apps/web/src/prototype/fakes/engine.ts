/* PROTOTYPE ONLY — what a running call does: load-and-verify a stage (model-first §6) and the echo test (§4.8). The
 * real ones run the engines; these follow the toggles and take believable time. */
import { offers as resolveOffers } from "../../../../../packages/browser-audio/offers";
import modelCatalog from "../../../../../packages/browser-audio/models.json";
import type { EchoEvents, VerifyOutcome, VerifyProgress } from "../../state/hosts/hosts-store";
import type { Stage, Task } from "../../state/hosts/stage-scope";
import type { Toggles } from "../scenario";

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

export function createFakeEngine(toggles: Toggles, capabilities: Parameters<typeof resolveOffers>[1], installed: Set<string>, language: () => string) {
  async function verifyStage(task: Task, stage: Stage, _host: unknown, onProgress: (p: VerifyProgress) => void, signal: AbortSignal): Promise<VerifyOutcome> {
    const cancelled = { ok: false as const, step: "apply", reason: { key: "apply_cancelled" } };
    if (stage.place !== "device") {
      onProgress({ phase: "check" });
      await sleep(900, signal);
      if (signal.aborted) return cancelled;
      if (toggles.offline) return { ok: false, step: "host", reason: { key: "host_unreachable" } };
      if (toggles.w4KeyRefused) return { ok: false, step: "key", reason: { key: "provider_key_refused", provider: stage.place } };
      return { ok: true, result: { passes: [{ latency_ms: 420, first_audio_ms: 380 }] } };
    }
    const offer = resolveOffers(modelCatalog as never, capabilities, "device").find((o) => o.model === stage.model);
    const total = installed.has(stage.model) ? 0 : offer?.download_size ?? 120_000_000;
    if (total) {
      const rate = (toggles.slowDownload ? 7 : 45) * 1e6;
      const failAt = toggles.w4Download === "download" ? 0.55 : 2;
      for (let done = 0; done < total; done = Math.min(total, done + rate / 8)) {
        onProgress({ phase: "download", done, total });
        await sleep(125, signal);
        if (signal.aborted) return cancelled;
        if (toggles.offline) return { ok: false, step: "download", reason: { key: "download_failed" } };
        if (done / total >= failAt) return { ok: false, step: "download", reason: { key: "download_failed" } };
      }
      onProgress({ phase: "download", done: total, total });
      installed.add(stage.model);
    }
    onProgress({ phase: "load" });
    await sleep(900, signal);
    if (signal.aborted) return cancelled;
    onProgress({ phase: "check" });
    await sleep(1300, signal);
    if (signal.aborted) return cancelled;
    if (toggles.w4Download === "check") return task === "stt"
      ? { ok: false, step: "check", reason: { key: "check_mismatch", heard: "ola que tal" } }
      : { ok: false, step: "check", reason: { key: "check_silent" } };
    if (toggles.w4Slow && task === "stt") return { ok: true, slow: { latency_ms: 2600 } };
    return { ok: true, result: { load_ms: 820, passes: task === "stt" ? [{ latency_ms: 610 }, { latency_ms: 340 }] : [{ first_audio_ms: 290, realtime: 4.2 }, { first_audio_ms: 210, realtime: 5.1 }] } };
  }

  async function echoTest(_host: unknown, events: EchoEvents, signal: AbortSignal) {
    await sleep(500, signal);
    if (signal.aborted) return;
    const mode = String(toggles.w5 || "");
    if (mode === "mic-denied" || mode === "no-mic") { events.failed(mode); return; }
    if (mode === "silence") {
      const until = Date.now() + 10_000;
      while (Date.now() < until && !signal.aborted) { events.level(Math.random() * 0.04); await sleep(120, signal); }
      if (!signal.aborted) events.silent();
      return;
    }
    // Speaking: the meter moves for a couple of seconds.
    const until = Date.now() + 2200;
    while (Date.now() < until && !signal.aborted) { events.level(0.25 + Math.random() * 0.6); await sleep(90, signal); }
    events.level(0.03);
    if (signal.aborted) return;
    if (mode === "stt-error") { await sleep(700, signal); events.failed("stt-error", "stt"); return; }
    await sleep(800, signal);
    const es = language() === "es";
    const heard = es ? "Hola, ¿me oyes bien?" : "Hi, can you hear me?";
    events.heard(heard);
    await sleep(600, signal);
    if (signal.aborted) return;
    if (mode === "tts-error") { events.failed("tts-error", "tts"); return; }
    const reply = (es ? "Te he oído: " : "I heard you: ") + heard;
    events.replied(reply);
    try {
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.lang = es ? "es-ES" : "en-US";
      window.speechSynthesis?.speak(utterance);
    } catch { /* no synthesis in this browser: the text is enough */ }
  }

  return { verifyStage, echoTest };
}

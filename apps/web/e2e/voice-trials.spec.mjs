import { expect, test } from "@playwright/test";
import { installHarness, installVoicePackageRoute } from "./harness.mjs";

test("the published browser host records opt-in takes and reports rendered speaker level", async ({ page }) => {
  await installVoicePackageRoute(page);
  await page.goto("/voice/");
  const result = await page.evaluate(async () => {
    const { default: init, createVoiceHost } = await import("/voice-contract/js/index.js");
    await init();
    let sink;
    const seen = { states: [], turns: [], takes: [], output: [] };
    const source = {
      vad: () => ({ createVad: () => ({
        position: 0,
        accept(samples) {
          const frames = [];
          for (let offset = 0; offset + 512 <= samples.length; offset += 512) {
            this.position += 512;
            frames.push({ end: this.position, speech: samples[offset] > 0.2 });
          }
          return frames;
        },
        reset() { this.position = 0; },
      }) }),
      transcriber: () => ({ transcribe: async () => "hello" }),
      speaker: () => ({ speak: async () => ({ samples: new Float32Array(16000).fill(0.6), sampleRate: 16000 }) }),
    };
    const audio = {
      attach() { const lane = { active: false }; return { io: { start(next) { lane.active = true; sink = next; queueMicrotask(() => sink.ready()); },
        stop() { lane.active = false; }, stopPlayback() {}, play() {}, dispose() {} }, input: { id: 1, lane } }; },
      // As the shared audio does: only a started lane can be given the microphone.
      routeInput: async (target) => { if (target && !target.lane.active) throw new TypeError("an inactive lane"); },
      setInputDevice: async () => {}, setOutputDevice: async () => {}, outputSelectable: false,
    };
    const owner = createVoiceHost(source, { io: audio });
    const halves = { input: { stt: { model: "fake" }, endOfTurn: { kind: "silence" }, patience: "fast" }, output: { tts: { model: "fake" } } };
    const host = owner.start(halves, { take: true });
    const stops = [
      host.onState((state) => seen.states.push(state.listening)),
      host.onTurn((turn) => seen.turns.push(turn.phase)),
      host.onTake((take) => seen.takes.push({ samples: take.samples.length, turns: take.turns })),
      host.onPlaybackLevel((level) => seen.output.push(level)),
    ];
    await host.ready;
    await owner.routeInput(host);
    // The fake output reports what a rendered browser audio window would give the host.
    sink.rendered(new Float32Array(16000).fill(0.6));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const feed = async (value, milliseconds) => {
      for (let n = 0; n < milliseconds; n += 32) sink.captured(new Float32Array(512).fill(value));
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    await feed(0.5, 2000);
    await feed(0, 500);
    await feed(0.5, 1000);
    await feed(0, 2500);
    await host.stop();
    // A restart is a new call, which asked for no take: it hands none.
    const again = owner.start(halves);
    await again.ready;
    sink.captured(new Float32Array(512).fill(0.5));
    await again.stop();
    stops.forEach((stop) => stop());
    return seen;
  });
  expect(result.states).toContain("speaking");
  expect(result.states).toContain("listening");
  expect(result.takes).toHaveLength(1);
  expect(result.takes[0].samples).toBeGreaterThan(0);
  expect(result.takes[0].turns).toHaveLength(1);
  expect(result.takes[0].turns[0].pauses).toHaveLength(1);
  expect(result.takes[0].turns[0].end_ms).toBeGreaterThan(0);
  expect(result.states.filter((state) => state === "speaking").length).toBeGreaterThanOrEqual(2);
  expect(result.output.some((level) => level > 0)).toBe(true);
  expect(result.output.at(-1)).toBe(0);
});

test("the candidate browser host reports a heard reply with scalar progress and one terminal outcome", async ({ page }) => {
  await installVoicePackageRoute(page);
  await page.goto("/voice/");
  const result = await page.evaluate(async () => {
    const { default: init, createVoiceHost } = await import("/voice-contract/js/index.js");
    await init();
    let sink;
    const played = [], events = [];
    const source = {
      vad: () => ({ createVad: () => ({ position: 0, accept() { return []; }, reset() { this.position = 0; } }) }),
      transcriber: () => ({ transcribe: async () => "" }),
      speaker: () => ({ speak: async () => ({ samples: new Float32Array(16000).fill(0.2), sampleRate: 16000 }) }),
    };
    const audio = {
      attach() { const lane = { active: false }; return { io: { start(next) { lane.active = true; sink = next; queueMicrotask(() => sink.ready()); },
        stop() { lane.active = false; }, stopPlayback() {},
        play(utterance, chunk) {
          played.push([utterance, chunk]);
          queueMicrotask(() => { sink.chunkStarted(utterance, chunk); sink.chunkPlayed(utterance, chunk); sink.playbackEnded(); });
        }, dispose() {} }, input: { id: 1, lane } }; },
      // As the shared audio does: only a started lane can be given the microphone.
      routeInput: async (target) => { if (target && !target.lane.active) throw new TypeError("an inactive lane"); },
      setInputDevice: async () => {}, setOutputDevice: async () => {}, outputSelectable: false,
    };
    // A call that only speaks: the output half, no microphone asked for.
    const host = createVoiceHost(source, { io: audio }).start({ output: { tts: { model: "fake" } } });
    await host.ready;
    const saying = host.say("é🐙ab");
    saying.onEvent((event) => events.push(event));
    const outcome = await Promise.race([saying.outcome, new Promise((_, reject) => setTimeout(() => reject(Error("reply did not settle")), 5000))]);
    await host.stop();
    return { played, events, outcome };
  });
  expect(result.played.length).toBeGreaterThan(0);
  expect(result.events.some((event) => event.type === "playing")).toBe(true);
  expect(result.events.filter((event) => event.type === "done")).toHaveLength(1);
  expect(result.outcome).toEqual({ status: "heard" });
  expect(result.events.some((event) => event.type === "progress" && event.heard_chars === 4)).toBe(true);
});

test("a recorded settings try delivers the package take through the real trial action", async ({ page }) => {
  await installVoicePackageRoute(page);
  await installHarness(page, { voiceReady: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions && !!window.sidevoiceUI?.store);
  await page.evaluate(async () => {
    const { default: init, createVoiceHost } = await import("/voice-contract/js/index.js");
    await init();
    const source = {
      vad: () => ({ createVad: () => ({
        position: 0,
        accept(samples) {
          const frames = [];
          for (let offset = 0; offset + 512 <= samples.length; offset += 512) {
            this.position += 512;
            frames.push({ end: this.position, speech: samples[offset] > 0.2 });
          }
          return frames;
        },
        reset() { this.position = 0; },
      }) }),
      transcriber: () => ({ transcribe: async () => "hello" }),
      speaker: () => ({ speak: async () => ({ samples: new Float32Array(16000), sampleRate: 16000 }) }),
    };
    const audio = {
      attach() { const lane = { active: false }; return { io: { start(sink) { lane.active = true; window.__trialSink = sink; queueMicrotask(() => sink.ready()); },
        stop() { lane.active = false; }, stopPlayback() {}, play() {}, dispose() {} }, input: { id: 1, lane } }; },
      // As the shared audio does: only a started lane can be given the microphone.
      routeInput: async (target) => { if (target && !target.lane.active) throw new TypeError("an inactive lane"); },
      setInputDevice: async () => {}, setOutputDevice: async () => {}, outputSelectable: false,
    };
    const owner = createVoiceHost(source, { io: audio });
    window.__trialTakes = [];
    window.__turnStarted = false;
    // The trial makes its own call on the page's voice: each call it makes is watched.
    const host = { ...owner, start(settings, options) {
      const call = owner.start(settings, options);
      call.onTake((take) => window.__trialTakes.push(take));
      call.onTurn((turn) => { if (turn.phase === "started") window.__turnStarted = true; });
      return call;
    } };
    window.__sidevoiceDesktop = { host: { voice: host } };
    const model = (id, capability) => ({ id, family: "fake", capabilities: [capability], languages: ["en"], voices: [], installed: true,
      builds: [{ id: id + "/test", backend: "test", precision: "test", accelerator: "cpu", available: true, installed: true, reasons: [] }] });
    const settings = { stt: { catalog: "local", model: "fake-stt", language: null }, tts: { catalog: "local", model: "fake-tts", voice: null, speed: 1 }, end_of_turn: "silence", patience: "normal", idle_unload_minutes: 10 };
    window.__trialSettings = settings;
    window.__trialCatalogue = { state: "ready", catalogs: [
      { id: "local", name: null, status: { stale: false }, models: [model("fake-stt", "stt"), model("fake-tts", "tts")] },
    ], error: "" };
  });
  await page.locator("#settings-open").click();
  await page.locator("#settings-transcription").click();
  await page.waitForFunction(() => ["ready", "failed"].includes(window.sidevoiceUI.store.getState().facts.voiceCatalogue.state));
  await page.evaluate(() => window.sidevoiceUI.store.patch({ voiceSettings: window.__trialSettings, voiceDraft: window.__trialSettings, voiceCatalogue: window.__trialCatalogue }));
  await expect(page.locator("#stt-try")).toBeEnabled();
  await page.locator("#stt-try").click();
  await page.waitForFunction(() => !!window.__trialSink);
  await page.evaluate(() => {
    for (let n = 0; n < 64; n++) window.__trialSink.captured(new Float32Array(512).fill(0.5));
  });
  await page.waitForFunction(() => window.__turnStarted);
  // Stop ends the open turn at once (`endInput`), with no more audio and no wait for the pause: its words come as soon
  // as the voice has transcribed and merged them, well inside the 2.5 s of ordinary patience.
  const stopped = Date.now();
  await page.locator("#stt-try").click();
  // The microphone goes on giving frames after Stop; the try fenced it off.
  await page.evaluate(() => {
    for (let n = 0; n < 160; n++) window.__trialSink.captured(new Float32Array(512));
  });
  await expect(page.locator("#stt-try-panel")).toHaveAttribute("data-phase", "done");
  expect(Date.now() - stopped).toBeLessThan(3000);
  await expect(page.locator("#stt-take")).toBeVisible();
  await expect(page.locator("#stt-take")).toContainText("recorded");
  const takes = await page.evaluate(() => window.__trialTakes.map((take) => ({ samples: take.samples.length, turns: take.turns.length })));
  expect(takes).toHaveLength(1);
  expect(takes[0].samples).toBeGreaterThan(0);
  expect(takes[0].turns).toBe(1);
});

test("a completed transcription take shows its waveform with only its start and stop, no turn marks, then releases replay audio", async ({ page }) => {
  await installHarness(page, { voiceReady: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.locator("#settings-open").click();
  await page.locator("#settings-transcription").click();
  await page.waitForFunction(() => ["ready", "failed"].includes(window.sidevoiceUI.store.getState().facts.voiceCatalogue.state));
  await page.evaluate(() => {
    const model = (id, family, capability) => ({
      id, family, capabilities: [capability], languages: ["en"], voices: [], installed: true,
      builds: [{ id: id + "/test", backend: "test", precision: "test", accelerator: "cpu", available: true, installed: true, reasons: [] }],
    });
    const settings = { stt: { catalog: "local", model: "whisper-base", language: null }, tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: null, speed: 1 }, end_of_turn: "silence", patience: "normal" };
    window.sidevoiceUI.store.patch({ voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs: [
      { id: "local", name: null, status: { stale: false }, models: [model("whisper-base", "whisper", "stt"), model("kokoro-82m-v1.0", "kokoro", "tts")] },
    ], error: "" } });
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    window.__takeUrls = { created: [], revoked: [] };
    URL.createObjectURL = (blob) => { const url = create(blob); window.__takeUrls.created.push(url); return url; };
    URL.revokeObjectURL = (url) => { window.__takeUrls.revoked.push(url); return revoke(url); };
    window.sidevoiceActions.tryVoiceSettings = async (_task, progress) => {
      if ((window.__trialCount = (window.__trialCount || 0) + 1) > 1) return new Promise(() => {});
      progress.onListening?.();
      progress.onTake?.({ sampleRate: 16000, samples: new Float32Array(32000).fill(0.4), started_at: 0, ended_at: 2000,
        turns: [{ turn_id: "one", speech_ms: 300, pauses: [{ from_ms: 800, to_ms: 1000 }], end_ms: 1700 }] });
      return { text: "hello", timings: { ready_ms: 100, recognition_ms: 200 } };
    };
  });
  await expect(page.locator("#stt-try")).toBeEnabled();
  await page.locator("#stt-try").click();
  const take = page.locator("#stt-take");
  await expect(take).toBeVisible();
  await expect(take).toContainText("2.0 s recorded");
  // The transcription take marks only its start and stop (decided 2026-10-15): none of its turns, over it or in words.
  await expect(take.locator('[data-kind="speech"]')).toHaveCount(0);
  await expect(take.locator('[data-kind="pause"]')).toHaveCount(0);
  await expect(take.locator('[data-kind="end"]')).toHaveCount(0);
  await expect(take).not.toContainText("speech starts");
  const slider = take.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "0.5");
  const play = take.locator("#stt-take-play");
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__takeUrls.created.length)).toBe(1);
  if (await play.getAttribute("aria-pressed") === "true") await play.click();
  await page.locator("#stt-try").click();
  await expect(take).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__takeUrls.revoked.length)).toBe(1);
});

test("an ended turn shows its pause and end marks under the detected result", async ({ page }) => {
  await installHarness(page, { voiceReady: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.locator("#settings-open").click();
  await page.locator("#settings-call").click();
  await page.waitForFunction(() => ["ready", "failed"].includes(window.sidevoiceUI.store.getState().facts.voiceCatalogue.state));
  await page.evaluate(() => {
    const local = { id: "local", name: null, status: { stale: false }, models: [{
      id: "whisper-base", family: "whisper", capabilities: ["stt"], installed: true, languages: ["en"], voices: [],
      builds: [{ id: "whisper-base/test", backend: "test", precision: "test", accelerator: "cpu", available: true, installed: true, reasons: [] }],
    }] };
    const settings = { stt: { catalog: "local", model: "whisper-base", language: null }, tts: { catalog: "local", model: "fake", voice: null, speed: 1 }, end_of_turn: "silence", patience: "normal" };
    window.sidevoiceUI.store.patch({ voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs: [local], error: "" } });
    window.sidevoiceActions.cancelVoiceTry = () => {};
    window.sidevoiceActions.tryTurnSettings = async (progress) => {
      for (const step of ["listening", "speaking", "pause", "speaking", "ended"]) {
        progress.onTurnStep({ step, again: false });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      progress.onTake({ sampleRate: 16000, samples: new Float32Array(32000), started_at: 0, ended_at: 2000,
        turns: [{ turn_id: "one", speech_ms: 200, pauses: [{ from_ms: 700, to_ms: 950 }], end_ms: 1700 }] });
      progress.onTurnStep({ step: "heard", text: "hello", endpoint_silence_ms: 800 });
      throw Object.assign(new Error("stopped"), { code: "trial-cancelled" });
    };
  });
  await expect(page.locator("#turn-try")).toBeEnabled();
  await page.locator("#turn-try").click();
  await expect(page.locator("#turn-try-panel")).toHaveAttribute("data-phase", "done");
  await expect(page.locator("#turn-try-panel")).toContainText("Detected you finished");
  const take = page.locator("#turn-try-take");
  await expect(take).toBeVisible();
  // The inline take draws its marks on the wave, names what the colours mean under it, and says each in words to assistive tech.
  await expect(take.locator('.try-take-wave [data-kind="pause"]')).toHaveCount(1);
  await expect(take.locator('.try-take-wave [data-kind="end"]')).toHaveCount(1);
  await expect(take.locator('.try-take-key-line [data-kind="pause"]')).toBeVisible();
  await expect(take.locator('.try-take-key-line [data-kind="end"]')).toBeVisible();
  await expect(take.locator('.sr-only [data-kind="pause"]')).toHaveCount(1);
  await expect(take.locator('.sr-only [data-kind="end"]')).toHaveCount(1);
});

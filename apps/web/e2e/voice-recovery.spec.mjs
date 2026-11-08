import { expect, test } from "@playwright/test";

/* What the page relies on to hear the person again after the browser took their microphone away (web#190, web#192):
 * the published browser host, with its own shared audio, tries the system's default microphone when the track ends and,
 * when none opens, leaves every call speaking, without its input half (`listening: "off"`), saying `microphone-lost`;
 * a call given its input half again opens the microphone anew and hears. The microphone is the page's own here (an
 * oscillator, sounding while the test "speaks"), so both browsers run it with no capture device. */
test("a call the lost microphone left speaking hears again once its input half is added", async ({ page }) => {
  // An empty page of the site: only the voice package runs, none of the room.
  await page.route("**/voice-contract-page", (route) => route.fulfill({ body: "<!doctype html><title>voice</title>", contentType: "text/html" }));
  await page.goto("/voice-contract-page");
  // A tap first, as a join is: a browser may start audio only after one.
  await page.mouse.click(5, 5);
  const result = await page.evaluate(async () => {
    const tracks = [];
    let level = null, none = false;
    navigator.mediaDevices.getUserMedia = async () => {
      if (none) throw new DOMException("no microphone", "NotFoundError");
      const context = new AudioContext();
      await context.resume();
      const tone = context.createOscillator();
      level = context.createGain();
      level.gain.value = 0;
      const out = context.createMediaStreamDestination();
      tone.connect(level).connect(out);
      tone.start();
      tracks.push(out.stream.getAudioTracks()[0]);
      return out.stream;
    };
    const { default: init, createVoiceHost } = await import("/voice-contract/js/index.js");
    await init();
    // Speech is a window of 512 samples with the tone in it; what comes in is buffered into whole windows.
    const source = {
      vad: () => ({ createVad: () => {
        let position = 0, pending = [];
        return {
          accept(samples) {
            pending.push(...samples);
            const frames = [];
            while (pending.length >= 512) {
              const window = pending.splice(0, 512);
              position += 512;
              frames.push({ end: position, speech: window.some((sample) => Math.abs(sample) > 0.1) });
            }
            return frames;
          },
          reset() { position = 0; pending = []; },
        };
      } }),
      transcriber: () => ({ transcribe: async () => "hello" }),
      speaker: () => ({ speak: async () => ({ samples: new Float32Array(1600), sampleRate: 16000 }) }),
    };
    const host = createVoiceHost(source);
    const input = { stt: { model: "fake" }, endOfTurn: { kind: "silence" }, patience: "fast" };
    const call = host.start({ input, output: { tts: { model: "fake" } } });
    const seen = { turns: [], errors: [], states: [] };
    call.onTurn((turn) => seen.turns.push(turn.phase));
    call.onError((error) => seen.errors.push(error.code));
    call.onState((state) => seen.states.push(state.listening));
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const finished = () => seen.turns.filter((phase) => phase === "finished").length;
    const speak = async () => {
      const before = finished();
      level.gain.value = 0.5; await wait(1500); level.gain.value = 0;
      for (let i = 0; i < 100 && finished() === before; i++) await wait(100);
    };
    await call.ready;
    await host.routeInput(call);
    await speak();
    const heardFirst = finished();
    // The browser ends the microphone (unplugged, taken by the system) and there is none to take its place.
    none = true;
    tracks[0].dispatchEvent(new Event("ended"));
    for (let i = 0; i < 50 && seen.states.at(-1) !== "off"; i++) await wait(20);
    const leftAs = { error: seen.errors.at(-1), state: seen.states.at(-1) };
    // The call goes on speaking; a microphone is back, and given its input half again, the call opens it.
    none = false;
    await call.update({ input });
    for (let i = 0; i < 50 && seen.states.at(-1) === "off"; i++) await wait(20);
    await host.routeInput(call);
    await speak();
    await call.stop();
    return { heardFirst, leftAs, heardAfter: finished(), microphones: tracks.length };
  });
  expect(result.heardFirst).toBe(1);
  expect(result.leftAs).toEqual({ error: "microphone-lost", state: "off" });
  expect(result.microphones).toBe(2);
  expect(result.heardAfter).toBe(2);
});

import { host } from "../host";
import type { CueBridge, CueOptions } from "../host/types";
import { nextGapSeconds, thinkingSound, thinkingSoundGain, thinkingSoundIntervalScale, thinkingSoundUrl, type ThinkingSound } from "./thinking-sounds";

/* The thinking sound's player: the sound the person chose (services/thinking-sounds.ts), played now and then at its own
 * cadence stretched or shortened by the person's frequency, and at its level moved by the person's offset, in the page's
 * Web Audio. When it plays is not its business (features/call/PresenceSound.tsx decides, by Settings → Call and the
 * screen); Settings' Try plays it here too.
 *
 * A browser lets a page start its audio only from a gesture: WebKit keeps an AudioContext made later suspended, silent
 * for good, and the sound starts when the agent starts working, never in a gesture (sidevoice-web#439). So the page's
 * one context for it is begun in the Join tap (`primeThinkingSound`, beside the lock screen's element), and every play
 * of the call is in it; where the page made none in a gesture (an app's webview, which lets a page start its audio at
 * any time), it is made when the sound first plays.
 *
 * An app that plays the cue itself (`host.cue`: the phone's native call holds the audio session, and a webview's Web Audio
 * is not sure to come out through it) is asked to, with the sound, the offset and the frequency (`intervalScale`), and the
 * page's context is never made. An app before the frequency drops it and plays the sound's own cadence: still the app's,
 * not the page's, which may not be heard there. An app that holds the cue for the lock (`thinkingSoundHeldForLock`) may be
 * asked to play it only while the screen is locked (`whileLocked`): "only with the screen off" on a phone whose page may be
 * suspended once the screen locks.
 * An app whose `host.cue` does not take them (one before the sounds) would play its own sound, not the chosen one: the
 * page plays the chosen one itself there. */

/** Each play goes through the person's offset, then a limiter that keeps a raised sound from clipping (the settings it was
 *  approved with: a threshold just under full scale, a hard knee and a high ratio, quick to act). */
const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;
/** How long a sound fades out once it is stopped (on the audio clock), and when its nodes are let go (on the page's): the
 *  latest a stopped sound can be heard, whatever the audio clock does. */
const TAIL_SECONDS = 0.15;
const RELEASE_MS = 400;

/** The sound, the person's offset in dB, and their frequency (a factor on the sound's gaps; none: 1, its own cadence).
 *  `whileLocked`: only while the screen is locked, for an app that holds the cue for it (`thinkingSoundHeldForLock`). */
export interface ThinkingSoundChoice { sound: string; gainDb: number; intervalScale?: number; whileLocked?: boolean }

let context: AudioContext | null = null;
let playing = 0;
/** Each sound decoded once for the page's context (null: it could not be, and is tried again next time). */
const decoded = new Map<string, Promise<AudioBuffer | null>>();

function audioContext(): AudioContext | null {
  if (context && context.state !== "closed") return context;
  if (typeof AudioContext === "undefined") return null;
  decoded.clear();
  try { context = new AudioContext(); } catch { context = null; }
  return context;
}

/** The app's player where it plays the chosen sound itself: its start takes the sound and the offset. */
function hostCue(): CueBridge | null {
  const cue = host().cue;
  const options = cue?.options;
  return cue && Array.isArray(options) && options.includes("sound") && options.includes("gainDb") ? cue : null;
}

/** Whether the app plays the cue itself and holds it for the lock: started with `whileLocked`, it plays only while the
 *  screen is locked, starting and stopping by itself (an app that does not list it would play at once). */
export function thinkingSoundHeldForLock(): boolean {
  return hostCue()?.options?.includes("whileLocked") ?? false;
}

/** Begins the page's context for the sound, inside the Join gesture: resumed there, it may resume again later. Quiet
 *  until a sound plays: it is suspended again once the gesture's resume is through. */
export function primeThinkingSound(): void {
  if (hostCue()) return;
  const made = audioContext();
  if (!made) return;
  made.resume().then(() => { if (!playing && made.state === "running") void made.suspend().catch(() => undefined); }, () => undefined);
}

const dbToGain = (db: number) => Math.pow(10, thinkingSoundGain(db) / 20);

/** Opus first where the page plays it for sure; else, or where it does not decode after all, AAC. */
function formats(): ("webm" | "m4a")[] {
  let opus = "";
  try { opus = document.createElement("audio").canPlayType('audio/webm; codecs="opus"'); } catch { /* No media element. */ }
  return opus === "probably" ? ["webm", "m4a"] : ["m4a", "webm"];
}

function decode(made: AudioContext, sound: ThinkingSound): Promise<AudioBuffer | null> {
  const known = decoded.get(sound.id);
  if (known) return known;
  const pending = (async () => {
    for (const format of formats()) {
      try {
        const response = await fetch(thinkingSoundUrl(sound.files[format]));
        if (response.ok) return await made.decodeAudioData(await response.arrayBuffer());
      } catch { /* The other format. */ }
    }
    return null;
  })();
  decoded.set(sound.id, pending);
  void pending.then((buffer) => { if (!buffer && decoded.get(sound.id) === pending) decoded.delete(sound.id); });
  return pending;
}

/** A sound that plays at its cadence until stopped: now, then again a gap after each play ends. */
export interface ThinkingSoundLoop {
  /** The person's offset, applied at once to what plays. */
  setGain(gainDb: number): void;
  /** The person's frequency: the play waiting on the clock is moved to where it puts it. */
  setIntervalScale(scale: number): void;
  /** Stops it. The page's own copy fades out (TAIL_SECONDS) and says when it has: what follows it (the app's cue taking
   *  over) starts then, never over it. Nothing to wait for where it stops at once (the app's cue, nothing played yet). */
  stop(): Promise<void> | void;
}

/** `sound` playing in `made` at its cadence (moved by `intervalScale`), through its own gain and limiter. Each next play is
 *  put on the audio clock one play ahead, when the one before it starts: a timer the browser delays (a page in the
 *  background) delays nothing heard. */
function startLoop(made: AudioContext, sound: ThinkingSound, gainDb: number, intervalScale: number, random: () => number, unplayable: () => void): ThinkingSoundLoop {
  const gain = made.createGain();
  gain.gain.value = dbToGain(gainDb);
  const limiter = made.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  gain.connect(limiter).connect(made.destination);
  const sources = new Set<AudioBufferSourceNode>();
  /** When each play begins, on the audio clock: a stop tells the one playing from the one still waiting. */
  const begins = new WeakMap<AudioBufferSourceNode, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let scale = thinkingSoundIntervalScale(intervalScale);
  /** The play last put on the clock, and when the one before it ends (none for the first): where a new frequency moves it. */
  let last: { source: AudioBufferSourceNode; buffer: AudioBuffer; at: number; after: number | null } | null = null;
  const play = (buffer: AudioBuffer, at: number, after: number | null) => {
    if (stopped) return;
    const source = made.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { sources.delete(source); source.disconnect(); };
    sources.add(source);
    begins.set(source, at);
    source.start(at);
    last = { source, buffer, at, after };
    wake(buffer, at);
  };
  // When the play at `at` begins, the next is put on the clock, a gap drawn at the frequency set after this one ends. A clock
  // that has not got there (a context still suspended, a timer early) is waited for: never more than one play ahead. A timer
  // so late that the next has gone by (a page long in the background) plays it now, and the cadence goes on from there:
  // never a burst of the plays it missed.
  const wake = (buffer: AudioBuffer, at: number) => {
    timer = setTimeout(() => {
      if (made.currentTime < at) { wake(buffer, at); return; }
      const end = at + buffer.duration;
      play(buffer, Math.max(end + nextGapSeconds(sound, scale, random), made.currentTime), end);
    }, Math.max(0, (at - made.currentTime) * 1000));
  };
  const release = () => { gain.disconnect(); limiter.disconnect(); };
  // Neither format playable (offline, a file missing): nothing to hold the audio for until the loop is stopped.
  void decode(made, sound).then((buffer) => {
    if (stopped) return;
    if (buffer) { play(buffer, made.currentTime, null); return; }
    release();
    unplayable();
  });
  return {
    setGain(next) {
      if (stopped) return;
      gain.gain.setTargetAtTime(dbToGain(next), made.currentTime, 0.02);
    },
    setIntervalScale(next) {
      if (stopped) return;
      scale = thinkingSoundIntervalScale(next);
      // The play still waiting is put where the new frequency puts it after the one before it ends (now, if that has gone
      // by); one already begun plays on, and the gap after it is drawn at the new frequency.
      const waiting = last;
      if (!waiting || waiting.after === null || waiting.at <= made.currentTime) return;
      clearTimeout(timer);
      sources.delete(waiting.source);
      try { waiting.source.stop(); } catch { /* Already stopped. */ }
      waiting.source.disconnect();
      play(waiting.buffer, Math.max(waiting.after + nextGapSeconds(sound, scale, random), made.currentTime), waiting.after);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      const now = made.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, TAIL_SECONDS / 3);
      // The play sounding fades out; the one still waiting never begins.
      const sounding = [...sources].filter((source) => (begins.get(source) ?? 0) <= now);
      for (const source of sources) {
        try { source.stop(sounding.includes(source) ? now + TAIL_SECONDS : now); } catch { /* Already stopped. */ }
      }
      // Faded once what sounded has ended, on the audio clock: a page's timer is no measure of it (iOS may hold the audio back
      // or suspend it, and what follows would start before the fade is through). A context that does not run (suspended,
      // closed) would play the rest of it when it runs again: the chain is cut there, and that is the end of it, as it is at
      // the latest when the nodes are let go.
      let ended = sounding.length;
      let faded: () => void = () => undefined;
      const through = new Promise<void>((resolve) => { faded = resolve; });
      const cut = () => { release(); faded(); };
      const paused = () => { if (made.state !== "running") cut(); };
      for (const source of sounding) source.addEventListener("ended", () => { if (--ended === 0) faded(); }, { once: true });
      made.addEventListener("statechange", paused);
      void through.then(() => made.removeEventListener("statechange", paused));
      setTimeout(() => { for (const source of sources) source.disconnect(); sources.clear(); cut(); }, RELEASE_MS);
      if (!ended || made.state !== "running") cut();
      return last ? through : undefined;
    },
  };
}

/** The host's own player, started and stopped as the page's would be. A host that throws is not worth a call's failing, and
 *  is still asked to stop. */
function playInHost(cue: CueBridge, options: CueOptions & { gainDb: number; intervalScale: number }): ThinkingSoundLoop {
  // A start that throws may have begun to play: its cleanup still asks the host to stop.
  try { cue.start("thinking", options); } catch { /* Stopped below. */ }
  let stopped = false;
  let current = options;
  return {
    setGain(gainDb) {
      if (stopped || thinkingSoundGain(gainDb) === current.gainDb) return;
      current = { ...current, gainDb: thinkingSoundGain(gainDb) };
      try { cue.start("thinking", current); } catch { /* It plays what it played. */ }
    },
    setIntervalScale(scale) {
      if (stopped || thinkingSoundIntervalScale(scale) === current.intervalScale) return;
      current = { ...current, intervalScale: thinkingSoundIntervalScale(scale) };
      try { cue.start("thinking", current); } catch { /* It plays what it played. */ }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try { cue.stop("thinking"); } catch { /* Nothing to stop. */ }
    },
  };
}

/** The page's own loop, kept in the count of what plays: the context is suspended again only once nothing does. */
function playInPage(choice: ThinkingSoundChoice, random: () => number): ThinkingSoundLoop | null {
  const made = audioContext();
  if (!made) return null;
  playing++;
  void made.resume().catch(() => undefined);
  let counted = true;
  // Out of the count once it plays nothing more (stopped, or nothing it could play); quiet between sounds: the context holds
  // no output device while nothing plays.
  const done = () => {
    if (!counted) return;
    counted = false;
    playing--;
    setTimeout(() => { if (!playing && made.state === "running") void made.suspend().catch(() => undefined); }, RELEASE_MS);
  };
  const loop = startLoop(made, thinkingSound(choice.sound), choice.gainDb, choice.intervalScale ?? 1, random, done);
  let stopped = false;
  return {
    setGain: (gainDb) => loop.setGain(gainDb),
    setIntervalScale: (scale) => loop.setIntervalScale(scale),
    stop() {
      if (stopped) return;
      stopped = true;
      const faded = loop.stop();
      done();
      return faded;
    },
  };
}

const SILENT: ThinkingSoundLoop = { setGain: () => undefined, setIntervalScale: () => undefined, stop: () => undefined };

/** Plays the chosen sound at its cadence until the returned loop is stopped: in the app where it plays the chosen sound
 *  itself, else in the page. Nothing where the page has no Web Audio. `whileLocked` goes to an app that holds the cue for
 *  the lock, and nowhere else: the page's own player has no lock to wait for, and its caller decides by the screen instead. */
export function playThinkingSound(choice: ThinkingSoundChoice, random: () => number = Math.random): ThinkingSoundLoop {
  const cue = hostCue();
  if (cue) {
    return playInHost(cue, {
      sound: thinkingSound(choice.sound).id, gainDb: thinkingSoundGain(choice.gainDb), intervalScale: thinkingSoundIntervalScale(choice.intervalScale),
      ...(choice.whileLocked && thinkingSoundHeldForLock() ? { whileLocked: true } : {}),
    });
  }
  return playInPage(choice, random) ?? SILENT;
}

/** Settings' Try: the chosen sound in the page, at its cadence and the frequency set, started by the person's press (which
 *  lets the page's audio start). Always the page's: the app plays its cue only in a call. */
export function previewThinkingSound(choice: ThinkingSoundChoice, random: () => number = Math.random): ThinkingSoundLoop {
  return playInPage(choice, random) ?? SILENT;
}

/** For tests: forgets the page's context. */
export function resetThinkingSoundForTests(): void {
  void context?.close().catch(() => undefined);
  context = null;
  playing = 0;
  decoded.clear();
}

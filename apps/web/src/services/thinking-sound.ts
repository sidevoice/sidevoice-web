import { host } from "../host";
import type { CueBridge, CueOptions } from "../host/types";
import { nextGapSeconds, thinkingSound, thinkingSoundGain, thinkingSoundUrl, type ThinkingSound } from "./thinking-sounds";

/* The thinking sound's player: the sound the person chose (services/thinking-sounds.ts), played now and then at its own
 * cadence and at its level moved by the person's offset, in the page's Web Audio. When it plays is not its business
 * (features/call/PresenceSound.tsx decides, by Settings → Call and the screen); Settings' Try plays it here too.
 *
 * A browser lets a page start its audio only from a gesture: WebKit keeps an AudioContext made later suspended, silent
 * for good, and the sound starts when the agent starts working, never in a gesture (sidevoice-web#439). So the page's
 * one context for it is begun in the Join tap (`primeThinkingSound`, beside the lock screen's element), and every play
 * of the call is in it; where the page made none in a gesture (an app's webview, which lets a page start its audio at
 * any time), it is made when the sound first plays.
 *
 * An app that plays the cue itself (`host.cue`: the phone's native call holds the audio session, and a webview's Web Audio
 * is not sure to come out through it) is asked to, with the sound and the offset, and the page's context is never made.
 * An app whose `host.cue` does not take them (one before the sounds) would play its own sound, not the chosen one: the
 * page plays the chosen one itself there. */

/** Each play goes through the person's offset, then a limiter that keeps a raised sound from clipping (the settings it was
 *  approved with: a threshold just under full scale, a hard knee and a high ratio, quick to act). */
const LIMITER = { threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;
/** How long a sound fades out once it is stopped, and when its nodes are let go. */
const TAIL_SECONDS = 0.15;
const RELEASE_MS = 400;

export interface ThinkingSoundChoice { sound: string; gainDb: number }

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
  stop(): void;
}

/** `sound` playing in `made` at its cadence, through its own gain and limiter. Each next play is put on the audio clock one
 *  play ahead, when the one before it starts: a timer the browser delays (a page in the background) delays nothing heard. */
function startLoop(made: AudioContext, sound: ThinkingSound, gainDb: number, random: () => number): ThinkingSoundLoop {
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const play = (buffer: AudioBuffer, at: number) => {
    if (stopped) return;
    const source = made.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { sources.delete(source); source.disconnect(); };
    sources.add(source);
    source.start(at);
    wake(buffer, at, at + buffer.duration + nextGapSeconds(sound, random));
  };
  // When the play at `at` begins, the one at `next` is put on the clock. A clock that has not got there (a context still
  // suspended, a timer early) is waited for: never more than one play ahead.
  const wake = (buffer: AudioBuffer, at: number, next: number) => {
    timer = setTimeout(() => { if (made.currentTime < at) wake(buffer, at, next); else play(buffer, next); },
      Math.max(0, (at - made.currentTime) * 1000));
  };
  void decode(made, sound).then((buffer) => { if (buffer) play(buffer, made.currentTime); });
  return {
    setGain(next) {
      if (stopped) return;
      gain.gain.setTargetAtTime(dbToGain(next), made.currentTime, 0.02);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      const now = made.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, TAIL_SECONDS / 3);
      for (const source of sources) { try { source.stop(now + TAIL_SECONDS); } catch { /* Already stopped. */ } }
      setTimeout(() => { for (const source of sources) source.disconnect(); sources.clear(); gain.disconnect(); limiter.disconnect(); }, RELEASE_MS);
    },
  };
}

/** The host's own player, started and stopped as the page's would be. A host that throws is not worth a call's failing, and
 *  is still asked to stop. */
function playInHost(cue: CueBridge, options: Required<CueOptions>): ThinkingSoundLoop {
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
  const loop = startLoop(made, thinkingSound(choice.sound), choice.gainDb, random);
  let stopped = false;
  return {
    setGain: (gainDb) => loop.setGain(gainDb),
    stop() {
      if (stopped) return;
      stopped = true;
      loop.stop();
      playing--;
      // Quiet between sounds: the context holds no output device while nothing plays.
      setTimeout(() => { if (!playing && made.state === "running") void made.suspend().catch(() => undefined); }, RELEASE_MS);
    },
  };
}

const SILENT: ThinkingSoundLoop = { setGain: () => undefined, stop: () => undefined };

/** Plays the chosen sound at its cadence until the returned loop is stopped: in the app where it plays the chosen sound
 *  itself, else in the page. Nothing where the page has no Web Audio. */
export function playThinkingSound(choice: ThinkingSoundChoice, random: () => number = Math.random): ThinkingSoundLoop {
  const cue = hostCue();
  if (cue) return playInHost(cue, { sound: thinkingSound(choice.sound).id, gainDb: thinkingSoundGain(choice.gainDb) });
  return playInPage(choice, random) ?? SILENT;
}

/** Settings' Try: the chosen sound in the page, at its cadence, started by the person's press (which lets the page's audio
 *  start). Always the page's: the app plays its cue only in a call. */
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

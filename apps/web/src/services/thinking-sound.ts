/* The thinking sound's player: a soft breath (a filtered noise breathing slowly, quiet), drawn in the page's Web Audio.
 * When it plays is not its business (features/call/PresenceSound.tsx decides, by Settings → Call and the screen).
 *
 * A browser lets a page start its audio only from a gesture: WebKit keeps an AudioContext made later suspended, silent
 * for good, and the breath starts when the agent starts working, never in a gesture (sidevoice-web#439). So the page's
 * one context for it is begun in the Join tap (`primeThinkingSound`, beside the lock screen's element), and every breath
 * of the call plays in it; where the page made none in a gesture (an app's webview, which lets a page start its audio
 * at any time), it is made when the first breath plays. */

const LEVEL = 0.035;
const BREATH_SECONDS = 3.2;
/** How long a breath fades out once it stops, and when its nodes are let go. */
const TAIL_SECONDS = 0.3;
const RELEASE_MS = 400;

let context: AudioContext | null = null;
let playing = 0;

function audioContext(): AudioContext | null {
  if (context && context.state !== "closed") return context;
  if (typeof AudioContext === "undefined") return null;
  try { context = new AudioContext(); } catch { context = null; }
  return context;
}

/** Begins the page's context for the breath, inside the Join gesture: resumed there, it may resume again later. Quiet
 *  until a breath plays: it is suspended again once the gesture's resume is through. */
export function primeThinkingSound(): void {
  const made = audioContext();
  if (!made) return;
  made.resume().then(() => { if (!playing && made.state === "running") void made.suspend().catch(() => undefined); }, () => undefined);
}

function startBreath(context: AudioContext): () => void {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  const gain = context.createGain();
  gain.gain.value = 0;
  // A slow swell and fall, like breathing: the gain follows a low sine between silence and LEVEL.
  const lfo = context.createOscillator();
  lfo.frequency.value = 1 / BREATH_SECONDS;
  const depth = context.createGain();
  depth.gain.value = LEVEL / 2;
  const base = context.createConstantSource();
  base.offset.value = LEVEL / 2;
  lfo.connect(depth).connect(gain.gain);
  base.connect(gain.gain);
  noise.connect(filter).connect(gain).connect(context.destination);
  noise.start(); lfo.start(); base.start();
  return () => {
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    for (const node of [noise, lfo, base]) { try { node.stop(now + TAIL_SECONDS); } catch { /* Already stopped. */ } }
    setTimeout(() => { for (const node of [noise, filter, gain, lfo, depth, base]) node.disconnect(); }, RELEASE_MS);
  };
}

/** Plays the breath until the returned function stops it. Nothing where the page has no Web Audio. */
export function playThinkingSound(): () => void {
  const made = audioContext();
  if (!made) return () => undefined;
  playing++;
  void made.resume().catch(() => undefined);
  const stop = startBreath(made);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stop();
    playing--;
    // Quiet between breaths: the context holds no output device while nothing plays.
    setTimeout(() => { if (!playing && made.state === "running") void made.suspend().catch(() => undefined); }, RELEASE_MS);
  };
}

/** For tests: forgets the page's context. */
export function resetThinkingSoundForTests(): void {
  void context?.close().catch(() => undefined);
  context = null;
  playing = 0;
}

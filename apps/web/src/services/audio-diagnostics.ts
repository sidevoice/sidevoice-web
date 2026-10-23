/* Always-on audio diagnostics for the call's microphone and speaker (sidevoice-web#341: echo cancellation that degrades
 * in a long call, a barge-in that works well or badly). Observation only: it adds listeners to objects the page owns and
 * replaces no function of the browser or of any package.
 *
 * What it hears: `devicechange` (how many inputs and outputs, never their labels), the page becoming hidden or shown,
 * the call's start and end (the clock of `call_ms`), the page's own activation stream (its tracks' settings and
 * `ended`/`mute`/`unmute`, its context's state: `watchStream`, `watchContext`), and what the controller reports: a
 * reply cut by a barge-in with the last levels, the microphone going live or muted.
 *
 * What it cannot hear: the microphone stream and context that `@sidevoice/voice` opens inside its call are not the
 * page's. Why it rebuilt the microphone, its output (`setSinkId`) changes and the detector's level against its bar need an
 * optional `onDiagnostic` callback in that package.
 *
 * Cheap and private: no per-frame logging (a kind is rate-limited), no audio, no text, no label, and a device id only
 * as a short hash. The log is a ring of the last events, in memory and mirrored to localStorage so it outlives a reload,
 * read with `window.sidevoiceAudioDiagnostics.dump()` or from the stats dialog's copied text. */

export type AudioDiagnosticEntry = { at: string; call_ms: number | null; kind: string; mic_rebuilds: number; [field: string]: unknown };

type Any = any; // The browser objects here are observed through feature checks, never trusted to have a shape.

export interface AudioDiagnosticsOptions {
  win?: Any;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Entries kept. */
  max?: number;
  /** At most `burst` entries of a kind per `windowMs`; the rest are counted into the next one that passes. */
  burst?: number;
  windowMs?: number;
  log?: (line: string) => void;
}

export const AUDIO_DIAGNOSTICS_KEY = "sidevoice.audio-diagnostics";

/** A device id as 6 hex digits: enough to tell two devices apart in one log, not to find the device again. */
export function shortId(id: unknown): string | null {
  if (typeof id !== "string" || !id) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0").slice(0, 6);
}

const num = (value: unknown, digits = 0) => typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

/** Reads a value the browser may refuse to give; the log goes on without it. */
function peek<T>(read: () => T): T | null {
  try { const value = read(); return value === undefined ? null : value; } catch { return null; }
}
const quietly = (hook: () => void) => { try { hook(); } catch { /* unobserved */ } };

export function createAudioDiagnostics(options: AudioDiagnosticsOptions = {}) {
  const win: Any = options.win ?? (typeof window === "undefined" ? undefined : window);
  const now = options.now ?? (() => Date.now());
  const max = options.max ?? 200;
  const burst = options.burst ?? 20;
  const windowMs = options.windowMs ?? 10_000;
  const storage = options.storage === undefined ? safeStorage(win) : options.storage;
  const log = options.log ?? ((line: string) => { try { console.debug(line); } catch { /* nothing to say it to */ } });

  let entries: AudioDiagnosticEntry[] = load(storage, max);
  // The clock of the call is set by callStarted() and nothing else; an event before it reads call_ms null.
  let callStart: number | null = null;
  let acquisitions = 0;
  const detachers = new Set<() => void>();
  const gates = new Map<string, { since: number; count: number; dropped: number }>();
  let saving = false;
  let installed = false;

  function load(from: typeof storage, keep: number): AudioDiagnosticEntry[] {
    try {
      const kept = JSON.parse(from?.getItem(AUDIO_DIAGNOSTICS_KEY) || "[]");
      return Array.isArray(kept) ? kept.filter((e) => e && typeof e.kind === "string").slice(-keep) : [];
    } catch { return []; }
  }
  function save() {
    if (!storage || saving) return;
    saving = true;
    const write = () => { saving = false; try { storage.setItem(AUDIO_DIAGNOSTICS_KEY, JSON.stringify(entries)); } catch { /* full or blocked: memory still has it */ } };
    try { if (typeof setTimeout === "function") setTimeout(write, 1000); else write(); } catch { saving = false; }
  }

  function record(kind: string, fields: Record<string, unknown> = {}) {
    try {
      const t = now();
      const gate = gates.get(kind) ?? { since: t, count: 0, dropped: 0 };
      if (t - gate.since >= windowMs) { gate.since = t; gate.count = 0; }
      gates.set(kind, gate);
      if (gate.count >= burst) { gate.dropped++; return; }
      gate.count++;
      const entry = { at: new Date(t).toISOString(), call_ms: callStart === null ? null : t - callStart, kind, mic_rebuilds: Math.max(0, acquisitions - 1), ...fields } as AudioDiagnosticEntry;
      if (gate.dropped) { entry.suppressed = gate.dropped; gate.dropped = 0; }
      entries.push(entry);
      if (entries.length > max) entries = entries.slice(-max);
      log("[audio-diag] " + JSON.stringify(entry));
      save();
    } catch { /* diagnostics never break a call */ }
  }

  /** Adds a listener and returns how to take it off; uninstall takes off whatever is left. */
  function listen(target: Any, type: string, handler: () => void): () => void {
    target.addEventListener(type, handler);
    const off = () => { detachers.delete(off); quietly(() => target.removeEventListener(type, handler)); };
    detachers.add(off);
    return off;
  }

  /** Never throws: each property is read on its own. */
  function contextFacts(context: Any): Record<string, unknown> {
    if (!context) return {};
    return {
      ctx_state: peek(() => context.state),
      ctx_rate: peek(() => num(context.sampleRate)),
      ctx_out_latency_ms: peek(() => num(context.outputLatency * 1000, 1)),
      ctx_base_latency_ms: peek(() => num(context.baseLatency * 1000, 1)),
    };
  }
  function trackFacts(track: Any): Record<string, unknown> {
    const s: Any = peek(() => track.getSettings?.()) ?? {};
    return {
      track: peek(() => typeof track.id === "string" ? track.id.slice(0, 8) : null),
      ready: peek(() => track.readyState), muted: peek(() => track.muted), enabled: peek(() => track.enabled),
      aec: peek(() => s.echoCancellation), ns: peek(() => s.noiseSuppression), agc: peek(() => s.autoGainControl),
      rate: peek(() => num(s.sampleRate)), channels: peek(() => num(s.channelCount)),
      device: peek(() => shortId(s.deviceId)), group: peek(() => shortId(s.groupId)),
    };
  }

  function install() {
    if (installed || !win) return;
    installed = true;
    quietly(() => {
      const devices = win.navigator?.mediaDevices;
      if (!devices?.addEventListener) return;
      listen(devices, "devicechange", () => {
        void Promise.resolve().then(() => devices.enumerateDevices()).then(
          (list: Any[]) => record("devicechange", { inputs: list.filter((d) => d.kind === "audioinput").length, outputs: list.filter((d) => d.kind === "audiooutput").length }),
          () => record("devicechange", { inputs: null, outputs: null }),
        ).catch(() => {});
      });
    });
    quietly(() => {
      const doc = win.document;
      if (doc?.addEventListener) listen(doc, "visibilitychange", () => record("visibility", { state: peek(() => doc.visibilityState) }));
    });
  }

  return {
    install,
    uninstall() { installed = false; [...detachers].forEach((off) => off()); },
    record,
    /** The call began, or came back with a resumed session: its clock starts here if it is not running. */
    callStarted() { try { callStart ??= now(); } catch { /* clock unchanged */ } },
    /** The call ended: its totals are the last entry, the next call counts from zero, and the clock stops. */
    callEnded() {
      try { record("call-ended", { mic_acquisitions: acquisitions }); }
      finally { callStart = null; acquisitions = 0; }
    },
    /** A microphone stream the page opened itself: its tracks' settings now, and their events until `stop`. Returns
     *  how to stop watching (call it when the page lets the stream go: a stopped track emits no `ended`). */
    watchStream(stream: Any, context?: Any): () => void {
      const offs: Array<() => void> = [];
      quietly(() => {
        const n = ++acquisitions;
        const tracks: Any[] = Array.from(stream?.getAudioTracks?.() ?? []);
        for (const track of tracks) {
          record("mic-acquired", { n, ...trackFacts(track), ...contextFacts(context) });
          for (const type of ["ended", "mute", "unmute"]) {
            quietly(() => offs.push(listen(track, type, () => {
              record("track-" + type, { n, ...trackFacts(track), ...contextFacts(context) });
              if (type === "ended") offs.forEach((off) => off());
            })));
          }
        }
      });
      return () => offs.forEach((off) => off());
    },
    /** An audio context the page made itself: its state changes until it closes or `stop`. */
    watchContext(context: Any): () => void {
      let off = () => {};
      quietly(() => {
        record("ctx-created", contextFacts(context));
        off = listen(context, "statechange", () => {
          record("ctx-" + (peek(() => context.state) ?? "state"), contextFacts(context));
          if (peek(() => context.state) === "closed") off();
        });
      });
      return () => off();
    },
    entries: () => entries.slice(),
    dump: () => entries.map((e) => JSON.stringify(e)).join("\n"),
  };
}

export type AudioDiagnostics = ReturnType<typeof createAudioDiagnostics>;

function safeStorage(win: Any) { try { return win?.localStorage ?? null; } catch { return null; } }

/** The page's one log, listening from first use. Never throws: where it cannot start, the page gets a log that records
 *  nothing, and the caller loads all the same. */
const SHARED = Symbol.for("sidevoice.audio-diagnostics.log");
export function audioDiagnostics(): AudioDiagnostics {
  const holder: Any = typeof window === "undefined" ? globalThis : window;
  // A re-imported copy of this module finds the log already made.
  if (holder[SHARED]) return holder[SHARED];
  let made: AudioDiagnostics;
  try {
    made = createAudioDiagnostics();
    made.install();
    quietly(() => { holder.sidevoiceAudioDiagnostics = { dump: made.dump, entries: made.entries }; });
  } catch {
    made = { install() {}, uninstall() {}, record() {}, callStarted() {}, callEnded() {}, watchStream: () => () => {}, watchContext: () => () => {}, entries: () => [], dump: () => "" };
  }
  quietly(() => Object.defineProperty(holder, SHARED, { value: made, configurable: true }));
  return made;
}

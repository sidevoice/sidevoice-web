/* Always-on audio diagnostics for the call's microphone and speaker (sidevoice-web#341: echo cancellation that degrades
 * in a long call, a barge-in that works well or badly). It only watches: nothing here changes what the audio path does.
 *
 * The audio path itself is `@sidevoice/voice`'s `createSharedWebAudioIo`, which keeps its stream, tracks and context
 * to itself. What the page can see of it, it sees from the browser's side: it wraps `getUserMedia` (every acquisition
 * of the microphone, the page's and the package's, and the track's own `ended`/`mute`/`unmute`, listened to with
 * `addEventListener` so the package's handlers stay as they are), follows each `AudioContext` the page makes (state,
 * sample rate, output device, output latency) and `devicechange`. The call's own facts that the page does hear (a reply
 * cut by a barge-in, the microphone going live or muted) are recorded by the controller through `record`.
 *
 * Cheap and private: no per-frame logging (a kind is rate-limited), no audio, no text, no device label, and a device
 * id only as a short hash. The log is a ring of the last events, kept in memory and mirrored to localStorage so it
 * outlives a reload, and read with `window.sidevoiceAudioDiagnostics.dump()` or from the stats dialog's copied text. */

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

/** The one installed instance on this page: a second install, from any instance, is a no-op while it stands, so the
 *  wrappers never stack and an uninstall in any order restores the browser's own functions. */
let installedBy: object | null = null;

/** Reads a value the browser may refuse to give; the log goes on without it. */
function peek<T>(read: () => T): T | null {
  try { const value = read(); return value === undefined ? null : value; } catch { return null; }
}

export function createAudioDiagnostics(options: AudioDiagnosticsOptions = {}) {
  const win: Any = options.win ?? (typeof window === "undefined" ? undefined : window);
  const now = options.now ?? (() => Date.now());
  const max = options.max ?? 200;
  const burst = options.burst ?? 20;
  const windowMs = options.windowMs ?? 10_000;
  const storage = options.storage === undefined ? safeStorage(win) : options.storage;
  const log = options.log ?? ((line: string) => { try { console.debug(line); } catch { /* nothing to say it to */ } });
  const owner = {};

  let entries: AudioDiagnosticEntry[] = load(storage, max);
  // The clock of the call: set by its start (or by the first event before one), cleared only by its end; the events of
  // a teardown never start it again, so an idle hour does not become the next call's first minute.
  let callStart: number | null = null;
  let callOver = false;
  let acquisitions = 0;
  let live = false;
  const contexts = new Set<Any>();
  const detach = new Set<() => void>();
  const gates = new Map<string, { since: number; count: number; dropped: number }>();
  let saving = false;
  let uninstallAll: (() => void) | null = null;

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
      if (callStart === null && !callOver) callStart = t;
      const entry: AudioDiagnosticEntry = { at: new Date(t).toISOString(), call_ms: callStart === null ? null : t - callStart, kind, mic_rebuilds: Math.max(0, acquisitions - 1), ...fields } as AudioDiagnosticEntry;
      if (gate.dropped) { entry.suppressed = gate.dropped; gate.dropped = 0; }
      entries.push(entry);
      if (entries.length > max) entries = entries.slice(-max);
      log("[audio-diag] " + JSON.stringify(entry));
      save();
    } catch { /* diagnostics never break a call */ }
  }

  const sinkName = (sink: unknown) => typeof sink === "string" ? (sink === "" ? "default" : shortId(sink)) : sink && typeof sink === "object" ? String(peek(() => (sink as Any).type) ?? "object") : null;

  /** Never throws: each property is read on its own. */
  function contextFacts(context: Any = [...contexts].pop()): Record<string, unknown> {
    if (!context) return {};
    return {
      ctx_state: peek(() => context.state),
      ctx_rate: peek(() => num(context.sampleRate)),
      ctx_sink: peek(() => sinkName(context.sinkId)),
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
  /** Runs a hook of the log; whatever it does, the caller's own result stands. */
  const quietly = (hook: () => void) => { try { hook(); } catch { /* unobserved */ } };

  function listen(target: Any, type: string, handler: () => void) {
    target.addEventListener(type, handler);
    const off = () => { detach.delete(off); try { target.removeEventListener(type, handler); } catch { /* gone */ } };
    detach.add(off);
    return off;
  }

  function watchTrack(track: Any, n: number) {
    const offs: Array<() => void> = [];
    const drop = () => offs.forEach((off) => off());
    for (const type of ["ended", "mute", "unmute"]) {
      offs.push(listen(track, type, () => {
        if (!live) return;
        record("track-" + type, { n, ...trackFacts(track), ...contextFacts() });
        if (type === "ended") drop();
      }));
    }
  }

  function wrapGetUserMedia(devices: Any): (() => void) | null {
    const original = devices.getUserMedia;
    if (typeof original !== "function") return null;
    const wrapped = async function (this: Any, constraints?: Any) {
      if (!live) return original.call(this, constraints);
      const audio = peek(() => constraints?.audio);
      if (!audio) return original.call(this, constraints);
      let asked: Record<string, unknown> = {};
      quietly(() => { asked = typeof audio === "object" ? { aec: audio.echoCancellation ?? null, ns: audio.noiseSuppression ?? null, agc: audio.autoGainControl ?? null, device: shortId(audio.deviceId?.exact ?? audio.deviceId) } : {}; });
      let stream: Any;
      try { stream = await original.call(this, constraints); }
      catch (error: Any) {
        quietly(() => record("mic-failed", { asked, error: String(error?.name ?? "Error").slice(0, 40), ...contextFacts() }));
        throw error;
      }
      quietly(() => {
        const n = ++acquisitions;
        const tracks: Any[] = Array.from(stream?.getAudioTracks?.() ?? []);
        for (const track of tracks) {
          quietly(() => record("mic-acquired", { n, asked, ...trackFacts(track), ...contextFacts() }));
          quietly(() => watchTrack(track, n));
        }
        if (!tracks.length) record("mic-acquired", { n, asked, tracks: 0, ...contextFacts() });
      });
      return stream;
    };
    // A property the browser or another script made read-only cannot be wrapped: skipped, not thrown.
    try { devices.getUserMedia = wrapped; } catch { return null; }
    if (devices.getUserMedia !== wrapped) return null;
    return () => { if (devices.getUserMedia === wrapped) { try { devices.getUserMedia = original; } catch { /* stays wrapped, passes through */ } } };
  }

  function observeContext(context: Any) {
    contexts.add(context);
    record("ctx-created", contextFacts(context));
    listen(context, "statechange", () => {
      if (!live) return;
      record("ctx-" + (peek(() => context.state) ?? "state"), contextFacts(context));
      if (peek(() => context.state) === "closed") contexts.delete(context);
    });
  }

  function wrapAudioContext(target: Any): (() => void) | null {
    const Base = target.AudioContext;
    if (typeof Base !== "function") return null;
    class Observed extends Base {
      constructor(...args: Any[]) { super(...args); if (live) quietly(() => observeContext(this)); }
    }
    // Only where the browser has it: a subclass that grew setSinkId would change what the page's feature checks see.
    if (typeof Base.prototype.setSinkId === "function") {
      Object.defineProperty(Observed.prototype, "setSinkId", {
        configurable: true, writable: true,
        value: async function (this: Any, sink: Any) {
          if (!live) return Base.prototype.setSinkId.call(this, sink);
          let wanted: unknown = null;
          quietly(() => { wanted = sinkName(sink); });
          let result: Any;
          try { result = await Base.prototype.setSinkId.call(this, sink); }
          catch (error: Any) {
            quietly(() => record("sink-failed", { wanted, error: String(error?.name ?? "Error").slice(0, 40), ...contextFacts(this) }));
            throw error;
          }
          quietly(() => record("sink-set", { wanted, ...contextFacts(this) }));
          return result;
        },
      });
    }
    try { target.AudioContext = Observed; } catch { return null; }
    if (target.AudioContext !== Observed) return null;
    return () => { if (target.AudioContext === Observed) { try { target.AudioContext = Base; } catch { /* stays, passes through */ } } };
  }

  /** Never throws. Where something cannot be wrapped it is left alone and the fact is logged. */
  function install() {
    try {
      if (installedBy || !win) return;
      installedBy = owner;
      live = true;
      const undo: Array<() => void> = [];
      const skipped: string[] = [];
      const devices = peek(() => win.navigator?.mediaDevices);
      if (devices) {
        const off = peek(() => wrapGetUserMedia(devices));
        if (off) undo.push(off); else skipped.push("getUserMedia");
        const onChange = async () => {
          if (!live) return;
          let inputs: number | null = null, outputs: number | null = null;
          try { const list: Any[] = await devices.enumerateDevices(); inputs = list.filter((d) => d.kind === "audioinput").length; outputs = list.filter((d) => d.kind === "audiooutput").length; } catch { /* counts unknown */ }
          record("devicechange", { inputs, outputs, ...contextFacts() });
        };
        try { listen(devices, "devicechange", onChange); } catch { skipped.push("devicechange"); }
      } else skipped.push("mediaDevices");
      const restoreContext = peek(() => wrapAudioContext(win));
      if (restoreContext) undo.push(restoreContext); else skipped.push("AudioContext");
      uninstallAll = () => {
        live = false;
        [...detach].forEach((off) => off());
        contexts.clear();
        undo.reverse().forEach((fn) => quietly(fn));
        uninstallAll = null;
        if (installedBy === owner) installedBy = null;
      };
      if (skipped.length) record("install-skipped", { skipped });
    } catch { if (installedBy === owner) installedBy = null; live = false; }
  }

  return {
    install,
    uninstall() { try { uninstallAll?.(); } catch { /* nothing more to undo */ } },
    record,
    /** The call began (the first event of a call starts the clock too, if this is not said). */
    callStarted() { try { callOver = false; callStart ??= now(); } catch { /* clock unchanged */ } },
    /** The call ended: its totals are the last entry, the next call counts from zero, and no event of the teardown
     *  starts a clock. */
    callEnded() {
      try { record("call-ended", { mic_acquisitions: acquisitions, ...contextFacts() }); }
      finally { callStart = null; callOver = true; acquisitions = 0; }
    },
    entries: () => entries.slice(),
    dump: () => entries.map((e) => JSON.stringify(e)).join("\n"),
  };
}

export type AudioDiagnostics = ReturnType<typeof createAudioDiagnostics>;

function safeStorage(win: Any) { try { return win?.localStorage ?? null; } catch { return null; } }

/** The page's one log, installed on first use. Never throws: where it cannot start, the page gets a log that records
 *  nothing, and the controller loads all the same. */
let shared: AudioDiagnostics | null = null;
export function audioDiagnostics(): AudioDiagnostics {
  if (shared) return shared;
  try {
    const made = createAudioDiagnostics();
    made.install();
    shared = made;
    try { (window as Any).sidevoiceAudioDiagnostics = { dump: made.dump, entries: made.entries }; } catch { /* no window */ }
  } catch {
    shared = { install() {}, uninstall() {}, record() {}, callStarted() {}, callEnded() {}, entries: () => [], dump: () => "" };
  }
  return shared;
}

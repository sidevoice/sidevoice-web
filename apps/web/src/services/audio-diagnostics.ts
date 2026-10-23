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

export type AudioDiagnosticEntry = { at: string; call_ms: number; kind: string; mic_rebuilds: number; [field: string]: unknown };

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

export function createAudioDiagnostics(options: AudioDiagnosticsOptions = {}) {
  const win: Any = options.win ?? (typeof window === "undefined" ? undefined : window);
  const now = options.now ?? (() => Date.now());
  const max = options.max ?? 200;
  const burst = options.burst ?? 20;
  const windowMs = options.windowMs ?? 10_000;
  const storage = options.storage === undefined ? safeStorage(win) : options.storage;
  const log = options.log ?? ((line: string) => { try { console.debug(line); } catch { /* nothing to say it to */ } });

  let entries: AudioDiagnosticEntry[] = load(storage, max);
  let callStart: number | null = null;
  let acquisitions = 0;
  const contexts = new Set<Any>();
  const gates = new Map<string, { since: number; count: number; dropped: number }>();
  let saving = false;
  let installed: (() => void) | null = null;

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
    if (typeof setTimeout === "function") setTimeout(write, 1000); else write();
  }

  function record(kind: string, fields: Record<string, unknown> = {}) {
    try {
      const t = now();
      const gate = gates.get(kind) ?? { since: t, count: 0, dropped: 0 };
      if (t - gate.since >= windowMs) { gate.since = t; gate.count = 0; }
      gates.set(kind, gate);
      if (gate.count >= burst) { gate.dropped++; return; }
      gate.count++;
      callStart ??= t;
      const entry: AudioDiagnosticEntry = { at: new Date(t).toISOString(), call_ms: t - callStart, kind, mic_rebuilds: Math.max(0, acquisitions - 1), ...fields };
      if (gate.dropped) { entry.suppressed = gate.dropped; gate.dropped = 0; }
      entries.push(entry);
      if (entries.length > max) entries = entries.slice(-max);
      log("[audio-diag] " + JSON.stringify(entry));
      save();
    } catch { /* diagnostics never break a call */ }
  }

  function contextFacts(context: Any = [...contexts].pop()): Record<string, unknown> {
    if (!context) return {};
    const sink = context.sinkId;
    return {
      ctx_state: context.state ?? null,
      ctx_rate: num(context.sampleRate),
      ctx_sink: typeof sink === "string" ? (sink === "" ? "default" : shortId(sink)) : sink && typeof sink === "object" ? String(sink.type ?? "object") : null,
      ctx_out_latency_ms: num(context.outputLatency * 1000, 1),
      ctx_base_latency_ms: num(context.baseLatency * 1000, 1),
    };
  }
  function trackFacts(track: Any): Record<string, unknown> {
    let s: Any = {};
    try { s = track.getSettings?.() ?? {}; } catch { /* none */ }
    return {
      track: typeof track.id === "string" ? track.id.slice(0, 8) : null,
      ready: track.readyState ?? null, muted: track.muted ?? null, enabled: track.enabled ?? null,
      aec: s.echoCancellation ?? null, ns: s.noiseSuppression ?? null, agc: s.autoGainControl ?? null,
      rate: num(s.sampleRate), channels: num(s.channelCount),
      device: shortId(s.deviceId), group: shortId(s.groupId),
    };
  }

  function watchTrack(track: Any, n: number) {
    for (const type of ["ended", "mute", "unmute"]) {
      track.addEventListener?.(type, () => record("track-" + type, { n, ...trackFacts(track), ...contextFacts() }));
    }
  }

  function wrapGetUserMedia(devices: Any) {
    const original = devices.getUserMedia;
    if (typeof original !== "function") return () => {};
    const wrapped = async function (this: Any, constraints?: Any) {
      const audio = constraints?.audio;
      if (!audio) return original.call(this, constraints);
      const asked = typeof audio === "object" ? { aec: audio.echoCancellation ?? null, ns: audio.noiseSuppression ?? null, agc: audio.autoGainControl ?? null, device: shortId(audio.deviceId?.exact ?? audio.deviceId) } : {};
      try {
        const stream = await original.call(this, constraints);
        const n = ++acquisitions;
        const tracks: Any[] = stream?.getAudioTracks?.() ?? [];
        for (const track of tracks) { record("mic-acquired", { n, asked, ...trackFacts(track), ...contextFacts() }); watchTrack(track, n); }
        if (!tracks.length) record("mic-acquired", { n, asked, tracks: 0, ...contextFacts() });
        return stream;
      } catch (error: Any) {
        record("mic-failed", { asked, error: String(error?.name ?? "Error").slice(0, 40), ...contextFacts() });
        throw error;
      }
    };
    devices.getUserMedia = wrapped;
    return () => { if (devices.getUserMedia === wrapped) devices.getUserMedia = original; };
  }

  function observeContext(context: Any) {
    contexts.add(context);
    record("ctx-created", contextFacts(context));
    context.addEventListener?.("statechange", () => {
      record("ctx-" + (context.state ?? "state"), contextFacts(context));
      if (context.state === "closed") contexts.delete(context);
    });
  }

  function wrapAudioContext(target: Any) {
    const Base = target.AudioContext;
    if (typeof Base !== "function") return () => {};
    class Observed extends Base {
      constructor(...args: Any[]) { super(...args); try { observeContext(this); } catch { /* unobserved */ } }
    }
    // Only where the browser has it: a subclass that grew setSinkId would change what the page's feature checks see.
    if (typeof Base.prototype.setSinkId === "function") {
      Object.defineProperty(Observed.prototype, "setSinkId", {
        configurable: true, writable: true,
        value: async function (this: Any, sink: Any) {
          const wanted = typeof sink === "string" ? (sink === "" ? "default" : shortId(sink)) : sink && typeof sink === "object" ? String(sink.type ?? "object") : null;
          try { const result = await Base.prototype.setSinkId.call(this, sink); record("sink-set", { wanted, ...contextFacts(this) }); return result; }
          catch (error: Any) { record("sink-failed", { wanted, error: String(error?.name ?? "Error").slice(0, 40), ...contextFacts(this) }); throw error; }
        },
      });
    }
    target.AudioContext = Observed;
    return () => { if (target.AudioContext === Observed) target.AudioContext = Base; };
  }

  function install() {
    if (installed || !win) return;
    const undo: Array<() => void> = [];
    const devices = win.navigator?.mediaDevices;
    if (devices) {
      undo.push(wrapGetUserMedia(devices));
      const onChange = async () => {
        let inputs: number | null = null, outputs: number | null = null;
        try { const list: Any[] = await devices.enumerateDevices(); inputs = list.filter((d) => d.kind === "audioinput").length; outputs = list.filter((d) => d.kind === "audiooutput").length; } catch { /* counts unknown */ }
        record("devicechange", { inputs, outputs, ...contextFacts() });
      };
      devices.addEventListener?.("devicechange", onChange);
      undo.push(() => devices.removeEventListener?.("devicechange", onChange));
    }
    undo.push(wrapAudioContext(win));
    installed = () => { undo.reverse().forEach((fn) => fn()); installed = null; };
  }

  return {
    install,
    uninstall: () => installed?.(),
    record,
    /** The call began (the first event of a call starts the clock too, if this is not said). */
    callStarted() { callStart ??= now(); },
    /** The call ended: its totals are the last entry, and the next call counts from zero. */
    callEnded() { record("call-ended", { mic_acquisitions: acquisitions, ...contextFacts() }); callStart = null; acquisitions = 0; },
    entries: () => entries.slice(),
    dump: () => entries.map((e) => JSON.stringify(e)).join("\n"),
  };
}

export type AudioDiagnostics = ReturnType<typeof createAudioDiagnostics>;

function safeStorage(win: Any) { try { return win?.localStorage ?? null; } catch { return null; } }

/** The page's one log, installed on first use. */
let shared: AudioDiagnostics | null = null;
export function audioDiagnostics(): AudioDiagnostics {
  if (!shared) {
    shared = createAudioDiagnostics();
    shared.install();
    try { (window as Any).sidevoiceAudioDiagnostics = { dump: shared.dump, entries: shared.entries }; } catch { /* no window */ }
  }
  return shared;
}

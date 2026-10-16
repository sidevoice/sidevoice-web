import { desktopHost } from "./desktop-host";

/* Whether this page may use the microphone, and asking for it (web#129): the first-run setup asks early, in a step of
 * its own, so voice never silently fails for a permission nobody asked for. Where the desktop app runs the voice call
 * itself (macOS), the microphone is the app's to ask for (`host.microphone`: the system's own prompt and its answer,
 * sidevoice-desktop's bridge); elsewhere the page's, through the platform: `permissions.query({name: "microphone"})`
 * to read it without asking, `getUserMedia` to ask, its tracks stopped at once. Where neither is there (no microphone
 * API in this page, or an app that asks for itself when its call opens), there is nothing to ask: `none`. */

/** `checking`: read for the first time; `requesting`: the system's or the browser's prompt is open; `missing`: allowed
 *  or not, there is no microphone to use; `none`: nothing to ask here. */
export type MicrophoneState = "checking" | "prompt" | "requesting" | "granted" | "denied" | "missing" | "none";

export interface MicrophoneSnapshot {
  state: MicrophoneState;
  /** Who asks: the desktop app (the system's permission for the app) or the page (the browser's, or the webview's). */
  asker: "app" | "page";
  /** Whether the state can be read without asking. Where it cannot (a browser without the microphone's permission
   *  query), `prompt` only means "not asked in this page yet". */
  known: boolean;
  /** The last request was closed without an answer (the prompt dismissed): it may be asked again. */
  dismissed: boolean;
  /** The last request found it as it was (still blocked, still no microphone). */
  unchanged: boolean;
  /** While requesting: the state it was asked from (Check again asks from blocked or none found). */
  from: MicrophoneState | null;
}

/** The desktop app's microphone permission (sidevoice-desktop `host.microphone`, macOS). */
export interface MicrophoneBridge {
  /** `missing`: not denied, and the system lists no audio input device. */
  state(): Promise<"prompt" | "granted" | "denied" | "missing">;
  request(): Promise<"granted" | "denied">;
  openSettings?(): Promise<void>;
  /** Tells when the system's answer changes (the person changed it in the system's settings); returns how to stop. */
  onChange?(listener: () => void): () => void;
}

export interface MicrophoneAccess {
  getSnapshot(): MicrophoneSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reads the state again without asking. */
  check(): Promise<void>;
  /** Asks: the prompt where it was not answered yet, else the stored answer, at once (Check again is a request). */
  request(): Promise<void>;
  /** Where the app can open the system's microphone settings: opens them. */
  openSettings: (() => Promise<void>) | null;
  dispose(): void;
}

export function microphoneBridge(): MicrophoneBridge | null {
  const bridge = desktopHost()?.microphone as Partial<MicrophoneBridge> | undefined;
  return bridge && typeof bridge.state === "function" && typeof bridge.request === "function" ? bridge as MicrophoneBridge : null;
}

type PermissionView = { state: string; addEventListener?(type: "change", listener: () => void): void; removeEventListener?(type: "change", listener: () => void): void };

/** What a refused `getUserMedia` says: no device, or no permission. A device that is there but busy was allowed. */
function refusal(error: unknown): "missing" | "denied" | "granted" {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "missing";
  if (name === "NotReadableError" || name === "TrackStartError") return "granted";
  return "denied";
}

export function createMicrophoneAccess(win: Window & typeof globalThis = window): MicrophoneAccess {
  const listeners = new Set<() => void>();
  const bridge = microphoneBridge();
  const media = win.navigator?.mediaDevices;
  const inAppCall = !!desktopHost()?.voice;
  // The app asks where it runs the call; a page in such an app is never given the microphone, and an app too old to
  // ask leaves it to its call: nothing to ask here. Elsewhere, the page asks where it can.
  const asker: MicrophoneSnapshot["asker"] = bridge ? "app" : "page";
  const askable = !!bridge || (!inAppCall && typeof media?.getUserMedia === "function");
  let snapshot: MicrophoneSnapshot = { state: askable ? "checking" : "none", asker, known: !!bridge, dismissed: false, unchanged: false, from: null };
  let status: PermissionView | null = null;
  let disposed = false;
  // Only the newest read or request writes the state: a slow one never overwrites a later answer.
  let run = 0;

  function set(next: Partial<MicrophoneSnapshot>) {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
  }

  /** The state as the platform says it now, without asking; null where it cannot say. */
  async function read(): Promise<"prompt" | "granted" | "denied" | "missing" | null> {
    if (bridge) {
      const answer = await bridge.state();
      return answer === "granted" || answer === "denied" || answer === "missing" ? answer : "prompt";
    }
    if (!status) return null;
    return status.state === "granted" || status.state === "denied" ? status.state : "prompt";
  }

  // A change while the prompt is open is its answer: the request says it, with what only it knows (none found, closed).
  const onChange = () => { if (snapshot.state !== "requesting") void check(); };

  async function start() {
    if (!askable) return;
    if (!bridge) {
      try {
        status = await win.navigator.permissions?.query({ name: "microphone" as PermissionName }) ?? null;
        status?.addEventListener?.("change", onChange);
      } catch { status = null; }
      set({ known: !!status });
    }
    await check();
  }

  /** Whether a microphone is plugged in, as the device list says (it lists them without permission); null where it cannot say. */
  async function devices(): Promise<boolean | null> {
    if (typeof media?.enumerateDevices !== "function") return null;
    try {
      const list = await media.enumerateDevices();
      return list.some((device) => device.kind === "audioinput");
    } catch { return null; }
  }

  /** A silent getUserMedia (the permission already reads allowed, so nothing is shown), its tracks stopped at once:
   *  what the browser really gives, whatever the site's permission says (the computer may block the browser itself). */
  async function probe(): Promise<"granted" | "denied" | "missing"> {
    try {
      const stream = await media!.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      return "granted";
    } catch (error) { return refusal(error); }
  }

  async function check() {
    if (!askable || disposed) return;
    const mine = ++run;
    const before = snapshot.state;
    let now: Awaited<ReturnType<typeof read>>;
    try { now = await read(); } catch { now = null; }
    if (mine !== run) return;
    let state: MicrophoneState;
    if (bridge) {
      // The app's own read is the system's answer: authoritative, in every direction.
      state = now ?? (before === "granted" || before === "denied" || before === "missing" ? before : "prompt");
    } else {
      const plugged = await devices();
      if (mine !== run) return;
      if (now === "denied") state = "denied";
      else if (plugged === false) state = "missing";
      else if (now === "granted") {
        // A site permission that reads allowed is not the browser's word: the computer may block it. Moving up from
        // anything else is confirmed by a silent probe; only its success is "granted".
        if (before === "denied" || before === "missing" || before === "prompt") {
          const probed = await probe();
          if (mine !== run) return;
          state = probed;
        } else state = "granted";
      } else if (now === "prompt") {
        // Without a device list, a missing microphone is only found by asking: a read of "not asked" keeps it.
        state = before === "missing" && plugged === null ? "missing" : "prompt";
      } else state = before === "granted" || before === "denied" || before === "missing" ? before : "prompt";
    }
    set({ state, unchanged: state === before && snapshot.unchanged, dismissed: state === "prompt" && snapshot.dismissed });
  }

  async function request() {
    if (!askable || disposed || snapshot.state === "requesting") return;
    const mine = ++run;
    const before = snapshot.state;
    set({ state: "requesting", dismissed: false, unchanged: false, from: before });
    let answer: "granted" | "denied" | "missing";
    if (bridge) {
      try { answer = await bridge.request() === "granted" ? "granted" : "denied"; } catch { answer = "denied"; }
    } else {
      try {
        const stream = await media!.getUserMedia({ audio: true });
        // Only the permission was wanted: the microphone is let go at once.
        for (const track of stream.getTracks()) track.stop();
        answer = "granted";
      } catch (error) { answer = refusal(error); }
    }
    if (mine !== run) return;
    // A refusal the browser's permission still calls "prompt" was the prompt closed without an answer.
    if (answer === "denied" && status) {
      let now: Awaited<ReturnType<typeof read>> = null;
      try { now = await read(); } catch { /* as answered */ }
      if (mine !== run) return;
      if (now === "prompt") { set({ state: "prompt", dismissed: true, from: null }); return; }
    }
    set({ state: answer, unchanged: answer === before, from: null });
  }

  // Back from the system's settings or the browser's: read it again, whatever it was.
  const onReturn = () => { if (win.document?.visibilityState !== "hidden" && snapshot.state !== "requesting") void check(); };
  let unwatchBridge: (() => void) | undefined;
  if (askable) {
    win.addEventListener?.("focus", onReturn);
    win.document?.addEventListener?.("visibilitychange", onReturn);
    // A microphone plugged in or out.
    media?.addEventListener?.("devicechange", onChange);
    // The app says when the system's answer changes, where it can.
    unwatchBridge = bridge?.onChange?.(onChange);
    void start();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check,
    request,
    openSettings: bridge?.openSettings ? () => bridge.openSettings!().catch(() => undefined) : null,
    dispose() {
      disposed = true;
      status?.removeEventListener?.("change", onChange);
      media?.removeEventListener?.("devicechange", onChange);
      unwatchBridge?.();
      win.removeEventListener?.("focus", onReturn);
      win.document?.removeEventListener?.("visibilitychange", onReturn);
      listeners.clear();
    },
  };
}

/** The platform the person is on, for where its microphone settings are; `other` where the page cannot tell. */
export function devicePlatform(nav: Navigator | undefined = globalThis.navigator): "mac" | "windows" | "linux" | "other" {
  const said = `${(nav as Navigator & { userAgentData?: { platform?: string } } | undefined)?.userAgentData?.platform ?? ""} ${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`.toLowerCase();
  // A phone says it is Linux (Android) or a Mac (iPad): its microphone is the browser's alone.
  if (/android|iphone|ipad|ipod/.test(said) || (/mac/.test(said) && (nav?.maxTouchPoints ?? 0) > 1)) return "other";
  if (/mac/.test(said)) return "mac";
  if (/win/.test(said)) return "windows";
  if (/linux|x11|cros/.test(said)) return "linux";
  return "other";
}

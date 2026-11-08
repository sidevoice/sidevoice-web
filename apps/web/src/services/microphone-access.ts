import { host, pageMicrophone, type MicrophoneBridge, type PermissionView } from "../host";

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
  const bridge = host().microphone;
  return bridge && typeof bridge.state === "function" && typeof bridge.request === "function" ? bridge as MicrophoneBridge : null;
}

export function createMicrophoneAccess(win: Window & typeof globalThis = window): MicrophoneAccess {
  const listeners = new Set<() => void>();
  const bridge = microphoneBridge();
  const settings = host().microphone;
  const mic = pageMicrophone(win);
  const inAppCall = host().voice.runs === "app";
  // The app asks where it runs the call; a page in such an app is never given the microphone, and an app too old to
  // ask leaves it to its call: nothing to ask here. Elsewhere, the page asks where it can.
  const asker: MicrophoneSnapshot["asker"] = bridge ? "app" : "page";
  const askable = !!bridge || (!inAppCall && !!mic?.canAsk);
  let snapshot: MicrophoneSnapshot = { state: askable ? "checking" : "none", asker, known: !!bridge, dismissed: false, unchanged: false, from: null };
  let status: PermissionView | null = null;
  // A browser permission query is a hint. WebKit can report denied after getUserMedia has opened a stream.
  const page = askable && !bridge ? mic : null;
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
  // A microphone plugged in or out reads the list again. The list also changes as a stream opens and is let go (WebKit,
  // iPhone Safari's audio session): an opened stream stays the page's answer; only a failure is asked again.
  const onDeviceChange = () => { if (page && page.answer !== "granted") page.answer = null; onChange(); };

  async function start() {
    if (!askable) return;
    if (!bridge) {
      try {
        status = await page!.permission();
        status?.addEventListener?.("change", onChange);
      } catch { status = null; }
      set({ known: !!status });
    }
    await check();
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
      const plugged = await page!.plugged();
      if (mine !== run) return;
      // An opened stream is the browser's word, over a device list that may list none once it is let go (iPhone Safari).
      const answer = page!.answer;
      state = answer === "granted" ? answer : plugged === false ? "missing" : answer ?? "prompt";
    }
    set({ state, unchanged: state === before && snapshot.unchanged, dismissed: state === "prompt" && snapshot.dismissed });
  }

  async function request() {
    if (!askable || disposed || snapshot.state === "requesting") return;
    const mine = ++run;
    const before = snapshot.state;
    set({ state: "requesting", dismissed: false, unchanged: false, from: before });
    let answer: "granted" | "denied" | "missing";
    let closed = false;
    if (bridge) {
      try {
        const said = await bridge.request();
        answer = said === "granted" || said === "missing" ? said : "denied";
      } catch {
        // A failed native request says nothing: as a failed read does, the state stays what it was.
        if (mine !== run) return;
        set({ state: before === "granted" || before === "denied" || before === "missing" ? before : "prompt", from: null });
        return;
      }
    } else {
      // Called in the tap itself, before any await: iPhone Safari asks only from a gesture.
      const opened = await page!.open();
      closed = opened === "dismissed";
      answer = opened === "dismissed" ? "denied" : opened;
    }
    if (mine !== run) return;
    if (page) {
      // The page's answer, for every reader: a prompt closed without one is not a block.
      page.answer = closed ? null : answer;
      for (const reader of page.readers) if (reader !== onChange) reader();
    }
    if (closed) { set({ state: "prompt", dismissed: true, from: null }); return; }
    set({ state: answer, unchanged: answer === before, from: null });
  }

  // Back from the system's settings or the browser's: read it again, whatever it was.
  const onReturn = () => { if (win.document?.visibilityState !== "hidden" && snapshot.state !== "requesting") void check(); };
  let unwatchBridge: (() => void) | undefined;
  let unwatchDevices: (() => void) | undefined;
  if (askable) {
    win.addEventListener?.("focus", onReturn);
    win.document?.addEventListener?.("visibilitychange", onReturn);
    // A microphone plugged in or out.
    unwatchDevices = mic?.onDeviceChange(onDeviceChange);
    // Another reader of the page asked: its answer is this page's too.
    page?.readers.add(onChange);
    // The app says when the system's answer changes, where it can.
    unwatchBridge = bridge?.onChange?.(onChange);
    void start();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check,
    request,
    openSettings: typeof settings?.openSettings === "function" ? () => settings.openSettings!().catch(() => undefined) : null,
    dispose() {
      disposed = true;
      status?.removeEventListener?.("change", onChange);
      unwatchDevices?.();
      page?.readers.delete(onChange);
      unwatchBridge?.();
      win.removeEventListener?.("focus", onReturn);
      win.document?.removeEventListener?.("visibilitychange", onReturn);
      listeners.clear();
    },
  };
}

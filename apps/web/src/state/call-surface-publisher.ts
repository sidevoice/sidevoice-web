import { host } from "../host";
import type { CallSurfaceBridge } from "../host/types";
import { PAGE_MS } from "../features/call/PagedText";
import { readOn, readingPosition, type Reading } from "../features/call/speech-chunks";
import { spokenPage, stillId, FACE_PX, STILL_PX, SURFACE_OTHERS, type SpokenPage, type SurfaceLive } from "./call-surface.js";
import { renderStill, type RenderedStill } from "./call-surface-still";
import { conversationView } from "./room-session-state.js";
import type { RoomStore } from "./room-store";

/* What a native call surface needs by the clock, which the room's pure projections do not read (state/call-surface.js
 * `callSurfaceView` takes it as `surfaceLive`): the page the voice is on, sent at most every PAGE_SURFACE_MS; the person's
 * words just sent, for PAGE_MS (what the stage shows them for); and the creatures' stills, which cross to the host once
 * per id (CallSurfaceBridge.still) while the snapshot only refers to them. All of it follows the CALL's conversation, not
 * the one being browsed. It does nothing until the host has a native surface (`callSurface.active()`), and gives
 * everything back when that stops, so a page without one pays nothing. */

/** The spoken page goes out at most this often: a Live Activity is rate limited and a caption needs no more. */
export const PAGE_SURFACE_MS = 2000;

export interface SurfaceClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface SurfaceOptions {
  clock?: SurfaceClock;
  bridge?: () => CallSurfaceBridge | null;
  draw?: (threadId: string, px: number) => Promise<RenderedStill | null>;
}

const realClock: SurfaceClock = { now: () => Date.now(), setTimeout: (run, ms) => window.setTimeout(run, ms), clearTimeout: (timer) => window.clearTimeout(timer as number) };

export function startCallSurface(store: RoomStore, options: SurfaceOptions = {}): () => void {
  const clock = options.clock ?? realClock;
  const bridge = options.bridge ?? (() => host().callSurface);
  const draw = options.draw ?? renderStill;
  let live: SurfaceLive = { page: null, said: null, stills: {} };
  let reading: Reading | null = null;
  let pageAt = -Infinity, pageTimer: unknown = null, saidTimer: unknown = null;
  let seen = "", sentKey: string | null = null, spoke = false, baselined = false, callThread: string | null | undefined;
  let engaged = false, stopped = false;
  const drawing = new Set<string>();
  /** The stills that could not be drawn. An id is its inputs (the thread and the size): drawn again, it fails again. */
  const failed = new Set<string>();
  let shown = new Map<string, { thread: string; px: number }>();

  /** The host the stills were handed to: a new instance (the app reloaded) holds none of them. */
  let host_: CallSurfaceBridge | null = null;
  const active = () => !!bridge()?.active();
  const publish = () => store.patch({ surfaceLive: { page: live.page, said: live.said, stills: live.stills } });
  const same = (a: SpokenPage | null, b: SpokenPage | null) => a?.text === b?.text && a?.lit === b?.lit;
  /** The call's conversation, whichever one is on the screen. */
  const callView = () => conversationView({ ...store.getState().facts, viewedThread: null });

  function clearTimers() {
    if (pageTimer !== null) clock.clearTimeout(pageTimer);
    if (saidTimer !== null) clock.clearTimeout(saidTimer);
    pageTimer = saidTimer = null;
  }

  /** The surface closed: nothing of it is kept, in the page or in the host. */
  function disengage() {
    clearTimers();
    const ids = Object.keys(live.stills);
    live = { page: null, said: null, stills: {} };
    reading = null; pageAt = -Infinity; seen = ""; baselined = false; callThread = undefined; shown = new Map();
    engaged = false;
    // The snapshot first, so none names a still that is gone; then the host lets go of them.
    store.patch({ surfaceLive: null });
    if (ids.length) host_?.forget(ids);
  }

  /** The call moved to another conversation: what was said, read and shown of the last one is not this one's. */
  function reset() {
    clearTimers();
    reading = null; pageAt = -Infinity; baselined = false; seen = "";
    live = { ...live, page: null, said: null };
    publish();
  }

  /** The page the voice is on now, read at the pace the stage's balloon reads it. */
  function currentPage(): SpokenPage | null {
    const state = store.getState();
    const reply = callView().saying ?? null;
    reading = readOn(reading && reply && reading.segment === reply.segment ? reading : null, reply?.segment ?? null, !!reply && state.facts.botLive === true, reply?.karaoke ?? null, clock.now(), Math.floor);
    if (!reply || !reading || reading.segment !== reply.segment) return null;
    return spokenPage(reply.text, readingPosition(reading), undefined, state.callCard.language);
  }

  function flushPage() {
    pageTimer = null;
    if (!active()) { if (engaged) disengage(); return; }
    pageAt = clock.now();
    const page = currentPage();
    if (!same(page, live.page)) { live = { ...live, page }; publish(); }
    // The words go on while the voice does: look again in a page's time.
    if (page) pageTimer = clock.setTimeout(flushPage, PAGE_SURFACE_MS);
  }

  function wantPage() {
    if (pageTimer !== null) return;
    const wait = pageAt + PAGE_SURFACE_MS - clock.now();
    if (wait <= 0) flushPage(); else pageTimer = clock.setTimeout(flushPage, wait);
  }

  function said(text: string) {
    if (saidTimer !== null) clock.clearTimeout(saidTimer);
    live = { ...live, said: text };
    publish();
    saidTimer = clock.setTimeout(() => { saidTimer = null; live = { ...live, said: null }; publish(); }, PAGE_MS);
  }

  /** The person's spoken turn just sent (the stage's own rule, speech-reading.ts useSentTurns): only one that was spoken, to the call's conversation. What was already there when the surface opened, or when the call moved here, is the baseline, never said. */
  function watchSent() {
    const { messages, pendingText, pendingPhase } = callView();
    const last = [...messages].reverse().find((message) => message.role === "user") ?? null;
    const key = last ? last.segment ?? String(last.time) : null;
    if (!baselined) { baselined = true; sentKey = key; spoke = !!(pendingText || pendingPhase); return; }
    if (pendingText || pendingPhase) spoke = true;
    if (key === sentKey) return;
    sentKey = key;
    if (!spoke || !last?.text.trim()) return;
    spoke = false;
    said(last.text);
  }

  /** The stills of the conversations shown: handed to the host once each, and the ones no longer shown given back. */
  function wantStills() {
    const now = bridge();
    if (now !== host_) {
      // A new host instance has none of what was handed over: the snapshot lets go of the refs, then each still goes again.
      host_ = now;
      if (Object.keys(live.stills).length) { live = { ...live, stills: {} }; publish(); }
    }
    const state = store.getState();
    const current = state.callCard.conversation;
    const faces = state.participants.filter((p) => p.threadId !== current).slice(0, SURFACE_OTHERS).map((p) => p.threadId);
    shown = new Map([...(current ? [[current, STILL_PX] as const] : []), ...faces.map((id) => [id, FACE_PX] as const)]
      .map(([thread, px]) => [stillId(thread, px), { thread, px }] as const));
    const stale = Object.keys(live.stills).filter((id) => !shown.has(id));
    if (stale.length) {
      live = { ...live, stills: Object.fromEntries(Object.entries(live.stills).filter(([id]) => shown.has(id))) };
      publish();
      host_?.forget(stale);
    }
    for (const [id, { thread, px }] of shown) {
      if (live.stills[id] || drawing.has(id) || failed.has(id)) continue;
      drawing.add(id);
      const target = host_;
      void draw(thread, px).then((still) => {
        drawing.delete(id);
        if (!still) failed.add(id);
        if (stopped || !engaged || !still || !shown.has(id)) return;
        if (bridge() !== target) { wantStills(); return; } // The host changed while it drew: its own copy goes to the new one.
        // The bytes first, so a snapshot never names a still the host does not hold.
        target?.still({ id, png: still.png, px: still.px });
        live = { ...live, stills: { ...live.stills, [id]: { id, k: still.k } } };
        publish();
      });
    }
  }

  function look() {
    if (!active()) { if (engaged) disengage(); return; }
    engaged = true;
    if (bridge() !== host_) seen = "";
    const state = store.getState();
    const { facts } = state;
    const thread = state.callCard.conversation;
    if (thread !== callThread) {
      const first = callThread === undefined;
      callThread = thread;
      if (!first) reset();
    }
    const signature = [facts.karaokeState?.segment, facts.karaokeState?.to, facts.botLive, thread, facts.userTurn?.thread, facts.pendingUserText, facts.pendingPhase,
      facts.history.length, state.callCard.language, state.participants.map((p) => p.threadId).join(",")].join("|");
    if (signature === seen) return;
    seen = signature;
    watchSent();
    // The voice's cues are noted as they come, whenever the page is sent: the pace between them depends on when they came.
    currentPage();
    wantPage();
    wantStills();
  }

  const stop = store.subscribe(look);
  look();
  return () => {
    stopped = true;
    stop();
    clearTimers();
    if (engaged) { const ids = Object.keys(live.stills); live = { page: null, said: null, stills: {} }; store.patch({ surfaceLive: null }); if (ids.length) host_?.forget(ids); }
  };
}

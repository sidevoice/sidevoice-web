import { host } from "../host";
import { wordEnd } from "../features/conversation/KaraokeText";
import { PAGE_MS } from "../features/call/PagedText";
import { readOn, readingPosition, type Reading } from "../features/call/speech-chunks";
import { spokenPage, SURFACE_OTHERS, type SpokenPage, type SurfaceLive, type SurfaceStill } from "./call-surface.js";
import { renderStill } from "./call-surface-still";
import type { RoomStore } from "./room-store";

/* What a native call surface needs by the clock, which the room's pure projections do not read (state/call-surface.js
 * `callSurfaceView` takes it as `surfaceLive`): the page the voice is on, sent at most every PAGE_SURFACE_MS; the person's
 * words just sent, for PAGE_MS (what the stage shows them for); and the creatures' stills. It does nothing until the host
 * has a native surface (`host().callSurface.active()`), so a page without one pays nothing. */

/** The spoken page goes out at most this often: a Live Activity is rate limited and a caption needs no more. */
export const PAGE_SURFACE_MS = 2000;
/** The current conversation's still, in pixels: 3x the largest slot (the card's 72 pt tile). */
export const STILL_PX = 216;
/** The others' faces, 3x their 36 pt slot. */
export const FACE_PX = 108;

export interface SurfaceClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface SurfaceOptions {
  clock?: SurfaceClock;
  wanted?: () => boolean;
  draw?: (threadId: string, px: number) => Promise<SurfaceStill | null>;
}

const realClock: SurfaceClock = { now: () => Date.now(), setTimeout: (run, ms) => window.setTimeout(run, ms), clearTimeout: (timer) => window.clearTimeout(timer as number) };

export function startCallSurface(store: RoomStore, options: SurfaceOptions = {}): () => void {
  const clock = options.clock ?? realClock;
  const wanted = options.wanted ?? (() => !!host().callSurface?.active());
  const draw = options.draw ?? renderStill;
  const live: SurfaceLive = { page: null, said: null, stills: {} };
  let reading: Reading | null = null;
  let pageAt = -Infinity, pageTimer: unknown = null, saidTimer: unknown = null;
  let seen = "", sentKey: string | null = null, spoke = false, sentThread: string | null | undefined;
  const drawing = new Set<string>();
  let stopped = false;

  const publish = () => store.patch({ surfaceLive: { page: live.page, said: live.said, stills: live.stills } });
  const same = (a: SpokenPage | null, b: SpokenPage | null) => a?.text === b?.text && a?.lit === b?.lit;

  /** The page the voice is on now, read at the pace the stage's balloon reads it. */
  function currentPage(): SpokenPage | null {
    const state = store.getState();
    const reply = state.conversation.thread && state.conversation.thread === state.callCard.conversation ? state.conversation.saying ?? null : null;
    reading = readOn(reading && reply && reading.segment === reply.segment ? reading : null, reply?.segment ?? null, !!reply && state.facts.botLive === true, reply?.karaoke ?? null, clock.now());
    if (!reply || !reading || reading.segment !== reply.segment) return null;
    const spoken = readingPosition(reading);
    return spokenPage(reply.text, spoken === null ? 0 : wordEnd(reply.text, Math.min(spoken, reply.text.length)));
  }

  function flushPage() {
    pageTimer = null;
    pageAt = clock.now();
    const page = currentPage();
    if (!same(page, live.page)) { live.page = page; publish(); }
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
    live.said = text;
    publish();
    saidTimer = clock.setTimeout(() => { saidTimer = null; live.said = null; publish(); }, PAGE_MS);
  }

  /** The person's spoken turn just sent (the stage's own rule, speech-reading.ts useSentTurns): only one that was spoken, to the conversation on the stage. */
  function watchSent() {
    const { conversation } = store.getState();
    if (sentThread !== conversation.thread) { sentThread = conversation.thread; sentKey = null; spoke = false; }
    if (conversation.pendingText || conversation.pendingPhase) spoke = true;
    const last = [...conversation.messages].reverse().find((message) => message.role === "user") ?? null;
    const key = last ? last.segment ?? String(last.time) : null;
    if (key === sentKey) return;
    const first = sentKey === null && !spoke;
    sentKey = key;
    if (first || !spoke || !last?.text.trim()) return;
    spoke = false;
    said(last.text);
  }

  function wantStills() {
    const state = store.getState();
    const current = state.callCard.conversation;
    const faces = state.participants.filter((p) => p.threadId !== current).slice(0, SURFACE_OTHERS).map((p) => p.threadId);
    const wants: [string, number][] = [...(current ? [[current, STILL_PX] as [string, number]] : []), ...faces.map((id) => [id, FACE_PX] as [string, number])];
    for (const [id, px] of wants) {
      const have = live.stills[id];
      if (have?.px === px || drawing.has(id + px)) continue;
      drawing.add(id + px);
      void draw(id, px).then((still) => {
        drawing.delete(id + px);
        if (stopped || !still) return;
        live.stills = { ...live.stills, [id]: still };
        publish();
      });
    }
  }

  function look() {
    if (!wanted()) return;
    const state = store.getState();
    const { conversation } = state;
    const signature = [conversation.saying?.segment, conversation.saying?.karaoke?.to, state.facts.botLive, conversation.thread, conversation.pendingText,
      conversation.pendingPhase, conversation.messages.length, state.callCard.conversation, state.participants.map((p) => p.threadId).join(",")].join("|");
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
    if (pageTimer !== null) clock.clearTimeout(pageTimer);
    if (saidTimer !== null) clock.clearTimeout(saidTimer);
  };
}

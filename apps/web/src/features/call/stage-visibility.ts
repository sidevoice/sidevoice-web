import { useCallback, useRef } from "react";

/* Whether the room shows its call's stage — the conversation's creature and its balloons — for the desktop app's
 * floating card, which shows while the stage is out of view (decided 2026-10-21, sidevoice-desktop#165 and #265 here).
 * The page says what it shows: the stage's tile on screen in the page (an IntersectionObserver), and no screen of the app
 * over it (Settings, a full-page dialog: `.ui-dialog[data-layout="page"]` open). Whether the window itself is on screen
 * (minimised, covered, on another Space) is the app's to know: the page does not guess it. */

/** Where the stage is, in CSS pixels from the top-left corner of the viewport. */
export interface StageRect { x: number; y: number; width: number; height: number }
export type StageReport = (visible: boolean, rect?: StageRect) => void;

/** A screen of the app that covers the whole room (Settings). */
const FULL_PAGE = '.ui-dialog[data-layout="page"][open]';

/** The room's stage tiles in the page now (the floating card's own picture is not one). */
const stages = new Set<Element>();
const changes = new Set<() => void>();

function changed() {
  for (const listener of changes) listener();
}

/** The stage's tile is in the page until the returned function is called. */
export function addStage(element: Element): () => void {
  stages.add(element);
  changed();
  return () => {
    stages.delete(element);
    changed();
  };
}

/** A ref for the room's stage tile: it counts as the stage while it is in the page. `on` false (the floating card's
 *  own picture of it) leaves it out. */
export function useStageRef<T extends Element>(on: boolean) {
  const remove = useRef<(() => void) | null>(null);
  return useCallback((element: T | null) => {
    remove.current?.();
    remove.current = on && element ? addStage(element) : null;
  }, [on]);
}

export interface StageEnvironment {
  document: Document;
  window: Window;
  IntersectionObserver?: typeof IntersectionObserver;
}

/** Tells `report` whether the stage is in view, and where, at start and on every change; never the same twice running.
 *  At start it waits for the first look at a stage already in the page, so a stage on screen is never first said hidden.
 *  Returns its stop. */
export function reportStage(report: StageReport, env: StageEnvironment = { document, window, IntersectionObserver: globalThis.IntersectionObserver }): () => void {
  const { document: doc, window: win } = env;
  const seen = new Map<Element, boolean>();
  let last = "";
  const send = () => {
    // A stage not looked at yet: wait for its first look.
    for (const element of stages) if (!seen.has(element)) return;
    const shown = [...stages].find((element) => seen.get(element));
    const visible = !!shown && !doc.querySelector(FULL_PAGE);
    const rect = visible && shown ? viewportRect(shown, win) : undefined;
    const key = JSON.stringify([visible, rect]);
    if (key === last) return;
    last = key;
    report(visible, rect);
  };
  const Observer = env.IntersectionObserver;
  const sight = Observer ? new Observer((entries) => {
    for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
    send();
  }) : null;
  const follow = () => {
    for (const element of stages) {
      if (seen.has(element) || !sight) continue;
      sight.observe(element);
    }
    for (const element of [...seen.keys()]) {
      if (stages.has(element)) continue;
      seen.delete(element);
      sight?.unobserve(element);
    }
    // Without an observer the stage counts as on screen while it is in the page.
    if (!sight) for (const element of stages) seen.set(element, true);
    send();
  };
  changes.add(follow);
  // Settings opening or closing: a dialog's `open`.
  const dialogs = new MutationObserver(send);
  dialogs.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });
  win.addEventListener("resize", send);
  follow();
  return () => {
    changes.delete(follow);
    sight?.disconnect();
    dialogs.disconnect();
    win.removeEventListener("resize", send);
  };
}

/** The element's box, cut to the viewport, in whole CSS pixels. */
function viewportRect(element: Element, win: Window): StageRect {
  const box = element.getBoundingClientRect();
  const x = Math.max(0, box.left);
  const y = Math.max(0, box.top);
  const right = Math.min(win.innerWidth || box.right, box.right);
  const bottom = Math.min(win.innerHeight || box.bottom, box.bottom);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(0, right - x)), height: Math.round(Math.max(0, bottom - y)) };
}

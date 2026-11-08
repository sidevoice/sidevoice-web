import { useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

/* A sheet that follows the finger: the phone's transcript, which rises from the bottom, and its conversations
 * list, which drops from the header, are put away by dragging them back where they came from, as an app's sheet is.
 * The sheet moves with the finger; let go past a third of its height, or flicked that way, it goes; otherwise it springs
 * back. Pulled the other way it gives a little and resists (rubber band). It is dragged by its handle (the grabber and
 * the title row) with any pointer, and by its content with a finger only when the content is already scrolled to the
 * edge the sheet leaves by: anywhere else the content scrolls as it always did.
 *
 * The handle runs on Pointer Events (the CSS gives it `touch-action: none`, so the engine claims no pan from it). The
 * content cannot: an engine that starts a pan there cancels the pointer, so the content's drag is its touches', whose
 * first move is cancelled when it is ours. Nothing here knows what system it runs on; a mouse drags the handle too.
 *
 * What the drag writes is inline (the sheet's transform, the scrim's opacity), and it is taken back once the sheet has
 * settled, so the stylesheet keeps the open and closed looks and their transitions. Reduced motion settles at once:
 * the page's own rule (styles/app.css) shortens every transition, these included. */

export interface SheetDragOptions {
  /** Presented as a sheet and open: a docked desktop column is not dragged. */
  enabled: boolean;
  sheet: RefObject<HTMLElement | null>;
  /** The edge the sheet is anchored to, which it leaves by: a bottom sheet goes down, a top one up. */
  edge: "bottom" | "top";
  /** What drags it, inside the sheet (a selector): the grabber and the title row. */
  handle: string;
  /** What scrolls inside it (a selector): it drags the sheet only from its edge. */
  scroller?: string;
  /** The dimmed page behind it, which lightens as the sheet goes. */
  scrim?: RefObject<HTMLElement | null>;
  onDismiss(): void;
}

/** Moved less than this, a press is still a tap. */
const SLOP = 6;
/** Let go past this share of its height, it goes. */
const DISTANCE = 0.3;
/** Flicked faster than this (px/ms), it goes or stays as flicked, wherever it is. */
const FLICK = 0.4;
/** How far back the velocity looks (ms). */
const WINDOW = 100;
const EASE = "cubic-bezier(.2, .8, .2, 1)";

/** How far a pull the wrong way shows, as iOS resists one: it gives less the further it goes, never past `limit`. */
export function rubberBand(distance: number, limit: number) {
  if (distance <= 0 || limit <= 0) return 0;
  return (1 - 1 / ((distance * 0.55) / limit + 1)) * limit;
}

/** Whether a sheet let go `offset` px toward its edge (of `size`), moving at `velocity` px/ms that way, goes. */
export function shouldDismiss(offset: number, velocity: number, size: number) {
  if (velocity > FLICK) return offset > 0;
  if (velocity < -FLICK) return false;
  return offset > size * DISTANCE;
}

/** How long the sheet takes to settle from where it was let go: quicker the faster it was moving, within bounds. */
export function settleMs(remaining: number, velocity: number) {
  return Math.round(Math.min(280, Math.max(140, Math.abs(remaining) / Math.max(Math.abs(velocity), 1.5))));
}

interface Drag { start: number; size: number; offset: number; samples: { t: number; d: number }[] }

export function useSheetDrag({ enabled, sheet, edge, handle, scroller, scrim, onDismiss }: SheetDragOptions) {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;

  useEffect(() => {
    const node = sheet.current;
    if (!enabled || !node) return;
    const sign = edge === "bottom" ? 1 : -1;
    let drag: Drag | null = null;
    let settling = 0;

    const clear = () => {
      node.style.removeProperty("transform");
      node.style.removeProperty("transition");
      scrim?.current?.style.removeProperty("opacity");
      scrim?.current?.style.removeProperty("transition");
    };
    const show = (offset: number, size: number) => {
      const shown = offset >= 0 ? offset : -rubberBand(-offset, Math.min(80, size * 0.1));
      node.style.transition = "none";
      node.style.transform = `translateY(${sign * shown}px)`;
      const veil = scrim?.current;
      if (veil) { veil.style.transition = "none"; veil.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / size)); }
    };

    const begin = (at: number) => {
      window.clearTimeout(settling);
      const size = node.getBoundingClientRect().height || 1;
      drag = { start: at, size, offset: 0, samples: [{ t: performance.now(), d: 0 }] };
    };
    const move = (at: number) => {
      if (!drag) return;
      drag.offset = sign * (at - drag.start);
      const now = performance.now();
      drag.samples.push({ t: now, d: drag.offset });
      while (drag.samples.length > 2 && now - drag.samples[0].t > WINDOW) drag.samples.shift();
      show(drag.offset, drag.size);
    };
    const end = (cancelled: boolean) => {
      if (!drag) return;
      const { offset, size, samples } = drag;
      drag = null;
      const first = samples[0], last = samples[samples.length - 1];
      const velocity = last.t > first.t ? (last.d - first.d) / (last.t - first.t) : 0;
      const away = !cancelled && shouldDismiss(offset, velocity, size);
      const ms = settleMs(away ? size - offset : offset, velocity);
      node.style.transition = `transform ${ms}ms ${EASE}, visibility 0s linear ${ms}ms`;
      scrim?.current?.style.removeProperty("transition");
      scrim?.current?.style.removeProperty("opacity");
      // Closed in the same frame as the transform is let go: the sheet runs from the finger to its closed place, never
      // back to open first.
      if (away) flushSync(() => latest.current());
      node.style.removeProperty("transform");
      settling = window.setTimeout(clear, ms + 50);
    };

    // ----- the handle, with any pointer
    let pointer: { id: number; x: number; y: number; engaged: boolean } | null = null;
    let swallow = false;
    const onPointerDown = (event: PointerEvent) => {
      if (pointer || drag || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (!(event.target instanceof Element) || !event.target.closest(handle)) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, engaged: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (!pointer.engaged) {
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
        if (Math.abs(dy) < SLOP || Math.abs(dy) < Math.abs(dx)) return;
        pointer.engaged = true;
        // Captured only once it is a drag: a tap on the close button stays the button's.
        try { node.setPointerCapture(event.pointerId); } catch { /* a pointer the engine no longer tracks */ }
        begin(pointer.y);
      }
      event.preventDefault();
      move(event.clientY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const engaged = pointer.engaged;
      pointer = null;
      if (!engaged) return;
      // A drag that ended over the close button is not a press of it.
      swallow = true;
      window.setTimeout(() => { swallow = false; }, 0);
      end(event.type === "pointercancel");
    };
    const onClick = (event: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // ----- the content, with a finger, from its edge
    let touch: { id: number; x: number; y: number; state: "maybe" | "ours" | "theirs" } | null = null;
    const atEdge = (area: Element) => sign > 0 ? area.scrollTop <= 0 : area.scrollTop + area.clientHeight >= area.scrollHeight - 1;
    const onTouchStart = (event: TouchEvent) => {
      if (touch || drag || pointer || !scroller || event.touches.length !== 1) { if (touch?.state === "ours") end(true); touch = null; return; }
      const area = event.target instanceof Element ? event.target.closest(scroller) : null;
      if (!area || !node.contains(area) || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]"))) return;
      const point = event.touches[0];
      touch = { id: point.identifier, x: point.clientX, y: point.clientY, state: atEdge(area) ? "maybe" : "theirs" };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || touch.state === "theirs") return;
      const point = [...event.changedTouches].find((item) => item.identifier === touch!.id);
      if (!point) return;
      if (touch.state === "maybe") {
        const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
        if (!dx && !dy) return;
        // Toward the edge it leaves by, and more along than across: the sheet's. Anything else is the content's scroll.
        if (sign * dy <= 0 || Math.abs(dy) < Math.abs(dx)) { touch.state = "theirs"; return; }
        touch.state = "ours";
        begin(touch.y);
      }
      if (event.cancelable) event.preventDefault();
      move(point.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!touch || ![...event.changedTouches].some((item) => item.identifier === touch!.id)) return;
      const ours = touch.state === "ours";
      touch = null;
      if (ours) end(event.type === "touchcancel");
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerUp);
    node.addEventListener("click", onClick, true);
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", onTouchEnd);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerUp);
      node.removeEventListener("click", onClick, true);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
      // Closed some other way mid-drag (Escape, the layout changed): nothing of the drag stays on it. A settle still
      // running is left to finish.
      if (drag) clear();
    };
  }, [enabled, sheet, edge, handle, scroller, scrim]);
}

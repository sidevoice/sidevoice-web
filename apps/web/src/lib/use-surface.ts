import { useEffect, useRef, type RefObject } from "react";

/* The overlays of the call view — a phone's conversations panel, the transcript — and how they let go. Escape closes
 * the topmost of them only, and only when nothing above them takes it: a dialog the page opened, an open menu, or a
 * handler that already did. A modal one (on a phone) takes focus when it opens and keeps Tab inside; any of them gives
 * focus back to what opened it when it closes with focus inside. */

interface Surface { close(): void }
const stack: Surface[] = [];
/** What sits above these surfaces and answers Escape and Tab itself: a dialog the page opened (the pairing dialog can
 *  open over a phone's sheet), the header menu, a row's options menu. */
const ABOVE = "dialog[open], details.call-menu[open], [role=menu]";
const above = () => !!document.querySelector(ABOVE);

function escape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented || !stack.length || above()) return;
  event.preventDefault();
  stack[stack.length - 1].close();
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
function focusables(node: HTMLElement) {
  return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
}

export interface SurfaceOptions {
  open: boolean;
  close(): void;
  container: RefObject<HTMLElement | null>;
  /** Takes focus and keeps Tab inside while open: a phone's panel and sheet, not a desktop's docked column. */
  modal: boolean;
  /** Where focus lands when it opens as a modal; its first control otherwise. */
  initialFocus?(): HTMLElement | null | undefined;
  /** Where focus goes back when what opened it is gone. */
  fallbackFocus?(): HTMLElement | null | undefined;
}

export function useSurface({ open, close, container, modal, initialFocus, fallbackFocus }: SurfaceOptions) {
  const latest = useRef({ close, initialFocus, fallbackFocus });
  latest.current = { close, initialFocus, fallbackFocus };

  useEffect(() => {
    if (!open) return;
    const surface = { close: () => latest.current.close() };
    // Capture: it runs before the runtime's own Escape for the header menu, while that menu still says it is open.
    if (!stack.length) document.addEventListener("keydown", escape, true);
    stack.push(surface);
    return () => {
      stack.splice(stack.indexOf(surface), 1);
      if (!stack.length) document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const node = container.current;
    let trap: ((event: KeyboardEvent) => void) | null = null;
    if (modal && node) {
      (latest.current.initialFocus?.() ?? focusables(node)[0] ?? node).focus({ preventScroll: true });
      trap = (event) => {
        if (event.key !== "Tab" || event.defaultPrevented || above()) return;
        const items = focusables(node);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1], at = document.activeElement;
        if (!node.contains(at)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && at === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener("keydown", trap, true);
    }
    return () => {
      if (trap) document.removeEventListener("keydown", trap, true);
      const now = document.activeElement;
      // Back only from inside, or from nowhere: never pulled away from where the person has since moved it.
      if (now && now !== document.body && !node?.contains(now)) return;
      (opener?.isConnected ? opener : latest.current.fallbackFocus?.())?.focus({ preventScroll: true });
    };
  }, [open, modal, container]);
}

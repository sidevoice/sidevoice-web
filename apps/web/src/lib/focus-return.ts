import { useEffect, type RefObject } from "react";

/* Where focus goes as something that held it closes — a dialog, a notice: back to what opened it; else, that gone or
 * hidden (a menu's item, the menu shut), to what opens it again — the menu, a control that says it controls it
 * (`aria-controls`); else, with nothing that opened it (it came by itself), to the page's main region. Never on to
 * whatever happens to follow it in the page: the stage's model chips are there, and focus put on them opened their
 * tooltip. */

/** What a press opens from: a control, or anything that takes focus. */
const CONTROL = "button, a[href], input, select, textarea, summary, [tabindex]";

/** What the person last pressed or focused, newest last; a press on nothing (the page itself) is `null`. A click
 *  doesn't focus a button everywhere (WebKit), so a press counts as much as a focus. */
const recent: (HTMLElement | null)[] = [];
let listening = false;
function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  const keep = (element: HTMLElement | null) => { recent.push(element); if (recent.length > 8) recent.shift(); };
  document.addEventListener("pointerdown", (event) => keep(event.target instanceof Element ? event.target.closest<HTMLElement>(CONTROL) : null), true);
  document.addEventListener("focusin", (event) => keep(event.target instanceof HTMLElement ? event.target : null), true);
}

/** What opened `surface`, read as it opens: the last thing pressed or focused outside it, if anything. */
function openerOf(surface: HTMLElement) {
  for (let index = recent.length - 1; index >= 0; index--) {
    const element = recent[index];
    if (!element || !surface.contains(element)) return element;
  }
  return null;
}

/** Whether focus can go to `element` now: in the page, not disabled, not hidden, inert, in a closed dialog or folded in
 *  a closed disclosure (its summary aside), and drawn where the browser lays it out. */
function canTakeFocus(element: Element | null | undefined): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.matches(":disabled") || element.closest("[hidden], [inert], dialog:not([open])")) return false;
  for (let shut = element.closest("details:not([open])"); shut; shut = shut.parentElement?.closest("details:not([open])") ?? null) {
    if (!summaryOf(shut)?.contains(element)) return false;
  }
  return typeof element.checkVisibility !== "function" || element.checkVisibility();
}

const summaryOf = (details: Element) => [...details.children].find((child) => child.tagName === "SUMMARY") ?? null;

function focusOn(element: HTMLElement) {
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

/** Focus on the first of `places` that takes it; else on the page's main region. True when something took it. */
export function returnFocus(...places: (Element | null | undefined)[]): boolean {
  for (const place of places) if (canTakeFocus(place) && focusOn(place)) return true;
  return focusMain();
}

/** The page's main region, as where to read on from: focusable for this once, so a click inside it never lands focus
 *  on it (nor when it can't take it now: under a modal dialog still open). */
function focusMain() {
  const main = [...document.querySelectorAll<HTMLElement>("main")].find(canTakeFocus);
  if (!main) return false;
  if (main.hasAttribute("tabindex")) return focusOn(main);
  main.tabIndex = -1;
  if (focusOn(main)) { main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true }); return true; }
  main.removeAttribute("tabindex");
  return false;
}

/** Focus back where it belongs as `dialog` closes, however it closes — its close button, Escape, the runtime's
 *  `close()`, taken out of the page while open: what opened it, else what opens it (the closed menu it was chosen in, a
 *  control with `aria-controls` naming it), else the main region. Where the browser already put focus back on something
 *  outside it (what had focus as it opened), or what closed it sent focus on, it stays. A ref is read once mounted. */
export function useDialogFocusReturn(target: HTMLDialogElement | RefObject<HTMLDialogElement | null> | null) {
  useEffect(() => {
    const dialog = target instanceof HTMLDialogElement || target === null ? target : target.current;
    if (!dialog) return;
    listen();
    let open = dialog.open;
    let opener = open ? openerOf(dialog) : null;
    const back = () => {
      const now = document.activeElement;
      if (now instanceof HTMLElement && now !== document.body && !dialog.contains(now) && canTakeFocus(now)) return;
      const shut = opener?.closest("details:not([open])");
      const controls = [...document.querySelectorAll("[aria-controls]")]
        .filter((control) => !!dialog.id && control.getAttribute("aria-controls")!.split(/\s+/).includes(dialog.id));
      returnFocus(opener, shut && summaryOf(shut), ...controls);
    };
    // Opened and closed by whoever does it (React, the runtime, a browser's Escape): its `open` says which.
    const watch = new MutationObserver(() => {
      if (dialog.open === open) return;
      open = dialog.open;
      if (open) opener = openerOf(dialog); else back();
    });
    watch.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    return () => {
      watch.disconnect();
      // Taken out of the page while open (unmounted with what drew it): nothing closed it.
      if (open && !dialog.isConnected) back();
    };
  }, [target]);
}

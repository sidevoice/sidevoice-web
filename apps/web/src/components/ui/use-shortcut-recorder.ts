import { useEffect, useRef } from "react";
import { LONE_CODES, type Trigger } from "../../state/accelerators";

/* Recording a shortcut from the page's own key events (a native capture, where the host offers one, does it instead:
 * Fn is invisible to a page). A combination is recorded at the key that is not a modifier; a modifier pressed and
 * released alone is a single key, tapped once, tapped twice (under DOUBLE_MS) or held, as the shortcut allows. */

/** Two taps this close are a double press. */
export const DOUBLE_MS = 400;
/** A little longer, to know no second tap is coming. */
const SETTLE_MS = 420;

export interface Captured {
  /** A combination: the modifiers held and the key. */
  combo?: { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; code: string; key: string };
  /** A modifier alone, as an accelerator names it (`RightAlt`), and how it was pressed. */
  single?: { key: string; trigger: Trigger };
}

export interface RecorderOptions {
  /** How a modifier alone may be pressed: none (an in-app shortcut, where a lone modifier is no key) or any of these. */
  singles: readonly Trigger[];
  /** A key was captured: an error says why it cannot be the shortcut, and recording goes on; null takes it. */
  onCaptured(captured: Captured): string | null | Promise<string | null>;
  onCancel(): void;
  onClear(): void;
  /** What stopped it from taking the key: said under the field, until the next key. */
  onRefused(message: string | null): void;
  /** A modifier or Fn pressed and let go alone, which this recording ignores while it waits for a real key (a system that
   *  gives the app no way to hear one): said under the field. Not called for an in-app shortcut, where it is part of a chord. */
  onLoneIgnored?(): void;
}

export function useShortcutRecorder(active: boolean, options: RecorderOptions) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!active) return;
    let lone: string | null = null;
    // A modifier (or Fn) pressed on its own, ignored by a recording that cannot take one: it is only a lone press if nothing came between.
    let ignored: string | null = null;
    let lastTap: { key: string; at: number } | null = null;
    let timer: number | undefined;
    let finished = false;
    const finish = async (captured: Captured) => {
      if (finished) return;
      finished = true;
      const refused = await latest.current.onCaptured(captured);
      if (refused) { finished = false; latest.current.onRefused(refused); }
    };
    const settle = () => { window.clearTimeout(timer); lone = null; lastTap = null; };
    const down = (event: KeyboardEvent) => {
      if (event.key === "Tab") { latest.current.onCancel(); return; }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.isComposing || event.key === "Process") return;
      const alone = LONE_CODES[event.code];
      if (alone) {
        if (!event.repeat && latest.current.singles.length) lone = event.code;
        else if (!event.repeat && latest.current.onLoneIgnored) ignored = event.code;
        return;
      }
      if (["Shift", "Control", "Alt", "Meta", "OS", "AltGraph", "CapsLock", "Fn"].includes(event.key)) {
        if (event.key === "Fn" && latest.current.onLoneIgnored) ignored = "Fn";
        return;
      }
      ignored = null;
      settle();
      if (event.key === "Escape") { latest.current.onCancel(); return; }
      if (event.key === "Backspace" || event.key === "Delete") { latest.current.onClear(); return; }
      void finish({ combo: { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, code: event.code, key: event.key } });
    };
    const up = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (ignored && (event.code === ignored || (ignored === "Fn" && event.key === "Fn"))) { ignored = null; latest.current.onLoneIgnored?.(); return; }
      if (!lone || event.code !== lone) return;
      const key = LONE_CODES[event.code];
      const { singles } = latest.current;
      lone = null;
      if (!singles.includes("tap") && !singles.includes("double")) { void finish({ single: { key, trigger: "hold" } }); return; }
      const now = performance.now();
      if (singles.includes("double") && lastTap && lastTap.key === key && now - lastTap.at < DOUBLE_MS) { settle(); void finish({ single: { key, trigger: "double" } }); return; }
      if (!singles.includes("double")) { void finish({ single: { key, trigger: "tap" } }); return; }
      lastTap = { key, at: now };
      window.clearTimeout(timer);
      // No second tap: it was one.
      timer = window.setTimeout(() => { lastTap = null; void finish({ single: { key, trigger: singles.includes("tap") ? "tap" : "hold" } }); }, SETTLE_MS);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
  }, [active]);
}

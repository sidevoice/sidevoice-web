import { useEffect, useState } from "react";

/* The second half of entering Sidevoice (operator, 2026-10-02): the enter button has grown to fill the window in the
 * brand's lilac; when the wizard is gone, that lilac fades and the app is there. Nothing plays on opening the app
 * otherwise, nor on opening Configuración. Not shown with reduced motion. */

const EVENT = "sidevoice:enter";

/** Fade from the button's lilac into the app. */
export function playEnter() { window.dispatchEvent(new Event(EVENT)); }

export function EnterSplash() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = () => { if (!reduced) setRun((n) => n + 1); };
    window.addEventListener(EVENT, start);
    return () => window.removeEventListener(EVENT, start);
  }, []);
  useEffect(() => {
    if (!run) return;
    const done = setTimeout(() => setRun(0), 520);
    return () => clearTimeout(done);
  }, [run]);
  return run ? <div className="enter-fade" key={run} role="presentation" /> : null;
}

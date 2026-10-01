import { useEffect, useState } from "react";
import { useT } from "../../i18n";

/* The second half of entering Sidevoice (operator, 2026-10-02: «el fundido bien, estilo como el vídeo»): the enter
 * button has grown to fill the window in the film's pale lavender; on it the close of the Sidevoice film plays — the
 * mark's bars rise from dots, the name comes in, the tagline under it — and then the lavender fades into the app.
 * Only on entering from the wizard; any key or click skips it; not shown with reduced motion. On trial: if it does
 * not convince, it goes (sidevoice-web#33). */

const EVENT = "sidevoice:enter";
const HOLD_MS = 2400;

/** Play the close of the film, then fade into the app. */
export function playEnter() { window.dispatchEvent(new Event(EVENT)); }

const BARS = [
  { x: 1.5, y: 9, h: 6 }, { x: 6, y: 6, h: 12 }, { x: 10.5, y: 1.5, h: 21 }, { x: 15, y: 6, h: 12, voice: true }, { x: 19.5, y: 9, h: 6 },
];

export function EnterSplash() {
  const t = useT();
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = () => { if (!reduced) { setLeaving(false); setRun((n) => n + 1); } };
    window.addEventListener(EVENT, start);
    return () => window.removeEventListener(EVENT, start);
  }, []);
  useEffect(() => {
    if (!run) return;
    const out = setTimeout(() => setLeaving(true), HOLD_MS);
    const done = setTimeout(() => setRun(0), HOLD_MS + 700);
    const skip = () => { setLeaving(true); setTimeout(() => setRun(0), 600); };
    window.addEventListener("keydown", skip, { once: true });
    return () => { clearTimeout(out); clearTimeout(done); window.removeEventListener("keydown", skip); };
  }, [run]);
  if (!run) return null;
  return (
    <div className="enter-splash" data-leaving={leaving || undefined} key={run} role="presentation"
      onClick={() => { setLeaving(true); setTimeout(() => setRun(0), 600); }}>
      <div className="enter-logo" aria-label="Sidevoice">
        <svg className="enter-mark" viewBox="0 0 24 24" width="64" height="64" aria-hidden="true">
          {BARS.map((bar, i) => (
            <rect key={i} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.5" className="enter-bar" data-voice={bar.voice || undefined}
              style={{ ["--from" as string]: String(3 / bar.h), animationDelay: 0.2 + i * 0.08 + "s" }} />
          ))}
        </svg>
        <span className="enter-name">Sidevoice</span>
      </div>
      <p className="enter-tagline">{t("brand.tagline")}</p>
    </div>
  );
}

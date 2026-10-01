import { useEffect, useState } from "react";
import { useT } from "../../i18n";

/* Entering Sidevoice (operator, 2026-10-02): the mark's five bars rise from dots, the name comes in beside them and
 * the tagline under it — the close of the Sidevoice film — then the app. On opening the app and on leaving the
 * first-run wizard; not on opening Configuración, which is not entering. Any key or click skips it; with reduced
 * motion it is not shown. */

const EVENT = "sidevoice:enter";
const LENGTH_MS = 2300;

/** Play the entrance (once at a time). */
export function playEnter() { window.dispatchEvent(new Event(EVENT)); }

const BARS = [
  { x: 1.5, y: 9, h: 6 }, { x: 6, y: 6, h: 12 }, { x: 10.5, y: 1.5, h: 21 }, { x: 15, y: 6, h: 12, voice: true }, { x: 19.5, y: 9, h: 6 },
];

export function EnterSplash({ playOnMount = false }: { playOnMount?: boolean }) {
  const t = useT();
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = () => { if (!reduced) { setLeaving(false); setRun((n) => n + 1); } };
    window.addEventListener(EVENT, start);
    if (playOnMount) start();
    return () => window.removeEventListener(EVENT, start);
  }, [playOnMount]);
  useEffect(() => {
    if (!run) return;
    const out = setTimeout(() => setLeaving(true), LENGTH_MS);
    const done = setTimeout(() => setRun(0), LENGTH_MS + 450);
    const skip = () => { setLeaving(true); setTimeout(() => setRun(0), 300); };
    window.addEventListener("keydown", skip, { once: true });
    return () => { clearTimeout(out); clearTimeout(done); window.removeEventListener("keydown", skip); };
  }, [run]);
  if (!run) return null;
  return (
    <div className="enter-splash" data-leaving={leaving || undefined} key={run} role="presentation"
      onClick={() => { setLeaving(true); setTimeout(() => setRun(0), 300); }}>
      <div className="enter-logo" aria-label="Sidevoice">
        <svg className="enter-mark" viewBox="0 0 24 24" width="64" height="64" aria-hidden="true">
          {BARS.map((bar, i) => (
            <rect key={i} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.5" className="enter-bar" data-voice={bar.voice || undefined}
              style={{ ["--from" as string]: String(3 / bar.h), animationDelay: 0.25 + i * 0.07 + "s" }} />
          ))}
        </svg>
        <span className="enter-name">Sidevoice</span>
      </div>
      <p className="enter-tagline">{t("brand.tagline")}</p>
    </div>
  );
}

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

/* The one button that enters Sidevoice (operator, 2026-10-02: «más sugerente», a button of its own): a pill in the
 * brand's lilac, the mark inside it softly moving as a voice does, and an arrow that leans forward on hover. Pressed,
 * it grows from where it is until the lilac fills the window, and then the app fades in (EnterSplash). Used only to
 * enter — not a variant of the design system's buttons. */

const BARS = [
  { x: 1.5, y: 9, h: 6 }, { x: 6, y: 6, h: 12 }, { x: 10.5, y: 1.5, h: 21 }, { x: 15, y: 6, h: 12, voice: true }, { x: 19.5, y: 9, h: 6 },
];
const GROW_MS = 480;

export function EnterButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [from, setFrom] = useState<{ x: number; y: number; r: number } | null>(null);
  function enter() {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const box = button.current?.getBoundingClientRect();
    if (reduced || !box) { onClick(); return; }
    setFrom({ x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.height / 2 });
    setTimeout(onClick, GROW_MS);
  }
  return (
    <>
      <button ref={button} type="button" className="enter-button" onClick={enter} disabled={!!from}>
        <svg className="enter-button-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          {BARS.map((bar, i) => (
            <rect key={i} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.5" data-voice={bar.voice || undefined} style={{ animationDelay: -(i * 0.18) + "s" }} />
          ))}
        </svg>
        <span className="enter-button-label">{children}</span>
        <span className="enter-button-arrow" aria-hidden="true">→</span>
      </button>
      {from && <span className="enter-grow" aria-hidden="true"
        style={{ "--x": from.x + "px", "--y": from.y + "px", "--r": from.r + "px" } as CSSProperties} />}
    </>
  );
}

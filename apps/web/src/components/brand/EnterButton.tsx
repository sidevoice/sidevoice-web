import type { ReactNode } from "react";

/* The one button that enters Sidevoice (operator, 2026-10-02: «más sugerente», a button of its own): a pill in the
 * brand's lilac, the mark inside it softly moving as a voice does, and an arrow that leans forward on hover. Used only
 * to enter — not a variant of the design system's buttons. An entrance animation is for later (sidevoice-web#33). */

const BARS = [
  { x: 1.5, y: 9, h: 6 }, { x: 6, y: 6, h: 12 }, { x: 10.5, y: 1.5, h: 21 }, { x: 15, y: 6, h: 12, voice: true }, { x: 19.5, y: 9, h: 6 },
];

export function EnterButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="enter-button" onClick={onClick}>
      <svg className="enter-button-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        {BARS.map((bar, i) => (
          <rect key={i} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.5" data-voice={bar.voice || undefined} style={{ animationDelay: -(i * 0.18) + "s" }} />
        ))}
      </svg>
      <span className="enter-button-label">{children}</span>
      <span className="enter-button-arrow" aria-hidden="true">→</span>
    </button>
  );
}

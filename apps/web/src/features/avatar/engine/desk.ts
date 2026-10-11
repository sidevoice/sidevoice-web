import { rng } from "./core";

/* The desk a bicho works at: a stage-only scene layer in front of the avatar. Like the bicho itself, a desk is a small
 * spec (a top style and up to three props) that the conversation's seed rolls by default and the person can override.
 * Drawn in the cast's language: fat ink outline, two-stop shading, no filters. Props stay generic (nothing
 * code-specific): the desk says "working", not "coding". */

export interface DeskSpec { top: string; props: string[] }

const INK = "#1b1428";

/** Top styles: [label, top surface light, top surface deep, front light, front deep]. */
export const DESK_TOPS: Record<string, [string, string, string, string, string]> = {
  wood: ["madera", "#f0bf88", "#d79a62", "#b97a48", "#7d4b2a"],
  oak: ["roble claro", "#f6dcb0", "#e2bd85", "#d3a86f", "#a87c45"],
  white: ["blanca", "#ffffff", "#e6e3ee", "#dcd8e6", "#aaa5ba"],
  pink: ["rosa pastel", "#ffd6e3", "#f4afc6", "#e79ab4", "#b96b86"],
  mint: ["menta", "#d3f5e3", "#a7e3c4", "#8fd1b0", "#5c9c7e"],
  navy: ["azul noche", "#6d7bb8", "#4a5694", "#3d4880", "#262d5a"],
  steel: ["metal", "#e5ebf0", "#b9c4cf", "#a7b3bf", "#6f7c8a"],
};

/** Props, each drawn around its own foot at (0, 0) on the desk's top edge. */
export const DESK_PROPS: Record<string, [string, string]> = {
  plant: ["planta", `<path d="M-14 0 L-16 -26 L16 -26 L14 0Z" fill="#e2725b" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <g class="desk-sway"><path d="M0 -28 Q-18 -52 -26 -40 Q-16 -28 0 -28Z M0 -28 Q18 -56 28 -42 Q16 -28 0 -28Z M0 -28 Q-2 -58 4 -62 Q8 -42 0 -28Z" fill="#7cc47a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`],
  mug: ["taza", `<path d="M-14 -28 L14 -28 L12 -2 Q0 2 -12 -2Z" fill="#f4efe6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M13 -22 Q26 -22 24 -13 Q22 -6 11 -7" fill="none" stroke="${INK}" stroke-width="5"/>
    <g class="desk-steam"><path d="M-6 -34 q-5 -7 0 -14 q5 -7 0 -14 M6 -34 q-5 -7 0 -14 q5 -7 0 -14" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".85"/></g>`],
  lamp: ["lámpara", `<path d="M-16 0 Q-16 -6 0 -6 Q16 -6 16 0Z" fill="#5b6fb5" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M0 -6 L-8 -40 L10 -58" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 -6 L-8 -40 L10 -58" fill="none" stroke="#5b6fb5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 -70 L26 -52 L14 -40 Z" fill="#5b6fb5" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path class="desk-glow" d="M20 -44 L40 -10 L4 -10 Z" fill="#ffe9a8" opacity=".35"/>`],
  books: ["libros", `<rect x="-22" y="-12" width="44" height="12" rx="2" fill="#e5483a" stroke="${INK}" stroke-width="4.5"/>
    <rect x="-18" y="-24" width="38" height="12" rx="2" fill="#4fa3ff" stroke="${INK}" stroke-width="4.5"/>
    <rect x="-20" y="-36" width="34" height="12" rx="2" fill="#ffd23f" stroke="${INK}" stroke-width="4.5"/>`],
  cactus: ["cactus", `<path d="M-12 0 L-13 -18 L13 -18 L12 0Z" fill="#c98b55" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <g class="desk-sway"><path d="M-7 -18 L-7 -44 Q0 -52 7 -44 L7 -18Z M7 -30 L14 -30 Q18 -30 18 -36 L18 -40" fill="#58b368" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="0" cy="-50" r="4" fill="#ff8fb3" stroke="${INK}" stroke-width="3"/></g>`],
  duck: ["patito de goma", `<g class="desk-bob"><path d="M-18 -4 Q-20 -22 -2 -20 Q-4 -34 8 -34 Q20 -34 18 -20 Q22 -18 20 -10 Q16 0 -2 0 Q-16 0 -18 -4Z" fill="#ffd23f" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M18 -26 L28 -24 L18 -21Z" fill="#ff9f43" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="11" cy="-27" r="2.4" fill="${INK}"/></g>`],
  clock: ["reloj", `<circle cx="0" cy="-22" r="18" fill="#fff6e6" stroke="${INK}" stroke-width="5"/><path d="M-10 -2 L-14 2 M10 -2 L14 2" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <g class="desk-hand"><path d="M0 -22 L0 -34" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/></g><path d="M0 -22 L8 -22" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`],
  notes: ["notas", `<path d="M-16 -2 L-14 -30 L14 -32 L16 -4Z" fill="#fff38a" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M-8 -22 L8 -23 M-8 -14 L6 -15" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>`],
};

/** Where props stand on the desk: left edge, right edge, then a little further in on the left. */
const SPOTS = [62, 338, 104];

/** The seed's desk: a top style and two props (sometimes three). */
export function deskFromSeed(seed: string): DeskSpec {
  const r = rng(seed, "desk");
  const top = r.pick(Object.keys(DESK_TOPS));
  const pool = Object.keys(DESK_PROPS);
  const props: string[] = [];
  const count = r.chance(0.25) ? 3 : 2;
  while (props.length < count) {
    const p = r.pick(pool);
    if (!props.includes(p)) props.push(p);
  }
  return { top, props };
}

export function deskSvg(desk: DeskSpec): string {
  const [, tl, td, fl, fd] = DESK_TOPS[desk.top] ?? DESK_TOPS.wood;
  const props = desk.props.slice(0, 3).map((p, i) => DESK_PROPS[p] ? `<g transform="translate(${SPOTS[i]} 26)">${DESK_PROPS[p][1]}</g>` : "").join("");
  return `<svg class="desk" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="desk-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fl}"/><stop offset="1" stop-color="${fd}"/></linearGradient>
      <linearGradient id="desk-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tl}"/><stop offset="1" stop-color="${td}"/></linearGradient>
    </defs>
    <path d="M-10 44 L410 44 L410 170 L-10 170Z" fill="url(#desk-front)" stroke="${INK}" stroke-width="6"/>
    <path d="M-10 28 Q200 18 410 28 L410 46 L-10 46Z" fill="url(#desk-top)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M30 72 Q200 64 370 72" fill="none" stroke="${INK}" stroke-width="3" opacity=".22"/>
    ${props}
  </svg>`;
}

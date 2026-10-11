import type { Size } from "./engine/core";
import { idlesFor, type Idle } from "./engine/bichos/idle";
import type { Spec } from "./engine/bichos/kit";
import { renderSpec } from "./engine/bichos/render";
import { specFromSeed } from "./engine/bichos/seed";
import { normalizeSpec } from "./engine/bichos/spec";
import { worksFor, type Work } from "./engine/bichos/work";
import { renderMascot } from "./engine/styles/bichos";
import { avatarKey, type AvatarSpec } from "./avatar-spec";

/* The one door to the bichos engine. A drawing is SVG markup the engine builds from a spec and a size; React puts it
 * in once and CSS animates it (src/styles/bichos.css), keyed on the root's data-* attributes. Drawings are cached by
 * figure and size — the sidebar, the header and the transcript draw the same conversation many times — and every
 * copy handed out gets ids of its own: two copies sharing a gradient's id would paint from whichever came first, and
 * one hidden by CSS (the header's on a phone) would blank the other's fills. */

/** The app's avatar sizes. Every small one (sidebar, rail, phone header, transcript) is the engine's sidebar size:
 *  the rail here is the same 40px row, collapsed. */
export type AvatarSize = "stage" | "pip" | "small";
const ENGINE_SIZE: Record<AvatarSize, Size> = { stage: "stage", pip: "sidebar", small: "sidebar" };
export const engineSize = (size: AvatarSize): Size => ENGINE_SIZE[size];

export interface Drawing {
  /** The root's inner markup: one <svg>. */
  html: string;
  /** The figure's main colour. */
  tone: string;
  /** The working styles it can take (work.ts): none for the mascot, which keeps the classic crank. */
  works: readonly Work[];
  /** The idle steps it can take (idle.ts: quiet and the pastimes that suit it); none for the person or the mascot,
   *  who keep the old sleep. */
  idles: readonly Idle[];
}

const specs = new Map<string, Spec>();
/** The bicho a conversation's seed rolls (the engine's v4 roller). */
export function bichoSpec(seed: string): Spec {
  let spec = specs.get(seed);
  if (!spec) specs.set(seed, (spec = specFromSeed(seed)));
  return spec;
}

let person: Spec | undefined;
/** The person's bicho: the old person avatar redrawn in the cast's style — a round body, two eyes, a smile and a
 *  beanie, in the blue no agent's old avatar wore. Pinned as a spec, so the roller never moves it. */
export function personSpec(): Spec {
  person ??= normalizeSpec({
    body: "round",
    parts: { eyes: "two", mouth: "smile", arms: "nubs", legs: "feet", headgear: "beanie" },
    color: { hue: 214, sat: 75, light: 75, spot: 160 },
    shape: "sidevoice-person",
    name: "person",
  });
  return person;
}

const CACHE_LIMIT = 400;
const drawings = new Map<string, Drawing>();

function drawFresh(spec: AvatarSpec, size: AvatarSize): Drawing {
  if (spec.kind === "mascot") {
    const drawn = renderMascot(spec.mascot, engineSize(size));
    return { html: drawn.html, tone: drawn.tone, works: [], idles: [] };
  }
  const figure = spec.kind === "person" ? personSpec() : bichoSpec(spec.seed);
  const drawn = renderSpec(figure, engineSize(size));
  return {
    html: drawn.html,
    tone: drawn.tone,
    works: spec.kind === "person" ? [] : worksFor(figure),
    idles: spec.kind === "bicho" ? idlesFor(figure) : [],
  };
}

/** The drawing of `spec` at `size`, shared: never put in the page as it is (drawAvatar gives out copies). */
function cached(spec: AvatarSpec, size: AvatarSize): Drawing {
  const key = avatarKey(spec) + "\u0000" + size;
  let drawing = drawings.get(key);
  if (!drawing) {
    if (drawings.size >= CACHE_LIMIT) drawings.delete(drawings.keys().next().value!);
    drawings.set(key, (drawing = drawFresh(spec, size)));
  }
  return drawing;
}

/** The main colour of `spec`'s figure (the same at every size). */
export const avatarColor = (spec: AvatarSpec): string => cached(spec, "small").tone;

let copies = 0;
/** The same markup with every id (and every reference to one) made unique to this copy. */
export function withOwnIds(html: string): string {
  const salt = `c${(copies += 1).toString(36)}-`;
  return html.replace(/(\bid="|url\(#|href="#)/g, `$1${salt}`);
}

/** A copy of the drawing of `spec` at `size`, with ids of its own. */
export function drawAvatar(spec: AvatarSpec, size: AvatarSize): Drawing {
  const drawing = cached(spec, size);
  return { ...drawing, html: withOwnIds(drawing.html) };
}

import type { Size } from "./engine/core";
import { IDLE_STYLES, type Idle } from "./engine/bichos/idle";
import type { Spec } from "./engine/bichos/kit";
import { renderSpec } from "./engine/bichos/render";
import { normalizeSpec } from "./engine/bichos/spec";
import { WORKS, type Work } from "./engine/bichos/work";
import { creatureFromSeed } from "./creature/catalogue";
import { renderMascot } from "./engine/styles/bichos";
import { avatarKey, type AvatarSpec } from "./avatar-spec";

/* The one door to the bichos engine, which draws the person and the Sidevoice mascot; a conversation's agent is its
 * creature (creature/, CharacterAvatar), and only its tone and repertoire are answered here. A drawing is SVG markup the engine builds from a spec and a size; React puts it
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

const people = new Map<string, Spec>();
/** The person's bicho: the old person avatar redrawn in the cast's style — a round body, two eyes, a smile and a
 *  beanie, in the blue no agent's old avatar wore. Pinned as a spec, so the generator never moves it. */
export function personSpec(hold?: "microphone"): Spec {
  const key = hold ?? "";
  const known = people.get(key);
  if (known) return known;
  // `hold`: something in its hand where a screen asks for it (the microphone, once it is allowed: the setup's step).
  const person = normalizeSpec({
    body: "round",
    parts: { eyes: "two", mouth: "smile", arms: "nubs", legs: "feet", headgear: "beanie", ...(hold ? { held: hold } : {}) },
    color: { hue: 214, sat: 75, light: 75, spot: 160 },
    shape: "sidevoice-person",
    name: "person",
  });
  people.set(key, person);
  return person;
}

const CACHE_LIMIT = 400;
const drawings = new Map<string, Drawing>();

/** The drawings the engine makes: the person's and the mascot's. */
export type DrawnSpec = Exclude<AvatarSpec, { kind: "bicho" }>;

function drawFresh(spec: DrawnSpec, size: AvatarSize): Drawing {
  if (spec.kind === "mascot") {
    const drawn = renderMascot(spec.mascot, engineSize(size));
    return { html: drawn.html, tone: drawn.tone, works: [], idles: [] };
  }
  const drawn = renderSpec(personSpec(spec.hold), engineSize(size));
  return { html: drawn.html, tone: drawn.tone, works: [], idles: [] };
}

/** The drawing of `spec` at `size`, shared: never put in the page as it is (drawAvatar gives out copies). */
function cached(spec: DrawnSpec, size: AvatarSize): Drawing {
  const key = avatarKey(spec) + "\u0000" + size;
  let drawing = drawings.get(key);
  if (!drawing) {
    if (drawings.size >= CACHE_LIMIT) drawings.delete(drawings.keys().next().value!);
    drawings.set(key, (drawing = drawFresh(spec, size)));
  }
  return drawing;
}

/** The main colour of `spec`'s figure (the same at every size): a creature's body colour. */
export const avatarColor = (spec: AvatarSpec): string => (spec.kind === "bicho" ? creatureFromSeed(spec.seed).color : cached(spec, "small").tone);

/** The working styles and idle steps `spec`'s figure can take (the same at every size). A creature takes every one (every
 *  act works on every body); what it draws for each comes with its acts (the moods, working styles and pastimes still to
 *  come over from the design reference), and until then the state's own motion stands for all of them. */
export function avatarRepertoire(spec: AvatarSpec): Pick<Drawing, "works" | "idles"> {
  if (spec.kind === "bicho") return { works: WORKS, idles: IDLE_STYLES };
  const { works, idles } = cached(spec, "small");
  return { works, idles };
}

let copies = 0;
/** The same markup with every id (and every reference to one) made unique to this copy. */
export function withOwnIds(html: string): string {
  const salt = `c${(copies += 1).toString(36)}-`;
  return html.replace(/(\bid="|url\(#|href="#)/g, `$1${salt}`);
}

/** A copy of the drawing of `spec` (the person or the mascot) at `size`, with ids of its own. */
export function drawAvatar(spec: DrawnSpec, size: AvatarSize): Drawing {
  const drawing = cached(spec, size);
  return { ...drawing, html: withOwnIds(drawing.html) };
}

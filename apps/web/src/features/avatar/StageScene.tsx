import { useCallback, useEffect, useMemo, useRef, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useMotion } from "../../lib/motion";
import { usePageTheme } from "../../lib/theme";
import { creatureFromSeed } from "./creature/catalogue";
import { creatureHostNow, loadCreatureHost, watchCreatureHost } from "./creature-loader";
import { hangOf } from "./scene/backdrops.js";
import { posterBounty, posterSeed, type PosterWords } from "./scene/poster.js";
import { backdropOf, SCENE_GROUND, StagePainter } from "./scene/stage-paint";

/* The stage: a backdrop behind the agent, and the wanted poster that stands in for it while it is offline, both drawn as
 * the design reference draws them (scene/: the toon backdrops, the poster and its mounts) and both from the conversation's
 * creature. The stage is laid out on a tile 440px tall and scaled to the tile's height (styles/call.css, `.stage-scene`):
 * the creature stands on the scene's ground line (creature/host.ts), and the backdrop's canvas, the whole tile, puts its
 * ground under the creature's feet. */

/** The height of the lab's stage, in its pixels. */
export const SCENE_HEIGHT = 440;

/** The box of a canvas `ratio` wide for each unit tall, as large as fits a tile `width` × `height`: the tile's whole
 *  width with bands above and below where the tile is taller than the ratio, its whole height with bands at the sides
 *  where it is wider. */
export function fitCanvas(width: number, height: number, ratio: number): { width: number; height: number } {
  return width / height > ratio ? { width: height * ratio, height } : { width, height: width / ratio };
}

/** The shape a tile takes in a slot: the slot's own, kept between the narrowest and the widest the form factor allows
 *  (operator, 2026-11-05: use the room there is, from a phone's portrait to a wide window, but never a strip). */
export function stageShape(width: number, height: number, [narrowest, widest]: readonly [number, number]): number {
  return Math.min(widest, Math.max(narrowest, width / height));
}

/** A range of ratios as the stylesheet writes it, "narrowest, widest" ("9 / 16, 21 / 9"); one ratio is a fixed shape. */
function parseRange(value: string): [number, number] | null {
  const [low, high = low] = value.split(",").map((part) => parseRatio(part.trim()));
  return low > 0 && high > 0 ? [Math.min(low, high), Math.max(low, high)] : null;
}

/** A ratio as CSS writes it: "16 / 9", "3/2" or "1". */
function parseRatio(value: string): number {
  const [over, under = "1"] = value.split("/");
  return Number(over) / Number(under);
}

/** The scene scaled to the tile's inner box (inside its border), where the stage's framing and its voice text measure:
 *  `--k` its height over the lab's 440, `--kw` its width over 440. */
function inner(tile: HTMLElement) {
  tile.style.setProperty("--k", String(tile.clientHeight / SCENE_HEIGHT));
  tile.style.setProperty("--kw", String(tile.clientWidth / SCENE_HEIGHT));
}

/** A ref for the stage's tile: it keeps `--k`, the scene's height over the lab's, on the tile, as it resizes. Where the
 *  tile holds a canvas (`.stage-canvas`) and says its shape (`--stage-ratio`, the form factor's: call-view.css), the
 *  canvas is fitted to the tile at that shape and the scene scaled to the canvas; else the scene fills the tile. */
export function useSceneScale() {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const apply = () => {
      const { clientWidth: width, clientHeight: height } = node;
      if (!(width > 0 && height > 0)) return;
      // A slot holding the tile: the tile itself takes its shape, as large as the slot allows (a slide in its window).
      const tile = node.querySelector<HTMLElement>(":scope > .stage-tile");
      if (tile) {
        const range = parseRange(getComputedStyle(tile).getPropertyValue("--stage-ratio"));
        const shape = range ? stageShape(width, height, range) : NaN;
        if (shape > 0) {
          const fitted = fitCanvas(width, height, shape);
          tile.style.width = fitted.width + "px";
          tile.style.height = fitted.height + "px";
          inner(tile);
          return;
        }
        // "fill" (the phone's portrait tile): the tile takes the whole slot.
        if (getComputedStyle(tile).getPropertyValue("--stage-ratio").trim() === "fill") {
          tile.style.width = tile.style.height = "";
          inner(tile);
          return;
        }
      }
      const canvas = node.querySelector<HTMLElement>(":scope > .stage-canvas");
      const ratio = canvas ? parseRatio(getComputedStyle(node).getPropertyValue("--stage-ratio")) : NaN;
      if (!canvas || !(ratio > 0)) { node.style.setProperty("--k", String(height / SCENE_HEIGHT)); return; }
      const box = fitCanvas(width, height, ratio);
      canvas.style.width = box.width + "px";
      canvas.style.height = box.height + "px";
      node.style.setProperty("--k", String(box.height / SCENE_HEIGHT));
    };
    apply();
    observer.current = new ResizeObserver(apply);
    observer.current.observe(node);
  }, []);
}

/** The conversation's scene behind its creature (scene/stage-paint.ts): the backdrop its creature rolls, in the theme it is
 *  drawn in (each has a light and a dark drawing), the nearest one above it — the page's, or a part of a page shown in the
 *  other theme (the design system's columns). Its ground line stands on the creature's feet: `feet`, a share of the
 *  tile's height (the stage's framing says where they are; by default the scene's ground, where CharacterAvatar stands
 *  the creature). Offline (`poster`), the wanted poster hangs in the creature's place, from what the backdrop has to hang
 *  it from; its photo is the creature, laughing (creature/host.ts posterPortrait). A `live` scene (the stage's) lets the
 *  poster move where the page's drawings move; anywhere else it holds still. Decoration: the stage's agent says its state.
 *  The canvas's fallback content is what the poster says. */
const noWatch = () => () => {};
/** A portrait the scene's stage could not render while it can draw (its context taken for a moment) is asked for again
 *  this often, this many times. */
const PORTRAIT_RETRY_MS = 1000, PORTRAIT_TRIES = 5;

export function StageBackdrop({ seed, tone, live, feet = SCENE_GROUND, poster }: { seed: string; tone: string; live?: boolean; feet?: number;
  poster?: { words: PosterWords; language: string } }) {
  const page = usePageTheme();
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<StagePainter | null>(null);
  const [theme, setTheme] = useState(page);
  useLayoutEffect(() => { setTheme(ref.current?.closest("[data-theme]")?.getAttribute("data-theme") === "dark" ? "dark" : "light"); }, [page]);
  const choice = useMemo(() => creatureFromSeed(seed), [seed]);
  const id = useMemo(() => backdropOf(choice), [choice]);
  const moving = useMotion() === "gpu" && !!live;
  // The portrait waits for the creature host (three.js and the rig), which the stage's creature loads anyway; a scene
  // without a poster never asks for it.
  const { host, failed } = useSyncExternalStore(watchCreatureHost, creatureHostNow);
  const offline = !!poster;
  useEffect(() => { if (offline && !creatureHostNow().host) loadCreatureHost().catch(() => {}); }, [offline]);
  // The portrait is rendered on the scene's stage: where that stage cannot draw (its context lost, refused), the poster's
  // photo is the fallback's outline, and the portrait is asked for again when the stage can draw again (the host says
  // so: onCreaturesChange), or, for a context taken for a moment and given back before the host counts it as down, a
  // few times a second apart.
  const drawable = useSyncExternalStore(host?.onCreaturesChange ?? noWatch, () => host?.creaturesDrawable("scene") ?? true);
  const [again, setAgain] = useState(0);
  const paperSeed = posterSeed(choice), bounty = poster ? posterBounty(paperSeed, poster.language) : "";
  // The words by what they say: a caller may make them afresh on each render.
  const words = poster ? JSON.stringify(poster.words) : "";
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const made = (painter.current = new StagePainter(element));
    return () => { made.dispose(); painter.current = null; };
  }, []);
  useLayoutEffect(() => {
    // Offline, the poster once the host has loaded (or could not: its photo is then the fallback's outline).
    const portrait = words && host ? host.posterPortrait(seed) : null;
    const shown = words && (host || failed) ? { seed: paperSeed, words: JSON.parse(words) as PosterWords, bounty, portrait, color: choice.color } : null;
    painter.current?.set({ id, tone, dark: theme === "dark", feet, poster: shown, moving });
    if (portrait && again) setAgain(0); // drawn: a later loss gets its tries afresh
    if (!words || !host || portrait || !drawable || again >= PORTRAIT_TRIES) return;
    const timer = setTimeout(() => setAgain((n) => n + 1), PORTRAIT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [id, tone, theme, feet, words, bounty, paperSeed, host, failed, seed, choice.color, moving, drawable, again]);
  return <div ref={ref} className="stage-backdrop" data-backdrop={id} data-hang={hangOf(id)} data-poster={poster ? "" : undefined} aria-hidden="true">
    <canvas ref={canvas}>{poster && <span className="wanted">
      <span>{poster.words.title}</span> <span className="w-name">{poster.words.status}</span> <span className="w-bounty">{bounty}</span>
      {poster.words.fine.map((line) => <span key={line}> {line}</span>)} <span>SIDEVOICE</span>
    </span>}</canvas>
  </div>;
}

/** The poster's words, in the interface's language (i18n/locales). */
export type { PosterWords } from "./scene/poster.js";

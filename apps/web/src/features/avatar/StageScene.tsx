import { useCallback, useMemo, useRef, type CSSProperties, useLayoutEffect, useState } from "react";
import { backdropFromSeed, backdropSvg } from "./engine/backdrop";
import { rng } from "./engine/core";
import { DESK_TOPS, deskFromSeed, deskSvg } from "./engine/desk";
import type { AvatarSpec } from "./avatar-spec";
import { withOwnIds } from "./bicho-draw";
import { useMotion } from "../../lib/motion";
import { usePageTheme } from "../../lib/theme";
import { stillAvatar } from "./avatar-state";
import { CharacterAvatar } from "./CharacterAvatar";
import { useLayers } from "./layers";

/* The stage as the avatar lab draws it: a backdrop behind the agent, the desk it works at, and the wanted poster that
 * stands in for it while it is offline. All three come from the conversation's seed, like the bicho. The lab lays the
 * stage out on a tile 440px tall, and the backdrops' mounts (the post, the tree, the balloons a poster hangs from) are
 * drawn in its pixels; so the scene keeps that frame and scales it to the tile's height (styles/call.css,
 * `.stage-scene`), and the poster, the desk and the agent meet where the lab put them. A `live` backdrop or desk (the
 * stage's) moves where the GPU moves it, drawn in layers like the agent (layers.ts); anywhere else it holds still. */

/** The height of the lab's stage, in its pixels. */
export const SCENE_HEIGHT = 440;

/** The box of a canvas `ratio` wide for each unit tall, as large as fits a tile `width` × `height`: the tile's whole
 *  width with bands above and below where the tile is taller than the ratio, its whole height with bands at the sides
 *  where it is wider. */
export function fitCanvas(width: number, height: number, ratio: number): { width: number; height: number } {
  return width / height > ratio ? { width: height * ratio, height } : { width, height: width / ratio };
}

/** A ratio as CSS writes it: "16 / 9", "3/2" or "1". */
function parseRatio(value: string): number {
  const [over, under = "1"] = value.split("/");
  return Number(over) / Number(under);
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
        const shape = parseRatio(getComputedStyle(tile).getPropertyValue("--stage-ratio"));
        if (shape > 0) {
          const fitted = fitCanvas(width, height, shape);
          tile.style.width = fitted.width + "px";
          tile.style.height = fitted.height + "px";
          tile.style.setProperty("--k", String(fitted.height / SCENE_HEIGHT));
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

/** The seed's backdrop, in the theme it is drawn in (its light and dark drawings are the engine's): the nearest one
 *  above it — the page's, or a part of a page shown in the other theme (the design system's columns). */
export function StageBackdrop({ seed, tone, live }: { seed: string; tone: string; live?: boolean }) {
  const page = usePageTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState(page);
  useLayoutEffect(() => { setTheme(ref.current?.closest("[data-theme]")?.getAttribute("data-theme") === "dark" ? "dark" : "light"); }, [page]);
  const html = useMemo(() => backdropSvg(backdropFromSeed(seed), tone, theme), [seed, tone, theme]);
  useLayers(ref, useMotion() === "gpu" && !!live, html);
  return <div ref={ref} className="stage-backdrop" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The seed's desk, in front of the agent; it slides in while the agent works (styles/call.css). Beside the drawing, the
 *  desk's top and front run on to the tile's edges in the same colours, so a wide stage gets a whole desk at the
 *  drawing's scale instead of a stretched one. */
export function StageDesk({ seed, live }: { seed: string; live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const desk = useMemo(() => deskFromSeed(seed), [seed]);
  const html = useMemo(() => withOwnIds(deskSvg(desk)), [desk]);
  useLayers(ref, useMotion() === "gpu" && !!live, html);
  const [, top, topDeep, front, frontDeep] = DESK_TOPS[desk.top] ?? DESK_TOPS.wood;
  const colours = { "--desk-top": top, "--desk-top-deep": topDeep, "--desk-front": front, "--desk-front-deep": frontDeep } as CSSProperties;
  return <div ref={ref} className="stage-desk" aria-hidden="true" style={colours} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The poster's words, in the interface's language (i18n/locales). */
export interface PosterWords {
  title: string;
  status: string;
  fine: [string, string, string];
}

/** The bounty: whole millions under a billion, so it always has the same width and always fits. From the seed for now;
 *  it could be the conversation's real token spend one day, rounded the same way. */
export function posterBounty(seed: string, language: string): string {
  return new Intl.NumberFormat(language).format(rng(seed, "bounty").int(100, 999) * 1_000_000) + "-";
}

/** The token sign, in the spirit of One Piece's berry: a T crossed twice (10 × 14, at the origin). */
const TokenSign = () => <path d="M1 2 H9 M5 2 V12.5 Q5 13.6 3.4 13.6 M1 5.6 H9 M1.6 8.8 H8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />;
const Scroll = () => (
  <>
    <path d="M7 1 Q1 2 2.5 7 Q4 11 1 13 Q5 16 2.5 20 Q0.5 25 4 27.5 Q7.5 30 5 34 Q3.5 36.5 7 37" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="7" cy="1.3" r="1.2" fill="currentColor" /><circle cx="7" cy="36.7" r="1.2" fill="currentColor" />
  </>
);
const fit = { lengthAdjust: "spacingAndGlyphs" } as const;

/** The easter egg of an offline conversation (the lab's, after One Piece's bounty posters): its bicho, laughing, on a
 *  wanted poster. Text is SVG with a fixed length, so it fits whatever fonts the browser has. Decoration: the stage's
 *  agent still says its state. */
export function WantedPoster({ spec, seed, words, language }: { spec: AvatarSpec; seed: string; words: PosterWords; language: string }) {
  return (
    <div className="wanted" aria-hidden="true">
      <svg className="w-title" viewBox="0 0 180 44"><text x="90" y="40" textAnchor="middle" textLength="172" {...fit}>{words.title}</text></svg>
      <div className="w-photo"><CharacterAvatar spec={spec} state={stillAvatar("speaking")} size="stage" /></div>
      <svg className="w-lower" viewBox="0 0 180 64">
        <g transform="translate(2 6)"><Scroll /></g><g transform="translate(178 6) scale(-1 1)"><Scroll /></g>
        <text className="w-name" x="90" y="30" textAnchor="middle" textLength="150" {...fit}>{words.status}</text>
        <g transform="translate(26 47)"><TokenSign /></g>
        <text className="w-bounty" x="40" y="59.5" textLength="118" {...fit}>{posterBounty(seed, language)}</text>
      </svg>
      <svg className="w-foot" viewBox="0 0 180 22">
        <text className="w-fine" x="2" y="7" textLength="114" {...fit}>{words.fine[0]}</text>
        <text className="w-fine" x="2" y="12" textLength="104" {...fit}>{words.fine[1]}</text>
        <text className="w-fine" x="2" y="17" textLength="100" {...fit}>{words.fine[2]}</text>
        {/* The issuer is the product's name, which is not translated. */}
        <text className="w-brand" x="178" y="18" textAnchor="end" textLength="62" {...fit}>SIDEVOICE</text>
      </svg>
    </div>
  );
}

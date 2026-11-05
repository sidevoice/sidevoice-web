import type { AvatarMood } from "../features/avatar/avatar-spec";
import type { CreatureChoice } from "../features/avatar/creature/catalogue";
import { mountMicHero, posterPortrait, type MicHero } from "../features/avatar/creature/host";
import { micGreyed, type MicState } from "../features/avatar/creature/mic-hero-spec";
import { BACKDROPS, hangOf } from "../features/avatar/scene/backdrops.js";
import { posterBounty, posterSeed } from "../features/avatar/scene/poster.js";
import { backdropOf, SCENE_GROUND, StagePainter } from "../features/avatar/scene/stage-paint";
import { translator } from "../i18n/translator";

/* The creature lab's scene and microphone hero (main.ts keeps the creature): the stage's scene behind the creature, as the
 * stage draws it (features/avatar/scene/stage-paint.ts), and the microphone permission hero on its own
 * (features/avatar/creature/mic-hero.ts). Hash keys, as the creator's:
 *
 *   backdrop=seed|<id>|none   the scene behind it: the creature's own (seed, the default), any of the 17, or none;
 *   dark=1                    its dark drawing;
 *   feet=<share>              where its ground line stands, a share of the tile's height (the creator's feetY over its PX);
 *                             default: the scene's ground line;
 *   mode=offline              the wanted poster on it, moving where the backdrop moves it (unless still=1);
 *   mic=prompt|requesting|granted|denied|missing   the microphone hero instead of the creature (112 px, moving unless
 *                             still=1); __lab.mic(state) changes its state (the transitions). */

const css = document.createElement("style");
css.textContent = `
  .mic { position: relative; width: 112px; height: 112px; background: #fff; }
  .mic canvas { width: 112px; height: 112px; display: block; }
  .mic[data-greyed] canvas { filter: saturate(.55); }`;
document.head.appendChild(css);

let painter: StagePainter | null = null;
let mic: MicHero | null = null;

/** What the last render made, let go. */
export function disposeScene() {
  painter?.dispose(); painter = null;
  mic?.dispose(); mic = null;
}

const stillOf = (h: Record<string, string>) => h.still === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** mic=<state>: the microphone hero alone, as the creator's microphone section drew it at 112 px. Whether it is shown. */
export function micLab(root: HTMLElement, h: Record<string, string>): boolean {
  if (!h.mic) return false;
  const box = document.createElement("div");
  box.className = "mic";
  const canvas = document.createElement("canvas");
  box.appendChild(canvas);
  root.appendChild(box);
  const grey = (state: MicState) => { if (micGreyed(state)) box.dataset.greyed = ""; else delete box.dataset.greyed; };
  grey(h.mic as MicState);
  mic = mountMicHero({ canvas, state: h.mic as MicState, moving: !stillOf(h) });
  (window as unknown as { __lab: unknown }).__lab = { canvas, mic: (state: MicState) => { grey(state); mic?.setState(state); }, ready: true };
  return true;
}

/** The scene on its own canvas, put in `tile` (under the creature's, which comes after it). What the lab says of it. */
export function sceneLab(tile: HTMLElement, { h, choice, seed, byHand, mood }: { h: Record<string, string>; choice: CreatureChoice; seed: string; byHand: boolean; mood: AvatarMood }) {
  const bg = document.createElement("canvas");
  const backdrop = h.backdrop === "none" ? null : h.backdrop && BACKDROPS[h.backdrop] ? h.backdrop : backdropOf(choice);
  if (!backdrop) return { about: "", lab: { bg, backdrop } };
  tile.appendChild(bg);
  painter = new StagePainter(bg);
  const t = translator(), paper = posterSeed(choice);
  const poster = mood === "offline" ? { seed: paper, bounty: posterBounty(paper, "en"), color: choice.color,
    words: { title: t("stage.poster.title"), status: t("stage.poster.status"), fine: [t("stage.poster.fine1"), t("stage.poster.fine2"), t("stage.poster.fine3")] as [string, string, string] },
    portrait: posterPortrait(byHand ? JSON.stringify(choice) : seed, byHand ? choice : undefined) } : null;
  painter.set({ id: backdrop, tone: choice.color, dark: h.dark === "1", feet: h.feet != null ? Number(h.feet) : SCENE_GROUND, poster, moving: !stillOf(h) });
  return { about: `\nbackdrop: ${backdrop} (${hangOf(backdrop)})`, lab: { bg, backdrop } };
}

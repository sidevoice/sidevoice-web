import { Stage, type StageItem } from "./rig.js";
import "./accessories.js";
import "./acts.js";
import { MIC_HERO, MIC_HERO_PX, MIC_MOOD, type MicState } from "./mic-hero-spec";

/* The microphone permission hero (T23, closed 2026-11-04 and shipped as designed): the setup's permissions step and
 * Settings › Permissions show it over the microphone's row. It is the same creature everywhere, never the person's nor a
 * conversation's: a round body with no ears and headphones, in the brand's mostaza set (mostaza body, berenjena
 * headphones, deep violet eyes). It acts out the microphone's state with the reference's `mic` act (acts.js), and plays a
 * short mood as the transition into a state: excited into allowed, sad into blocked, confused into none found.
 *
 * Ported from the design reference's creator, whose microphone section was removed from it once the hero was closed
 * (its act stays in reference/2026-11-04/src/acts.js; the section is the creator's buildMic, pickMic and micFrame as they
 * last stood): its own square stage, 384 px, at zoom 1.05 (here a little further back: STAGE_PX, ZOOM); the heroes drawn into
 * 224 px canvases shown at 112 px. A hero
 * that moves is the creator's large preview (the idle state under the act, the transition's mood over it, drawn on every
 * animation frame); one that holds still is its 112 px heroes (a neutral face, the act's key pose), drawn once per
 * change.
 *
 * The stage is a WebGL context of its own, made when the first hero mounts and let go when the last one goes: the
 * permissions screens are seldom open, and the call's two stages never wait for this one. */

/** The stage's size and camera: the reference's 384 px, and its camera stepped back from 1.05 so that every state, its
 *  transition, its ink and the shadow the key light throws to its right are inside the square (at 1.05 the shadow and the
 *  allowed mic's sound arcs reached past its right edge: never-clipped.test.ts measures every pose against it). */
export const STAGE_PX = 384, ZOOM = 1.16;

type HeroSpec = typeof MIC_HERO & { state?: string; expr?: string };

let stage: Stage | null = null;
let lost = false;
const heroes = new Set<Hero>();
let unwatch: (() => void) | null = null;

function release() {
  unwatch?.();
  unwatch = null;
  if (!stage) return;
  try { if (!stage.renderer.getContext().isContextLost()) stage.renderer.forceContextLoss(); } catch { /* nothing left to let go */ }
  stage.renderer.dispose();
  stage = null;
  lost = false;
}

/** The heroes' stage, made with the first one; null where WebGL cannot be had. */
function stageNow(): Stage | null {
  if (stage) return stage;
  try {
    if (typeof WebGLRenderingContext === "undefined") throw new Error("no WebGL");
    stage = new Stage("paint", STAGE_PX);
  } catch (error) {
    console.warn("[creature] cannot draw the microphone hero:", error instanceof Error ? error.message : error);
    return null;
  }
  const canvas = stage.renderer.domElement;
  // A lost context draws nothing: each hero keeps its last frame and is told (its page shows the fallback); three.js sets
  // its renderer up again when the browser gives the context back, and the heroes are drawn again.
  const onLost = (event: Event) => { event.preventDefault(); lost = true; for (const hero of heroes) hero.down(true); };
  const onBack = () => { lost = false; for (const hero of heroes) hero.down(false); };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onBack);
  unwatch = () => { canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onBack); };
  return stage;
}

const nowS = () => performance.now() / 1000;

export interface MicHero {
  /** The microphone's state now: the act restarts (the hop plays again) and, moving, the transition's mood plays. */
  setState(state: MicState): void;
  /** Moving (the live preview) or holding still in the act's key pose (reduced motion, no GPU). */
  setMoving(moving: boolean): void;
  dispose(): void;
}

export interface MicHeroOptions {
  canvas: HTMLCanvasElement;
  state: MicState;
  moving: boolean;
  /** Told when the hero can no longer be drawn (its context lost), and when it can again. */
  onDown?: (down: boolean) => void;
}

class Hero implements MicHero {
  private item: StageItem<HeroSpec>;
  private state: MicState;
  private moving: boolean;
  private frame = 0;

  constructor(private stage: Stage, private opts: MicHeroOptions) {
    const { canvas } = opts;
    if (canvas.width !== MIC_HERO_PX || canvas.height !== MIC_HERO_PX) { canvas.width = canvas.height = MIC_HERO_PX; }
    this.item = stage.add<HeroSpec>({ ...MIC_HERO }, canvas, { off: 0, zoom: ZOOM });
    this.state = opts.state;
    this.moving = opts.moving;
    this.pick(false);
  }

  down(down: boolean) { this.opts.onDown?.(down); if (!down) this.draw(); }

  /** The creator's pickMic: the act for the state (restarted), and the transition's mood while it moves. */
  private pick(transition: boolean) {
    const { c, spec } = this.item;
    // moving: the large preview (its idle state under the act); still: the 112 px heroes (a neutral face)
    spec.state = this.moving ? "idle" : undefined;
    spec.expr = this.moving ? undefined : "neutral";
    c.setAct("base", "mic", { state: this.state });
    const m = MIC_MOOD[this.state];
    c.setAct("mood", transition && this.moving && m ? m[0] : null, m ? { dur: m[1] } : {});
    this.draw();
    this.loop();
  }

  setState(state: MicState) { if (state === this.state) return; this.state = state; this.pick(true); }

  setMoving(moving: boolean) { if (moving === this.moving) return; this.moving = moving; this.pick(false); }

  private draw() {
    if (lost || !this.opts.canvas.isConnected) return;
    this.stage.draw(this.item, this.moving ? nowS() : 0, 0, !this.moving);
  }

  /** One frame per animation frame while it moves, as the creator's micFrame drew it. */
  private loop() {
    if (!this.moving || this.frame) return;
    const tick = () => {
      this.frame = 0;
      if (!this.moving || !heroes.has(this)) return;
      this.draw();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    heroes.delete(this);
    const { c } = this.item;
    this.stage.scene.remove(c.root);
    c.root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
    });
    this.stage.items = this.stage.items.filter((x) => x !== this.item);
    if (!heroes.size) release();
  }
}

/** A microphone hero drawn into `canvas` until disposed; null where it cannot be drawn (no WebGL). */
export function mountMicHero(opts: MicHeroOptions): MicHero | null {
  const s = stageNow();
  if (!s) return null;
  const hero = new Hero(s, opts);
  heroes.add(hero);
  return hero;
}

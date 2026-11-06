/* What TypeScript reads of rig.js: the port is plain JavaScript, kept diffable line by line against the design reference,
 * so its surface is declared here, as far as the app uses it. */

export interface RigObject {
  visible: boolean;
  userData: Record<string, unknown>;
  geometry?: { dispose(): void };
  material?: { dispose(): void } | { dispose(): void }[];
  position: RigVector;
  traverse(fn: (o: RigObject) => void): void;
}

export interface RigVector {
  x: number;
  y: number;
  z: number;
  project(camera: RigCamera): RigVector;
  constructor: new (x?: number, y?: number, z?: number) => RigVector;
}

export interface RigCamera {
  aspect: number;
  position: { set(x: number, y: number, z: number): void };
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
  updateMatrixWorld(): void;
  /** Renders a window of a larger frame (three.js): the same projection, only part of it. */
  setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
  clearViewOffset(): void;
  clone(): RigCamera;
}

/** An act playing on one of a creature's layers (Creature3D.setAct). */
export interface ActLayer {
  name: string;
  /** Its clock's start, on the clock its stage is drawn with (seconds); set by its first frame when null. */
  t0: number | null;
  /** Its seconds, ended by the rig past them unless held; null loops. */
  dur: number | null;
  hold: boolean;
  /** Drawn still: the moment of it shown (default: the act's key). */
  keyAt?: number;
}

/** A creature: its meshes under `root`, its acts in `layers` (base, mood, cogs…). */
export class Creature3D {
  constructor(spec: object, look: string);
  root: RigObject;
  minY: number;
  /** The body's mesh: its geometry's bounding box is the body alone, without ears, hats or acts. */
  body: { geometry: { boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } } };
  /** The layers that ended in the last frame. */
  ended: string[];
  layers: Record<string, ActLayer>;
  setAct(layer: string, name: string | null, opts?: { dur?: number; hold?: boolean } & Record<string, unknown>): ActLayer | null;
  act(layer: string): string | null;
}

export interface StageItem<Spec extends object = object> {
  c: Creature3D;
  canvas: HTMLCanvasElement;
  spec: Spec & { state?: string; expr?: string };
  /** turn, zoom, lookY, fit, extra (live overrides: gaze, a hop, an expression), off. */
  opts: Record<string, unknown>;
  off: number;
}

/** What the host reads of a stage's three.js WebGLRenderer: its canvas (where the browser says the context was lost or
 *  given back), and what lets it go when a new one takes its place. */
export interface RigRenderer {
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number): void;
  getContext(): { isContextLost(): boolean };
  forceContextLoss(): void;
  dispose(): void;
}

/** One renderer, many creatures blitted into 2D canvases. */
export class Stage {
  /** `fixed`: the host sizes the renderer (setRenderSize) to the canvas it shows. */
  constructor(look: "paint", px?: number, mode?: "" | "wide", opts?: { fixed?: boolean });
  /** The renderer takes this size (no style set). */
  setRenderSize(w: number, h: number): void;
  /** The shadow map's side (px), its filter radius in proportion; whether it changed. */
  setShadowPx(px: number): boolean;
  /** The shadow map's side now (px). */
  shadowPx: number;
  renderer: RigRenderer;
  /** The renderer's size: the stage's px tall, as wide as its shape. */
  w: number;
  h: number;
  scene: { remove(o: RigObject): void };
  camera: RigCamera;
  items: StageItem[];
  add<Spec extends object>(spec: Spec, canvas: HTMLCanvasElement | null, opts?: object): StageItem<Spec>;
  draw(item: StageItem, t: number, lvl: number, isStatic: boolean): void;
}

export const ACTS: Record<string, { kind: string; label: string; dur: number | null; key: number }>;
export const ACCESSORY_BUILDERS: Record<string, { slot: string; label: string }>;
export const EYE_STYLES: Record<string, { label: string; reaction?: boolean }>;
export const EXPR: Record<string, unknown>;
export const KEY: Record<string, [number, number]>;
export const STATES3D: Record<string, (t: number, lvl?: number) => Record<string, unknown>>;
export const PAINT_LEVELS: Record<string, { name: string }>;
export const TEMPER_NAMES: string[];
export function mix(a: string, b: string, t: number): string;
export function tint(c: string, t: number): string;
export function shade(c: string, t: number): string;

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from "react";
import { cn } from "../../lib/cn";
import { useMotion } from "../../lib/motion";
import { avatarKey, avatarTone, type AvatarSpec } from "./avatar-spec";
import { ENGINE_MOOD, toTimeline, type AvatarState, type MouthLevel } from "./avatar-state";
import { avatarColor, drawAvatar, engineSize, type AvatarSize, type DrawnSpec } from "./bicho-draw";
import { useLayers } from "./layers";
import { ATTENTION_EXPR, STILL_EXPR } from "./creature/faces";
import { FALLBACK_PATH } from "./creature/fallback";
import type { CreatureStep, LiveCreature } from "./creature/host";
import { creatureHostNow, loadCreatureHost, watchCreatureHost, type CreatureHost, type CreatureHostLoading } from "./creature-loader";

/** The creature host once it has loaded (null until then) and whether its last load failed (creature-loader.ts). A
 *  component that mounts asks for it, and asks again if the last load failed. */
function useCreatureHost(): CreatureHostLoading {
  const loading = useSyncExternalStore(watchCreatureHost, creatureHostNow);
  useEffect(() => { if (!creatureHostNow().host) loadCreatureHost().catch(() => {}); }, []);
  return loading;
}

const noWatch = () => () => {};
/** Whether the page can draw creatures now on the stage for `framing` (creature/host.ts: the stage's creature and the
 *  still faces have a renderer each). It is read again each time that changes: a context lost and not given back, or
 *  given back. */
function useDrawable(host: CreatureHost | null, framing: "scene" | "face"): boolean {
  return useSyncExternalStore(host?.onCreaturesChange ?? noWatch, () => host?.creaturesDrawable(framing) ?? true);
}

/* A conversation's agent is its creature (creature/: a real-time 3D rig, CreatureAvatar below): one canvas, drawn by the
 * page's creature stages: on the stage's scene, live (moving where the GPU moves the drawings, else in its state's key
 * pose); everywhere else, a still face in its state's expression. Where no creature can be drawn (no WebGL, its context
 * lost and not given back, its code not loaded), its fallback stands in (creature/fallback.ts), so the agent is never an
 * empty box. The person and the Sidevoice mascot are still the bichos engine's drawings (the rest of this comment).
 *
 * An avatar is a drawing and a state. The drawing is the bichos engine's SVG, made once per figure and size; the state
 * (avatar-state.ts) is a handful of attributes on its root that CSS keys on (src/styles/bichos.css, the engine's;
 * styles/call.css, the app's), so React touches it once per state and never per frame. This component only draws: the
 * state is one object per figure, worked out and moved on in avatar-state.ts, so every copy of a figure (the stage, a
 * thumbnail) shows the same thing at the same moment. Only a `live` copy moves (the stage's, the card's), and only with
 * the GPU (lib/motion.ts): it is drawn in layers (layers.ts), which WebKit composites without painting them again. Every
 * other copy is one still SVG (styles/call.css).
 *
 * Root attributes:
 *   data-avatar-state  the app's state (AvatarMood): offline | speaking | listening | working | idle | present
 *   data-mood          what the drawing acts out, in the engine's words: idle | speaking | listening | working
 *   data-size          the engine's size (stage | sidebar)
 *   data-beat          a | b for legacy voice animation; data-mouth=playback follows the speaker's output level
 *   data-work          the working style in hand (rotation.ts); data-idle, the idle step (quiet, or a pastime: only on
 *                      a copy that moves; a still one shows it at rest, quiet, never a frozen pastime)
 *   data-enter         for a moment after it starts listening, the state it left (the engine's startle), with what it
 *                      had in hand still on so it can drop away
 *   data-unread        it said something this browser has not seen yet: the "!" cue
 *   data-desk          a desk stands in front of it (the stage scene), so its working props rest on the desk top
 *   data-offline       the room cannot reach it: it sleeps (and the stage shows its wanted poster instead)
 *   data-fallback      a creature that cannot be drawn: its fallback (creature/fallback.ts) stands in for the canvas */

export type { AvatarSize } from "./bicho-draw";

export interface CharacterAvatarProps {
  spec: AvatarSpec;
  /** What it shows: its figure's one state (avatar-state.ts), the same object for every copy of it. */
  state: AvatarState;
  size: AvatarSize;
  /** How the mouth follows the voice: legacy word beats, an externally written level, the output channel, or not at all
   *  (`still`: a conversation's thumbnail, at rest whatever its agent does). */
  mouth?: "voice" | "level" | "playback" | "still";
  mouthKey?: string | number;
  /** With the output channel: the level its mouth is open, the same for every copy (AvatarStates.mouth). */
  mouthLevel?: MouthLevel;
  /** A desk stands in front of it (the stage scene, while it works). */
  desk?: boolean;
  /** It moves, where the GPU moves it (the stage's agent, the card's creature); every other copy holds still. */
  live?: boolean;
  /** Drawn on the stage's scene (a creature): the canvas is the whole tile, the creature standing on its ground, its eyes
   *  following the pointer over the tile. */
  scene?: boolean;
  /** A creature listening: the level of the voice it hears (the person's microphone), 0..1. */
  hearLevel?: MouthLevel;
  /** Said for the avatar; without one it is decoration. */
  label?: string;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

/** "a" and "b" in turn, a new one each time `key` changes: each restarts the engine's per-word keyframes. */
function useBeat(key: string | number | undefined): "a" | "b" | undefined {
  const [seen, setSeen] = useState(key);
  const [beat, setBeat] = useState<"a" | "b">("a");
  if (key !== seen) {
    setSeen(key);
    setBeat((current) => (current === "a" ? "b" : "a"));
  }
  return key === undefined ? undefined : beat;
}

export function CharacterAvatar(props: CharacterAvatarProps) {
  return props.spec.kind === "bicho" ? <CreatureAvatar {...props} seed={props.spec.seed} /> : <DrawnAvatar {...props} spec={props.spec} />;
}

/** The stage's figure box (styles/call.css .stage-agent, call-view.css --stage-head-y): its feet at 106 and the top of
 *  its head at 20 of its 120. The creature stands in it, so what is laid out round the figure (the balloons, the
 *  person's lift on a phone) stays where it was. */
const FIGURE = { feet: 106 / 120, crown: 20 / 120 };

/** A conversation's creature (creature/host.ts): live on the stage's scene, a still face elsewhere. */
function CreatureAvatar({ spec, seed, state, size, mouth = "voice", mouthLevel, hearLevel, live, scene, label, className, ref }: CharacterAvatarProps & { seed: string }) {
  const root = useRef<HTMLSpanElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const creature = useRef<LiveCreature | null>(null);
  const motion = useMotion();
  const moving = motion === "gpu" && !!live;
  // The stage's creature is drawn live, moving or not (held still: its key pose, drawn again on each change). Every other
  // copy is a still face in its state's expression, even one asked to move (the floating card, the animated thumbnails):
  // the reference animates no small face, and a page drawing a few creatures thirty times a second on a GPU-less machine
  // stalls. The rig can draw a live face (host.ts, framing "face") for whichever surface decides it should move.
  const drawn = !!scene;
  const framing = scene ? "scene" : "face";
  const voice = useRef(0), heard = useRef(0);
  useEffect(() => {
    if (!moving || mouth !== "playback" || !mouthLevel) { voice.current = 0; return; }
    // The rig reads the level each frame; the root says whether a voice is heard (data-mouth-active), as a drawing's does.
    let active = false;
    const stop = mouthLevel((level) => {
      voice.current = level;
      if ((level > 0) === active) return;
      active = level > 0;
      root.current?.toggleAttribute("data-mouth-active", active);
    });
    return () => { stop(); voice.current = 0; root.current?.removeAttribute("data-mouth-active"); };
  }, [moving, mouth, mouthLevel]);
  useEffect(() => {
    if (!moving || !hearLevel) { heard.current = 0; return; }
    return hearLevel((level) => { heard.current = level; });
  }, [moving, hearLevel]);
  const mood = state.mood;
  // The host (three.js and the rig) loads the first time a creature is drawn; the room does not wait for it.
  const { host, failed } = useCreatureHost();
  const canDraw = useDrawable(host, framing);
  // Nothing to draw it with: the fallback stands in. While the host is loading for the first time, nothing does yet.
  const fallback = host ? !canDraw : failed;
  // What it has on the go (its working style or pastime: creature/host.ts plays it as the rig's base act). A copy that holds
  // still shows it at rest, quiet, never a pastime frozen mid-way; a working style it shows in its key pose (the creator
  // under reduced motion).
  const idle = moving || state.idle === undefined ? state.idle : "quiet";
  const step = useMemo<CreatureStep>(() => ({ work: state.work, idle, since: state.since, until: state.until, enter: state.enter }), [state.work, idle, state.since, state.until, state.enter]);
  // What it shows when its host has loaded, whatever changed in the meantime.
  const now = useRef({ mood, moving, step });
  now.current = { mood, moving, step };
  useEffect(() => {
    const element = canvas.current;
    if (!drawn || !element || !host) return;
    // Mounted even where the page last found it could not draw: a mount is what tries again (null until it can).
    const live = host.mountCreature({ seed, canvas: element, framing, mood: now.current.mood, step: now.current.step, moving: now.current.moving, scene: () => {
      // its feet on the figure's, the top of its body at the figure's crown, in the scene's own pixels
      const figure = root.current, sceneBox = figure?.parentElement;
      if (!figure || !sceneBox?.offsetHeight || !figure.offsetHeight) return null;
      const H = sceneBox.offsetHeight, top = figure.offsetTop, size = figure.offsetHeight;
      return { ground: (top + size * FIGURE.feet) / H, crown: (top + size * FIGURE.crown) / H };
    },
      gazeFrom: scene ? element.closest<HTMLElement>(".stage-tile") ?? element : null,
      level: (acting) => (acting === "speaking" ? voice.current : heard.current) });
    creature.current = live;
    return () => { live?.dispose(); creature.current = null; };
    // Its mood, what it has on the go and whether it moves are applied below without building the creature again. It is
    // built again when the page can draw creatures again (canDraw).
  }, [drawn, seed, framing, scene, host, canDraw]);
  useEffect(() => { creature.current?.setMood(mood, { step }); }, [mood, step, drawn, seed, framing]);
  useEffect(() => { creature.current?.setMoving(moving); }, [moving, drawn, seed, framing]);
  // A still face: its state's expression (the card's states row, T34), surprised while it has something unread.
  const expr = state.unread ? ATTENTION_EXPR : STILL_EXPR[mood];
  useEffect(() => {
    const element = canvas.current;
    if (drawn || !element || !host) return;
    return host.drawFace(element, seed, expr);
  }, [drawn, seed, expr, host, canDraw]);
  // The state as the root says it, the same words as the engine's drawings (what it acts out, what it has on the go, its
  // entrance).
  return (
    <span ref={(element) => { root.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }} className={cn("sv-avatar", className)}
      data-style="creature" data-framing={framing} data-avatar-state={mood} data-mood={ENGINE_MOOD[mood]} data-size={engineSize(size)}
      data-mouth={mouth === "playback" && motion === "still" ? "still" : mouth} data-work={state.work} data-idle={idle} data-enter={state.enter}
      data-unread={state.unread || undefined} data-offline={mood === "offline" || undefined} data-fallback={fallback || undefined}
      style={avatarTone(avatarColor(spec)) as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <canvas ref={canvas} />
      {fallback && <svg className="creature-fallback" viewBox="0 0 100 100" aria-hidden="true"><path d={FALLBACK_PATH} /></svg>}
    </span>
  );
}

/** The person, the mascot: the bichos engine's drawing. */
function DrawnAvatar({ spec, state, size, mouth: asked = "voice", mouthKey, mouthLevel, desk, live, label, className, ref }: CharacterAvatarProps & { spec: DrawnSpec }) {
  const avatar = useRef<HTMLSpanElement | null>(null);
  const motion = useMotion();
  // Held still means still (operator, 2026-10-21): where the drawings do not move as GPU layers, the mouth does not follow the
  // voice either (an SVG mouth written thirty times a second is repainted on the CPU each time).
  const mouth = asked === "playback" && motion === "still" ? "still" : asked;
  useEffect(() => {
    const element = avatar.current;
    if (mouth !== "playback" || !mouthLevel || !element) return;
    // The level is written on the mouth itself, never on the root: a custom property is inherited, so one written up
    // there makes every element of the drawing (a layered stage holds about a thousand) work out its style again, on each
    // reading, about thirty a second, to change a single transform (desktop#149).
    let open: HTMLElement | SVGElement | null = null;
    let shown: number | null = null;
    let active = false;
    // A copy with no box (display none: the phone's header list on a desktop, a closed panel) does not follow the voice:
    // nobody sees it, and a drawing that was never laid out is never cut into layers, so its mouth would be an SVG written
    // thirty times a second for nothing. Told by its size, as it appears and goes.
    let boxed = true;
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      boxed = !!box && (box.width > 0 || box.height > 0);
    });
    watch?.observe(element);
    const unsubscribe = mouthLevel((level) => {
      if (!boxed) return;
      // The mouth that moves: a layered drawing keeps a clone of it holding still in a slice (styles/call.css [data-clone]).
      // Found again when the drawing was cut into layers, or put back, since it was.
      if (!open?.isConnected) { open = element.querySelector<HTMLElement | SVGElement>(".m-open:not([data-clone])"); shown = null; }
      const value = Math.round(level * 1000) / 1000;
      if (open && value !== shown) { open.style.setProperty("--mouth", String(value)); shown = value; }
      if ((level > 0) === active) return;
      active = level > 0;
      if (active) element.setAttribute("data-mouth-active", "");
      else element.removeAttribute("data-mouth-active");
    });
    return () => { watch?.disconnect(); unsubscribe(); };
  }, [mouth, mouthLevel]);
  const key = avatarKey(spec);
  // The key names the figure: a new spec object for the same conversation is the same drawing.
  const drawing = useMemo(() => drawAvatar(spec, size), [key, size]);
  const layered = motion === "gpu" && !!live;
  useLayers(avatar, layered, drawing.html);
  // A copy that holds still shows the creature at rest while the moving one plays a pastime (operator, 2026-10-20).
  const idle = layered || state.idle === undefined ? state.idle : "quiet";
  const acts = ENGINE_MOOD[state.mood];
  const beat = useBeat(state.mood === "speaking" && mouth === "voice" ? mouthKey : undefined);
  // One clock for every copy: its animations run from the moment its state last changed, not from when this copy
  // happened to be drawn, so a thumbnail that appears later blinks, hammers and blows its bubbles in step with the stage.
  useLayoutEffect(() => {
    const element = avatar.current;
    if (state.since === undefined || !element || typeof element.getAnimations !== "function") return;
    for (const animation of element.getAnimations({ subtree: true }))
      if ("animationName" in animation) animation.startTime = toTimeline(state.since);
  }, [state, drawing, desk, layered]);
  return (
    <span ref={(element) => { avatar.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }} className={cn("sv-avatar", className)} data-style="bichos" data-avatar-state={state.mood} data-mood={acts}
      data-size={engineSize(size)} data-mouth={mouth} data-beat={beat} data-work={state.work} data-idle={idle} data-enter={state.enter}
      data-unread={state.unread || undefined} data-desk={desk || undefined} data-offline={state.mood === "offline" || undefined}
      style={avatarTone(drawing.tone) as CSSProperties}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: drawing.html }} />
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { cn } from "../../lib/cn";
import { useMotion } from "../../lib/motion";
import { avatarKey, avatarTone, type AvatarSpec } from "./avatar-spec";
import { ENGINE_MOOD, type AvatarState, type MouthLevel } from "./avatar-state";
import { drawAvatar, engineSize, type AvatarSize } from "./bicho-draw";
import { useLayers } from "./layers";

/* An avatar is a drawing and a state. The drawing is the bichos engine's SVG, made once per figure and size; the state
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
 *   data-offline       the room cannot reach it: it sleeps (and the stage shows its wanted poster instead) */

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

export function CharacterAvatar({ spec, state, size, mouth: asked = "voice", mouthKey, mouthLevel, desk, live, label, className, ref }: CharacterAvatarProps) {
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
      if ("animationName" in animation) animation.startTime = state.since;
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

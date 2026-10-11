import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { cn } from "../../lib/cn";
import { avatarKey, avatarTone, type AvatarMood, type AvatarSpec } from "./avatar-spec";
import { drawAvatar, engineSize, type AvatarSize } from "./bicho-draw";
import { ENTER_MS, enterFrom } from "./engine/styles/bichos";
import { useRotation } from "./rotation";

/* An avatar is a drawing and a state. The drawing is the bichos engine's SVG, made once per figure and size; the state
 * is a handful of attributes on its root that CSS keys on (src/styles/bichos.css, the engine's; styles/call.css, the
 * app's), so React touches it once per state and never per frame. Under reduced motion none of it moves.
 *
 * Root attributes:
 *   data-avatar-state  the app's state (AvatarMood): offline | speaking | listening | working | idle | present
 *   data-mood          what the drawing acts out, in the engine's words: idle | speaking | listening | working
 *   data-size          the engine's size (stage | sidebar)
 *   data-beat          a | b, flipping on every spoken word; data-mouth=level, the mouth follows --mouth instead
 *   data-work          the working style in hand (rotation.ts); data-idle, the idle step (quiet, or a pastime)
 *   data-enter         for a moment after it starts listening, the state it left (the engine's startle), with what it
 *                      had in hand still on so it can drop away
 *   data-unread        it said something this browser has not seen yet: the "!" cue
 *   data-desk          a desk stands in front of it (the stage scene), so its working props rest on the desk top
 *   data-offline       the room cannot reach it: it sleeps (and the stage shows its wanted poster instead) */

export type { AvatarSize } from "./bicho-draw";

type EngineMood = "idle" | "speaking" | "listening" | "working";
/** The engine's mood for an app state. Offline sleeps (the engine's idle with no step: the old sleep); present (the
 *  person in a call, a transcript's speaker) is idle and quiet, awake with nothing in hand. */
const ENGINE_MOOD: Record<AvatarMood, EngineMood> = {
  offline: "idle", speaking: "speaking", listening: "listening", working: "working", idle: "idle", present: "idle",
};

export interface CharacterAvatarProps {
  spec: AvatarSpec;
  mood: AvatarMood;
  size: AvatarSize;
  /** How the mouth follows the voice while speaking: a beat for every spoken word (a new `mouthKey` each), or a
   *  level somebody else writes as `--mouth`, 0–1, on this element (the microphone's, for the person). */
  mouth?: "voice" | "level";
  mouthKey?: string | number;
  /** It has said something this browser has not seen yet. */
  unread?: boolean;
  /** A desk stands in front of it (the stage scene, while it works). */
  desk?: boolean;
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

/** The entrance into a new mood (enterFrom: the startle into listening), for ENTER_MS: the mood it left, or nothing.
 *  A first mood makes no entrance. */
function useEnter(acts: EngineMood): "idle" | "working" | null {
  const [seen, setSeen] = useState(acts);
  const [enter, setEnter] = useState<"idle" | "working" | null>(null);
  if (acts !== seen) {
    setSeen(acts);
    setEnter(enterFrom(seen, acts));
  }
  useEffect(() => {
    if (!enter) return;
    const timer = setTimeout(() => setEnter(null), ENTER_MS);
    return () => clearTimeout(timer);
  }, [enter, acts]);
  return enter;
}

/** The value as it was last shown, kept for the render after it goes. */
function useLast(value: string | undefined): string | undefined {
  const last = useRef(value);
  useLayoutEffect(() => { if (value) last.current = value; });
  return value ?? last.current;
}

export function CharacterAvatar({ spec, mood, size, mouth = "voice", mouthKey, unread, desk, label, className, ref }: CharacterAvatarProps) {
  const key = avatarKey(spec);
  // The key names the figure: a new spec object for the same conversation is the same drawing.
  const drawing = useMemo(() => drawAvatar(spec, size), [key, size]);
  const acts = ENGINE_MOOD[mood];
  const beat = useBeat(mood === "speaking" && mouth === "voice" ? mouthKey : undefined);
  const enter = useEnter(acts);
  const working = useRotation("work", key, drawing.works, acts === "working");
  // Idle steps (idle.ts) while idle: offline sleeps instead, and so does the person out of a call (no steps).
  const resting = useRotation("idle", key, drawing.idles, mood === "idle");
  // During the entrance, what it had in hand stays on so it can drop away.
  const lastWork = useLast(working), lastIdle = useLast(resting);
  const work = working ?? (enter === "working" ? lastWork : undefined);
  const idle = mood === "present" ? "quiet" : resting ?? (enter === "idle" ? lastIdle : undefined);
  return (
    <span ref={ref} className={cn("sv-avatar", className)} data-style="bichos" data-avatar-state={mood} data-mood={acts}
      data-size={engineSize(size)} data-mouth={mouth} data-beat={beat} data-work={work} data-idle={idle} data-enter={enter ?? undefined}
      data-unread={unread || undefined} data-desk={desk || undefined} data-offline={mood === "offline" || undefined}
      style={avatarTone(drawing.tone) as CSSProperties}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: drawing.html }} />
  );
}

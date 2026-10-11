import { useMemo, useState, type CSSProperties, type Ref } from "react";
import { cn } from "../../lib/cn";
import { avatarKey, avatarTone, type AvatarMood, type AvatarSpec } from "./avatar-spec";
import { drawAvatar, engineSize, type AvatarSize } from "./bicho-draw";
import { useRotation } from "./rotation";

/* An avatar is a drawing and a state. The drawing is the bichos engine's SVG, made once per figure and size; the state
 * is a handful of attributes on its root that CSS keys on (src/styles/bichos.css, the engine's; styles/call.css, the
 * app's), so React touches it once per state and never per frame. Under reduced motion none of it moves.
 *
 * Root attributes:
 *   data-avatar-state  the app's state (AvatarMood): offline | speaking | listening | working | idle | present
 *   data-mood          what the drawing acts out, in the engine's words: idle | speaking | listening | working | waiting
 *   data-size          the engine's size (stage | sidebar)
 *   data-beat          a | b, flipping on every spoken word; data-mouth=level, the mouth follows --mouth instead
 *   data-work          the working style in hand (rotation.ts); data-idle, the idle pastime, once the engine has them
 *   data-unread        it said something this browser has not seen yet: the "!" cue
 *   data-desk          a desk stands in front of it (the stage scene), so its working props rest on the desk top
 *   data-offline       the room cannot reach it: it sleeps (and the stage shows its wanted poster instead) */

export type { AvatarSize } from "./bicho-draw";

/** The engine's mood for an app state. Offline sleeps (the engine's idle without a pastime); the person, present in
 *  the call but not speaking, takes the engine's calm attentive pose. */
const ENGINE_MOOD: Record<AvatarMood, "idle" | "speaking" | "listening" | "working" | "waiting"> = {
  offline: "idle", speaking: "speaking", listening: "listening", working: "working", idle: "idle", present: "waiting",
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

export function CharacterAvatar({ spec, mood, size, mouth = "voice", mouthKey, unread, desk, label, className, ref }: CharacterAvatarProps) {
  const key = avatarKey(spec);
  // The key names the figure: a new spec object for the same conversation is the same drawing.
  const drawing = useMemo(() => drawAvatar(spec, size), [key, size]);
  const acts = ENGINE_MOOD[mood];
  const beat = useBeat(mood === "speaking" && mouth === "voice" ? mouthKey : undefined);
  const work = useRotation("work", key, drawing.works, acts === "working");
  // Idle pastimes (idle.ts): an awake idle only. Offline sleeps, and so does the person out of a call.
  const idle = useRotation("idle", key, drawing.idles, mood === "idle");
  return (
    <span ref={ref} className={cn("sv-avatar", className)} data-style="bichos" data-avatar-state={mood} data-mood={acts}
      data-size={engineSize(size)} data-mouth={mouth} data-beat={beat} data-work={work} data-idle={idle}
      data-unread={unread || undefined} data-desk={desk || undefined} data-offline={mood === "offline" || undefined}
      style={avatarTone(drawing.tone) as CSSProperties}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: drawing.html }} />
  );
}

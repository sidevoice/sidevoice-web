import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { cn } from "../../lib/cn";
import { avatarKey, avatarTone, type AvatarMood, type AvatarSpec } from "./avatar-spec";
import { drawAvatar, engineSize, type AvatarSize } from "./bicho-draw";
import { ENTER_MS, enterFrom } from "./engine/styles/bichos";
import { useRotation } from "./rotation";
import { smoothPlaybackLevel } from "./playback-mouth";
import { playbackLevel, type PlaybackLevelSample } from "../../state/playback-level";

/* An avatar is a drawing and a state. The drawing is the bichos engine's SVG, made once per figure and size; the state
 * is a handful of attributes on its root that CSS keys on (src/styles/bichos.css, the engine's; styles/call.css, the
 * app's), so React touches it once per state and never per frame. Under reduced motion none of it moves.
 *
 * Root attributes:
 *   data-avatar-state  the app's state (AvatarMood): offline | speaking | listening | working | idle | present
 *   data-mood          what the drawing acts out, in the engine's words: idle | speaking | listening | working
 *   data-size          the engine's size (stage | sidebar)
 *   data-beat          a | b for legacy voice animation; data-mouth=playback follows the speaker's output level
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
  /** How the mouth follows the voice: legacy word beats, an externally written level, or the output channel. */
  mouth?: "voice" | "level" | "playback";
  mouthKey?: string | number;
  playbackThreadId?: string | null;
  /** It has said something this browser has not seen yet. */
  unread?: boolean;
  /** A desk stands in front of it (the stage scene, while it works). */
  desk?: boolean;
  /** Said for the avatar; without one it is decoration. */
  label?: string;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
  /** No idle pastime while set (on the stage: while its balloon is up); quiet instead. */
  still?: boolean;
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

export function CharacterAvatar({ spec, mood, size, mouth = "voice", mouthKey, playbackThreadId, unread, desk, still, label, className, ref }: CharacterAvatarProps) {
  const avatar = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (mouth !== "playback") return;
    const element = avatar.current;
    if (!element) return;
    let shown = 0;
    let stale: number | undefined;
    const paint = (level: number, receivedAt = Date.now()) => {
      if (level > 0 && Date.now() - receivedAt >= 300) level = 0;
      shown = smoothPlaybackLevel(shown, level);
      element.style.setProperty("--mouth", String(shown));
      if (shown > 0) element.setAttribute("data-mouth-active", "");
      else element.removeAttribute("data-mouth-active");
      window.clearTimeout(stale);
      if (shown > 0) stale = window.setTimeout(() => paint(0), Math.max(0, receivedAt + 300 - Date.now()));
    };
    const read = (sample: PlaybackLevelSample) =>
      paint(mood === "speaking" && sample.threadId === playbackThreadId ? sample.level : 0, sample.receivedAt);
    read(playbackLevel.current());
    const stop = playbackLevel.subscribe(read);
    return () => { stop(); window.clearTimeout(stale); paint(0); };
  }, [mouth, mood, playbackThreadId]);
  const key = avatarKey(spec);
  // The key names the figure: a new spec object for the same conversation is the same drawing.
  const drawing = useMemo(() => drawAvatar(spec, size), [key, size]);
  const acts = ENGINE_MOOD[mood];
  const beat = useBeat(mood === "speaking" && mouth === "voice" ? mouthKey : undefined);
  const enter = useEnter(acts);
  const working = useRotation("work", key, drawing.works, acts === "working");
  // Idle steps (idle.ts) while idle: offline sleeps instead, and so does the person out of a call (no steps).
  // Held still (its words still on screen): no pastime starts, it stays quiet until they go.
  const resting = useRotation("idle", key, drawing.idles, mood === "idle" && !still);
  // During the entrance, what it had in hand stays on so it can drop away.
  const lastWork = useLast(working), lastIdle = useLast(resting);
  const work = working ?? (enter === "working" ? lastWork : undefined);
  const idle = mood === "present" || (still && mood === "idle") ? "quiet" : resting ?? (enter === "idle" ? lastIdle : undefined);
  return (
    <span ref={(element) => { avatar.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }} className={cn("sv-avatar", className)} data-style="bichos" data-avatar-state={mood} data-mood={acts}
      data-size={engineSize(size)} data-mouth={mouth} data-beat={beat} data-work={work} data-idle={idle} data-enter={enter ?? undefined}
      data-unread={unread || undefined} data-desk={desk || undefined} data-offline={mood === "offline" || undefined}
      style={avatarTone(drawing.tone) as CSSProperties}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: drawing.html }} />
  );
}

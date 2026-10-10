import type { CSSProperties, Ref } from "react";
import { cn } from "../../lib/cn";
import { avatarTone, type AvatarMood, type AvatarSpec } from "./avatar-spec";

/* An avatar is a drawing and a state: what it does for that state is CSS (styles/call.css), keyed on `data-mood`
 * and `data-size`, so React renders it once per state and never per frame. A small one does the reduced version,
 * and under reduced motion none of it moves. */

export type AvatarSize = "stage" | "pip" | "small";

export interface CharacterAvatarProps {
  spec: AvatarSpec;
  mood: AvatarMood;
  size: AvatarSize;
  /** How the mouth follows the voice while speaking: a beat for every spoken word (a new `mouthKey` each), or a
   *  level somebody else writes as `--mouth`, 0–1, on this element (the microphone's, for the person). */
  mouth?: "voice" | "level";
  mouthKey?: string | number;
  /** Said for the avatar; without one it is decoration. */
  label?: string;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

function Body({ shape }: { shape: AvatarSpec["shape"] }) {
  if (shape === "square") return <rect className="av-body" x="22" y="30" width="56" height="58" rx="14" />;
  if (shape === "drop") return <path className="av-body" d="M50 24c18 0 30 16 30 36s-12 28-30 28-30-8-30-28 12-36 30-36z" />;
  if (shape === "bot") return <g className="av-body"><rect x="20" y="32" width="60" height="54" rx="9" /><rect x="15" y="50" width="6" height="16" rx="3" /><rect x="79" y="50" width="6" height="16" rx="3" /></g>;
  return <circle className="av-body" cx="50" cy="58" r="30" />;
}

function Eyes({ eyes }: { eyes: AvatarSpec["eyes"] }) {
  if (eyes === "happy") return <path className="av-line" d="M36 55q5-6 10 0M54 55q5-6 10 0" strokeWidth="3.2" />;
  if (eyes === "glasses") return <g><circle className="av-lens" cx="40" cy="55" r="7.5" strokeWidth="2.5" /><circle className="av-lens" cx="60" cy="55" r="7.5" strokeWidth="2.5" /><path className="av-line" d="M47.5 55h5" strokeWidth="2.5" /><circle className="av-ink" cx="41" cy="56" r="2.6" /><circle className="av-ink" cx="61" cy="56" r="2.6" /></g>;
  if (eyes === "sleepy") return <path className="av-line" d="M35 56h10M55 56h10" strokeWidth="3.2" />;
  return <g><circle className="av-ink" cx="41" cy="55" r="5.2" /><circle className="av-ink" cx="59" cy="55" r="5.2" /><circle className="av-shine" cx="42.6" cy="53.4" r="1.6" /><circle className="av-shine" cx="60.6" cy="53.4" r="1.6" /></g>;
}

function Extra({ extra }: { extra: AvatarSpec["extra"] }) {
  if (extra === "beanie") return <g><path className="av-accent" d="M24 40c0-16 12-24 26-24s26 8 26 24z" /><rect className="av-accent-deep" x="21" y="36" width="58" height="9" rx="4.5" /><circle className="av-accent-light" cx="50" cy="15" r="5" /></g>;
  if (extra === "headset") return <g><path className="av-gear" d="M22 56a28 28 0 0 1 56 0" strokeWidth="5" /><rect className="av-cup" x="15" y="50" width="10" height="16" rx="4" /><rect className="av-cup" x="75" y="50" width="10" height="16" rx="4" /><path className="av-gear" d="M22 66q4 12 18 12" strokeWidth="2.5" /><circle className="av-gear-fill" cx="41" cy="78" r="3" /></g>;
  if (extra === "antenna") return <g><path className="av-line" d="M50 32V18" strokeWidth="2.5" /><circle className="av-accent" cx="50" cy="15" r="4.5" /></g>;
  if (extra === "leaf") return <g><path className="av-leaf" d="M50 30c-2-10 6-16 14-15-1 9-7 15-14 15z" /><path className="av-stem" d="M50 30q3-7 10-12" strokeWidth="1.5" /></g>;
  return null;
}

export function CharacterAvatar({ spec, mood, size, mouth = "voice", mouthKey, label, className, ref }: CharacterAvatarProps) {
  return (
    <span ref={ref} className={cn("sv-avatar", className)} data-mood={mood} data-size={size} data-mouth={mouth} data-tone={spec.tone}
      data-beat={mouthKey !== undefined || undefined} style={avatarTone(spec) as CSSProperties}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <g className="av-figure">
          <Body shape={spec.shape} />
          <circle className="av-cheek" cx="34" cy="66" r="4" />
          <circle className="av-cheek" cx="66" cy="66" r="4" />
          <g className="av-look"><g className="av-eyes"><Eyes eyes={spec.eyes} /></g></g>
          <path className="av-line av-mouth-rest" d="M44 69q6 5 12 0" strokeWidth="2.8" />
          {/* A new key per spoken word restarts the mouth's beat: it opens on the word and settles. */}
          <ellipse key={mouthKey ?? "mouth"} className="av-ink av-mouth-open" cx="50" cy="71" rx="6.5" ry="5" />
          <Extra extra={spec.extra} />
        </g>
      </svg>
      {size === "stage" && <span className="av-thinking" aria-hidden="true"><i /><i /><i /></span>}
    </span>
  );
}

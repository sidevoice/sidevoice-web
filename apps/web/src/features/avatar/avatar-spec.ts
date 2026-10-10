/* A conversation's agent wears an avatar chosen from its identity and nothing else: the same conversation gets the
 * same face on every reload and every device, and nothing is stored. Its colours are the room's avatar tokens
 * (styles/tokens.css), by number, so a theme can change them without touching this file. Choosing one by hand is
 * sidevoice/sidevoice-web#65. */

export const AVATAR_SHAPES = ["round", "square", "drop", "bot"] as const;
export const AVATAR_EYES = ["dots", "happy", "glasses", "sleepy"] as const;
export const AVATAR_EXTRAS = ["none", "beanie", "headset", "antenna", "leaf"] as const;
/** How many `--sv-avatar-N` / `--sv-avatar-N-bg` pairs tokens.css defines. */
export const AVATAR_TONES = 8;
/** The person's own tone: no agent wears it, so nobody on the stage is mistaken for you. */
export const PERSON_TONE = 5;
const AGENT_TONES = Array.from({ length: AVATAR_TONES }, (_, index) => index + 1).filter((tone) => tone !== PERSON_TONE);

/** How an avatar moves. `present` is the person in a call, not speaking: no state of its own to act out. */
export type AvatarMood = "speaking" | "working" | "waiting" | "idle" | "present";

export interface AvatarSpec {
  shape: (typeof AVATAR_SHAPES)[number];
  eyes: (typeof AVATAR_EYES)[number];
  extra: (typeof AVATAR_EXTRAS)[number];
  /** 1-based: the token pair `--sv-avatar-{tone}` and `--sv-avatar-{tone}-bg`. */
  tone: number;
}

/** FNV-1a, 32 bits, finished with MurmurHash3's mix: small and stable across engines, and its low bits — the ones a
 *  pick among a few options reads — no longer move together when only the end of the text differs. */
function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

function pick<T>(options: readonly T[], identity: string, part: string): T {
  return options[hash(identity + "\u0000" + part) % options.length];
}

/** The avatar of the agent behind `identity` (the conversation's thread id). */
export function avatarFor(identity: string): AvatarSpec {
  return {
    shape: pick(AVATAR_SHAPES, identity, "shape"),
    eyes: pick(AVATAR_EYES, identity, "eyes"),
    extra: pick(AVATAR_EXTRAS, identity, "extra"),
    tone: pick(AGENT_TONES, identity, "tone"),
  };
}

/** The person's own avatar, until they choose one (#65). */
export const PERSON_AVATAR: AvatarSpec = { shape: "round", eyes: "dots", extra: "beanie", tone: PERSON_TONE };

/** The CSS variables an avatar (and the stage behind it) is painted with. */
export function avatarTone(spec: AvatarSpec): Record<string, string> {
  return { "--av-color": `var(--sv-avatar-${spec.tone})`, "--av-bg": `var(--sv-avatar-${spec.tone}-bg)` };
}

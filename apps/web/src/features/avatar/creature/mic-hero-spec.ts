/* The microphone permission hero's look and moments (mic-hero.ts draws it), apart from the rig, so a page can name them
 * without loading three.js: the permissions screens map their state to it, and its fallback takes its colour. */

/** The microphone's state as the hero acts it out (the reference's `mic` act: acts.js). */
export type MicState = "prompt" | "requesting" | "granted" | "denied" | "missing";

/** The hero (T23): round, no ears, headphones, in the brand's mostaza set — mostaza body, berenjena headphones, deep violet
 *  eyes. The creator's micHero() with its MIC_COLOURS.mostaza, the set the operator closed. */
export const MIC_HERO = {
  body: "round", color: "#e0a82e", accent: "#4a2f6b", iris: "#5a3a8a", parts: ["headphones"],
  eyeStyle: null, level: "v1", eyeScale: 1.35, cheeks: false, marking: null, accessory: null, mouth: "smile",
} as const;

/** The transition into each state: a mood and how long it plays, seconds (the creator's MIC_MOOD). */
export const MIC_MOOD: Partial<Record<MicState, readonly [mood: string, seconds: number]>> = { granted: ["excited", 1.3], denied: ["sad", 1.2], missing: ["confused", 1.3] };

/** The canvas a hero is drawn into: the creator's 224 px, shown at 112 px. */
export const MIC_HERO_PX = 224;

/** Blocked or none found, the page greys it a little (the product's, and the creator's .desat). */
export const micGreyed = (state: MicState) => state === "denied" || state === "missing";

/* What an avatar shows, and how it is feeling. A conversation's agent is a bicho rolled from the conversation's
 * identity (its thread id) and nothing else: the same conversation gets the same bicho on every reload and every
 * device, and nothing is stored. Choosing one by hand, and keeping the choice, is sidevoice/sidevoice-web#65. The
 * drawing itself is the bichos engine's (engine/), reached through bicho-draw.ts. */

/** What an avatar draws: a conversation's bicho, the person's own, or — only when asked for by name — the Sidevoice
 *  mascot. A seed is never read as a mascot's name. */
export type AvatarSpec = { kind: "bicho"; seed: string } | { kind: "person"; hold?: "microphone" } | { kind: "mascot"; mascot: "sidevoice" };

/** The state an avatar acts out. An agent's, by priority: offline > speaking > listening > working > idle
 *  (features/call/conversation-state.ts derives them). `present` is the person in a call, not speaking. */
export type AvatarMood = "offline" | "speaking" | "listening" | "working" | "idle" | "present";

/** The bicho of the agent behind `identity` (the conversation's thread id). */
export function avatarFor(identity: string): AvatarSpec {
  return { kind: "bicho", seed: identity };
}

/** The person's own bicho, until they choose one (#65). */
export const PERSON_AVATAR: AvatarSpec = { kind: "person" };

/** The Sidevoice mascot. Nothing shows it yet; it is here to be asked for by name. */
export const SIDEVOICE_MASCOT: AvatarSpec = { kind: "mascot", mascot: "sidevoice" };

/** One key per drawing: two specs with the same key draw the same figure. */
export function avatarKey(spec: AvatarSpec): string {
  return spec.kind === "bicho" ? "bicho:" + spec.seed : spec.kind === "mascot" ? "mascot:" + spec.mascot : spec.hold ? "person:" + spec.hold : "person";
}

/** The CSS variables an avatar (and the stage and the picture-in-picture behind it) is tinted with: its figure's main
 *  colour, and a dark ground of that colour for the round small ones. */
export function avatarTone(tone: string): Record<string, string> {
  return { "--av-color": tone, "--av-bg": `color-mix(in srgb, ${tone} 22%, var(--sv-surface))` };
}

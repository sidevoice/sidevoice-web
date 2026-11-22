import type { AvatarMood } from "../avatar-spec";

/* How a creature that holds still looks in each state: the design reference's floating card states row (T34, CSTATES in
 * creator.js), the one place it draws a still face per state. Each is the idle key pose with this expression over it, as
 * the reference draws every still face (host.ts renderFace). Only speaking smiles; "needs you" is surprised (here: it
 * has something unread); offline fades to grey (styles/call.css). Kept apart from the rig, so a page can say what a
 * face shows before three.js has loaded. */
export const STILL_EXPR: Record<AvatarMood, string> = { idle: "neutral", listening: "neutral", speaking: "happy", working: "neutral", present: "neutral", offline: "neutral" };
export const ATTENTION_EXPR = "surprised";

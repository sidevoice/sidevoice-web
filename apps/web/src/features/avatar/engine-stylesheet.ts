import { BACKDROP_CSS } from "./engine/backdrop";
import { CSS } from "./engine/styles/bichos";
import { scopeCss } from "./engine-css";

/* src/styles/bichos.css, built from the engine: its figures' CSS under the avatar's root, and the stage backdrops'.
 * scripts/sync-bichos.mjs writes the file from this; a test checks the file still matches it. The app's own avatar
 * rules (the shared contract, the stage scene, the sizes) are in styles/call.css. */

/** The avatar root the engine's CSS is scoped to (CharacterAvatar renders it). */
export const BICHOS_SCOPE = ".sv-avatar[data-style=bichos]";

export function bichosStylesheet(): string {
  return `/* GENERATED from the bichos engine (src/features/avatar/engine) by scripts/sync-bichos.mjs: do not edit.
   The figures' moods, sizes and shared groups under ${BICHOS_SCOPE}, then the stage backdrops. */

${scopeCss(CSS, BICHOS_SCOPE)}
/* the stage backdrops (engine/backdrop.ts) */
${BACKDROP_CSS.trim()}
`;
}

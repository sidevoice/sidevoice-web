import { BACKDROP_CSS } from "./engine/backdrop";
import { CSS } from "./engine/styles/bichos";
import { scopeCss } from "./engine-css";

/* src/styles/bichos.css, built from the engine: its figures' CSS under the avatar's root, and the stage backdrops'.
 * The file is committed so the app loads it as a plain stylesheet; engine-css.test.ts holds it to this output, and
 * `npx vitest run -u src/features/avatar/engine-css.test.ts` (from apps/web) rewrites it after an engine change. The
 * app's own avatar rules (the shared contract, the stage scene, the sizes) are in styles/call.css. */

/** The avatar root the engine's CSS is scoped to (CharacterAvatar renders it). */
export const BICHOS_SCOPE = ".sv-avatar[data-style=bichos]";

export function bichosStylesheet(): string {
  return `/* Built from the bichos engine (src/features/avatar/engine) by features/avatar/engine-stylesheet.ts: do not edit by
   hand, run \`npx vitest run -u src/features/avatar/engine-css.test.ts\`. The figures' moods, sizes and shared groups
   under ${BICHOS_SCOPE}, then the stage backdrops. */

${scopeCss(CSS, BICHOS_SCOPE)}
/* the stage backdrops (engine/backdrop.ts) */
${BACKDROP_CSS.trim()}
`;
}

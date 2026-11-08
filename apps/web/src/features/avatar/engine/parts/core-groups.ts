import { batch } from "../bichos/kit";

/* Shared animation groups added after fw3. The original shared groups (arm, ear, sprout, tail, wing, float, hang, …) are
 * in the base CSS (src/styles/bichos.ts); these follow it, before every batch's own CSS, and only recombine the
 * existing keyframes. A part joins one with `group` (or a piece with `g`), as with any shared group.
 *
 * - `sprout-l/-r`: a pair of sprouts (B11's gills, the eye stalks' sides): the sprout's droop asleep, sway while
 *   talking (the two sides in opposite phase, so the pair moves mirrored) and perk while waiting; still while working.
 * - `open-l/-r`: a pair that opens outward from its hinge (B12's ladybug shell): shut at rest and while talking, it buzzes
 *   open while working and opens and shuts while waiting. Pivot each side on its hinge (a piece's `pivot`). */

export default batch({
  css: `
    :is(.pg-sprout-l, .pg-sprout-r) { transform-box: fill-box; transform-origin: 50% 100% }
    &[data-mood=idle] .pg-sprout-l { transform: rotate(-14deg) scale(.94) }
    &[data-mood=idle] .pg-sprout-r { transform: rotate(14deg) scale(.94) }
    &[data-mood=speaking] .pg-sprout-l { animation: bx-sway 1.8s ease-in-out infinite }
    &[data-mood=speaking] .pg-sprout-r { animation: bx-sway 1.8s ease-in-out infinite -.9s }
    &[data-mood=waiting] :is(.pg-sprout-l, .pg-sprout-r) { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }

    &[data-mood=working] .pg-open-l { animation: bx-claw-r .25s steps(2) infinite }
    &[data-mood=working] .pg-open-r { animation: bx-claw .25s steps(2) infinite }
    &[data-mood=waiting] .pg-open-l { animation: bx-claw-r .65s ease-in-out infinite alternate }
    &[data-mood=waiting] .pg-open-r { animation: bx-claw .65s ease-in-out infinite alternate }
  `,
});

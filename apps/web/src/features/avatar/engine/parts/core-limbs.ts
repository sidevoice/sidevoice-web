import { LAYER, batch } from "../bichos/kit";

/* Arms, legs and tails, plus the `back` slot (wings, shells, fins…) that designer batches fill. Drawn on the reference
 * body; the socket is the joint: it lands on the anchor and is the pivot the arm gestures, cranks and waves around. */

export default batch({
  slots: [
    { id: "arms", label: "Brazos", order: 32, none: "sin brazos", layer: LAYER.arms, noise: 1 },
    { id: "legs", label: "Pies", order: 34, none: "sin pies", layer: LAYER.legs, noise: 0 },
    { id: "tail", label: "Cola", order: 36, none: "sin cola", layer: LAYER.tail, noise: 2 },
    // Also a gear slot for worn back pieces (the cape, the backpack): only parts tagged `gear` are gear, so the gear step
    // never hands out quills or a shell. It is tried 0.3 as often as the other gear slots (B14: a cape is loud).
    { id: "back", label: "Espalda", order: 38, none: "nada", layer: LAYER.back, noise: 2, gear: "back" },
  ],
  parts: [
    {
      // Nub arms with a hand: held items ride `handL/R` and the arm's group.
      id: "nubs", slot: "arms", label: "bracitos", at: "shoulderL", socket: [34, 74], group: "arm", tags: ["hand"],
      draw: { pieces: [{ d: "M32 72 Q18 74 18 84 Q26 86 34 80Z", c: "body" }], emits: { handL: { x: 21, y: 82 } } },
    },
    { id: "feet", slot: "legs", label: "pies", at: "footL", socket: [51, 92], draw: { pieces: [{ d: "M44 92 Q42 102 52 102 Q60 102 58 92Z", c: "dark" }] } },
    { id: "cat", slot: "tail", label: "de gato", at: "rump", socket: [82, 94], group: "tail", draw: { pieces: [{ d: "M84 94 Q108 92 102 68 Q100 62 95 66 Q98 84 82 86Z", c: "body" }] } },
    {
      id: "fox", slot: "tail", label: "de zorro", at: "rump", socket: [82, 94], group: "tail",
      draw: { pieces: [{ d: "M80 94 Q114 96 108 64 Q104 56 97 62 Q100 82 78 84Z", c: "body" }, { d: "M108 66 Q105 56 97 62 Q100 67 101 73Z", c: "belly" }] },
    },
  ],
});

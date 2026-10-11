import { batch, blob } from "../bichos/kit";

/* The five existing bodies. Each declares its frame; every anchor comes from it (src/bichos/rig.ts). */

export default batch({
  bodies: [
    { id: "blob", label: "blandito", frame: { top: 38, eyeY: 58, mouthY: 78, armY: 72, half: 32, bottom: 96 }, outline: (r) => blob(r, 60, 66, 32, 30, 8, 0.09, 0.08) },
    { id: "round", label: "redondo", frame: { top: 41, eyeY: 62, mouthY: 77, armY: 76, half: 31, bottom: 96 }, outline: (r) => blob(r, 60, 68, 31, 29, 10, 0.03, 0.1) },
    { id: "wide", label: "ancho", frame: { top: 50, eyeY: 66, mouthY: 79, armY: 80, half: 35, bottom: 99 }, outline: (r) => blob(r, 60, 74, 35, 26, 10, 0.04, 0.12) },
    { id: "tall", label: "alto", frame: { top: 40, eyeY: 60, mouthY: 76, armY: 78, half: 26, bottom: 101 }, outline: (r) => blob(r, 60, 70, 26, 32, 10, 0.03, 0.06) },
    {
      id: "box", label: "caja", frame: { top: 38, eyeY: 62, mouthY: 79, armY: 66, half: 40, bottom: 98 },
      outline: () => "M32 38 L88 38 Q100 38 100 50 L100 86 Q100 98 88 98 L32 98 Q20 98 20 86 L20 50 Q20 38 32 38Z",
      // A belly patch has no room on a flat robot front.
      excludes: ["pattern:belly"],
    },
  ],
});

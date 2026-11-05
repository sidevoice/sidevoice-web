# The creature

A conversation's agent is a creature: a real-time 3D rig drawn with three.js, ported from the frozen design reference
(`research/creature-void-design-2026-11-01/reference/2026-11-04/`: `src/creature3d.js`, `src/accessories.js`, the shared
kit of `src/acts.js`, and the colour and rarity rules of `src/creator.js`). The reference's `DESIGN.md` is the "why";
decisions carry the same `T<n>` markers here as there. The creature is never named after the project that inspired its
eyes (Void, MIT: see `THIRD_PARTY_NOTICES.md`).

| file | what it holds |
|---|---|
| `rig.js` | the rig (`Creature3D`) and the stage that draws it (`Stage`): the 18 bodies, the eyes and lids, the toon ink shader (paint level `v1`), the outline, the shadows, the states' motion (`STATES3D`). Plain JavaScript, kept diffable line by line against the reference's `creature3d.js`; `rig.d.ts` declares what TypeScript reads of it |
| `accessories.js` | the ears, hats, face items and eyewear, and the special eye styles, registered into the rig's registries. The reference's file, unchanged but for its header and the rig's file name |
| `acts.js` | the acts' shared kit and, so far, the busy cogs every working state shows. The moods, working styles and pastimes come over from the reference's `acts.js` into this file |
| `catalogue.ts` | what a creature can be (bodies, palette, irises, slots, rarity, colour harmony) and which one a conversation gets: the creator's Random button, its `Math.random` replaced by a stream seeded with the conversation's key (`<machine fingerprint>\|<thread id>`). No three.js |
| `faces.ts` | how a still face looks in each state |
| `fallback.ts` | what stands in where no creature can be drawn: the body colour in a plain outline, no face. No three.js |
| `host.ts` | where creatures are drawn: two stages per page, the live loop (about 30 frames a second), the still faces, the framings, the pointer gaze; what happens when WebGL is missing, refused or lost |

`CharacterAvatar` (`../CharacterAvatar.tsx`) draws a conversation's creature (the `bicho` kind) through `host.ts`, which
it loads the first time a creature is drawn (`../creature-loader.ts`; the room does not wait for three.js). The person and
the Sidevoice mascot are still the bichos engine's drawings (`../engine/`).

## Where it cannot be drawn

An agent is never an empty box. Where no creature can be drawn, `fallback.ts` stands in, with the creature's label:

- **Its code did not load** (a dropped chunk): the load is not kept as failed. The next creature mounted loads it again,
  and the ones on the page try again after 1 s, doubling up to 30 s.
- **No WebGL, or a context refused**: the page is told (`creaturesDrawable`, `onCreaturesChange`), and a creature mounted
  10 s later tries again.
- **A context lost**: nothing is drawn, and each canvas keeps its last frame. When the browser gives the context back,
  the stage gets a new renderer (same scene, camera and creatures) and everything is drawn again. If it is not back
  within 3 s, the fallback stands in until it is.
- **A native call surface's still** is the fallback too where creatures cannot be drawn
  (`../../../state/call-surface-still.ts`). Where the code did not load it gives no still yet, and the publisher asks
  again with the next change.

## Drawing one

- **The stage** (`<CharacterAvatar scene live …>`, `framing: "scene"`): one canvas over the whole tile, 960 px tall as
  the creator's preview, rendered at the stage's 1152 × 768 and resampled into it (the creator's `viewCam`). The camera
  stands where the stage puts it: by default the reference's desktop distance (`SCENE_ZOOM`, 1.32) with the feet on the
  scene's ground line; a framing `{ zoom, lookY }` (the creator's `item.opts`) replaces it — this is where the stage's
  own framing (`fitFrame`, `capCentre`) plugs in.
- **A face** (`framing: "face"`): the whole creature fitted in a 144 px square, the creator's face render (T35) — the
  transcript's 44 px face and the floating card's. Still faces are rendered once per conversation and expression and
  kept (`drawFace`, `faceImage`); a face that moves is drawn live.
- **Moving or still**: a copy moves where the page's drawings move (`lib/motion.ts`: the GPU, no reduced motion) and it
  is `live`; otherwise it shows its state's key pose (the creator under reduced motion), drawn again on each change.
- **The eyes** follow the pointer over the stage's tile, or the finger on touch (the creator's `gazeAt`, `easedGaze`;
  pointer above the creature, it looks up). Nothing else answers a touch (T23).

## Checking it against the reference

`creature-lab.html` (dev server: `npm run dev -w @sidevoice/web`, then `/voice/creature-lab.html`) draws one creature
as the product does. Its hash takes a conversation id (`#seed=…`) or the creator's own keys (`#body=…&color=…&mode=…`,
the same hash the reference keeps), and an exact camera (`zoom`, `lookY`) and tile size (`w`, `h`). Given the
reference's framing and tile, the lab's canvas and the creator's are the same pixels (the PR that brought the creature
over shows the comparison and how it was run).

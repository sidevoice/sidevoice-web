# The creature

A conversation's agent is a creature: a real-time 3D rig drawn with three.js, ported from the frozen design reference
(`research/creature-void-design-2026-11-01/reference/2026-11-04/`: `src/creature3d.js`, `src/accessories.js`, `src/acts.js`,
and the colour and rarity rules and the acts' turn-taking of `src/creator.js`). The reference's `DESIGN.md` is the "why";
decisions carry the same `T<n>` markers here as there. The creature is never named after the project that inspired its
eyes (Void, MIT: see `THIRD_PARTY_NOTICES.md`).

| file | what it holds |
|---|---|
| `rig.js` | the rig (`Creature3D`) and the stage that draws it (`Stage`): the 18 bodies, the eyes and lids, the toon ink shader (paint level `v1`), the outline, the shadows, the states' motion (`STATES3D`). Plain JavaScript, kept diffable line by line against the reference's `creature3d.js`; `rig.d.ts` declares what TypeScript reads of it |
| `accessories.js` | the ears, hats, face items and eyewear, and the special eye styles, registered into the rig's registries. The reference's file, unchanged but for its header and the rig's file name |
| `acts.js` | what a creature acts out over its state: the 12 moods, the 5 working styles (crank, hammer, files, type, think) with the busy cogs, and the 9 pastimes (stretch, water, juggle, soup, fish, bubbles, music, read, nap). The reference's `acts.js` line for line (constants, curves, timings); its few product edits are marked `product:`. Not ported: the desk while working (#476), the shell terminals, the mic hero (the permissions step's), the voice cue lines |
| `schedule.ts` | which act shows and for how long, without three.js: the reference's lists, its durations (`WORK_DURATION`, `IDLE_DEFS`), the nap's half weight, the turn-taking (`nextWork`: never the same style twice; `nextRest`: quiet, then a pastime that is never the last one) and the fishing's bites (5 s slots, the first bite in the third, then about one in three; a 0.7 s leap) |
| `catalogue.ts` | what a creature can be (bodies, palette, irises, slots, rarity, colour harmony) and which one a conversation gets: the creator's Random button, its `Math.random` replaced by a stream seeded with the conversation's key (`<machine fingerprint>\|<thread id>`). No three.js |
| `faces.ts` | how a still face looks in each state |
| `fallback.ts` | what stands in where no creature can be drawn: the body colour in a plain outline, no face. No three.js |
| `host.ts` | where creatures are drawn: two stages per page, the live loop (about 30 frames a second), the still faces, the framings, the pointer gaze, and the acts on the rig's layers; what happens when WebGL is missing, refused or lost |

`CharacterAvatar` (`../CharacterAvatar.tsx`) draws a conversation's creature (the `bicho` kind) through `host.ts`, which
it loads the first time a creature is drawn (`../creature-loader.ts`; the room does not wait for three.js). The person and
the Sidevoice mascot are still the bichos engine's drawings (`../engine/`).

## Where it cannot be drawn

An agent is never an empty box. Where no creature can be drawn, `fallback.ts` stands in, with the creature's label.
Each of the two stages answers for itself: one stage draws the stage's creature, the other the still faces. When one is
down, only the creatures it draws show the fallback.

- **Its code did not load** (a dropped chunk): the load is not kept as failed. The next creature mounted loads it again,
  and the ones on the page try again after 1 s, doubling up to 30 s.
- **No WebGL, or a context refused**: the page is told (`creaturesDrawable(framing)`, `onCreaturesChange`). A creature
  mounted on that stage 10 s later tries again.
- **A context lost**: nothing is drawn, and each canvas keeps its last frame. When the browser gives the context back,
  the stage gets a new renderer (same scene, camera and creatures) and its creatures are drawn again. If it is not back
  within 3 s, the fallback stands in for that stage's creatures until it is.
- **A native call surface's still** is the fallback too where creatures cannot be drawn
  (`../../../state/call-surface-still.ts`), drawn by the faces' stage. Where the code did not load it gives no still
  yet, and the publisher asks again by itself, after 1 s, doubling up to 30 s
  (`../../../state/call-surface-publisher.ts`).

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

## What it acts out

On the rig's act layers, as the creator plays them:

- **`base`**: the working style while it works, the pastime while it rests (quiet has none). Which one, and for how long,
  is the state's (`../avatar-state.ts` by `../rotation.ts`, with `schedule.ts`'s rules): a pure function of the figure and
  the moment its rest or work began, so every window shows the same step. The product's semantics hold: working takes
  styles; idle rests quiet for `BORED_AFTER_MS` (10 s), then quiet and pastimes take turns, only while a copy is drawn
  moving; present stays quiet; offline is the poster; held still under its balloon it takes nothing. The state hands the
  step to the host (`work`, `idle`, `since`, `until`): the act's clock starts at `since` and a pastime runs for its
  spell (`until - since`) and half a second more, as the creator's `idleStep` does.
- **`cogs`**: the busy cue over the head in every working style.
- **Entering listening**, whatever it had going goes at once, as the creator's `applyMode` drops the base act and the
  cogs, and it startles as the creator does (surprised, a hop of 1.1, 0.55 s), on every change into listening, a
  barge-in on its speech included (creator.js `interrupt()`). It runs from the moment it came in (`enteredAt`: the
  room's stamp, the same in every window, kept while it listens), so a copy drawn late plays what is left of it; it is
  the reference's 0.55 s, not the 2D figure's 420 ms entrance (`enter`, which only drops the 2D props).
- **`mood`**: a reaction over all of it (`LiveCreature.playMood(name, { dur, hold })`), which keeps the mouth while it
  speaks. Nothing in the product plays one yet: they are meant to be picked from the conversation.

Held still (reduced motion, no GPU), a working style shows its key pose and a rest shows quiet, never a pastime frozen
mid-way.

## Checking it against the reference

`creature-lab.html` (dev server: `npm run dev -w @sidevoice/web`, then `/voice/creature-lab.html`) draws one creature
as the product does. Its hash takes a conversation id (`#seed=…`) or the creator's own keys (`#body=…&color=…&mode=…`,
the same hash the reference keeps), and an exact camera (`zoom`, `lookY`) and tile size (`w`, `h`). For the acts:
`work=hammer` or `rest=fish` holds a working style or a pastime, `mood=love` plays a mood (`hold=1` keeps it),
`auto=1` runs the product's own turn-taking (every change in `__lab.log`), and `t=<s>` draws the frame `<s>` seconds into
the state's motion and every act (`__lab.frameAt(s)`), for comparing against the reference at fixed times. Given the
reference's framing and tile, the lab's canvas and the creator's are the same pixels (the PR that brought the creature
over shows the comparison and how it was run).

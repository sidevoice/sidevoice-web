# The bichos engine

The drawing and animation code behind the person's avatar and the Sidevoice mascot: the engine draws them as SVG at a
size. A conversation's agent is no longer a bicho: it is its creature, a 3D rig
(`../creature/`); the generator that rolled a bicho from a conversation's identity (archetypes, palette, `specFromSeed`)
and the desk it worked at are gone with it, and the stage's backdrops are the design reference's, drawn on a canvas
(`../scene/`). It is ordinary source of this app, edited and reviewed here like the rest
of `features/avatar/`. It began as a proof of concept in a separate scratch project (the "avatar lab"); nothing is
synced from there any more.

The app talks to the engine only through `features/avatar/` (`bicho-draw.ts`, `CharacterAvatar.tsx`,
`engine-stylesheet.ts`).

## Layout

| path | what it holds |
|---|---|
| `core.ts` | the random streams (SHA-256 of the versioned identity and decision into PCG32), the `Size`/`Mood` types, small drawing helpers, `uid` for per-drawing ids |
| `bichos/kit.ts` | the types and helpers a part file is written with (`batch`, `Spec`, colour swatches) |
| `bichos/registry.ts` | finds every part file under `parts/` and indexes slots, bodies and parts |
| `bichos/spec.ts` | `normalizeSpec` and the rules that keep a spec coherent (what a part hides, what conflicts) |
| `bichos/rig.ts`, `bichos/render.ts` | a body's anchors and the renderer that lays the parts out as one SVG (`renderSpec`) |
| `bichos/work.ts`, `bichos/idle.ts` | the working styles and the idle pastimes: their cues, their CSS and which a figure can take |
| `parts/` | the parts, in batches (`b01-bodies.ts` … `b15-elementals.ts`) and the `core-*.ts` files the batches build on. A part says what it needs and what it excludes; it does not say who wears it |
| `styles/mascots.ts` | the Sidevoice mascot (its mark and the shade every figure uses) |
| `styles/bichos.ts` | the mascot frame and the shared CSS (moods, sizes, shared groups) |

## Changing it

- A drawing is deterministic: the same seed and size give the same markup, apart from the per-drawing id prefix
  (`bx<n>` from `uid`). `engine-render.test.ts` holds a sample of drawings to a committed snapshot, so a change
  that moves the markup shows up in review as a diff of `__snapshots__/engine-render.txt`. When the change is meant,
  run `npx vitest run -u src/features/avatar` from `apps/web` to accept it.
- The engine's CSS reaches the page as `src/styles/bichos.css`, built from `styles/bichos.ts` by
  `engine-stylesheet.ts`. `engine-css.test.ts` holds the file to that output; the same `-u` run rewrites it.
- Colour: a figure's tints are in `Spec.tints`, and a piece painted `body`, `belly` or `dark` takes its slot's tint.
  Fixed materials (a flower, a bucket) keep their own colour.
- No third-party mark belongs here (no other product's mascot or logo): `bicho-draw.test.ts` fails if one comes in.

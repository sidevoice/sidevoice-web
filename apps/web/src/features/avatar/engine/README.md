# The bichos engine

The drawing and animation code behind every avatar: a conversation's seed rolls a bicho (a body, parts, a palette),
and the engine draws it as SVG at a size. It is ordinary source of this app, edited and reviewed here like the rest
of `features/avatar/`. It began as a proof of concept in a separate scratch project (the "avatar lab"); nothing is
synced from there any more.

The app talks to the engine only through `features/avatar/` (`bicho-draw.ts`, `CharacterAvatar.tsx`,
`StageScene.tsx`, `engine-stylesheet.ts`).

## Layout

| path | what it holds |
|---|---|
| `core.ts` | the seed hash and its random streams, the `Size`/`Mood` types, small drawing helpers, `uid` for per-drawing ids |
| `bichos/kit.ts` | the types and helpers a part file is written with (`batch`, `Spec`, `Pool`, colour swatches) |
| `bichos/registry.ts` | finds every part file under `parts/` and indexes slots, bodies, families, members and parts |
| `bichos/seed.ts` | the roller: seed to spec (`specFromSeed`), and the `bicho:<family>/<member>:<seed>?slot=id` form that pins one |
| `bichos/spec.ts` | `normalizeSpec` and the rules that keep a spec coherent (what a part hides, what conflicts) |
| `bichos/rig.ts`, `bichos/render.ts` | a body's anchors and the renderer that lays the parts out as one SVG (`renderSpec`) |
| `bichos/work.ts`, `bichos/idle.ts` | the working styles and the idle pastimes: their cues, their CSS and which a figure can take |
| `parts/` | the parts, in batches (`b01-bodies.ts` … `b15-elementals.ts`) and the `core-*.ts` files the batches build on |
| `styles/mascots.ts` | the Sidevoice mascot (its mark and the shade every figure uses) |
| `styles/bichos.ts` | the mascot frame and the shared CSS (moods, sizes, shared groups) |
| `backdrop.ts`, `desk.ts` | the stage scene's backdrops and the desk the agent works at |

## Changing it

- A drawing is deterministic: the same seed and size give the same markup, apart from the per-drawing id prefix
  (`bx<n>`, `bd<n>` from `uid`). `engine-render.test.ts` holds a sample of drawings to a committed snapshot, so a change
  that moves the markup shows up in review as a diff of `__snapshots__/engine-render.txt`. When the change is meant,
  run `npx vitest run -u src/features/avatar` from `apps/web` to accept it.
- The engine's CSS reaches the page as `src/styles/bichos.css`, built from `styles/bichos.ts` and `backdrop.ts` by
  `engine-stylesheet.ts`. `engine-css.test.ts` holds the file to that output; the same `-u` run rewrites it.
- A seed rolls its bicho from salted random streams and rendezvous picks, so adding a part or a member only takes the
  seeds it wins and moves no other choice. Keep it so: a change to an existing roll moves the bicho of every
  conversation that rolled it, on every device.
- No third-party mark belongs here (no other product's mascot or logo): `bicho-draw.test.ts` fails if one comes in.

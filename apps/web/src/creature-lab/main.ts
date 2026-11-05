import "../styles/tokens.css";
import { CHOICE_KEYS, creatureFromSeed, type CreatureChoice } from "../features/avatar/creature/catalogue";
import { ATTENTION_EXPR, drawFace, mountCreature, STILL_EXPR, type Framing, type LiveCreature } from "../features/avatar/creature/host";
import { MOODS as ACT_MOODS, PASTIMES, WORKS, fishing } from "../features/avatar/creature/schedule";
import { avatarFor, type AvatarMood } from "../features/avatar/avatar-spec";
import { createAvatarStates, type AvatarState } from "../features/avatar/avatar-state";

/* The creature lab (creature-lab.html, served by the dev server only): one conversation's creature as the product draws
 * it (features/avatar/creature/host.ts), on its own, for review and for the pixel comparison against the design
 * reference's creator. Everything is in the URL hash, as the creator keeps it:
 *
 *   seed=<conversation key>          the creature a conversation rolls (its key: `<machine fingerprint>|<thread id>`);
 *                                    or the creator's own keys, for any creature:
 *   body= color= accent= iris= eyes= ears= head= face= eyewear=   (labels, as the creator's hash spells them)
 *   mode=idle|listening|speaking|working|present|offline         the state (default idle)
 *   work=crank|hammer|files|type|think                           a working style, held (the creator's pressed style)
 *   rest=stretch|water|juggle|soup|fish|bubbles|music|read|nap   a pastime, held (the creator's pressed pastime)
 *   mood=happy|laugh|love|…|proud    a mood over it, for its own seconds (dur=<s> for others; hold=1 until replaced)
 *   auto=1                           the product's own turn-taking (avatar-state.ts by creature/schedule.ts), on the real
 *                                    clock, as a figure drawn moving: every change is kept in __lab.log
 *   t=<s>                            one frame, <s> seconds into the state's motion and every act (moving), then held:
 *                                    the comparison against the reference at fixed times (also __lab.frameAt(s))
 *   at=<s>                           its key pose with the acts at <s> (the creator's captureSheet `at`)
 *   still=1                          held still in its key pose (as under reduced motion); default: moving
 *   w= h=                            the tile's size in CSS px (default 900 × 600, the desktop's 3:2)
 *   zoom= lookY=                     an exact camera (the creator's item.opts); default: the stage's scene framing
 *
 * Under the tile: the still faces (the transcript's, the sidebar's) in every state. A developer page, not the product:
 * its few words are not translated. */

const MOODS: AvatarMood[] = ["idle", "listening", "speaking", "working", "present", "offline"];

function readHash(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const kv of location.hash.slice(1).split("&")) { const [k, v] = kv.split("="); if (k && v != null) o[k] = decodeURIComponent(v); }
  return o;
}

const root = document.getElementById("lab")!;
const css = document.createElement("style");
css.textContent = `
  body { margin: 0; background: #f4f1ec; font: 13px/1.4 "DM Sans", system-ui, sans-serif; color: #1b1d24; }
  #lab { display: grid; gap: 14px; padding: 14px; justify-items: start; }
  .tile { position: relative; background: #fbf9f6; overflow: hidden; touch-action: none; }
  .tile canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .faces { display: flex; gap: 12px; flex-wrap: wrap; }
  .face { display: grid; justify-items: center; gap: 4px; }
  .face canvas { width: 72px; height: 72px; }
  .face[data-offline] canvas { filter: grayscale(1); opacity: .55; }
  pre { margin: 0; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; }`;
document.head.appendChild(css);

let live: LiveCreature | null = null;
let stopAuto: (() => void) | null = null;
function render() {
  live?.dispose(); live = null;
  stopAuto?.(); stopAuto = null;
  root.textContent = "";
  const h = readHash();
  const seed = h.seed ?? "creature-lab";
  const rolled = creatureFromSeed(seed);
  const choice: CreatureChoice = { ...rolled };
  let byHand = false;
  for (const k of CHOICE_KEYS) if (h[k] != null) { choice[k] = h[k]; byHand = true; }
  const work = (WORKS as readonly string[]).includes(h.work) ? h.work : undefined;
  const rest = (PASTIMES as readonly string[]).includes(h.rest) ? h.rest : undefined;
  const mood: AvatarMood = work ? "working" : rest ? "idle" : (MOODS as string[]).includes(h.mode) ? (h.mode as AvatarMood) : "idle";
  const fixed = h.t != null ? Number(h.t) : h.at != null ? Number(h.at) : null;
  const w = Number(h.w) || 900, ht = Number(h.h) || 600;
  const tile = document.createElement("div");
  tile.className = "tile stage-tile";
  tile.style.width = w + "px"; tile.style.height = ht + "px";
  const canvas = document.createElement("canvas");
  tile.appendChild(canvas);
  root.appendChild(tile);
  let framing: Framing | undefined = h.zoom != null && h.lookY != null ? { zoom: Number(h.zoom), lookY: Number(h.lookY) } : undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = work ? { work, since: Date.now() } : rest ? { idle: rest, since: Date.now() } : {};
  live = mountCreature({ seed, choice: byHand ? choice : undefined, canvas, framing: "scene", scene: () => framing ?? null, mood, step, moving: !(fixed != null || h.still === "1" || reduced), gazeFrom: tile });
  if (live && (ACT_MOODS as readonly string[]).includes(h.mood)) live.playMood(h.mood, { hold: h.hold === "1", dur: h.dur != null ? Number(h.dur) : undefined });
  // The product's turn-taking, as a stage's figure drawn moving: its state's work and idle become the creature's acts.
  const log: Array<{ t: number; mood: string; work?: string; idle?: string; spell?: number; act?: string | null; actDur?: number | null }> = [];
  if (live && h.auto === "1") {
    const states = createAvatarStates(), born = Date.now(), creature = live;
    const show = () => {
      const s: AvatarState | undefined = states.get("lab");
      if (!s) return;
      creature.setMood(s.mood, { step: { work: s.work, idle: s.idle, since: s.since, until: s.until } });
      const base = creature.acting().base;
      log.push({ t: (Date.now() - born) / 1000, mood: s.mood, work: s.work, idle: s.idle, spell: s.until != null && s.since != null ? (s.until - s.since) / 1000 : undefined, act: base?.name ?? null, actDur: base?.dur });
    };
    const stop = states.subscribe(show);
    states.set("lab", { spec: avatarFor(seed), mood, restStart: born, pastimes: true });
    stopAuto = () => { stop(); states.clear(); };
  }
  const faces = document.createElement("div");
  faces.className = "faces";
  for (const m of [...MOODS, "unread"] as const) {
    const face = document.createElement("div");
    face.className = "face";
    if (m === "offline") face.dataset.offline = "";
    const c = document.createElement("canvas");
    face.append(c, m);
    faces.appendChild(face);
    // A hand-picked creature has no seed of its own: its faces are keyed by its choice.
    drawFace(c, byHand ? JSON.stringify(choice) : seed, m === "unread" ? ATTENTION_EXPR : STILL_EXPR[m], byHand ? choice : undefined);
  }
  root.appendChild(faces);
  const about = document.createElement("pre");
  const link = "#" + CHOICE_KEYS.map((k) => `${k}=${encodeURIComponent(choice[k])}`).join("&") + `&mode=${mood}`;
  about.textContent = `${byHand ? "by hand" : `seed ${seed}`}\n${JSON.stringify(choice)}\ncreator hash: ${link}`;
  root.appendChild(about);
  const it = live;
  if (it && fixed != null) it.frameAt(fixed, h.at != null);
  (window as unknown as { __lab: unknown }).__lab = {
    canvas, live, choice, mood, log, ready: true,
    /** The frame `t` seconds into everything it acts out (still: its key pose, the acts at `t`). */
    frameAt: (t: number, still = false) => it?.frameAt(t, still),
    /** An exact camera from now on (the reference's, which makes room for the act playing). */
    camera: (zoom: number, lookY: number) => { framing = { zoom, lookY }; it?.reframe(); },
    acting: () => it?.acting() ?? {},
    /** The fishing's slots and leap at `k` (the rule the act draws from), for a timing log with a known seed. */
    fishing,
  };
}
addEventListener("hashchange", render);
render();

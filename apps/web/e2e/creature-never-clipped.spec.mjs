import { expect, test } from "@playwright/test";
import { installHarness, stageFramed } from "./harness.mjs";

// Each case loads the room and waits for the creature's reach to be measured: a software GL takes its time over it. The desktop
// sweep then goes through every window size and every state in the same page.
test.describe.configure({ timeout: 150_000 });

/* A creature is never cut at the edge of what it is drawn in, at any size or shape of window (operator, 2026-11-10: in the
 * desktop app's tall, narrow window a conversation's creature was sliced by a hard vertical edge, headphone cup and shadow
 * alike; narrower still, the stage showed no creature at all. 2026-11-12: at work, its busy cogs and the crank's little machine
 * beside it were sliced by one vertical line). Here the room runs as the desktop app runs it (its host injected, a fine pointer),
 * and on phones (touch), with the drawings moving (`sidevoice.motion`: as on a GPU, so the stage's canvas is cropped to the
 * creature), and what is drawn is read back from the pixels once the creature's reach is measured (its canvas's `data-reach`):
 * the stage's creature is there, on a canvas with a box inside its tile that nothing it sits in cuts (overflow, a clip-path, paint
 * containment), and nothing it draws touches that canvas's edges, either way; every conversation's face in the list, the rail or
 * the header is painted, and none touches the edges of its own square.
 *
 * Nothing it draws means every state that draws something besides the creature: listening (the startle's hop) and speaking (the
 * voice's squash, at its loudest), each working style with the busy cogs over its head (the crank's machine beside it, the hammer,
 * the files, the keyboard, the thought cloud), and each pastime. Each is put on the stage through the room's own figures fact (the
 * floating card's path: `restRelayed`), at a moment whose rotation picks that act (`data-work`, `data-idle`), and read a few times
 * while it moves. On a desktop, the stage builds the creature again on its canvas when another conversation comes on it (and back),
 * before the window takes every size: the canvas kept from the creature before must not keep that one's crop. A browser that draws
 * no creature fails here: there is nothing to check whole. */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });
const WORKS = ["crank", "hammer", "files", "type", "think"];
const PASTIMES = ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"];
/** Every state that draws something: what it is, the room's mood for it, and the working style or pastime that must show. */
const STATES = [{ mood: "listening" }, { mood: "speaking" }, ...WORKS.map((work) => ({ mood: "working", work })), ...PASTIMES.map((idle) => ({ mood: "idle", idle }))];
const named = (s) => s.work ?? s.idle ?? s.mood;

/** In the page: what `canvas` draws, from its pixels (its alpha), and where it is. */
function drawn(canvas) {
  const box = canvas.getBoundingClientRect(), { width: W, height: H } = canvas;
  const out = { box: { x: box.x, y: box.y, w: box.width, h: box.height }, W, H, count: 0, l: W, r: -1, t: H, b: -1 };
  if (!W || !H) return out;
  const d = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { out.count++; if (x < out.l) out.l = x; if (x > out.r) out.r = x; if (y < out.t) out.t = y; if (y > out.b) out.b = y; }
  return out;
}

/** In the page: every box `canvas`'s own box spills out of among the elements it sits in that cut what they hold (an overflow
 *  other than visible, a clip-path, paint containment), to the document. The stage's tile clips at its edges: the canvas is inside it. */
function clipped(canvas) {
  const box = canvas.getBoundingClientRect(), out = [];
  for (let e = canvas.parentElement; e && e !== document.documentElement; e = e.parentElement) {
    const s = getComputedStyle(e), cuts = s.overflowX !== "visible" || s.overflowY !== "visible" || s.clipPath !== "none" || /paint|strict|content/.test(s.contain);
    if (!cuts) continue;
    const r = e.getBoundingClientRect();
    if (box.left < r.left - 0.5 || box.right > r.right + 0.5 || box.top < r.top - 0.5 || box.bottom > r.bottom + 0.5)
      out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join(".")} [${Math.round(r.left)}, ${Math.round(r.right)}] × [${Math.round(r.top)}, ${Math.round(r.bottom)}] cuts [${Math.round(box.left)}, ${Math.round(box.right)}] × [${Math.round(box.top)}, ${Math.round(box.bottom)}]`);
  }
  return out;
}

/** In the page: puts the first conversation's agent in `state` on the stage, through the room's figures fact as the floating card
 *  takes it (`restRelayed`): its rest stamped where the act asked for has just begun, if the rotation picks it (avatar-state.ts:
 *  a working style from the stamp; a pastime after BORED_AFTER_MS, 10 s, and the quiet before it, 4 to 10 s), each try another
 *  stamp a millisecond apart, which the pick is seeded with. Listening and speaking start now (the startle plays from its start).
 *  The voice is at its loudest meanwhile (startVoice). Resolves to whether the stage shows it. */
async function putState({ mood, work, idle }) {
  const { store } = window.sidevoiceUI, facts = () => store.getState().facts;
  const key = Object.keys(facts().figures).find((k) => k.endsWith("|t1"));
  const agent = () => document.querySelector(".stage-tile[data-mood] .stage-agent");
  for (let n = 0; n < 240; n++) {
    const back = work ? 1_000 + n : idle ? 20_050 + n : 0;
    store.patch({ restRelayed: true, figures: { ...facts().figures, [key]: { mood, still: false, restStart: Date.now() - back } } });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const a = agent();
    if (a?.closest(".stage-tile")?.dataset.mood === mood && (!work || a.dataset.work === work) && (!idle || a.dataset.idle === idle)) return true;
  }
  return false;
}

/** In the page: the voice at its loudest, both ways (the person's level while it listens, the agent's while it speaks), as the
 *  runtime publishes them. */
function startVoice() {
  const { store, micLevel, playbackLevel } = window.sidevoiceUI;
  const key = Object.keys(store.getState().facts.figures).find((k) => k.endsWith("|t1"));
  setInterval(() => { micLevel?.publish?.(100); playbackLevel?.publish?.(1, key); }, 32);
}

/** The room at `width` × `height`, its first conversation on the stage, its framing solved on the creature's measured reach. */
async function open(page, { width, height, app }) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((app) => {
    if (app) window.__sidevoiceHost = { host: { build: { channel: "release", version: "0.0.0-e2e" } } };
    localStorage.setItem("sidevoice.motion", "gpu");
  }, app);
  // several conversations: each rolls its creature (body, hat, ears), so each run checks a few more of them
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core"), ...["t2", "t3", "t4", "t5", "t6"].map((id) => conversation(id, "project-" + id))] } });
  await page.goto("/voice/");
  // A wide window lists the conversations; a narrower one keeps them in a rail; a phone in its header.
  const row = page.locator("#participants").getByText("sidevoice-core").first();
  const picker = page.locator(".header-avatar:visible, button.person:visible").first();
  await Promise.race([row.waitFor({ state: "visible", timeout: 15_000 }).catch(() => null), picker.waitFor({ state: "visible", timeout: 15_000 }).catch(() => null)]);
  if (await row.isVisible()) await row.click(); else await picker.click();
  const stage = page.locator(".stage-tile[data-mood] .stage-agent[data-style=creature] > canvas");
  await expect(stage, "the creature's reach measured").toHaveAttribute("data-reach", "measured", { timeout: 90_000 });
  await stageFramed(page, 60_000, { strict: true });
  await settled(page, stage);
  await page.evaluate(`window.__drawn = ${drawn}; window.__clipped = ${clipped}`);
  return stage;
}

/** The framing on what was measured eases in: drawn a frame or two after it lands (the canvas says so while it eases: data-easing),
 *  then settled. */
async function settled(page, stage) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect.poll(() => stage.evaluate((c) => !c.hasAttribute("data-easing")), { timeout: 30_000, message: "the framing settled" }).toBe(true);
}

/** The stage's creature as drawn now: there (at least `least` px of it: a turn on a phone on its side steps it far back, to make
 *  room for its card), inside its tile, cut by nothing it sits in, and clear of its canvas's edges. */
async function stageWhole(page, stage, what, least = 500) {
  const { s, tile, cuts } = await stage.evaluate((canvas) => {
    const r = canvas.closest(".stage-tile").getBoundingClientRect();
    return { s: window.__drawn(canvas), tile: { x: r.x, y: r.y, width: r.width, height: r.height }, cuts: window.__clipped(canvas) };
  });
  // drawn: a canvas with a box and pixels, and a creature on it
  expect(s.W * s.H, `${what}: the canvas has pixels`).toBeGreaterThan(0);
  expect(s.box.w * s.box.h, `${what}: the canvas has a box`).toBeGreaterThan(0);
  expect(s.count, `${what}: the creature is drawn`).toBeGreaterThan(least);
  // inside its tile (its border's px aside), cut by nothing it sits in, and nothing it draws at its canvas's edges, either way
  expect(s.box.x, `${what}: inside its tile`).toBeGreaterThanOrEqual(tile.x - 0.5);
  expect(s.box.x + s.box.w, `${what}: inside its tile`).toBeLessThanOrEqual(tile.x + tile.width + 0.5);
  expect(s.box.y, `${what}: inside its tile`).toBeGreaterThanOrEqual(tile.y - 0.5);
  expect(s.box.y + s.box.h, `${what}: inside its tile`).toBeLessThanOrEqual(tile.y + tile.height + 0.5);
  expect(cuts, `${what}: nothing it sits in cuts it`).toEqual([]);
  expect({ left: s.l > 0, top: s.t > 0, right: s.r < s.W - 1, bottom: s.b < s.H - 1 }, `${what}: clear of the canvas's edges (${s.W} × ${s.H} px, drawn ${s.l}..${s.r} × ${s.t}..${s.b})`)
    .toEqual({ left: true, top: true, right: true, bottom: true });
}

/** The conversations' faces: every one shown is painted, and none touches its square's edges. */
async function facesWhole(page, what) {
  const faces = page.locator(".conversation-avatar canvas");
  const shown = () => faces.evaluateAll((all) => all.filter((c) => c.getClientRects().length).map((c) => (c.width ? window.__drawn(c).count : 0)));
  await expect.poll(async () => { const counts = await shown(); return counts.length > 0 && counts.every((n) => n > 0); }, { timeout: 20_000, message: `${what}: faces are shown, and every one is painted` }).toBe(true);
  for (const f of await faces.evaluateAll((all) => all.filter((c) => c.getClientRects().length).map((c) => window.__drawn(c))))
    expect({ left: f.l > 0, top: f.t > 0, right: f.r < f.W - 1, bottom: f.b < f.H - 1 }, `${what}: a face clear of its square's edges`).toEqual({ left: true, top: true, right: true, bottom: true });
}

/** Every state on the stage, each read a few times while it moves (`reads`, ~150 ms apart). */
async function everyState(page, stage, where, { states = STATES, reads = 2 } = {}) {
  for (const state of states) {
    expect(await page.evaluate(putState, state), `${where}: the stage shows ${named(state)}`).toBe(true);
    for (let n = 0; n < reads; n++) {
      await stageWhole(page, stage, `${where}, ${named(state)}, read ${n + 1}`, 0);
      await page.waitForTimeout(150);
    }
  }
}

/** Desktop windows, as [width, height, rail]: from a phone-wide window to a 2560 px one, 500 to 1600 px tall, portrait and landscape;
 *  the operator's (a stage of about 1470 × 1420); the conversations listed (a wide window), kept in a rail (a narrower one) or
 *  collapsed into it by hand (`rail: false`: wider stages). Every one shows listening, speaking and every working style; the pastimes
 *  are shown at the operator's window and at the extremes of the stage's shape (`PASTIME_WINDOWS`), which keeps the sweep to a few
 *  minutes on a software GL. */
const WINDOWS = [[2560, 1440], [2560, 1000], [1920, 1080], [1791, 1624], [1791, 1624, false], [1440, 900], [1440, 900, false], [1280, 800],
  [1170, 1600], [1024, 1400, false], [900, 1400], [740, 1600], [600, 900], [500, 1400], [360, 800], [1600, 500], [2000, 600], [800, 500]];
const PASTIME_WINDOWS = new Set(["1791 × 1624", "740 × 1600", "2000 × 600", "360 × 800"]);

test("in the desktop app, at every window size and in every state, the creature is drawn whole, inside its tile, and no face is cut", async ({ page }) => {
  test.setTimeout(900_000);
  // A wide, short window first: the stage's canvas is cropped narrow to its creature there...
  const stage = await open(page, { width: 2400, height: 1100, app: true });
  await page.evaluate(startVoice);
  // ...then another conversation comes on the stage and the first one back: the stage builds the creature again on its canvas.
  await page.locator("#participants").getByText("project-t2").first().click();
  await expect(stage, "the second creature's reach measured").toHaveAttribute("data-reach", "measured", { timeout: 90_000 });
  await page.locator("#participants").getByText("sidevoice-core").first().click();
  await expect(page.getByRole("button", { name: /^sidevoice-core ·/ }), "the first conversation back on the stage").toHaveAttribute("aria-pressed", "true");
  await settled(page, stage);
  let collapsed = false;
  for (const [width, height, rail = true] of WINDOWS) {
    const where = `${width} × ${height}${rail ? "" : ", rail collapsed"}`;
    await page.setViewportSize({ width, height });
    // the rail collapsed by hand where asked, and expanded again after (the room keeps the choice; a narrow window has a rail anyway)
    const toggle = page.getByRole("button", { name: rail ? "Expand conversations" : "Collapse conversations" });
    if ((collapsed === rail) && await toggle.isVisible()) { await toggle.click(); collapsed = !rail; }
    await settled(page, stage);
    await page.evaluate(putState, { mood: "idle" }).catch(() => {});
    await settled(page, stage);
    await stageWhole(page, stage, where);
    await facesWhole(page, where);
    await everyState(page, stage, where, { states: PASTIME_WINDOWS.has(where) ? STATES : STATES.filter((s) => s.mood !== "idle") });
  }
});

for (const [width, height] of [[1170, 2000], [740, 2000], [500, 1400], [360, 1200], [1600, 500], [1280, 800]]) {
  test(`in the desktop app opened at ${width} × ${height}, the creature is drawn whole, inside its tile, and no face is cut`, async ({ page }) => {
    const stage = await open(page, { width, height, app: true });
    await stageWhole(page, stage, `${width} × ${height}`);
    await facesWhole(page, `${width} × ${height}`);
  });
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  for (const [width, height] of [[360, 640], [390, 844], [320, 568], [844, 390]]) {
    test(`at ${width} × ${height}, in every state, the creature is drawn whole, inside its tile, and no face is cut`, async ({ page }) => {
      test.setTimeout(300_000);
      const stage = await open(page, { width, height, app: false });
      await stageWhole(page, stage, `${width} × ${height}`);
      await facesWhole(page, `${width} × ${height}`);
      await page.evaluate(startVoice);
      await everyState(page, stage, `${width} × ${height}`, { reads: 2 });
    });
  }
});

/** The stage's creature as drawn now, in css px: its drawn height (from the pixels), and its tile's. */
async function creatureSize(stage) {
  return stage.evaluate((canvas) => {
    const s = window.__drawn(canvas), tile = canvas.closest(".stage-tile").getBoundingClientRect();
    return { height: ((s.b - s.t + 1) * s.box.h) / s.H, tile: tile.height, agentCard: document.querySelector(".stage-voice .vcap.agent.meas")?.offsetHeight ?? 0 };
  });
}

/* A phone on its side (a tile far wider than tall, 167 to 220 px of height): the stage steps the creature back to leave room under it
 * for the largest card of a turn, and the card was 102 px of it, so while it listened or spoke the creature was drawn at about a tenth of
 * the tile's height, a third of its size at rest (2026-11-12: "far too small"). Now the card's type steps down in so short a tile (a card
 * is no more than 42% of the tile's height, the agent's type no lower than 12 px) and the creature, rising off the tile's middle to stand
 * over it, steps back no further than that needs: here it stays at 55% of the size it has at rest or more (it was a third), and at 15% of
 * the tile's height or more (a tenth), whole, as the same sweep reads it. Over many rolls of the creature (each run of the harness rolls its own),
 * the least seen was 0.19 of the tile and 0.64 of its size at rest. */
test.describe("on a phone on its side", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  for (const [width, height] of [[844, 390], [932, 430], [667, 375]]) {
    test(`at ${width} × ${height}, the creature keeps a sensible size while it listens and speaks, and is drawn whole`, async ({ page }) => {
      test.setTimeout(300_000);
      const where = `${width} × ${height}`;
      const stage = await open(page, { width, height, app: false });
      await page.evaluate(startVoice);
      // at rest: the creature in its plain pose, as large as the tile lets it be
      expect(await page.evaluate(putState, { mood: "idle" }), `${where}: the stage shows it at rest`).toBe(true);
      await settled(page, stage);
      const rest = await creatureSize(stage);
      expect(rest.height / rest.tile, `${where}: at rest, a creature of some size on the stage`).toBeGreaterThan(0.1);
      for (const mood of ["listening", "speaking"]) {
        expect(await page.evaluate(putState, { mood }), `${where}: the stage shows ${mood}`).toBe(true);
        await settled(page, stage);
        for (let n = 0; n < 3; n++) {
          await stageWhole(page, stage, `${where}, ${mood}, read ${n + 1}`, 500);
          const turn = await creatureSize(stage);
          expect(turn.height / turn.tile, `${where}, ${mood}: its height (${turn.height.toFixed(1)} px) at least 15% of the tile's (${turn.tile.toFixed(0)} px) or more`).toBeGreaterThanOrEqual(0.15);
          expect(turn.height / rest.height, `${where}, ${mood}: its height (${turn.height.toFixed(1)} px) at least 55% of what it is at rest (${rest.height.toFixed(1)} px)`).toBeGreaterThanOrEqual(0.55);
          // the card it makes room for is the one the type was sized to: at most 42% of the tile (a px of rounding aside)
          expect(turn.agentCard, `${where}: the agent's card (${turn.agentCard} px) takes no more than 42% of the tile`).toBeLessThanOrEqual(0.42 * turn.tile + 1);
          await page.waitForTimeout(150);
        }
      }
    });
  }
});

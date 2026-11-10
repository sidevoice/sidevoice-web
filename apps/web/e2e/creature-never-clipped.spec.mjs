import { expect, test } from "@playwright/test";
import { installHarness, stageFramed } from "./harness.mjs";

// Each case loads the room and waits for the creature's reach to be measured: a software GL takes its time over it.
test.describe.configure({ timeout: 150_000 });

/* A creature is never cut at the edge of what it is drawn in, at any size or shape of window (operator, 2026-11-10: in the
 * desktop app's tall, narrow window a conversation's creature was sliced by a hard vertical edge, headphone cup and shadow
 * alike; narrower still, the stage showed no creature at all). Here the room runs at tall and narrow, short and wide windows as the
 * desktop app runs it (its host injected, a fine pointer), and on phones (touch), with the drawings moving (`sidevoice.motion`: as
 * on a GPU, so the stage's canvas is cropped to the creature), and what is drawn is read back from the pixels once the creature's
 * reach is measured (its canvas's `data-reach`): the stage's creature is there, on a canvas with a box inside its tile, and nothing it
 * draws touches that canvas's edges, either way; every conversation's face in the list, the rail or the header is painted, and none
 * touches the edges of its own square. A browser that draws no creature fails here: there is nothing to check whole. */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

/** In the page: what `canvas` draws, from its pixels (its alpha), and where it is. */
function drawn(canvas) {
  const box = canvas.getBoundingClientRect(), { width: W, height: H } = canvas;
  const out = { box: { x: box.x, y: box.y, w: box.width, h: box.height }, W, H, count: 0, l: W, r: -1, t: H, b: -1 };
  if (!W || !H) return out;
  const d = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { out.count++; if (x < out.l) out.l = x; if (x > out.r) out.r = x; if (y < out.t) out.t = y; if (y > out.b) out.b = y; }
  return out;
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
  // The framing on what was measured eases in: drawn a frame or two after it lands (the canvas says so while it eases: data-easing),
  // then settled.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect.poll(() => stage.evaluate((c) => !c.hasAttribute("data-easing")), { timeout: 30_000, message: "the framing settled" }).toBe(true);
  await page.evaluate(`window.__drawn = ${drawn}`);
  return stage;
}

async function whole(page, stage) {
  const tile = await page.locator(".stage-tile[data-mood]").boundingBox();
  const s = await stage.evaluate((canvas) => window.__drawn(canvas));
  // drawn: a canvas with a box and pixels, and a creature on it
  expect(s.W * s.H, "the canvas has pixels").toBeGreaterThan(0);
  expect(s.box.w * s.box.h, "the canvas has a box").toBeGreaterThan(0);
  expect(s.count, "the creature is drawn").toBeGreaterThan(500);
  // inside its tile (its border's px aside), and nothing it draws at its canvas's edges, either way
  expect(s.box.x).toBeGreaterThanOrEqual(tile.x - 0.5);
  expect(s.box.x + s.box.w).toBeLessThanOrEqual(tile.x + tile.width + 0.5);
  expect(s.box.y).toBeGreaterThanOrEqual(tile.y - 0.5);
  expect(s.box.y + s.box.h).toBeLessThanOrEqual(tile.y + tile.height + 0.5);
  expect({ left: s.l > 0, top: s.t > 0, right: s.r < s.W - 1, bottom: s.b < s.H - 1 }, "clear of the canvas's edges").toEqual({ left: true, top: true, right: true, bottom: true });
  // the conversations' faces: every one shown is painted, and none touches its square's edges
  const faces = page.locator(".conversation-avatar canvas");
  const shown = () => faces.evaluateAll((all) => all.filter((c) => c.getClientRects().length).map((c) => (c.width ? window.__drawn(c).count : 0)));
  await expect.poll(async () => { const counts = await shown(); return counts.length > 0 && counts.every((n) => n > 0); }, { timeout: 20_000, message: "faces are shown, and every one is painted" }).toBe(true);
  for (const f of await faces.evaluateAll((all) => all.filter((c) => c.getClientRects().length).map((c) => window.__drawn(c))))
    expect({ left: f.l > 0, top: f.t > 0, right: f.r < f.W - 1, bottom: f.b < f.H - 1 }, "a face clear of its square's edges").toEqual({ left: true, top: true, right: true, bottom: true });
}

for (const [width, height] of [[1170, 2000], [740, 2000], [500, 1400], [360, 1200], [1600, 500], [1280, 800]]) {
  test(`in the desktop app at ${width} × ${height}, the creature is drawn whole, inside its tile, and no face is cut`, async ({ page }) => {
    await whole(page, await open(page, { width, height, app: true }));
  });
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  for (const [width, height] of [[360, 640], [390, 844], [320, 568], [844, 390]]) {
    test(`at ${width} × ${height}, the creature is drawn whole, inside its tile, and no face is cut`, async ({ page }) => {
      await whole(page, await open(page, { width, height, app: false }));
    });
  }
});

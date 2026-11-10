import { expect, test } from "@playwright/test";
import { installHarness, stageFramed } from "./harness.mjs";

// Each case loads the room and waits for the stage's framing: a software GL takes its time over it.
test.describe.configure({ timeout: 120_000 });

/* A creature is never cut at the edge of what it is drawn in, at any size or shape of window (operator, 2026-11-10: in the
 * desktop app's tall, narrow window a conversation's creature was sliced by a hard vertical edge, headphone cup and shadow
 * alike; narrower still, the stage showed no creature at all). Here the room runs as the desktop app runs it (its host
 * injected) with the drawings moving (`sidevoice.motion`: as on a GPU, so the stage's canvas is cropped to the creature), at
 * tall and narrow, phone-wide and short and wide windows, and what is drawn is read back from the pixels: the stage's creature is
 * there, on a canvas inside its tile, and nothing it draws touches that canvas's edges; no conversation's face in the list, the
 * rail or the header touches the edges of its own. */

const SIZES = [[1170, 2000], [740, 2000], [500, 1400], [360, 1200], [1600, 500], [1280, 800]];
const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

/** The room at `width` × `height` in the desktop app, its first conversation on the stage, its framing solved. */
async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    window.__sidevoiceHost = { host: { build: { channel: "release", version: "0.0.0-e2e" } } };
    localStorage.setItem("sidevoice.motion", "gpu");
  });
  // several conversations: each rolls its creature (body, hat, ears), so each run checks a few more of them
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core"), ...["t2", "t3", "t4", "t5", "t6", "t7", "t8"].map((id) => conversation(id, "project-" + id))] } });
  await page.goto("/voice/");
  // A wide window lists the conversations; a narrower one keeps them in a rail; a phone-wide one in its header.
  const row = page.locator("#participants").getByText("sidevoice-core").first();
  const picker = page.locator(".header-avatar:visible, button.person:visible").first();
  await Promise.race([row.waitFor({ state: "visible", timeout: 10_000 }).catch(() => null), picker.waitFor({ state: "visible", timeout: 10_000 }).catch(() => null)]);
  if (await row.isVisible()) await row.click(); else await picker.click();
  await page.locator(".stage-tile[data-mood] .stage-agent[data-style=creature] > canvas").waitFor({ state: "attached" });
  await stageFramed(page);
}

/** In the page: what `canvas` draws, from its pixels (its alpha), and where it is. */
function drawn(canvas) {
  const box = canvas.getBoundingClientRect(), { width: W, height: H } = canvas;
  const out = { box: { x: box.x, y: box.y, w: box.width, h: box.height }, W, H, count: 0, l: W, r: -1, t: H, b: -1 };
  if (!W || !H) return out;
  const d = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { out.count++; if (x < out.l) out.l = x; if (x > out.r) out.r = x; if (y < out.t) out.t = y; if (y > out.b) out.b = y; }
  return out;
}

for (const [width, height] of SIZES) {
  test(`at ${width} × ${height}, the creature is drawn whole, inside its tile, and no face is cut`, async ({ page }) => {
    await open(page, width, height);
    test.skip(!await page.evaluate(() => !!document.createElement("canvas").getContext("webgl")), "no WebGL here: the fallback stands in for the creature");
    // what it acts out round it settles a moment after the framing
    await page.waitForTimeout(800);
    const tile = await page.locator(".stage-tile[data-mood]").boundingBox();
    await page.evaluate(`window.__drawn = ${drawn}`);
    const stage = await page.locator(".stage-tile[data-mood] .stage-agent[data-style=creature] > canvas").evaluate((canvas) => window.__drawn(canvas));
    // drawn: a canvas with pixels, and a creature on it
    expect(stage.W).toBeGreaterThan(0);
    expect(stage.H).toBeGreaterThan(0);
    expect(stage.box.w).toBeGreaterThan(0);
    expect(stage.box.h).toBeGreaterThan(0);
    expect(stage.count).toBeGreaterThan(500);
    // inside its tile (its border's px aside), and nothing it draws at its canvas's edges
    expect(stage.box.x).toBeGreaterThanOrEqual(tile.x - 0.5);
    expect(stage.box.x + stage.box.w).toBeLessThanOrEqual(tile.x + tile.width + 0.5);
    expect(stage.box.y).toBeGreaterThanOrEqual(tile.y - 0.5);
    expect(stage.box.y + stage.box.h).toBeLessThanOrEqual(tile.y + tile.height + 0.5);
    expect(stage.l).toBeGreaterThan(0);
    expect(stage.t).toBeGreaterThan(0);
    expect(stage.r).toBeLessThan(stage.W - 1);
    expect(stage.b).toBeLessThan(stage.H - 1);
    // the conversations' faces (the list's cards, the rail's, the header's): none touches its square's edges
    const faces = await page.locator(".conversation-avatar canvas").evaluateAll((canvases) => canvases.filter((c) => c.getClientRects().length && c.width).map((c) => window.__drawn(c)));
    for (const face of faces.filter((f) => f.count > 0)) {
      expect(face.l).toBeGreaterThan(0);
      expect(face.t).toBeGreaterThan(0);
      expect(face.r).toBeLessThan(face.W - 1);
      expect(face.b).toBeLessThan(face.H - 1);
    }
  });
}

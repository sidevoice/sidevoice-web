import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* On a phone the stage fills the screen in portrait: what is said on it (the agent's reply, the person's pill with Cancel
 * sending, its transcribing, what was sent), laid under the creature by the stage's framing, must never cover the
 * creature (a gap from its lowest drawn row, its shadow included: max(14px, 3.5% of the tile's height)), and each card
 * stays inside the tile. The tooltips of the call bar and the header open beside their trigger, inside the viewport and
 * the safe areas. Measured in real browsers at the phone sizes (440 × 956, 390 × 844), light and dark; the desktop's
 * layout is left as it was (SCREENSHOTS=<dir> also writes the stage as a picture, for a review). */

const SHOTS = process.env.SCREENSHOTS;
const THREAD = "t1";
const REPLY = "I found the failing setting and fixed it. The tests pass now, and the change is in the working tree for you to look at.";
const conversation = { thread_id: THREAD, title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

/** What each state adds to the joined call, in the order it happens: one set of facts each, patched over the last. */
const draft = (key) => ({ segment: "u", thread: key, role: "user", text: "", name: "", time: Date.now(), session: "s1", seq: 1, draft: true });
const listening = (key) => ({ userLive: true, userTurn: { id: "u", segment: "u", thread: key }, pendingPhase: "listening", history: [draft(key)] });
const transcribing = (key) => ({ ...listening(key), pendingPhase: "transcribing" });
// What was heard, sent: the bars gone, the person's words in their place (PersonTurn's SentBubble, a moment on the stage).
const sent = (key) => ({ userLive: false, userTurn: null, pendingPhase: "", pendingText: "",
  history: [{ ...draft(key), segment: "u-sent", text: "Run the tests and tell me what fails.", draft: false, delivery: "delivered" }] });
const working = (key) => ({ harness: { [key]: true }, workingSince: { [key]: 0 }, now: 60_000 });
const STATES = {
  idle: [],
  listening: [listening],
  transcribing: [transcribing],
  sent: [listening, sent],
  speaking: [(key) => ({ botLive: true, karaokeState: { segment: "h-1", from: 0, to: 60 },
    history: [{ segment: "h-1", thread: key, role: "assistant", text: REPLY, name: "sidevoice-web", time: Date.now(), session: "s1", seq: 1, audio: "playing" }] })],
  working: [working],
  // The agent at its desk (or resting), the person's turn over it.
  "working-listening": [working, listening],
  "working-sent": [working, listening, sent],
};

/** The stage's framing settled: solved (the layer says so where the browser draws the creature) and the creature standing
 *  still there (its feet, as the framing keeps them, unchanged a moment). The cards go straight to where it will stand. */
async function settled(page) {
  await page.locator(".stage-tile .stage-voice[data-framed]").waitFor({ timeout: 60_000 }).catch(() => {});
  let last = null;
  for (let i = 0, same = 0; i < 80 && same < 3; i++) {
    const now = await page.evaluate(() => document.querySelector(".stage-tile .stage-canvas")?.style.getPropertyValue("--stage-feet") ?? "");
    same = now === last ? same + 1 : 0; last = now;
    await page.waitForTimeout(300);
  }
}

async function onStage(page, theme, state, { held = false } = {}) {
  await installHarness(page, { participants: { first: [conversation] } });
  // The call below is the page's own state, not a room's: the room would answer its binding poll (/api/presentation,
  // on the beat and after the pick) with no binding, and the page would take the call as ended by it and clear the
  // binding the balloon is drawn for, a moment after it was set. Nothing answers that poll here.
  await page.route((url) => url.pathname === "/api/presentation", (route) => route.abort());
  await page.goto("/voice/");
  await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
  const narrow = await page.evaluate(() => matchMedia("(max-width: 899px)").matches);
  if (narrow) await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
  await page.waitForFunction(() => !!window.sidevoiceUI?.store);
  // The call, joined, on the machine the conversation is on; then the state's own facts.
  const key = await page.evaluate(() => {
    const { store } = window.sidevoiceUI;
    const person = store.getState().facts.people.find((p) => p.thread_id === "t1");
    store.patch({ ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
      roomBinding: { thread_id: "t1", title: "sidevoice-web" }, sessionId: "s1", callNode: person.node, micEnabled: true, userLive: false, botLive: false,
      voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" } });
    return `${person.node}|t1`;
  });
  await page.evaluate((insets) => {
    for (const [side, px] of Object.entries(insets)) document.documentElement.style.setProperty(`--sv-inset-${side}`, `calc(${px}px + 0px)`);
  }, INSETS);
  for (const [i, facts] of STATES[state].entries()) {
    if (state.endsWith("sent") && i === STATES[state].length - 1) await settled(page);
    await page.evaluate((facts) => window.sidevoiceUI.store.patch(facts), facts(key));
    // The turns' hooks read each step as they render it (a sent turn is shown only after the bars were).
    await page.waitForTimeout(250);
  }
  // Where a state has one, its balloon is up before it is measured (a slow runner takes its time), and it pops in over
  // 460ms: measure it where it stands.
  if (state !== "idle" && state !== "working") await page.locator(".stage-tile .stage-voice > .vcap:not(.meas)").first().waitFor({ timeout: 10_000, state: held ? "attached" : "visible" });
  // What was sent shows PAGE_MS: measured as it lands, the framing having settled while the person spoke (above).
  if (state.endsWith("sent")) await page.waitForTimeout(300);
  else { await page.waitForTimeout(900); await settled(page); }
}

/** The boxes on the stage, in the page's own pixels, and the creature as drawn under them: its canvas's drawn pixels inside
 *  each card, and the gap from a card's top to the lowest drawn row above it (none where the browser gives no WebGL). */
/** The gap a card keeps to the creature: max(14 px, 3.5% of the tile), a px and a half of rounding. What the person sent
 *  lands where their pill was (it pops out of it, as the design reference has it) while the agent may rest or work by then,
 *  a pose that can reach a few px lower than the one the turn was fitted on: never touching, 14 px at least (the gap's
 *  floor; recorded for the human). */
const need = (state, tileHeight) => state.endsWith("sent") ? 14 - 0.5 : Math.max(14, tileHeight * 0.035) - 1.5;

/** Whether this browser gives the page WebGL (the creature needs it; without it its fallback stands in). */
const webgl = (page) => page.evaluate(() => !!document.createElement("canvas").getContext("webgl"));

/** Every animation frame for `ms` after `facts` are patched in: each card seen (its pop-in transform included; one held
 *  unseen is skipped), whether the creature's canvas has anything drawn, the creature's drawn pixels under the card, the
 *  gap from its top to the lowest drawn row above it, and whether it is inside the tile. */
const sampleTransition = (page, facts, ms) => page.evaluate(([facts, ms]) => new Promise((done) => {
  const out = [], t0 = performance.now();
  window.sidevoiceUI.store.patch(facts);
  const sample = () => {
    const t = performance.now() - t0, cv = document.querySelector(".stage-agent canvas"), g = cv?.width ? cv.getContext("2d") : null;
    const tile = document.querySelector(".stage-tile"), tr = tile.getBoundingClientRect(), inner = { top: tr.top + tile.clientTop, bottom: tr.top + tile.clientTop + tile.clientHeight };
    if (g) {
      const vr = cv.getBoundingClientRect(), k = cv.width / vr.width, W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
      let drawn = false; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 16) { drawn = true; break; }
      for (const card of document.querySelectorAll(".stage-tile .stage-voice > .vcap:not(.meas)")) {
        const er = card.getBoundingClientRect(), style = getComputedStyle(card);
        if (!er.width || style.visibility === "hidden" || +style.opacity < 0.05) continue;
        const x0 = Math.max(0, Math.floor((er.left - vr.left) * k)), x1 = Math.min(W, Math.ceil((er.right - vr.left) * k)), y0 = Math.max(0, Math.floor((er.top - vr.top) * k)), y1 = Math.min(H, Math.ceil((er.bottom - vr.top) * k));
        let over = 0, low = -1;
        for (let y = 0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] > 16) { if (y >= y0) over++; else if (y > low) low = y; }
        out.push({ t: Math.round(t), drawn, over, gap: low < 0 ? null : (y0 - low) / k, inside: er.top >= inner.top - 0.5 && er.bottom <= inner.bottom + 0.5 });
      }
    }
    if (t < ms) requestAnimationFrame(sample); else done(out);
  };
  requestAnimationFrame(sample);
}), [facts, ms]);

const measure = (page) => page.evaluate(() => {
  const box = (node) => { if (!node) return null; const { left, top, right, bottom, width, height } = node.getBoundingClientRect(); return width && height ? { left, top, right, bottom, width, height } : null; };
  const tile = document.querySelector(".stage-tile"), canvas = document.querySelector(".stage-agent canvas");
  const cards = [...document.querySelectorAll(".stage-tile .stage-voice > .vcap:not(.meas)")].map((node) => ({ kind: node.className, ...box(node) })).filter((b) => b.width);
  let drawn = null;
  const g = canvas?.width ? canvas.getContext("2d") : null;
  if (g) {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width, d = g.getImageData(0, 0, canvas.width, canvas.height).data, W = canvas.width;
    let any = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 16) { any = 1; break; }
    if (any) drawn = cards.map((c) => {
      const x0 = Math.max(0, Math.floor((c.left - r.left) * k)), x1 = Math.min(W, Math.ceil((c.right - r.left) * k)), y0 = Math.max(0, Math.floor((c.top - r.top) * k)), y1 = Math.min(canvas.height, Math.ceil((c.bottom - r.top) * k));
      let over = 0, low = -1;
      for (let y = 0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] > 16) { if (y >= y0) over++; else if (y > low) low = y; }
      return { over, gap: low < 0 ? null : (y0 - low) / k };
    });
  }
  let creature = null;
  if (g) {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width, W = canvas.width, H = canvas.height, d = g.getImageData(0, 0, W, H).data;
    let y0 = H, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 16) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (y1 >= 0) creature = { top: r.top + y0 / k, bottom: r.top + y1 / k };
  }
  return { viewport: { width: innerWidth, height: innerHeight }, tile: box(tile), tileHeight: tile.clientHeight, balloons: cards, drawn, creature };
});

for (const [name, viewport] of [["440x956", { width: 440, height: 956 }], ["390x844", { width: 390, height: 844 }]]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${name} ${theme}`, () => {
      test.use({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

      for (const state of Object.keys(STATES)) {
        test(`${state}: the balloon keeps clear of the agent's face and inside the tile`, async ({ page }) => {
          await onStage(page, theme, state);
          if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${theme}-${state}.png`) }); }
          const m = await measure(page);
          if (state !== "idle" && state !== "working") expect(m.balloons.length, "a card is up").toBeGreaterThan(0);
          if (state.endsWith("sent")) expect(await page.locator(".stage-tile .stage-voice > .vcap.sent:not(.meas)").count(), "what was sent is on the stage").toBe(1);
          // The creature as drawn: none of it under a card, and a gap over each (where the browser gives WebGL, it is drawn).
          if (await webgl(page) && m.balloons.length) expect(m.drawn, "the creature is drawn under the cards").not.toBeNull();
          for (const [i, drawn] of (m.drawn ?? []).entries()) {
            expect(drawn.over, `${m.balloons[i].kind}: the creature's pixels under it`).toBe(0);
            if (drawn.gap != null) expect(drawn.gap, `${m.balloons[i].kind}: the gap to the creature`).toBeGreaterThanOrEqual(need(state, m.tileHeight));
          }
          for (const balloon of m.balloons) {
            expect(balloon.left, "inside the tile, left").toBeGreaterThanOrEqual(m.tile.left - 0.5);
            expect(balloon.right, "inside the tile, right").toBeLessThanOrEqual(m.tile.right + 0.5);
            expect(balloon.top, "inside the tile, top").toBeGreaterThanOrEqual(m.tile.top - 0.5);
            expect(balloon.bottom, `inside the tile, bottom ${JSON.stringify({ balloon, tile: m.tile })}`).toBeLessThanOrEqual(m.tile.bottom + 0.5);
          }
        });
      }

      test("the tooltips open beside their trigger, inside the screen and its safe areas", async ({ page }) => {
        await onStage(page, theme, "idle");
        // A phone with a keyboard (or a screen reader's focus) opens each control's tooltip as focus reaches it: walk the
        // page's tab order, from the header to the call bar, and measure each as it opens.
        await page.evaluate(() => document.activeElement?.blur());
        const vp = page.viewportSize();
        let opened = 0;
        for (let step = 0; step < 40; step++) {
          await page.keyboard.press("Tab");
          const tip = page.locator(".ui-tooltip").first();
          if (!await tip.isVisible()) continue;
          const tipBox = await tip.boundingBox();
          const triggerBox = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
          opened++;
          if (SHOTS && opened <= 12) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${theme}-tooltip-${opened}.png`) }); }
          // Next to the trigger: its edge a few px off the trigger's on the side it opens along.
          const gapX = Math.max(0, triggerBox.x - (tipBox.x + tipBox.width), tipBox.x - (triggerBox.x + triggerBox.width));
          const gapY = Math.max(0, triggerBox.y - (tipBox.y + tipBox.height), tipBox.y - (triggerBox.y + triggerBox.height));
          const where = JSON.stringify({ tip: tipBox, trigger: triggerBox });
          expect(Math.max(gapX, gapY), `next to its trigger ${where}`).toBeLessThanOrEqual(16);
          expect(tipBox.x, `left safe area ${where}`).toBeGreaterThanOrEqual(INSETS.left - 0.5);
          expect(tipBox.x + tipBox.width, `right safe area ${where}`).toBeLessThanOrEqual(vp.width - INSETS.right + 0.5);
          expect(tipBox.y, `top safe area (under the status bar) ${where}`).toBeGreaterThanOrEqual(INSETS.top - 0.5);
          expect(tipBox.y + tipBox.height, `bottom safe area (over the home indicator) ${where}`).toBeLessThanOrEqual(vp.height - INSETS.bottom + 0.5);
        }
        expect(opened, "tooltips opened as focus walked the page").toBeGreaterThan(3);
      });
    });
  }
}

/* A phone on its side (844 × 390: a tile far wider than tall). The design reference has no landscape phone: the tile takes
 * the desktop's framing and card rules (StageVoice), so the creature stays on the stage, smaller, the cards clear of it. */
test.describe("844x390 landscape", () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  for (const state of ["idle", "speaking", "listening"]) {
    test(`${state}: the creature stays on the stage and no card covers it`, async ({ page }) => {
      // a card that cannot fit under the creature in so short a tile waits unseen: never over it, never out of the tile
      await onStage(page, "light", state, { held: true });
      const m = await measure(page);
      if (await webgl(page)) {
        expect(m.creature, "the creature is drawn").not.toBeNull();
        expect(m.creature.top, "its top on the stage").toBeGreaterThanOrEqual(m.tile.top - 0.5);
        expect(m.creature.bottom, "its foot on the stage").toBeLessThanOrEqual(m.tile.bottom + 0.5);
      }
      for (const [i, drawn] of (m.drawn ?? []).entries()) expect(drawn.over, `${m.balloons[i].kind}: the creature's pixels under it`).toBe(0);
      for (const balloon of m.balloons) expect(balloon.bottom, "inside the tile").toBeLessThanOrEqual(m.tile.bottom + 0.5);
    });
  }
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const state of ["listening", "transcribing", "sent", "working-listening"]) {
    test(`${state}: the person's card is centred under the creature and clear of it, and the agent's box does not move`, async ({ page }) => {
      await onStage(page, "light", state);
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `1280x800-light-${state}.png`) }); }
      const m = await measure(page);
      expect(m.balloons.length).toBe(1);
      const [card] = m.balloons;
      // Centred on the tile, under the creature (the design reference's 'place': both turns below it).
      expect(Math.abs((card.left + card.right) / 2 - (m.tile.left + m.tile.right) / 2), JSON.stringify({ card, tile: m.tile })).toBeLessThanOrEqual(1.5);
      expect(card.bottom, "inside the tile").toBeLessThanOrEqual(m.tile.bottom + 0.5);
      for (const drawn of m.drawn ?? []) {
        expect(drawn.over, "the creature's pixels under the card").toBe(0);
        if (drawn.gap != null) expect(drawn.gap, "the gap to the creature").toBeGreaterThanOrEqual(need(state, m.tileHeight));
      }
      // The stage's framing moves the creature by its camera: its box never moves.
      const agent = await page.evaluate(() => getComputedStyle(document.querySelector(".stage-agent")).translate);
      expect(["none", "0px", "0px 0px"]).toContain(agent);
    });
  }

  // At rest a desktop's creature stands closer; the first card after it comes in while it steps back: never over it, the
  // gap kept, from the card's first visible frame to the framing settled.
  for (const state of ["speaking", "listening"]) {
    test(`the first card after rest (${state}) keeps clear of the creature while it steps back for it`, async ({ page }) => {
      await onStage(page, "light", "idle");
      await settled(page);
      const key = await page.evaluate(() => { const person = window.sidevoiceUI.store.getState().facts.people.find((p) => p.thread_id === "t1"); return `${person.node}|t1`; });
      const samples = await sampleTransition(page, STATES[state].at(-1)(key), 2500);
      const tileHeight = await page.evaluate(() => document.querySelector(".stage-tile").clientHeight);
      const drawn = await webgl(page);
      if (drawn) expect(samples.length, "the card seen over the creature's canvas").toBeGreaterThan(0);
      for (const s of samples) {
        if (drawn) expect(s.drawn, `${s.t} ms: the creature is drawn`).toBe(true);
        expect(s.inside, `${s.t} ms: the card inside the tile`).toBe(true);
        expect(s.over, `${s.t} ms: the creature's pixels under the card`).toBe(0);
        if (s.gap != null) expect(s.gap, `${s.t} ms: the gap to the creature`).toBeGreaterThanOrEqual(Math.max(14, tileHeight * 0.035) - 1.5);
      }
    });
  }
});

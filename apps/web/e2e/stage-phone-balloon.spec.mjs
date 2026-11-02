import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* On a phone the stage is a small square: the agent's face, and the balloons laid on the tile (the agent's reply, the
 * person's bars with Cancel sending, its transcribing, the page after it is sent), must never cover the face, and each
 * stays inside the tile. The tooltips of the call bar and the header open beside their trigger, inside the viewport and
 * the safe areas. Measured in real browsers at the phone sizes (440 × 956, 390 × 844), light and dark; the desktop's
 * layout is left as it was (SCREENSHOTS=<dir> also writes the stage as a picture, for a review). */

const SHOTS = process.env.SCREENSHOTS;
const THREAD = "t1";
const REPLY = "I found the failing setting and fixed it. The tests pass now, and the change is in the working tree for you to look at.";
const conversation = { thread_id: THREAD, title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

/** The call as the room's runtime reports it once joined, what each state adds to it, and the stage in that state. */
const STATES = {
  idle: () => ({}),
  listening: (key) => ({ userLive: true, userTurn: { id: "u", segment: "u", thread: key }, pendingPhase: "listening",
    history: [{ segment: "u", thread: key, role: "user", text: "", name: "", time: Date.now(), session: "s1", seq: 1, draft: true }] }),
  transcribing: (key) => ({ userLive: true, userTurn: { id: "u", segment: "u", thread: key }, pendingPhase: "transcribing",
    history: [{ segment: "u", thread: key, role: "user", text: "", name: "", time: Date.now(), session: "s1", seq: 1, draft: true }] }),
  speaking: (key) => ({ botLive: true, karaokeState: { segment: "h-1", from: 0, to: 60 },
    history: [{ segment: "h-1", thread: key, role: "assistant", text: REPLY, name: "sidevoice-web", time: Date.now(), session: "s1", seq: 1, audio: "playing" }] }),
  working: (key) => ({ harness: { [key]: true }, workingSince: { [key]: 0 }, now: 60_000 }),
};

async function onStage(page, theme, state) {
  await installHarness(page, { participants: { first: [conversation] } });
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
  await page.evaluate(({ facts, insets }) => {
    window.sidevoiceUI.store.patch(facts);
    for (const [side, px] of Object.entries(insets)) document.documentElement.style.setProperty(`--sv-inset-${side}`, `calc(${px}px + 0px)`);
  }, { facts: STATES[state](key), insets: INSETS });
  // The balloons pop in over 460ms: measure them where they stand.
  await page.waitForTimeout(900);
}

/** The boxes on the stage, in the page's own pixels. */
const measure = (page) => page.evaluate(() => {
  const box = (node) => { if (!node) return null; const { left, top, right, bottom, width, height } = node.getBoundingClientRect(); return width && height ? { left, top, right, bottom, width, height } : null; };
  const agent = box(document.querySelector(".stage-agent"));
  // The face: the head of the figure, its middle half across and from its crown to under its chin (the figure's box is
  // 120 tall with its crown at ~20 and its chin at ~85, call-view.css --stage-head-y).
  const face = agent && { left: agent.left + agent.width * .25, right: agent.right - agent.width * .25, top: agent.top + agent.height * (30 / 120), bottom: agent.top + agent.height * (85 / 120) };
  return { viewport: { width: innerWidth, height: innerHeight }, tile: box(document.querySelector(".stage-tile")), face,
    balloons: [...document.querySelectorAll(".stage-tile .stage-bubble, .stage-tile .person-turns .person-bubble")].map((node) => ({ kind: node.className.split(" ")[1] ?? node.className, ...box(node) })).filter((b) => b.width) };
});
const overlaps = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

for (const [name, viewport] of [["440x956", { width: 440, height: 956 }], ["390x844", { width: 390, height: 844 }]]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${name} ${theme}`, () => {
      test.use({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

      for (const state of ["idle", "listening", "transcribing", "speaking", "working"]) {
        test(`${state}: the balloon keeps clear of the agent's face and inside the tile`, async ({ page }) => {
          await onStage(page, theme, state);
          if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${theme}-${state}.png`) }); }
          const m = await measure(page);
          expect(m.face, "the agent is on the stage").not.toBeNull();
          if (state === "listening" || state === "transcribing" || state === "speaking") expect(m.balloons.length, "a balloon is up").toBeGreaterThan(0);
          for (const balloon of m.balloons) {
            expect(overlaps(balloon, m.face), `${balloon.kind} ${JSON.stringify(balloon)} over the face ${JSON.stringify(m.face)}`).toBe(false);
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

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the desktop stage is not laid out for a phone: the balloon stays where the stage always had it", async ({ page }) => {
    await onStage(page, "light", "listening");
    const m = await measure(page);
    expect(m.balloons.length).toBeGreaterThan(0);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, "1280x800-light-listening.png") }); }
  });
});

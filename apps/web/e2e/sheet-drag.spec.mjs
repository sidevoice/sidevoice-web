import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* A phone's sheets follow the finger (lib/use-sheet-drag.ts): the transcript is dragged down by its grabber or title, or
 * by its messages scrolled to the top; let go past a third of its height or flicked, it closes, short of that it springs
 * back; the messages scrolled away from the top keep their own scroll. The conversations list goes back up the same
 * way. The engines under test take no scripted touch drag, so the drag is dispatched as the engine would: Pointer
 * Events (a touch pointer) on the handle, Touch Events on the content, a frame apart, timed. */

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

const conversation = { thread_id: "t1", title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

async function joined(page) {
  await installHarness(page, { participants: { first: [conversation] } });
  await page.goto("/voice/");
  await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

async function openTranscript(page) {
  await page.locator("#transcript-toggle").click();
  await expect(page.locator("#transcript[data-open]")).toBeVisible();
  // Risen: the sheet is 76% of the screen tall (the creature redesign's transcript), its top a quarter of the way down.
  await expect.poll(() => page.locator("#transcript").evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(844 * 0.25);
}

/** Drags from the middle of `selector` by `dy` px in `steps` moves `stepMs` apart, holds `holdMs`, and lets go.
 *  `kind` "pointer" (a touch pointer) or "touch" (Touch Events). Resolves with what the drag saw: the sheet's transform
 *  midway (`during`) and whether any move was cancelled (`prevented`). */
function drag(page, selector, dy, { steps = 12, stepMs = 16, holdMs = 0, kind = "pointer", sheet = "#transcript" } = {}) {
  return page.evaluate(async ({ selector, dy, steps, stepMs, holdMs, kind, sheet }) => {
    const target = document.querySelector(selector);
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2, y0 = box.top + Math.min(box.height / 2, 10);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let prevented = false, during = null;
    const send = (type, y) => {
      if (kind === "pointer") {
        const event = new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true, composed: true });
        target.dispatchEvent(event);
        prevented ||= type === "pointermove" && event.defaultPrevented;
      } else {
        const end = type === "touchend";
        let event;
        try {
          const touch = new Touch({ identifier: 3, target, clientX: x, clientY: y });
          event = new TouchEvent(type, { touches: end ? [] : [touch], targetTouches: end ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true, composed: true });
        } catch {
          // An engine whose Touch cannot be made by a script (WebKit's): an event of the same type carrying the same lists.
          const touch = { identifier: 3, target, clientX: x, clientY: y };
          event = new Event(type, { bubbles: true, cancelable: true, composed: true });
          for (const [name, list] of [["touches", end ? [] : [touch]], ["targetTouches", end ? [] : [touch]], ["changedTouches", [touch]]]) Object.defineProperty(event, name, { value: list });
        }
        target.dispatchEvent(event);
        prevented ||= type === "touchmove" && event.defaultPrevented;
      }
    };
    const [down, moveType, up] = kind === "pointer" ? ["pointerdown", "pointermove", "pointerup"] : ["touchstart", "touchmove", "touchend"];
    send(down, y0);
    for (let i = 1; i <= steps; i++) {
      await wait(stepMs);
      send(moveType, y0 + (dy * i) / steps);
      if (i === Math.ceil(steps / 2)) during = document.querySelector(sheet).style.transform;
    }
    if (holdMs) { await wait(holdMs); send(moveType, y0 + dy); }
    const before = document.querySelector(sheet).style.transform;
    send(up, y0 + dy);
    return { prevented, during, before };
  }, { selector, dy, steps, stepMs, holdMs, kind, sheet });
}

const settled = (page, selector) => expect.poll(() => page.locator(selector).evaluate((node) => node.getAttribute("style") ?? "")).not.toContain("transform");

test.describe("the transcript sheet, on a phone", () => {
  test.beforeEach(async ({ page }) => { await joined(page); await openTranscript(page); });

  test("dragged down by its grabber past the threshold, it follows the finger and closes", async ({ page }) => {
    const seen = await drag(page, ".transcript-grab", 360, { holdMs: 150 });
    expect(seen.during).toMatch(/translateY\(1\d\dpx\)/);
    await expect(page.locator("#transcript")).not.toHaveAttribute("data-open");
    await expect(page.locator(".transcript-scrim")).not.toHaveAttribute("data-open");
    await settled(page, "#transcript");
    await expect(page.locator("#transcript")).toBeHidden();
  });

  test("a short drag springs back and leaves it open", async ({ page }) => {
    const seen = await drag(page, ".transcript-head", 90, { holdMs: 150 });
    expect(seen.before).toBe("translateY(90px)");
    await settled(page, "#transcript");
    await expect(page.locator("#transcript")).toHaveAttribute("data-open", "true");
    expect(await page.locator("#transcript").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
    // The close button still takes a tap.
    await page.locator(".transcript-close").tap();
    await expect(page.locator("#transcript")).not.toHaveAttribute("data-open");
  });

  test("a short flick down closes it", async ({ page }) => {
    await drag(page, ".transcript-grab", 70, { steps: 4, stepMs: 16 });
    await expect(page.locator("#transcript")).not.toHaveAttribute("data-open");
  });

  test("pulled up, it resists and comes back", async ({ page }) => {
    const seen = await drag(page, ".transcript-grab", -300, { holdMs: 150 });
    const lifted = -Number(/translateY\((-?[\d.]+)px\)/.exec(seen.before)[1]);
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThan(80);
    await settled(page, "#transcript");
    await expect(page.locator("#transcript")).toHaveAttribute("data-open", "true");
  });

  test("the messages scroll as their own, away from the top; from the top they drag the sheet", async ({ page }) => {
    // Enough to scroll: a tall block at the end of the list, the list scrolled part-way down.
    await page.locator("#messages").evaluate((list) => {
      // In the messages' own column, where a message would be (the list is a column whose newest sits at its foot).
      const tall = document.createElement("div"); tall.id = "tall"; tall.style.height = "3000px"; tall.style.flex = "none";
      (list.querySelector(".messages-content") ?? list).append(tall); list.style.scrollBehavior = "auto"; list.scrollTop = 600;
    });
    const scrolled = await drag(page, "#tall", 300, { kind: "touch", holdMs: 150 });
    expect(scrolled.prevented).toBe(false);
    expect(scrolled.during).toBe("");
    await expect(page.locator("#transcript")).toHaveAttribute("data-open", "true");

    // Swiping up at the top is the list's too.
    await page.locator("#messages").evaluate((list) => { list.scrollTop = 0; });
    const up = await drag(page, "#tall", -200, { kind: "touch", holdMs: 150 });
    expect(up.prevented).toBe(false);
    await expect(page.locator("#transcript")).toHaveAttribute("data-open", "true");

    // Down from the top, the sheet's.
    await page.locator("#messages").evaluate((list) => { list.scrollTop = 0; });
    const pulled = await drag(page, "#tall", 360, { kind: "touch", holdMs: 150 });
    expect(pulled.prevented).toBe(true);
    await expect(page.locator("#transcript")).not.toHaveAttribute("data-open");
  });
});

test("on a phone the conversations list goes back up when pushed up by its title", async ({ page }) => {
  await joined(page);
  await page.locator("button.conversations-toggle").tap();
  const list = page.locator(".conversation-sidebar[data-open]");
  await expect(list).toBeVisible();
  await page.waitForTimeout(400);
  const short = await drag(page, ".conversation-sidebar .sidebar-head", -30, { holdMs: 150, sheet: ".conversation-sidebar" });
  expect(short.before).toBe("translateY(-30px)");
  await settled(page, ".conversation-sidebar");
  await expect(list).toBeVisible();
  await drag(page, ".conversation-sidebar .sidebar-head", -220, { holdMs: 150, sheet: ".conversation-sidebar" });
  await expect(page.locator(".conversation-sidebar")).not.toHaveAttribute("data-open");
});

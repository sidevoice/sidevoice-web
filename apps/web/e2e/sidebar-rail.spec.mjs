import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";
import { conversation } from "./motion-states.mjs";

/* Collapsing the desktop's conversations column into its rail changes its width alone (operator, 2026-11-07): every
 * creature stays at the height it had in the list, the machine's icon keeps its size, and the rail's expand button wears
 * the list's own conversations chip, at the same size. */

const people = Array.from({ length: 4 }, (_, i) => conversation(i + 1));

async function geometry(page) {
  return page.locator("#conversations").evaluate((aside) => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, height: Math.round(r.height * 10) / 10, width: Math.round(r.width * 10) / 10 }; };
    const visible = (el) => el.getClientRects().length > 0;
    const chip = [...aside.querySelectorAll(".sidebar-head .conversations-chip")].find(visible);
    return {
      head: box(aside.querySelector(".sidebar-head")),
      machineIcon: box(aside.querySelector(".sidebar-group-label svg")),
      rows: [...aside.querySelectorAll("#participants .participant-row")].map((row) => box(row)),
      avatars: [...aside.querySelectorAll("#participants .conversation-avatar")].map((avatar) => ({ top: box(avatar).top, height: box(avatar).height })),
      chip: chip && { height: box(chip).height, icon: box(chip.querySelector("svg")).height, count: chip.textContent },
    };
  });
}

test("the rail keeps every creature where the list had it, and the same chip and icons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installHarness(page, { participants: { first: people } });
  await page.addInitScript(() => localStorage.setItem("sidevoice.motion", "still"));
  await page.goto("/voice/");
  await page.locator("#participants .participant-row").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const aside = page.locator("#conversations");
  await expect(aside).not.toHaveAttribute("data-collapsed");
  const list = await geometry(page);
  expect(list.rows).toHaveLength(people.length);
  expect(list.chip).toEqual({ height: 20, icon: 14, count: String(people.length) });
  expect(list.machineIcon.height).toBe(16);

  await page.locator(".sidebar-collapse").click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  // The width animates; the heights must not move at any point, but compare once it has settled.
  await expect.poll(() => aside.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(100);
  const rail = await geometry(page);

  expect(rail.head).toEqual({ ...list.head, width: rail.head.width });
  expect(rail.machineIcon).toEqual(list.machineIcon);
  expect(rail.rows.map(({ top, height }) => ({ top, height }))).toEqual(list.rows.map(({ top, height }) => ({ top, height })));
  expect(rail.avatars).toEqual(list.avatars);
  expect(rail.chip).toEqual(list.chip);
});

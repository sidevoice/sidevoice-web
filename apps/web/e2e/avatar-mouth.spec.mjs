import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const call = readFileSync(new URL("../src/styles/call.css", import.meta.url), "utf8");
const engine = readFileSync(new URL("../src/styles/bichos.css", import.meta.url), "utf8");

test("output gaps rest the mouth and reduced motion freezes its open shape, even after a live toggle", async ({ page }) => {
  await page.setContent(`<style>${call}</style><style>${engine}</style>
    <span class="sv-avatar" data-style="bichos" data-mood="speaking" data-mouth="playback" style="--mouth:.9">
      <svg><g class="m-open"></g><g class="m-rest"></g></svg>
    </span>`);
  const avatar = page.locator(".sv-avatar");
  const mouth = avatar.locator(".m-open");
  const rest = avatar.locator(".m-rest");
  const style = async (element, property) => element.evaluate((node, name) => getComputedStyle(node)[name], property);
  expect(await style(mouth, "opacity")).toBe("0");
  expect(await style(rest, "opacity")).toBe("1");
  await avatar.evaluate((node) => node.setAttribute("data-mouth-active", ""));
  expect(await style(mouth, "opacity")).toBe("1");
  expect(await style(rest, "opacity")).toBe("0");
  const full = await style(mouth, "transform");
  await avatar.evaluate((node) => node.style.setProperty("--mouth", ".25"));
  await page.waitForTimeout(100);
  expect(await style(mouth, "transform")).not.toBe(full);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frozen = await style(mouth, "transform");
  await avatar.evaluate((node) => node.style.setProperty("--mouth", ".9"));
  expect(await style(mouth, "transform")).toBe(frozen);
  await avatar.evaluate((node) => node.removeAttribute("data-mouth-active"));
  expect(await style(mouth, "opacity")).toBe("0");
  expect(await style(rest, "opacity")).toBe("1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await style(mouth, "opacity")).toBe("0");
});

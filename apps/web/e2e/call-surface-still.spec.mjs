import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

/* A conversation's creature still (state/call-surface-still.ts) in the browser's own engine: a PNG of the size asked for,
 * with the creature on it, in Chromium and in WebKit (the iPhone's Live Activity takes it from a WKWebView). */

const root = fileURLToPath(new URL("..", import.meta.url));
const css = ["tokens", "call", "bichos"].map((name) => readFileSync(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8"));
let bundle;

test.beforeAll(async () => {
  const out = await build({ configFile: false, logLevel: "silent", root,
    build: { write: false, minify: false, lib: { entry: `${root}/src/state/call-surface-still.ts`, formats: ["iife"], name: "SidevoiceStill", fileName: "still" } } });
  bundle = (Array.isArray(out) ? out[0] : out).output[0].code;
});

for (const px of [240, 108]) {
  test(`renderStill draws each creature as a ${px}px PNG`, async ({ page }) => {
    await page.route("http://still.test/", (route) => route.fulfill({ contentType: "text/html",
      body: `<!doctype html><html><head>${css.map((sheet) => `<style>${sheet}</style>`).join("")}</head><body></body></html>` }));
    await page.goto("http://still.test/");
    await page.addScriptTag({ content: bundle });
    const stills = await page.evaluate(async (size) => {
      const out = [];
      for (const id of ["t1", "thread-abc", "019a-xyz", "sidevoice-core", "a&b<c>\"d'"]) {
        const still = await window.SidevoiceStill.renderStill(id, size);
        if (!still) { out.push({ id, still: null }); continue; }
        const image = new Image();
        image.src = `data:image/png;base64,${still.png}`;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const alpha = context.getImageData(0, 0, size, size).data;
        let opaque = 0;
        for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 0) opaque++;
        out.push({ id, still: { px: still.px, width: image.naturalWidth, height: image.naturalHeight, opaque } });
      }
      return out;
    }, px);
    for (const { id, still } of stills) {
      expect(still, id).not.toBeNull();
      expect(still, id).toMatchObject({ px, width: px, height: px });
      // The creature is on it, not an empty square.
      expect(still.opaque, id).toBeGreaterThan(px * px * 0.1);
    }
  });
}

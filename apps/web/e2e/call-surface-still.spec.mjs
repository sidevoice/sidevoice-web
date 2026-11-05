import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "vite";

/* A conversation's creature still (state/call-surface-still.ts) in the browser's own engine: a PNG of the size asked for,
 * with the creature on it, in Chromium and in WebKit (the iPhone's Live Activity takes it from a WKWebView). */

const root = fileURLToPath(new URL("..", import.meta.url));
const src = new URL("../src/", import.meta.url);
// Every stylesheet of the app with rules for its avatars: renderStill carries all of them into the still.
const sheets = readdirSync(src, { recursive: true }).filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(new URL(file, src), "utf8")).filter((sheet) => sheet.includes("sv-avatar"));
const ids = ["t1", "thread-abc", "019a-xyz", "sidevoice-core", "a&b<c>\"d'"];
let bundle;

test.beforeAll(async () => {
  const out = await build({ configFile: false, logLevel: "silent", root,
    build: { write: false, minify: false, lib: { entry: `${root}/src/state/call-surface-still.ts`, formats: ["iife"], name: "SidevoiceStill", fileName: "still" } } });
  bundle = (Array.isArray(out) ? out[0] : out).output[0].code;
});

/** Each id's still, measured in the page: its size and how much of it the creature covers. */
async function measure({ ids, size }) {
  const out = [];
  for (const id of ids) {
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
}

/** The page's warnings about stills, so a failure says why. */
function warnings(page) {
  const said = [];
  page.on("console", (message) => { if (message.text().includes("[sidevoice] call surface")) said.push(message.text()); });
  return said;
}

/** A page on an http origin with the app's avatar stylesheets, plus `extra`, and the module loaded. */
async function open(page, extra = "") {
  await page.route("http://still.test/", (route) => route.fulfill({ contentType: "text/html",
    body: `<!doctype html><html><head>${[...sheets, extra].map((sheet) => `<style>${sheet}</style>`).join("")}</head><body></body></html>` }));
  await page.goto("http://still.test/");
  await page.addScriptTag({ content: bundle });
}

function expectDrawn(stills, px, said) {
  for (const { id, still } of stills) {
    expect(still, `${id}: ${said.join(" | ")}`).not.toBeNull();
    expect(still, id).toMatchObject({ px, width: px, height: px });
    // The creature is on it, not an empty square.
    expect(still.opaque, id).toBeGreaterThan(px * px * 0.1);
  }
}

test("the app's stylesheets with avatar rules are the ones the spec loads", () => {
  expect(sheets.length).toBeGreaterThanOrEqual(8);
});

for (const px of [240, 108]) {
  test(`renderStill draws each creature as a ${px}px PNG`, async ({ page }) => {
    const said = warnings(page);
    await open(page);
    expectDrawn(await page.evaluate(measure, { ids, size: px }), px, said);
  });
}

test("a nesting `&`, a `<` in a value or a `]]>` in an avatar rule does not break the still", async ({ page }) => {
  const said = warnings(page);
  await open(page, `.sv-avatar { & svg { opacity: 1 } }
.sv-avatar .still-test { background: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>") }
.sv-avatar .still-test::after { content: "]]>" }`);
  expectDrawn(await page.evaluate(measure, { ids, size: 108 }), 108, said);
});

test("a still that cannot be drawn is told once", async ({ page }) => {
  const said = warnings(page);
  await open(page);
  const stills = await page.evaluate(async () => {
    HTMLCanvasElement.prototype.toDataURL = () => "data:,";
    return [await window.SidevoiceStill.renderStill("t1", 108), await window.SidevoiceStill.renderStill("t1", 108)];
  });
  expect(stills).toEqual([null, null]);
  await expect.poll(() => said.length).toBe(1);
  expect(said[0]).toContain("no still for t1 at 108px");
});

test("renderStill draws in an opaque origin, as a custom-scheme app page may be", async ({ page }) => {
  const said = warnings(page);
  await open(page);
  const stills = await page.evaluate(async ({ sheets, bundle, measure, ids }) => {
    const frame = document.createElement("iframe");
    frame.sandbox = "allow-scripts";
    const result = new Promise((resolve) => addEventListener("message", (event) => resolve(event.data), { once: true }));
    frame.srcdoc = `<!doctype html><html><head>${sheets.map((sheet) => `<style>${sheet}</style>`).join("")}</head><body>`
      + `<script>${bundle.replaceAll("</script", "<\\/script")}</script>`
      + `<script>(${measure})({ ids: ${JSON.stringify(ids)}, size: 108 }).then((stills) => parent.postMessage({ origin: location.origin, stills }, "*"),`
      + ` (error) => parent.postMessage({ origin: location.origin, error: String(error) }, "*"));</script></body></html>`;
    document.body.append(frame);
    return result;
  }, { sheets, bundle, measure: measure.toString(), ids });
  expect(stills.error).toBeUndefined();
  expect(stills.origin).toBe("null");
  expectDrawn(stills.stills, 108, said);
});

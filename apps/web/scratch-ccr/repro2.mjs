// For several conversations (so several backdrops): the card opened at Small, against the card opened at Medium and then
// switched to Small the way Settings does it. Pixel difference over the card, and the backdrop drawn.
import { webkit, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { openCard, conversation } from "../e2e/motion-states.mjs";
process.env.SIDEVOICE_STATIC_SITE ||= "/tmp/ccr-site";
const server = spawn(process.execPath, [new URL("./serve.mjs", import.meta.url).pathname], { stdio: "ignore", env: process.env });
for (let i = 0; i < 50; i++) { try { if ((await fetch("http://127.0.0.1:4292/voice/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const engine = process.env.ENGINE === "chromium" ? chromium : webkit;
const browser = await engine.launch(process.env.ENGINE === "chromium" ? {} : { executablePath: "/tmp/wk/bin/webkit-headless" });
const FROM = process.env.FROM || "m", TO = process.env.TO || "s";
async function shot(people, format, mode, sizes) {
  const context = await browser.newContext({ viewport: { width: 520, height: 640 }, baseURL: "http://127.0.0.1:4292" });
  try {
    const page = await openCard(context, { state: process.env.STATE || "listening", format, size: sizes[0], mode, people });
    await page.waitForTimeout(700);
    if (sizes[1]) {
      const other = await context.newPage();
      await other.goto("/voice/target.js");
      await other.evaluate(({ format, to }) => localStorage.setItem("sidevoice.floatingCard", JSON.stringify({ format, size: to })), { format, to: sizes[1] });
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; } });
    await page.waitForTimeout(150);
    const backdrop = await page.evaluate(() => document.querySelector(".backdrop")?.dataset.backdrop ?? null);
    return { png: PNG.sync.read(await page.screenshot()), backdrop };
  } finally { await context.close(); }
}
try {
  for (const mode of (process.env.MODES || "gpu").split(",")) for (const format of (process.env.FORMATS || "pip,avatar,card").split(",")) for (const i of (process.env.IDS || "1,2,3,4,5,6,7,8").split(",")) {
    const people = [{ ...conversation(1), thread_id: "t" + i }];
    const a = await shot(people, format, mode, [TO]), b = await shot(people, format, mode, [FROM, TO]);
    let diff = 0; const D = new PNG({ width: a.png.width * 3, height: a.png.height });
    for (let y = 0; y < a.png.height; y++) for (let x = 0; x < a.png.width; x++) { const k = (y * a.png.width + x) * 4; const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.png.data[k + c] - b.png.data[k + c]))); if (d > 40) diff++;
      for (const [o, src] of [[0, a.png], [1, b.png]]) { const j = (y * D.width + x + o * a.png.width) * 4; for (let c = 0; c < 4; c++) D.data[j + c] = src.data[k + c]; }
      const j = (y * D.width + x + 2 * a.png.width) * 4; D.data[j] = d > 40 ? 255 : 0; D.data[j + 1] = D.data[j + 2] = 0; D.data[j + 3] = 255; }
    const name = `${mode}-${format}-t${i}-${a.backdrop}`;
    if (diff > 50) writeFileSync(`/tmp/ccr-shots/${name}.png`, PNG.sync.write(D));
    console.log(name.padEnd(34), "differing px:", diff);
  }
} finally { await browser.close(); server.kill(); }

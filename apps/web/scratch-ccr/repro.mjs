// The floating card in `format` at Medium, switched to Small the way Settings does it (another page writes the stored
// prefs), then measured: where the tile, the canvas and the scene sit against the picture's frame.
import { webkit, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { openCard } from "../e2e/motion-states.mjs";
process.env.SIDEVOICE_STATIC_SITE ||= "/tmp/ccr-site";
const server = spawn(process.execPath, [new URL("./serve.mjs", import.meta.url).pathname], { stdio: "ignore", env: process.env });
for (let i = 0; i < 50; i++) { try { if ((await fetch("http://127.0.0.1:4292/voice/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const engine = process.env.ENGINE === "chromium" ? chromium : webkit;
const browser = await engine.launch(process.env.ENGINE === "chromium" ? {} : { executablePath: "/tmp/wk/bin/webkit-headless" });
const geometry = (page) => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
  const tile = document.querySelector(".stage-tile");
  return { card: r(".floating-card > *"), picture: r(".picture-stage"), slot: r(".picture-stage .stage-slot"), tile: r(".picture-stage .stage-tile"), canvas: r(".picture-stage .stage-canvas"),
    scene: r(".picture-stage .stage-scene"), agent: r(".picture-stage .stage-agent"), tileStyle: tile?.getAttribute("style"), k: tile && getComputedStyle(tile).getPropertyValue("--k") };
});
try {
  for (const mode of (process.env.MODES || "gpu,still").split(",")) for (const format of (process.env.FORMATS || "pip").split(",")) {
    const context = await browser.newContext({ viewport: { width: 520, height: 640 }, baseURL: "http://127.0.0.1:4292" });
    const page = await openCard(context, { state: process.env.STATE || "listening", format, size: process.env.FROM || "m", mode });
    await page.waitForTimeout(800);
    const before = await geometry(page);
    await page.screenshot({ path: `/tmp/ccr-shots/${mode}-${format}-before.png` });
    const other = await context.newPage();
    await other.goto("/voice/target.js");
    await other.evaluate(({ format, to }) => localStorage.setItem("sidevoice.floatingCard", JSON.stringify({ format, size: to })), { format, to: process.env.TO || "s" });
    await page.waitForTimeout(1200);
    const after = await geometry(page);
    await page.screenshot({ path: `/tmp/ccr-shots/${mode}-${format}-after.png` });
    console.log(mode, format, JSON.stringify({ before, after }, null, 1));
    await context.close();
  }
} finally { await browser.close(); server.kill(); }

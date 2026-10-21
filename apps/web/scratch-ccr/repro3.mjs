// The card as the desktop app shows it: the window sized to what the card reports (host.layout), right-anchored, then the
// size switched Medium -> Small and the window following the new report. Screenshots and geometry, for each format.
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
  return { vw: innerWidth, card: r(".floating-card"), picture: r(".picture-stage"), tile: r(".stage-tile"), scene: r(".stage-scene"), agent: r(".stage-agent, .avatar-figure .sv-avatar, .card-face .sv-avatar"), layout: window.__layouts?.at(-1) };
});
async function follow(page) {
  // The app sizes the window to the card's last report.
  const last = await page.evaluate(() => window.__layouts?.at(-1));
  if (last?.width && last?.height) await page.setViewportSize({ width: last.width, height: last.height });
}
try {
  for (const mode of (process.env.MODES || "gpu,still").split(",")) for (const format of (process.env.FORMATS || "pip,card,avatar").split(",")) {
    const context = await browser.newContext({ viewport: { width: 520, height: 640 }, baseURL: "http://127.0.0.1:4292" });
    await context.addInitScript(() => {
      window.__layouts = [];
      const watch = () => { const cc = window.__sidevoiceDesktop?.host?.callControls; if (cc && !cc.__watched) { const layout = cc.layout; cc.layout = (box) => { window.__layouts.push(box); return layout?.(box); }; cc.__watched = true; } };
      const id = setInterval(watch, 0); setTimeout(() => clearInterval(id), 5000);
    });
    const page = await openCard(context, { state: process.env.STATE || "listening", format, size: "m", mode });
    await page.waitForTimeout(600); await follow(page); await page.waitForTimeout(600);
    const before = await geometry(page);
    await page.screenshot({ path: `/tmp/ccr-shots/w-${mode}-${format}-1m.png` });
    const other = await context.newPage();
    await other.goto("/voice/target.js");
    await other.evaluate((format) => localStorage.setItem("sidevoice.floatingCard", JSON.stringify({ format, size: "s" })), format);
    await page.waitForTimeout(Number(process.env.LAG || 150));
    const mid = await geometry(page);
    await follow(page); await page.waitForTimeout(900);
    const after = await geometry(page);
    await page.screenshot({ path: `/tmp/ccr-shots/w-${mode}-${format}-2s.png` });
    console.log(mode, format, JSON.stringify({ before, mid, after }));
    await context.close();
  }
} finally { await browser.close(); server.kill(); }

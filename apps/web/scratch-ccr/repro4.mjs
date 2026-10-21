// A sequence of card changes (format/size prefs, the host's custom size, theme), the window following the card's report,
// against the same final state opened fresh. Pixel difference, per scenario.
import { webkit, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { openCard, conversation, MIXED } from "../e2e/motion-states.mjs";
const PEOPLE = [{ ...conversation(1), title: process.env.TITLE || "project-1" }, ...MIXED.slice(1)];
process.env.SIDEVOICE_STATIC_SITE ||= "/tmp/ccr-site";
const server = spawn(process.execPath, [new URL("./serve.mjs", import.meta.url).pathname], { stdio: "ignore", env: process.env });
for (let i = 0; i < 50; i++) { try { if ((await fetch("http://127.0.0.1:4292/voice/")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const engine = process.env.ENGINE === "chromium" ? chromium : webkit;
const browser = await engine.launch(process.env.ENGINE === "chromium" ? {} : { executablePath: "/tmp/wk/bin/webkit-headless" });
const SCENARIOS = {
  "m->s": { start: { size: "m" }, steps: [{ pref: { size: "s" } }] },
  "l->s": { start: { size: "l" }, steps: [{ pref: { size: "s" } }] },
  "l->m->s": { start: { size: "l" }, steps: [{ pref: { size: "m" } }, { pref: { size: "s" } }] },
  "custom->s": { start: { size: "m", custom: { width: 520, height: 420 } }, steps: [{ pref: { size: "s" }, custom: null }] },
  "custom->custom": { start: { size: "m", custom: { width: 520, height: 420 } }, steps: [{ custom: { width: 380, height: 360 } }] },
  "m->s light": { start: { size: "m", theme: "light" }, steps: [{ pref: { size: "s" } }] },
  "l->m->s window first": { start: { size: "l" }, steps: [{ window: { width: 444, height: 400 }, pref: { size: "m" } }, { window: { width: 374, height: 361 }, pref: { size: "s" } }] },
};
async function run(format, mode, start, steps) {
  const context = await browser.newContext({ viewport: { width: 520, height: 640 }, baseURL: "http://127.0.0.1:4292" });
  await context.addInitScript(() => {
    window.__layouts = [];
    const id = setInterval(() => { const cc = window.__sidevoiceDesktop?.host?.callControls; if (cc && !cc.__w) { const l = cc.layout; cc.layout = (b) => { window.__layouts.push(b); return l?.(b); }; cc.__w = true; } }, 0);
    setTimeout(() => clearInterval(id), 5000);
  });
  if (start.theme) await context.addInitScript((t) => localStorage.setItem("sidevoice.appearance", t), start.theme);
  try {
    // openCard's room needs a wide enough window to choose the conversation; the card window is sized after.
    const page = await openCard(context, { state: process.env.STATE || "listening", format, size: start.size, mode, people: PEOPLE, level: process.env.STATE === "person-speaking" });
    const host = (custom) => page.evaluate((custom) => { window.__cardState = { ...window.__cardState, size: custom }; window.__cardListener(window.__cardState); }, custom);
    const follow = async () => { const last = await page.evaluate(() => window.__layouts.at(-1)); if (last?.width) await page.setViewportSize({ width: last.width, height: last.height }); };
    if (start.custom) await host(start.custom);
    await page.waitForTimeout(500); await follow(); await page.waitForTimeout(500);
    const other = steps.some((s) => s.pref) ? await context.newPage() : null;
    if (other) await other.goto("/voice/target.js");
    for (const step of steps) {
      if (step.window) { await page.setViewportSize(step.window); await page.waitForTimeout(150); }
      if (step.pref) await other.evaluate((v) => localStorage.setItem("sidevoice.floatingCard", JSON.stringify(v)), { format, ...step.pref });
      if ("custom" in step) await host(step.custom);
      await page.waitForTimeout(120); await follow(); await page.waitForTimeout(600);
    }
    await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; } });
    await page.waitForTimeout(150);
    return PNG.sync.read(await page.screenshot());
  } finally { await context.close(); }
}
const final = (sc) => { const f = { ...sc.start }; for (const s of sc.steps) { if (s.pref) Object.assign(f, s.pref); if ("custom" in s) f.custom = s.custom; } return f; };
try {
  for (const mode of (process.env.MODES || "gpu").split(",")) for (const format of (process.env.FORMATS || "pip").split(",")) for (const [name, sc] of Object.entries(SCENARIOS)) {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
    const b = await run(format, mode, sc.start, sc.steps), a = await run(format, mode, final(sc), []);
    let diff = 0; const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    const D = new PNG({ width: w * 3, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ka = (y * a.width + x) * 4, kb = (y * b.width + x) * 4; const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[ka + c] - b.data[kb + c]))); if (d > 40) diff++;
      for (const [o, src, k] of [[0, a, ka], [1, b, kb]]) { const j = (y * D.width + x + o * w) * 4; for (let c = 0; c < 4; c++) D.data[j + c] = src.data[k + c]; }
      const j = (y * D.width + x + 2 * w) * 4; D.data[j] = d > 40 ? 255 : 0; D.data[j + 1] = D.data[j + 2] = 0; D.data[j + 3] = 255; }
    const file = `/tmp/ccr-shots/seq-${mode}-${format}-${name.replace(/[^\w]+/g, "_")}.png`;
    writeFileSync(file, PNG.sync.write(D));
    console.log(`${mode} ${format} ${name}`.padEnd(30), `sizes ${a.width}x${a.height} vs ${b.width}x${b.height}`, "differing px:", diff);
  }
} finally { await browser.close(); server.kill(); }

import { createRequire } from "module";
const require = createRequire("/workspace/sidevoice/worktrees/e2e-red/node_modules/");
const { chromium } = require("playwright");
const [,, outDir, base, widthArg, dprArg, scalesArg, themesArg, shotsArg] = process.argv;
const width = +widthArg, dpr = +dprArg;
const scales = scalesArg.split(","), themes = themesArg.split(","), shots = shotsArg.split(",");
const b = await chromium.launch();
for (const theme of themes) for (const scale of scales) {
  const ctx = await b.newContext({ viewport: { width, height: +(process.env.H || 780) }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  for (const shot of shots) {
    const [id, action] = shot.split("+");
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${base}/voice/journeys.html?shot=${id}&theme=${theme}&scale=${scale}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    if (action === "sidebar") { await p.locator(".conversations-chip").first().tap({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(500); }
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({ path: `${outDir}/${id}${action ? "-" + action : ""}_${width}_s${scale}_${theme}.png` });
    console.log(id, action ?? "", width, scale, theme, "hscroll", overflow, errs.slice(0, 1));
    await p.close();
  }
  await ctx.close();
}
await b.close();

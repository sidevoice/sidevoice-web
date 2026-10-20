#!/usr/bin/env node
/* What the room costs while nothing happens (desktop#149): the static site in Playwright's WebKit, each scenario left
 * idle, and the CPU every WebKit process spent meanwhile (the page's WebContent, the GPU process that paints and
 * composites it, the rest), with the animations the page keeps running. A measurement, not a test: it prints a table
 * (and, given PERF_SUMMARY, appends it there as markdown) and fails only when a scenario cannot be set up.
 *
 *   node apps/web/perf/idle-cpu.mjs            the site assembled at SIDEVOICE_STATIC_SITE (or .playwright-static-web)
 *   PERF_SECONDS=20 PERF_HEADED=1 …            a longer window, a visible window (macOS CI runs headed)
 *   PERF_NO_ANIMATIONS=1                         the floor: every CSS animation and transition stopped
 *   PERF_MOTION=gpu|still                        the drawings moving as GPU layers, or still, whatever the page decides
                                                (web#278, lib/motion.ts: a runner without a GPU decides still)
 *   PERF_WEBKIT=<path>                           another WebKit executable (a rootless wrapper, an older build)
 *
 * Scenarios: idle with one conversation and with six, no call; idle in a call (listening, nobody speaking) with six. */

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "@playwright/test";
import { installHarness } from "../e2e/harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SECONDS = Number(process.env.PERF_SECONDS || 15);
const SETTLE_MS = 3000;
const BASE = "http://127.0.0.1:4173";
const TICK = 100; // Linux /proc clock ticks per second (sysconf CLK_TCK on every Linux runner)

const conversation = (n) => ({ thread_id: `t${n}`, title: `project-${n}`, available: true, reach: { state: "listening" }, harness: "claude-code" });
const several = Array.from({ length: 6 }, (_, i) => conversation(i + 1));

/** The CPU seconds each of the browser's processes has spent so far, by pid. */
function cpuTimes() {
  const out = new Map();
  if (process.platform === "linux") {
    for (const pid of execFileSync("ls", ["/proc"], { encoding: "utf8" }).split("\n").filter((p) => /^\d+$/.test(p))) {
      try {
        const command = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
        if (!command.includes("ms-playwright/webkit") && !command.includes("/wk/")) continue;
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        out.set(pid, { command, seconds: (Number(fields[11]) + Number(fields[12])) / TICK });
      } catch { /* gone meanwhile */ }
    }
    return out;
  }
  // macOS: `time` is user + system, [[dd-]hh:]mm:ss.cc. The XPC services are launchd's children: matched by their path.
  for (const line of execFileSync("ps", ["-A", "-o", "pid=,time=,command="], { encoding: "utf8" }).split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match || !match[3].includes("ms-playwright/webkit")) continue;
    const parts = match[2].replace(/^(\d+)-/, (_, d) => `${Number(d) * 24}:`).split(":").map(Number);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    out.set(match[1], { command: match[3], seconds });
  }
  return out;
}

function kind(command) {
  if (/GPU/.test(command)) return "gpu";
  if (/WebContent|WebProcess/.test(command)) return "web";
  if (/Network/.test(command)) return "net";
  return "ui";
}

/** The percentage of one core each kind of process spent over `seconds`. */
async function sample(seconds) {
  const before = cpuTimes();
  const started = performance.now();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const elapsed = (performance.now() - started) / 1000;
  const after = cpuTimes();
  const total = { ui: 0, web: 0, gpu: 0, net: 0 };
  for (const [pid, { command, seconds: spent }] of after) total[kind(command)] += spent - (before.get(pid)?.seconds ?? 0);
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, (100 * v) / elapsed]));
}

/** What the page keeps moving: its running animations, and how many of them are on SVG (repainted, never composited). */
const animations = (page) => page.evaluate(() => {
  const running = document.getAnimations().filter((a) => a.playState === "running");
  return { running: running.length, svg: running.filter((a) => a.effect?.target instanceof SVGElement).length };
});

async function room(page, participants) {
  await installHarness(page, { participants: { first: participants } });
  await page.goto("/voice/");
  await page.locator("#participants").getByText(participants[0].title).first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

const SCENARIOS = [
  { name: "no call, 1 conversation", run: (page) => room(page, [conversation(1)]) },
  { name: "no call, 6 conversations", run: (page) => room(page, several) },
  {
    name: "in a call, 6 conversations (listening)",
    run: async (page) => {
      await room(page, several);
      // The call as the room's runtime reports it once joined: the conversation bound, the microphone open, nobody
      // speaking. Patched over the store: the harness has no core to call.
      await page.evaluate(() => window.sidevoiceUI.store.patch({
        ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
        roomBinding: { thread_id: "t1", title: "project-1" }, sessionId: "perf", micEnabled: true, userLive: false, botLive: false,
        voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" },
      }));
    },
  },
];

const server = spawn(process.execPath, [path.join(here, "../test/serve-static-web.mjs")], { stdio: "inherit" });
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + "/voice/")).ok) break; } catch { /* not yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const rows = [];
  for (const scenario of SCENARIOS) {
    const browser = await webkit.launch({ headless: !process.env.PERF_HEADED, executablePath: process.env.PERF_WEBKIT || undefined });
    try {
      const page = await browser.newPage({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
      if (process.env.PERF_MOTION) await page.addInitScript((how) => localStorage.setItem("sidevoice.motion", how), process.env.PERF_MOTION);
      await scenario.run(page);
      // The floor, for comparison: the same page with every CSS animation and transition stopped.
      if (process.env.PERF_NO_ANIMATIONS) await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important }" });
      const mood = await page.locator(".stage-tile[data-mood]").first().getAttribute("data-mood");
      const motion = await page.evaluate(() => document.documentElement.dataset.motion);
      await page.waitForTimeout(SETTLE_MS);
      const moving = await animations(page);
      const cpu = await sample(SECONDS);
      rows.push({ scenario: `${scenario.name} [stage: ${mood}, motion: ${motion}]`, ...cpu, ...moving });
    } finally {
      await browser.close();
    }
  }
  const pct = (v) => v.toFixed(1).padStart(6);
  const header = "| scenario | WebContent % | GPU % | UI % | Network % | total % | running animations (SVG) |";
  const lines = [header, "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map((r) => `| ${r.scenario} | ${pct(r.web)} | ${pct(r.gpu)} | ${pct(r.ui)} | ${pct(r.net)} | ${pct(r.web + r.gpu + r.ui + r.net)} | ${r.running} (${r.svg}) |`)];
  const table = `WebKit idle CPU, ${SECONDS}s per scenario, ${process.platform}/${process.arch}, ${process.env.PERF_HEADED ? "headed" : "headless"}\n\n${lines.join("\n")}\n`;
  console.log(table);
  if (process.env.PERF_SUMMARY) appendFileSync(process.env.PERF_SUMMARY, `${process.env.PERF_LABEL ? `### ${process.env.PERF_LABEL}\n\n` : ""}${table}\n`);
} finally {
  server.kill();
}

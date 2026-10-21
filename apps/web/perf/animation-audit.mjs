#!/usr/bin/env node
/* What moves in every state the app can be put in, and what it costs (desktop#149, web#278): a runtime audit, not a test.
 * For each state it records the running animations (name, element, whether the element is inside an SVG, what the keyframes
 * animate, whether the animation is infinite, whether anybody can see the element), the CSS transitions started and
 * animations restarted per second, what the page schedules (animation frames, timers, intervals that never stop), the DOM
 * mutations per second and what blocks the thread. It prints the findings per state and writes everything as JSON lines
 * (AUDIT_OUT) for a table. The rules are the motion guard's (e2e/motion-audit.mjs, e2e/motion-guard.spec.mjs).
 *
 *   node apps/web/perf/animation-audit.mjs
 *   AUDIT_BASE=http://127.0.0.1:4391        where the site is served (default 4173, the e2e server); it must serve voice/ with
 *                                           index, call-controls.html, journeys.html and design-system.html (the last two are
 *                                           pages of the dev server: `vite build` them with their own input to audit them)
 *   AUDIT_WEBKIT=/tmp/wk/bin/webkit-headless  another WebKit executable (a rootless wrapper)
 *   AUDIT_ENGINES=webkit,chromium           the engines to run (default webkit)
 *   AUDIT_GROUPS=live,card,journeys,design  the groups to run (default all)
 *   AUDIT_ONLY=<text>                       only the states whose id contains it
 *   AUDIT_MODES=still,gpu                   how the drawings move (lib/motion.ts), for the live and card groups
 *   AUDIT_WINDOW=3                          seconds counted per state (default 3), AUDIT_SETTLE=1800 ms waited before
 *   AUDIT_SLICE=0/2                         the first half of the states (1/2 the second): runs in parallel split the audit
 *   AUDIT_CPU=1                             also sample the CPU of the browser's processes over the window (a coarse number:
 *                                           anything else running a WebKit counts too)
 *   AUDIT_OUT=/tmp/audit.jsonl              where the JSON lines go
 *
 * The states: `live` the room (conversations of every state, in a call listening, working, with the person speaking,
 * transcribing, the agent speaking, reconnecting, joining, muted, Settings over it), `card` the desktop app's floating call
 * card (call-controls.html) in each of its formats and each of the call's states, `journeys` every screen of the storyboard
 * (journeys.html: setup, pairing, Settings, updates), `design` the design system page. Each on a desktop window and a phone. */

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "@playwright/test";
import { observe, probe, violations } from "../e2e/motion-audit.mjs";
import { MIXED, SINGLE, openCard, openRoom } from "../e2e/motion-states.mjs";
import { sample } from "./cpu.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../src");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:4173";
const WINDOW = Number(process.env.AUDIT_WINDOW || 3);
const OUT = process.env.AUDIT_OUT || "/tmp/animation-audit.jsonl";
const ENGINES = (process.env.AUDIT_ENGINES || "webkit").split(",");
const GROUPS = new Set((process.env.AUDIT_GROUPS || "live,card,journeys,design").split(","));
const MODES = (process.env.AUDIT_MODES || "still,gpu").split(",");
const SETTLE_MS = Number(process.env.AUDIT_SETTLE || 1800);
/** `AUDIT_SLICE=i/n`: only every n-th state of each group, from the i-th, so n runs split the audit between them. */
const [SLICE, SLICES] = (process.env.AUDIT_SLICE || "0/1").split("/").map(Number);
let counted = 0;
const mine = () => counted++ % SLICES === SLICE;
const VIEWS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
const ONLY = process.env.AUDIT_ONLY;

// ---------- the states of the room ----------

/** The room's own scenarios: the harness page, a conversation chosen, then the state. */
const LIVE = [
  { id: "room: one conversation, no call", people: SINGLE, state: "not-in-call" },
  { id: "room: six conversations (listening, holding, offline, unavailable), no call", people: MIXED, state: "not-in-call" },
  { id: "room: six conversations, two of them working, no call", people: MIXED, state: "working-no-call" },
  { id: "room: six conversations, one with an unread reply", people: MIXED, state: "unread" },
  { id: "room: the machine does not answer", people: MIXED, state: "offline-machine" },
  { id: "room: joining the call", people: MIXED, state: "joining" },
  { id: "room: the join failed", people: MIXED, state: "join-failed" },
  { id: "call: listening, nobody speaking", people: MIXED, state: "listening" },
  { id: "call: the agent and two others working", people: MIXED, state: "working" },
  { id: "call: the person speaking", people: MIXED, state: "person-speaking" },
  { id: "call: the person speaking, transcript open", people: MIXED, state: "person-speaking", after: "transcript" },
  { id: "call: the person's turn being transcribed", people: MIXED, state: "transcribing" },
  { id: "call: the person's turn being transcribed, transcript open", people: MIXED, state: "transcribing", after: "transcript" },
  { id: "call: the agent speaking (karaoke, mouth)", people: MIXED, state: "agent-speaking" },
  { id: "call: the agent speaking, transcript open", people: MIXED, state: "agent-speaking", after: "transcript" },
  { id: "call: reconnecting", people: MIXED, state: "reconnecting" },
  { id: "call: microphone muted", people: MIXED, state: "muted" },
  { id: "call: the call's own conversation offline (wanted poster)", people: MIXED, state: "own-offline" },
  { id: "call: the idle warning", people: MIXED, state: "idle-warning" },
  { id: "call: an unread reply in another conversation", people: MIXED, state: "unread-in-call" },
  { id: "call: working, Settings (General) open over it", people: MIXED, state: "working", after: "settings" },
];
/** Which of them also run on a phone. */
const PHONE = new Set(["room: one conversation, no call", "room: six conversations, one with an unread reply", "call: listening, nobody speaking", "call: the agent and two others working",
  "call: the person speaking", "call: the agent speaking (karaoke, mouth)", "call: reconnecting", "call: the call's own conversation offline (wanted poster)", "call: working, Settings (General) open over it"]);

async function live(browser, scenario, view, mode) {
  const context = await browser.newContext({ viewport: VIEWS[view], baseURL: BASE });
  try {
    const page = await context.newPage();
    await openRoom(page, { people: scenario.people, state: scenario.state, mode, after: scenario.after });
    return await measure(page);
  } finally { await context.close(); }
}

// ---------- the floating call card ----------

const CARD_STATES = [
  { id: "listening", state: "listening" }, { id: "the agent working", state: "working" }, { id: "the person speaking", state: "person-speaking", level: true },
  { id: "transcribing", state: "transcribing" }, { id: "the agent speaking", state: "agent-speaking", playback: true }, { id: "reconnecting", state: "reconnecting" },
  { id: "muted", state: "muted" }, { id: "conversation offline", state: "own-offline" }, { id: "idle warning", state: "idle-warning" }, { id: "unread elsewhere", state: "unread-in-call" },
];
const CARD_FORMATS = ["card", "pip", "avatar"];

async function card(browser, spec, view, mode) {
  const context = await browser.newContext({ viewport: view === "phone" ? VIEWS.phone : { width: 520, height: 640 }, baseURL: BASE });
  try {
    const page = await openCard(context, { state: spec.state, format: spec.format, size: spec.size, mode, expanded: spec.expanded, level: spec.level, playback: spec.playback });
    return await measure(page);
  } finally { await context.close(); }
}

// ---------- the storyboard and the design system ----------

async function shots(browser) {
  const context = await browser.newContext({ viewport: VIEWS.desktop, baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/voice/journeys.html", { waitUntil: "domcontentloaded" });
  await page.locator("iframe").first().waitFor({ state: "attached" });
  const found = await page.$$eval("iframe", (frames) => frames.map((frame) => ({ src: frame.getAttribute("src"), title: frame.title, view: frame.closest(".journey-frame")?.dataset.view ?? "desktop" })));
  await context.close();
  return found.map((frame) => ({ id: new URLSearchParams(frame.src.slice(frame.src.indexOf("?"))).get("shot"), caption: frame.title, view: frame.view }));
}

async function journey(browser, shot) {
  const context = await browser.newContext({ viewport: VIEWS[shot.view], baseURL: BASE });
  const page = await context.newPage();
  await page.addInitScript(probe);
  try {
    await page.goto(`/voice/journeys.html?shot=${shot.id}&theme=light`);
    await page.locator("#root > *").first().waitFor({ state: "attached" });
    return await measure(page);
  } finally { await context.close(); }
}

async function design(browser) {
  const context = await browser.newContext({ viewport: VIEWS.desktop, baseURL: BASE });
  const page = await context.newPage();
  await page.addInitScript(probe);
  try {
    await page.goto("/voice/design-system.html");
    await page.locator("#root > *").first().waitFor({ state: "attached" });
    return await measure(page);
  } finally { await context.close(); }
}

// ---------- measuring ----------

/** One state, settled: what runs, sampled through the window, and what the page does meanwhile. */
async function measure(page) {
  const seen = await observe(page, { settle: SETTLE_MS, duration: WINDOW * 1000, samples: Math.max(3, Math.round(WINDOW * 1.5)) });
  const cpu = process.env.AUDIT_CPU ? await sample(WINDOW, process.pid) : null;
  return { ...seen, cpu, viewport: page.viewportSize() };
}

// ---------- where in the source ----------

/** Where each keyframes is defined and which rules start it: file:line, from the source tree. */
function cssIndex() {
  const files = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full); } else if (/\.(css|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
  } };
  walk(SRC);
  const index = new Map();
  const lines = files.map((file) => ({ file: path.relative(path.resolve(SRC, ".."), file), lines: readFileSync(file, "utf8").split("\n") }));
  for (const { file, lines: text } of lines) text.forEach((line, i) => { const m = line.match(/@keyframes\s+([\w-]+)/); if (m) index.set(m[1], { defined: `${file}:${i + 1}`, used: [] }); });
  for (const { file, lines: text } of lines) text.forEach((line, i) => {
    if (!/animation/.test(line)) return;
    for (const [name, entry] of index) if (new RegExp(`(^|[\\s:,])${name}([\\s;,]|$)`).test(line.replace(/^.*?animation(-name)?\s*:/, " ")) && !/@keyframes/.test(line)) entry.used.push(`${file}:${i + 1}`);
  });
  return index;
}

/** Turns a bundle position (`…/assets/x.js:12:34`) into the source file and line, from the build's source maps; the position
 *  as it is when there are none. */
async function sourceMapper() {
  let TraceMap, originalPositionFor;
  try { ({ TraceMap, originalPositionFor } = await import("@jridgewell/trace-mapping")); } catch { return (position) => position; }
  const maps = new Map();
  const load = async (url) => {
    if (!maps.has(url)) {
      try { const response = await fetch(url + ".map"); maps.set(url, response.ok ? new TraceMap(await response.text()) : null); } catch { maps.set(url, null); }
    }
    return maps.get(url);
  };
  const cache = new Map();
  const resolved = async (position) => {
    const match = position.match(/^(https?:\/\/[^\s]+?\.js):(\d+):(\d+)$/);
    if (!match) return position;
    const map = await load(match[1]);
    if (!map) return position;
    const found = originalPositionFor(map, { line: Number(match[2]), column: Number(match[3]) - 1 });
    return found.source ? `${found.source.replace(/^(\.\.\/)+/, "")}:${found.line}` : position;
  };
  return async (position) => { if (!cache.has(position)) cache.set(position, await resolved(position)); return cache.get(position); };
}

// ---------- running ----------

const css = cssIndex();
const mapper = await sourceMapper();
writeFileSync(OUT, "");

async function record(group, id, view, mode, engine, result) {
  const relative = (position) => position.replace(/^.*?(apps\/web\/)/, "");
  const mapKey = async (key) => { const [kind, position] = key.split(" "); return `${kind} ${relative(await mapper(position))}`; };
  const counted = { ...result.counted, scheduled: await Promise.all(result.counted.scheduled.map(async (s) => ({ ...s, key: await mapKey(s.key) }))),
    intervals: await Promise.all(result.counted.intervals.map(async (i) => ({ ...i, site: await mapKey(i.site) }))) };
  const found = violations(result);
  const sources = Object.fromEntries(result.animations.filter((a) => css.has(a.name)).map((a) => [a.name, css.get(a.name)]));
  const line = { group, id, view, mode, engine, animations: result.animations, violations: found.map((v) => v.text), counted, cpu: result.cpu, sources };
  appendFileSync(OUT, JSON.stringify(line) + "\n");
  const running = result.animations;
  const summary = `${group} | ${id} | ${view}/${mode} | anims ${running.length} (infinite ${running.filter((a) => a.infinite).length}, svg ${running.filter((a) => a.svg === "inside").length}, hidden ${running.filter((a) => !a.visible).length}) | raf ${counted.rafPerSecond}/s timers ${(counted.timeoutsPerSecond + counted.intervalTicksPerSecond).toFixed(1)}/s mutations ${counted.mutationsPerSecond}/s${counted.blocks.length ? ` blocks ${counted.blocks.join(",")}ms` : ""}`;
  console.log(summary);
  for (const v of found) console.log(`    ! ${v.text}`);
}

const wanted = (id) => (!ONLY || id.includes(ONLY)) && mine();
for (const engine of ENGINES) {
  const browser = engine === "chromium" ? await chromium.launch() : await webkit.launch({ executablePath: process.env.AUDIT_WEBKIT || undefined });
  try {
    if (GROUPS.has("live")) for (const scenario of LIVE) for (const view of ["desktop", "phone"]) for (const mode of MODES) {
      if (view === "phone" && !PHONE.has(scenario.id) || !wanted(scenario.id)) continue;
      try { await record("live", scenario.id, view, mode, engine, await live(browser, scenario, view, mode)); } catch (error) { console.log(`live | ${scenario.id} | ${view}/${mode} | FAILED ${String(error).split("\n")[0]}`); }
    }
    if (GROUPS.has("card")) for (const spec of CARD_STATES) for (const format of CARD_FORMATS) for (const mode of MODES) for (const expanded of format === "avatar" ? [false] : [false, true]) {
      const id = `card ${format}${expanded ? " (controls out)" : ""}: ${spec.id}`;
      if (!wanted(id)) continue;
      try { await record("card", id, "card", mode, engine, await card(browser, { ...spec, format, expanded }, "desktop", mode)); } catch (error) { console.log(`card | ${id} | ${mode} | FAILED ${String(error).split("\n")[0]}`); }
    }
    if (GROUPS.has("journeys")) for (const shot of await shots(browser)) {
      const id = `${shot.id} (${shot.caption.replace(/ \((phone|desktop)\)$/, "").slice(0, 70)})`;
      if (!wanted(id)) continue;
      try { await record("journeys", id, shot.view, "still", engine, await journey(browser, shot)); } catch (error) { console.log(`journeys | ${id} | ${shot.view} | FAILED ${String(error).split("\n")[0]}`); }
    }
    if (GROUPS.has("design") && wanted("design system")) {
      try { await record("design", "design system page", "desktop", "still", engine, await design(browser)); } catch (error) { console.log(`design | FAILED ${String(error).split("\n")[0]}`); }
    }
  } finally { await browser.close(); }
}
console.log(`\nwritten to ${OUT}`);

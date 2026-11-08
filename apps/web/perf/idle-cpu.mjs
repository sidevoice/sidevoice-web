#!/usr/bin/env node
/* What the room costs while nothing happens (desktop#149): the static site in Playwright's WebKit, each scenario left
 * idle, and the CPU every WebKit process spent meanwhile (the page's WebContent, the GPU process that paints and
 * composites it, the rest), with the animations the page keeps running. A measurement, not a test: it prints a table
 * (and, given PERF_SUMMARY, appends it there as markdown) and fails only when a scenario cannot be set up.
 *
 *   node apps/web/perf/idle-cpu.mjs            the site assembled at SIDEVOICE_STATIC_SITE (or .playwright-static-web)
 *   PERF_SECONDS=20 PERF_HEADED=1 …            a longer window, a visible window (macOS CI runs headed)
 *   PERF_NO_ANIMATIONS=1                         the floor: every CSS animation and transition stopped
 *   PERF_MOTION=gpu|still                        the drawings moving as GPU layers, or held still, whatever the page
 *                                                would decide itself (web#278, lib/motion.ts)
 *   PERF_ANIMATED_THUMBNAILS=1                   the developer option "Animate conversation thumbnails" on (lib/animated-thumbnails.ts)
 *   PERF_WEBKIT=<path>                           another WebKit executable (a rootless wrapper, an older build)
 *   PERF_STYLE='<css>'                           extra CSS on the page, to isolate one animation's cost
 *   PERF_ONLY=<text>                             only the scenarios whose name contains it
 *
 * Scenarios: idle with one conversation and with six, no call; idle in a call (listening, nobody speaking) with six; the
 * same call while its conversation and two others work (the operator's usual room, desktop#149); the person speaking
 * in that call, the microphone's level arriving as the app hands it (about 30 readings a second); and the agent speaking in
 * it: a long reply said sentence by sentence, its words lit as the page paces them, the speaker's level arriving the same
 * way (desktop#150) and the room's beats writing what has not changed. Each row lists the animations still running, by
 * name and element. */

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "@playwright/test";
import { installHarness } from "../e2e/harness.mjs";
import { sample } from "./cpu.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SECONDS = Number(process.env.PERF_SECONDS || 15);
const SETTLE_MS = 3000;
const BASE = "http://127.0.0.1:4173";

const conversation = (n) => ({ thread_id: `t${n}`, title: `project-${n}`, available: true, reach: { state: "listening" }, harness: "claude-code" });
const several = Array.from({ length: 6 }, (_, i) => conversation(i + 1));

/** What the page keeps moving: its running animations, how many of them are on SVG (repainted, never composited), and
 *  which they are: the animation's name on its element (tag and first class), counted. */
const animations = (page) => page.evaluate(() => {
  const running = document.getAnimations().filter((a) => a.playState === "running");
  const names = {};
  for (const a of running) {
    const target = a.effect?.target;
    const element = `${target?.localName ?? "?"}${target?.classList?.[0] ? "." + target.classList[0] : ""}${a.effect?.pseudoElement ?? ""}`;
    const name = `${a.animationName || a.transitionProperty || "script"} on ${element}${target instanceof SVGElement ? " (SVG)" : ""}`;
    names[name] = (names[name] ?? 0) + 1;
  }
  return { running: running.length, svg: running.filter((a) => a.effect?.target instanceof SVGElement).length, names };
});

async function room(page, participants) {
  await installHarness(page, { participants: { first: participants } });
  await page.goto("/voice/");
  await page.locator("#participants").getByText(participants[0].title).first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

/** The call as the room's runtime reports it once joined: the conversation bound, the microphone open, nobody speaking.
 *  Patched over the store: the harness has no core to call. */
const joinCall = (page) => page.evaluate(() => window.sidevoiceUI.store.patch({
  ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
  roomBinding: { thread_id: "t1", title: "project-1" }, sessionId: "perf", micEnabled: true, userLive: false, botLive: false,
  voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" },
}));

const SCENARIOS = [
  { name: "no call, 1 conversation", run: (page) => room(page, [conversation(1)]) },
  { name: "no call, 6 conversations", run: (page) => room(page, several) },
  {
    name: "in a call, 6 conversations (listening)",
    run: async (page) => { await room(page, several); await joinCall(page); },
  },
  {
    name: "in a call, 6 conversations, 3 working",
    run: async (page) => {
      await room(page, several);
      await joinCall(page);
      // Busy as the harness reports it, since long enough ago to show as working: the call's own and two more.
      await page.evaluate(() => {
        const { store } = window.sidevoiceUI;
        const people = store.getState().facts.people.filter((p) => ["t1", "t2", "t3"].includes(p.thread_id));
        const keys = people.map((p) => `${p.node}|${p.thread_id}`);
        store.patch({
          callNode: people.find((p) => p.thread_id === "t1")?.node,
          harness: Object.fromEntries(keys.map((k) => [k, true])),
          workingSince: Object.fromEntries(keys.map((k) => [k, 0])),
        });
      });
    },
  },
  {
    name: "in a call, 6 conversations, the person speaking",
    run: async (page) => {
      await room(page, several);
      await joinCall(page);
      await page.evaluate(() => {
        const { store, micLevel } = window.sidevoiceUI;
        const thread = store.getState().facts.people.find((p) => p.thread_id === "t1");
        const key = `${thread.node}|t1`;
        store.patch({ callNode: thread.node, userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: key }, pendingPhase: "listening",
          voiceState: { listening: "speaking", recognising: 0, playback: "idle", microphone: "live" } });
        // The level as the room's runtime writes it on each reading (room-session-controller.js voiceLevel): a voice
        // rising and falling, a reading every 32 ms, only the whole-percent changes (desktop#150).
        let level = 0, last = -1;
        window.sidevoiceAudio = { ...window.sidevoiceAudio, level: () => level / 100 };
        setInterval(() => {
          const t = performance.now() / 1000;
          level = Math.round(Math.max(0, 40 + 35 * Math.sin(t * 7) + 15 * Math.sin(t * 23)));
          if (level === last) return;
          last = level;
          document.getElementById("mic-control")?.style.setProperty("--mic-level", String(level / 100));
          document.getElementById("mic-level-meter")?.setAttribute("aria-valuenow", String(level));
          micLevel?.publish?.(level);
        }, 32);
      });
    },
  },
  {
    name: "in a call, 6 conversations, the agent speaking",
    run: async (page) => {
      await room(page, several);
      await joinCall(page);
      // The room's beat asks the machine how the call stands once the page names its machine, and a harness that answers
      // "no call" would end this one: those two questions are left unanswered, so the call stays as patched (the beat's own
      // writes are made below, as they come when nothing has changed).
      await page.route((url) => /^\/api\/presentation(\/history)?$/.test(url.pathname), () => {});
      await page.evaluate(() => {
        const { store, playbackLevel } = window.sidevoiceUI;
        const thread = store.getState().facts.people.find((p) => p.thread_id === "t1");
        const key = `${thread.node}|t1`;
        // A long reply, said sentence by sentence (the voice's cue, `karaokeState`, moves from one to the next as the
        // voice reaches it); within a sentence the page's words go on at their own pace (speech-reading.ts).
        const reply = "I looked at the failing check first. The setting was being read before the page had written it, so the first start of every session saw the old value. "
          + "I moved the read after the write and added a test that flips the setting and reloads the page. The whole suite passes now, on both engines. "
          + "There is one more thing worth saying: the same ordering shows up in the sidebar, where the unread marks are counted before the history is loaded. "
          + "I left that alone, because it is a different change with its own risk. Shall I open the pull request for this one, and write the other one down as an issue?";
        const sentences = reply.match(/[^.?]+[.?]\s*/g);
        const segment = "voice:perf-1";
        const VOICE = 14; // characters a second the voice says, a little under the page's pace for words (PACE in speech-reading.ts)
        const started = performance.now();
        store.patch({
          callNode: thread.node, botLive: true,
          voiceState: { listening: "listening", recognising: 0, playback: "playing", microphone: "live" },
          history: [{ segment, thread: key, role: "assistant", text: reply, name: "project-1", time: Date.now(), session: "perf", seq: 1, audio: "playing" }],
          karaokeState: { segment, from: 0, to: 0 },
        });
        // The cue as the voice gives it: the sentence sounding, then the next one.
        let begin = 0;
        for (const sentence of sentences) {
          const from = begin, to = begin + sentence.length;
          setTimeout(() => store.patch({ karaokeState: { segment, from, to } }), Math.max(0, (from / VOICE) * 1000 - (performance.now() - started)));
          begin = to;
        }
        // What the room's beats write while a call stands as it was (room-session-controller.js callBeat, machinesBeat): the
        // same binding every 1.5 s and the same conversations every 6 s, each answer a new object.
        setInterval(() => store.patch({ roomBinding: { ...store.getState().facts.roomBinding } }), 1500);
        setInterval(() => { const facts = store.getState().facts; store.patch({ machinesAt: Date.now(), people: [...facts.people], harness: { ...facts.harness } }); }, 6000);
        // The speaker's level as the desktop app relays it (desktop#150): a reading about every 33 ms while a window
        // sounds, a voice's syllables (about 5 a second) with a pause between phrases.
        setInterval(() => {
          const t = performance.now() / 1000;
          const syllable = Math.max(0, Math.sin(t * 2 * Math.PI * 5.2)) ** 0.6;
          const phrase = Math.sin(t * 2 * Math.PI * 0.35) > -0.8 ? 1 : 0;
          playbackLevel.publish(Math.min(1, phrase * (0.15 + 0.7 * syllable * (0.7 + 0.3 * Math.sin(t * 17)))), key);
        }, 33);
      });
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
  for (const scenario of SCENARIOS.filter((s) => !process.env.PERF_ONLY || s.name.includes(process.env.PERF_ONLY))) {
    const browser = await webkit.launch({ headless: !process.env.PERF_HEADED, executablePath: process.env.PERF_WEBKIT || undefined });
    try {
      const page = await browser.newPage({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
      if (process.env.PERF_MOTION) await page.addInitScript((how) => localStorage.setItem("sidevoice.motion", how), process.env.PERF_MOTION);
      if (process.env.PERF_ANIMATED_THUMBNAILS) await page.addInitScript(() => localStorage.setItem("sidevoiceAnimatedThumbnails", "1"));
      await scenario.run(page);
      // The floor, for comparison: the same page with every CSS animation and transition stopped.
      if (process.env.PERF_NO_ANIMATIONS) await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important }" });
      if (process.env.PERF_STYLE) await page.addStyleTag({ content: process.env.PERF_STYLE });
      await page.waitForTimeout(SETTLE_MS);
      const mood = await page.locator(".stage-tile[data-mood]").first().getAttribute("data-mood");
      const motion = await page.evaluate(() => document.documentElement.dataset.motion);
      const moving = await animations(page);
      // On Linux only what this script started (a machine that runs other browsers too, a pod with several agents, must not
      // have theirs counted as the page's); macOS's XPC services are launchd's children, matched by their path.
      const cpu = await sample(SECONDS, process.platform === "linux" ? process.pid : undefined);
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
  const moving = rows.map((r) => `- ${r.scenario}: ${Object.entries(r.names).map(([n, c]) => `${n} ×${c}`).join(", ") || "none"}`).join("\n");
  console.log(table + "\nRunning animations:\n" + moving + "\n");
  if (process.env.PERF_SUMMARY) appendFileSync(process.env.PERF_SUMMARY, `${process.env.PERF_LABEL ? `### ${process.env.PERF_LABEL}\n\n` : ""}${table}\n<details><summary>Running animations</summary>\n\n${moving}\n\n</details>\n\n`);
} finally {
  server.kill();
}

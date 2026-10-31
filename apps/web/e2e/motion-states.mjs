import { installHarness } from "./harness.mjs";
import { probe } from "./motion-audit.mjs";

/* The states the room and its floating card can be put in, for the motion guard (motion-guard.spec.mjs) and the animation
 * audit (perf/animation-audit.mjs): the harness's paired machine with a few conversations, then the store patched as the
 * runtime would patch it (the harness has no core to call), and whatever feeds a state (the microphone's level, the
 * reply's progress) running on timers the probe does not count. */

export const conversation = (id, extra = {}) => ({ thread_id: `t${id}`, title: `project-${id}`, available: true, reach: { state: "listening" }, harness: "claude-code", ...extra });
export const SINGLE = [conversation(1)];
/** Six conversations, one of each kind: the call's own, one holding, one the machine cannot reach, one working, one with an
 *  unread reply, a plain one. */
export const MIXED = [conversation(1), conversation(2, { reach: { state: "holding" } }), conversation(3, { available: false, reach: { state: "offline" } }),
  conversation(4), conversation(5), conversation(6, { harness: "codex" })];

/** Run in the page: puts the room's store in the state `id`. Self-contained: it is sent to the page as source. The states:
 *  not-in-call, offline-machine, unread, working-no-call, joining, join-failed, and in a call: listening, working,
 *  person-speaking, transcribing, agent-speaking, reconnecting, muted, own-offline, idle-warning, unread-in-call. */
export function applyState({ id }) {
  const { store, micLevel, playbackLevel } = window.sidevoiceUI;
  const timers = window.__motion.timers;
  const people = store.getState().facts.people;
  const own = people.find((p) => p.thread_id === "t1");
  const keyOf = (thread) => `${people.find((p) => p.thread_id === thread)?.node}|${thread}`;
  const KEY = keyOf("t1");
  const REPLY = "I ran the tests: two fail in the settings pane, both about the Save button that no longer exists. Shall I update them?";
  const call = () => store.patch({
    ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
    roomBinding: { thread_id: "t1", title: "project-1" }, sessionId: "audit", micEnabled: true, userLive: false, botLive: false, callNode: own?.node,
    voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" },
  });
  const working = (...threads) => {
    const keys = threads.map(keyOf);
    store.patch({ harness: Object.fromEntries(keys.map((k) => [k, true])), workingSince: Object.fromEntries(keys.map((k) => [k, 0])) });
  };
  const reply = (audio) => ({ segment: "h-2", thread: KEY, role: "assistant", text: REPLY, name: "project-1", time: Date.now(), session: "audit", seq: 2, audio });
  const unread = () => store.patch({ history: [{ segment: "u-1", thread: keyOf("t5"), role: "assistant", text: "Both tests pass now.", name: "project-5", time: Date.now(), session: "audit", seq: 1 }], roomSeen: {} });
  /** The microphone's level as the runtime writes it (a reading every 32 ms, only the whole-percent changes). */
  const speak = () => {
    let level = 0, last = -1;
    window.sidevoiceAudio = { ...window.sidevoiceAudio, level: () => level / 100 };
    timers.setInterval(() => {
      const t = performance.now() / 1000;
      level = Math.round(Math.max(0, 40 + 35 * Math.sin(t * 7) + 15 * Math.sin(t * 23)));
      if (level === last) return;
      last = level;
      document.getElementById("mic-control")?.style.setProperty("--mic-level", String(level / 100));
      document.getElementById("mic-level-meter")?.setAttribute("aria-valuenow", String(level));
      micLevel?.publish?.(level);
    }, 32);
  };
  const turn = (phase) => store.patch({ userLive: phase === "listening", userTurn: { id: "u1", segment: "turn:u1", thread: KEY }, pendingPhase: phase,
    voiceState: { listening: phase === "listening" ? "speaking" : "listening", recognising: phase === "transcribing" ? 1 : 0, playback: "idle", microphone: "live" } });
  const says = () => {
    const history = store.getState().facts.history;
    store.patch({ botLive: true, history: [...history, reply("playing")], karaokeState: { segment: "h-2", from: 0, to: 0 },
      voiceState: { listening: "listening", recognising: 0, playback: "playing", microphone: "live" } });
    // The voice's cue names the sentence sounding, as the voice reaches it (14 characters a second); the page's words go on
    // inside it at their own pace (speech-reading.ts).
    let begin = 0;
    for (const sentence of REPLY.match(/[^.?]+[.?]\s*/g)) {
      const from = begin, to = begin + sentence.length;
      timers.setTimeout(() => store.patch({ karaokeState: { segment: "h-2", from, to } }), (from / 14) * 1000);
      begin = to;
    }
    timers.setInterval(() => playbackLevel.publish(0.3 + 0.4 * Math.abs(Math.sin(performance.now() / 120)), KEY), 33);
  };
  switch (id) {
    case "not-in-call": break;
    case "offline-machine": store.patch({ machineLinks: { [own.node]: { reach: "offline", via: "node" } } }); break;
    case "unread": unread(); break;
    case "working-no-call": working("t1", "t4"); break;
    case "joining": store.patch({ joinStep: "room", connecting: true }); break;
    case "join-failed": store.patch({ joinFailure: "The microphone could not be opened." }); break;
    case "listening": call(); break;
    case "working": call(); working("t1", "t4", "t5"); break;
    case "person-speaking": call(); turn("listening"); speak(); break;
    case "transcribing": call(); turn("transcribing"); break;
    case "agent-speaking": call(); says(); break;
    case "reconnecting": call(); store.patch({ reconnecting: true, reconnectShown: true }); break;
    case "muted": call(); store.patch({ micEnabled: false }); break;
    case "own-offline": call(); store.patch({ people: people.map((p) => p.thread_id === "t1" ? { ...p, available: false, reach: { state: "offline" } } : p) }); break;
    case "idle-warning": call(); store.patch({ callIdleWarning: true }); break;
    case "unread-in-call": call(); unread(); break;
    default: throw new Error("unknown state " + id);
  }
}

/** Puts the first conversation on the stage: its row in the sidebar on a wide window, the header's list on a phone. */
export async function choose(page) {
  const row = page.locator("#participants").getByText("project-1").first();
  const list = page.getByRole("button", { name: /^All conversations/ });
  await Promise.race([row.waitFor({ state: "visible", timeout: 6000 }).catch(() => null), list.waitFor({ state: "visible", timeout: 6000 }).catch(() => null)]);
  if (await row.isVisible()) await row.click();
  else {
    await list.click();
    await page.getByRole("button", { name: /^project-1/ }).first().click();
  }
  await page.locator(".stage-tile[data-mood]").waitFor();
}

/** The room on `page` (a fresh page of a fresh context), motion `mode` (gpu | still), the probe installed, the conversation
 *  chosen, then the state. `thumbnails`: the developer option that animates the conversations' thumbnails is on. `after`: "transcript" opens the transcript, "settings" (or "settings:<section>") opens Settings over the room. */
export async function openRoom(page, { people = MIXED, state = "not-in-call", mode = "still", after = null, thumbnails = false } = {}) {
  await page.addInitScript(probe);
  await page.addInitScript((how) => localStorage.setItem("sidevoice.motion", how), mode);
  // The developer option "Animate conversation thumbnails" (lib/animated-thumbnails.ts), on.
  if (thumbnails) await page.addInitScript(() => localStorage.setItem("sidevoiceAnimatedThumbnails", "1"));
  await installHarness(page, { participants: { first: people } });
  await page.goto("/voice/");
  await choose(page);
  // The room's beat asks the machine how the call stands once the page names its machine, and a harness that answers "no call"
  // ends the one patched in: those two questions stay unanswered while the agent speaks, so the reply goes on being said.
  if (state === "agent-speaking") await page.route((url) => /^\/api\/presentation(\/history)?$/.test(url.pathname), () => {});
  await page.evaluate(applyState, { id: state });
  if (after === "transcript") await page.locator("#transcript-toggle").click();
  if (after?.startsWith("settings")) {
    // Opened on a room that has settled: the room's animations are under way (a browser pausing animations in the same
    // task as it starts them leaves some running, which no person's click does). `settings:voice` opens that section.
    const section = after.split(":")[1] ?? "general";
    await page.waitForTimeout(1000);
    await page.evaluate((section) => {
      window.sidevoiceUI.store.patch({ settingsSection: section, settingsLevel: "page" });
      const dialog = document.getElementById("language-settings");
      if (dialog && !dialog.open) dialog.showModal();
    }, section);
    // The transcription's try keeps the microphone's level in view: a waveform that is flat until it listens.
    if (section === "transcription") await page.locator(".model-try-wave").first().scrollIntoViewIfNeeded();
  }
}

/** The desktop app's floating card (call-controls.html) in `state`, in `format` (card | pip | avatar) at `size`: the room's
 *  own projection of the call (its `callCard` snapshot) handed to the card through a host of its own, as the app hands it.
 *  `expanded`: the controls that wait for the pointer are out. `level` / `playback`: the microphone's / the reply's level
 *  arrive as the app relays them (about 30 a second). Returns the card's page, in `context`. */
export async function openCard(context, { state = "listening", format = "pip", size = "m", mode = "still", expanded = false, level = false, playback = false, people = MIXED } = {}) {
  // The room first, to say what the card is told in that state.
  const room = await context.newPage();
  await room.addInitScript(probe);
  await installHarness(room, { participants: { first: people } });
  await room.goto("/voice/");
  await choose(room);
  await room.evaluate(applyState, { id: state });
  const call = await room.evaluate(() => window.sidevoiceUI.store.getState().callCard);
  await room.close();
  const page = await context.newPage();
  await page.addInitScript(probe);
  await page.addInitScript(({ call, format, size, mode, level, expanded }) => {
    localStorage.setItem("sidevoice.motion", mode);
    localStorage.setItem("sidevoice.floatingCard", JSON.stringify({ format, size }));
    const state = { call: { ...call, version: 2, since: Date.now() - 65_000 }, level: level ? 40 : 0, pointerInside: expanded ? true : null, alwaysExpanded: expanded,
      muteShortcut: "Ctrl+Alt+M", playback: { level: 0, threadId: null }, place: { vertical: "upper", horizontal: "right" }, size: null };
    window.__cardState = state;
    window.__sidevoiceHost = { host: { callControls: {
      subscribe(listener) { window.__cardListener = listener; listener(window.__cardState); return () => {}; },
      run() {}, layout() {}, drag() {}, resize() {},
    } } };
  }, { call, format, size, mode, level, expanded });
  await page.goto("/voice/call-controls.html");
  await page.locator(".floating-card").waitFor();
  // The pointer parked away from the card, in the window's far corner: a browser that finds a pointer over what a card just
  // drew sends it hover events (Chromium does), and the avatar's compact card then opens and folds under it.
  const { width, height } = page.viewportSize();
  await page.mouse.move(width - 2, height - 2);
  if (level || playback) await page.evaluate(({ level, playback }) => {
    window.__motion.timers.setInterval(() => {
      const t = performance.now() / 1000;
      const next = Math.round(Math.max(0, 40 + 35 * Math.sin(t * 7) + 15 * Math.sin(t * 23)));
      window.__cardListener({ ...window.__cardState, level: level ? next : 0,
        playback: playback ? { level: 0.3 + 0.4 * Math.abs(Math.sin(t * 8)), threadId: window.__cardState.call.conversation } : window.__cardState.playback });
    }, 33);
  }, { level, playback });
  return page;
}

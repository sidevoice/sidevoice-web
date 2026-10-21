import { expect, test } from "@playwright/test";
import { observe, paints, violations } from "./motion-audit.mjs";
import { MIXED, openCard, openRoom } from "./motion-states.mjs";

/* Everything that moves is a compositable animation on an HTML layer, and nothing moves where nobody sees it (desktop#149,
 * web#278, the audit of 2026-10-21: perf/animation-audit.mjs). In real browsers (WebKit and Chromium, as the other specs),
 * for each state the room and its card can be in, with the drawings moving as GPU layers and held still, the animations
 * the page runs are read (document.getAnimations) and held to the rule (e2e/motion-audit.mjs `violations`):
 *
 *   svg        no running animation on an element inside an SVG (WebKit repaints the drawing on the CPU every frame)
 *   property   no running animation moves anything but transform and opacity (the rest lays out or paints every frame)
 *   invisible  no infinite animation runs where nobody sees it (hidden, zero-size, off screen, clipped away, covered by an
 *              opaque page, behind opacity 0)
 *   restarted  no transition or animation starts again in every second of the window (one retargeted on each reading)
 *
 * What script moves is held to the same three rules: a loop of writes to an element's style, class, attributes or content (in
 * every second of the window, more than twice a second) is read as an animation of what it moves (a custom property, a class
 * or an attribute: the properties the page's CSS makes of it) — so a `--level` that drives a transform is fine, one that drives
 * a width, or a text rewritten four times a second, or anything written inside an SVG or where nobody sees it, is not.
 *
 * Besides, a room where nothing is happening holds still: no animation, no animation-frame loop, and in Chromium (whose trace tells)
 * no loop of painted frames (PAINT_BUDGET). The intended exceptions are
 * the allowlist in motion-audit.mjs, each with its reason. A failure names the animation, its element and the rule. */

/** The room, in a call or not. `quiet`: with the drawings held still and nothing happening, nothing runs at all. */
// Review rule: these are written by hand (a state is a patch of the room's store, applyState in motion-states.mjs), not
// generated from the app's model: the moods (AvatarMood, features/avatar/avatar-spec.ts) and the call's phases are TypeScript,
// which this plain-JS spec cannot import, and a state needs a patch that makes it true, which only a person can write. So a
// change that adds a mood, a call phase, a conversation state, or anything that animates or is rewritten on a timer, adds its
// state here (and to CARDS when the floating card shows it) in the same PR. A reviewer asks for it.
const STATES = [
  { id: "six conversations, no call", state: "not-in-call", quiet: true },
  { id: "the machine does not answer", state: "offline-machine", quiet: true },
  { id: "an unread reply", state: "unread" },
  { id: "in a call, listening", state: "listening", quiet: true },
  { id: "in a call, the agent and two others working", state: "working" },
  { id: "in a call, the person speaking", state: "person-speaking" },
  { id: "in a call, the person speaking, transcript open", state: "person-speaking", after: "transcript" },
  { id: "in a call, the turn being transcribed", state: "transcribing" },
  { id: "in a call, the agent speaking", state: "agent-speaking" },
  { id: "in a call, the agent speaking, thumbnails animated", state: "agent-speaking", thumbnails: true },
  { id: "in a call, the agent and two others working, thumbnails animated", state: "working", thumbnails: true },
  { id: "in a call, reconnecting", state: "reconnecting" },
  { id: "in a call, its conversation offline", state: "own-offline" },
  { id: "in a call, Settings open over it", state: "listening", after: "settings" },
  { id: "Settings at Transcription, its level in view, nothing happening", state: "listening", after: "settings:transcription", quiet: true },
];
/** Those that also run on a phone, where the conversations and the transcript wait off screen. */
const ON_A_PHONE = ["in a call, the agent and two others working", "in a call, the person speaking, transcript open", "in a call, Settings open over it"];

/** Frames a second Chromium may paint on a page where nothing is happening: a one-off (a row settling) is not a loop. */
const PAINT_BUDGET = 1;

/** The desktop app's card, by format: the states that move it. */
const CARDS = {
  card: ["working", "person-speaking"],
  pip: ["working", "person-speaking", "agent-speaking", "reconnecting"],
  avatar: ["person-speaking", "agent-speaking"],
};

/** A settled page watched for two and a half seconds: enough to tell a loop from a one-off (the CI runs both browsers). */
const watch = (page) => observe(page, { settle: 1000, duration: 2500, samples: 3 });
/** The findings as readable lines, or an empty list. */
const broken = (seen) => violations(seen).map((finding) => finding.text);
/** What loops, for a message: keyframe animations (a transition is a state's fade, over in a few hundred ms). */
const running = (seen) => seen.animations.filter((a) => a.kind !== "CSSTransition").map((a) => `${a.kind} "${a.name}" on ${a.target}`);

for (const mode of ["gpu", "still"]) {
  test.describe(`drawings ${mode === "gpu" ? "move as GPU layers" : "hold still"}`, () => {
    test.describe("desktop", () => {
      for (const spec of STATES) {
        test(spec.id, async ({ page, browser, browserName }) => {
          await openRoom(page, { people: MIXED, state: spec.state, mode, after: spec.after, thumbnails: spec.thumbnails });
          const seen = await watch(page);
          expect(broken(seen)).toEqual([]);
          // Held still, with nothing happening: nothing runs, nothing asks for a frame, and the browser paints nothing
          // (Chromium's trace tells; WebKit has none).
          if (spec.quiet && mode === "still") {
            expect(running(seen)).toEqual([]);
            expect(seen.counted.rafPerSecond).toBe(0);
            if (browserName === "chromium") expect((await paints(browser, page)).perSecond).toBeLessThanOrEqual(PAINT_BUDGET);
          }
        });
      }
    });

    test.describe("phone", () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      for (const spec of STATES.filter((s) => ON_A_PHONE.includes(s.id))) {
        test(spec.id, async ({ page }) => {
          await openRoom(page, { people: MIXED, state: spec.state, mode, after: spec.after });
          expect(broken(await watch(page))).toEqual([]);
        });
      }
    });

    test.describe("the desktop app's floating card", () => {
      test.use({ viewport: { width: 520, height: 640 } });
      for (const [format, states] of Object.entries(CARDS)) {
        for (const state of states) {
          test(`${format}: ${state}`, async ({ context }) => {
            const page = await openCard(context, { state, format, mode, expanded: format !== "avatar", level: state === "person-speaking", playback: state === "agent-speaking" });
            expect(broken(await watch(page))).toEqual([]);
          });
        }
      }
    });
  });
}

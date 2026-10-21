import { expect, test } from "@playwright/test";
import { observe, violations } from "./motion-audit.mjs";
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
 * and a room where nothing is happening holds still: no animation, no animation-frame loop. The intended exceptions are
 * the allowlist in motion-audit.mjs, each with its reason. A failure names the animation, its element and the rule. */

/** The room, in a call or not. `quiet`: with the drawings held still and nothing happening, nothing runs at all. */
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
  { id: "in a call, reconnecting", state: "reconnecting" },
  { id: "in a call, its conversation offline", state: "own-offline" },
  { id: "in a call, Settings open over it", state: "listening", after: "settings" },
];
/** Those that also run on a phone, where the conversations and the transcript wait off screen. */
const ON_A_PHONE = ["in a call, the agent and two others working", "in a call, the person speaking, transcript open", "in a call, Settings open over it"];

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
        test(spec.id, async ({ page }) => {
          await openRoom(page, { people: MIXED, state: spec.state, mode, after: spec.after });
          const seen = await watch(page);
          expect(broken(seen)).toEqual([]);
          // Held still, with nothing happening: nothing runs, and nothing asks for a frame.
          if (spec.quiet && mode === "still") {
            expect(running(seen)).toEqual([]);
            expect(seen.counted.rafPerSecond).toBe(0);
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

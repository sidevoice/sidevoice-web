import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/* The creature waiting in the New conversation panel and in the setup's last step is a sharp live face: it is drawn on the
 * sharp faces' own stage (creature/host.ts, mocked here: the test's DOM has no WebGL), which goes with its last creature
 * (host.test.ts). So it must be let go of the moment the panel closes or the step goes: no WebGL context outlives them. */

const host = vi.hoisted(() => ({ lives: [] as Array<{ opts: Record<string, unknown>; disposed: boolean }> }));
vi.mock("../avatar/creature/host", () => ({
  creaturesDrawable: () => true,
  onCreaturesChange: () => () => {},
  mountCreature: (opts: Record<string, unknown>) => {
    const live = { opts, disposed: false };
    host.lives.push(live);
    return { setMood() {}, setMoving() {}, dispose: () => { live.disposed = true; } };
  },
  faceBox: () => ({ l: 0, r: 144, t: 0, b: 144, w: 144, h: 144 }),
  drawFace: () => () => {},
}));
const { NewConversation } = await import("./NewConversation");
const { ConnectYourAgent } = await import("./ConnectYourAgent");

/** The host is loaded on first use (a dynamic import): lets it land. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const sharp = () => host.lives.filter((live) => live.opts.sharp);
beforeEach(() => { host.lives.length = 0; });
afterEach(cleanup);

test("New conversation's panel draws its creature sharp, and lets it go when the panel closes", async () => {
  render(<NewConversation />);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  await settle();
  expect(sharp()).toHaveLength(1);
  expect(sharp()[0].opts).toMatchObject({ framing: "face", sharp: true, whole: false, moving: false });
  expect(sharp()[0].disposed).toBe(false);
  // Closed (Escape, as a click outside or the button again): the creature, and so its stage, goes.
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await settle();
  expect(document.querySelector(".ui-popover")).toBeNull();
  expect(sharp().every((live) => live.disposed)).toBe(true);
});

test("the setup's last step (its compact block) lets its creature go when the step goes", async () => {
  const view = render(<ConnectYourAgent titleAs="h3" compact />);
  await settle();
  expect(sharp()).toHaveLength(1);
  expect(sharp()[0].disposed).toBe(false);
  view.unmount();
  expect(sharp()[0].disposed).toBe(true);
});

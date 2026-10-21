import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { playbackLevel } from "../../state/playback-level";
import { avatarFor, type AvatarMood } from "./avatar-spec";
import { createAvatarStates, type AvatarStates } from "./avatar-state";
import { CharacterAvatar } from "./CharacterAvatar";
import { smoothPlaybackLevel } from "./playback-mouth";

let states: AvatarStates;
beforeEach(() => { states = createAvatarStates(); });
afterEach(() => { states.clear(); playbackLevel.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

const spec = avatarFor("fp|one");
const speaker = (mood: AvatarMood, voice = "fp|one") => act(() => states.set("one", { spec, mood, voice }));
/** One copy of the figure "one", drawn from its state. */
/** The mouth a copy moves: the one `.m-open` that is not a layered drawing's still clone. */
const mouthOf = (avatar: Element) => avatar.querySelector<SVGElement>(".m-open:not([data-clone])")!;
const copy = () => <CharacterAvatar spec={spec} state={states.get("one")!} size="stage" mouth="playback" mouthLevel={states.mouth("one")} />;

test("the stage mouth follows only its conversation's output, rests at zero and when it leaves", () => {
  vi.useFakeTimers();
  playbackLevel.clear();
  speaker("speaking");
  const view = render(copy());
  const avatar = view.container.firstElementChild as HTMLElement;
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  expect(avatar).not.toHaveAttribute("data-beat");
  act(() => playbackLevel.publish(0.9, "fp|other"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(avatar).toHaveAttribute("data-mouth-active");
  expect(Number(mouthOf(avatar).style.getPropertyValue("--mouth"))).toBeGreaterThan(0.5);
  act(() => playbackLevel.publish(0, "fp|one"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  act(() => vi.advanceTimersByTime(300));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.7, "fp|one"));
  speaker("speaking", "fp|two");
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.7, "fp|two"));
  expect(avatar).toHaveAttribute("data-mouth-active");
  speaker("idle", "fp|two");
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  speaker("speaking", "fp|two");
  act(() => playbackLevel.publish(0.7, "fp|two"));
  view.unmount();
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|two"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
});

test("smoothing is bounded and silence is immediate", () => {
  expect(smoothPlaybackLevel(0, 0.8)).toBeCloseTo(0.56);
  expect(smoothPlaybackLevel(0.56, 0.8)).toBeGreaterThan(0.56);
  expect(smoothPlaybackLevel(0.8, 0.04)).toBe(0);
  expect(smoothPlaybackLevel(0.8, Number.NaN)).toBe(0);
});

test("a stale cached level stays silent across remount and mood changes", () => {
  vi.useFakeTimers();
  playbackLevel.clear();
  speaker("speaking");
  const view = render(copy());
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(view.container.firstElementChild).toHaveAttribute("data-mouth-active");
  act(() => vi.advanceTimersByTime(200));
  view.unmount();
  const again = render(copy());
  expect(again.container.firstElementChild).toHaveAttribute("data-mouth-active");
  act(() => vi.advanceTimersByTime(100));
  expect(again.container.firstElementChild).not.toHaveAttribute("data-mouth-active");
  again.unmount();
  const stale = render(copy());
  expect(stale.container.firstElementChild).not.toHaveAttribute("data-mouth-active");
  speaker("idle");
  speaker("speaking");
  expect(stale.container.firstElementChild).not.toHaveAttribute("data-mouth-active");
});

test("two copies of one figure open their mouths together, one drawn mid-word included", () => {
  speaker("speaking");
  const stage = render(copy()).container.firstElementChild as HTMLElement;
  act(() => playbackLevel.publish(0.8, "fp|one"));
  act(() => playbackLevel.publish(0.5, "fp|one"));
  const thumbnail = render(<CharacterAvatar spec={spec} state={states.get("one")!} size="small" mouth="playback" mouthLevel={states.mouth("one")} />)
    .container.firstElementChild as HTMLElement;
  expect(mouthOf(thumbnail).style.getPropertyValue("--mouth")).toBe(mouthOf(stage).style.getPropertyValue("--mouth"));
  expect(thumbnail).toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.9, "fp|one"));
  expect(mouthOf(thumbnail).style.getPropertyValue("--mouth")).toBe(mouthOf(stage).style.getPropertyValue("--mouth"));
});

test("the level is written on the mouth alone: a custom property on the root would restyle the whole drawing on each reading", () => {
  speaker("speaking");
  const avatar = render(copy()).container.firstElementChild as HTMLElement;
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(mouthOf(avatar).style.getPropertyValue("--mouth")).not.toBe("");
  expect(avatar.style.getPropertyValue("--mouth")).toBe("");
  // Every other element of the drawing is left as it was.
  expect([...avatar.querySelectorAll("*")].filter((element) => (element as HTMLElement).style?.getPropertyValue("--mouth"))).toEqual([mouthOf(avatar)]);
  act(() => playbackLevel.publish(0, "fp|one"));
  expect(mouthOf(avatar).style.getPropertyValue("--mouth")).toBe("0");
});

test("a reading that changes nothing writes nothing, and the mouth it lands on is found again when the drawing is replaced", () => {
  speaker("speaking");
  const avatar = render(copy()).container.firstElementChild as HTMLElement;
  act(() => playbackLevel.publish(0.8, "fp|one"));
  const first = mouthOf(avatar);
  const write = vi.spyOn(first.style, "setProperty");
  // The mouth settles on a steady level (smoothing: playback-mouth.ts), and then has nothing to write.
  for (let reading = 0; reading < 20; reading += 1) act(() => playbackLevel.publish(0.8, "fp|one"));
  const settled = write.mock.calls.length;
  expect(settled).toBeGreaterThan(0);
  expect(settled).toBeLessThan(20);
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(write.mock.calls.length).toBe(settled);
  // The drawing cut into layers (or put back) leaves another mouth in its place: the next reading, and the level the
  // old one showed, are on it at once. A clone of the mouth that a layer holds still is never written.
  const replacement = first.cloneNode(true) as SVGElement;
  replacement.style.removeProperty("--mouth");
  const clone = first.cloneNode(true) as SVGElement;
  clone.setAttribute("data-clone", "");
  clone.style.removeProperty("--mouth");
  first.replaceWith(replacement);
  replacement.after(clone);
  act(() => playbackLevel.publish(0.6, "fp|one"));
  expect(replacement.style.getPropertyValue("--mouth")).not.toBe("");
  expect(clone.style.getPropertyValue("--mouth")).toBe("");
});

test("every copy runs its animations from the moment its state last changed, whenever it was drawn", () => {
  // The page's animations, one per element: what the engine's CSS would start on it.
  const animations = new WeakMap<Element, { animationName: string; startTime: number | null }[]>();
  const transition = { transitionProperty: "transform", startTime: 5 };
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value(this: HTMLElement) {
    if (!animations.has(this)) animations.set(this, [{ animationName: "bx-blink", startTime: null }]);
    return [...animations.get(this)!, transition];
  } });
  try {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    act(() => states.set("one", { spec, mood: "working" }));
    const stage = render(copy()).container.firstElementChild!;
    expect(animations.get(stage)![0].startTime).toBe(1000);
    // Later, a thumbnail appears: its animations run from the same moment, not from its own drawing.
    vi.mocked(performance.now).mockReturnValue(4000);
    const thumbnail = render(<CharacterAvatar spec={spec} state={states.get("one")!} size="small" />).container.firstElementChild!;
    expect(animations.get(thumbnail)![0].startTime).toBe(1000);
    // A transition is left to itself.
    expect(transition.startTime).toBe(5);
  } finally {
    delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations;
  }
});

test("a still mouth follows nothing: a thumbnail rests while its agent speaks", () => {
  speaker("speaking");
  const thumbnail = render(<CharacterAvatar spec={spec} state={states.get("one")!} size="small" mouth="still" />).container
    .firstElementChild as HTMLElement;
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(thumbnail).toHaveAttribute("data-mouth", "still");
  expect(thumbnail).not.toHaveAttribute("data-mouth-active");
  expect(mouthOf(thumbnail).style.getPropertyValue("--mouth")).toBe("");
});

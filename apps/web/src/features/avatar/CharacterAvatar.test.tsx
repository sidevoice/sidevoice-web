import { afterEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { playbackLevel } from "../../state/playback-level";
import { avatarFor } from "./avatar-spec";
import { CharacterAvatar } from "./CharacterAvatar";
import { smoothPlaybackLevel } from "./playback-mouth";

afterEach(() => { playbackLevel.clear(); vi.useRealTimers(); });

test("the stage mouth follows only its conversation's output, rests at zero and when it leaves", () => {
  vi.useFakeTimers();
  playbackLevel.clear();
  const view = render(<CharacterAvatar spec={avatarFor("fp|one")} mood="speaking" size="stage" mouth="playback" playbackThreadId="fp|one" />);
  const avatar = view.container.firstElementChild as HTMLElement;
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  expect(avatar).not.toHaveAttribute("data-beat");
  act(() => playbackLevel.publish(0.9, "fp|other"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(avatar).toHaveAttribute("data-mouth-active");
  expect(Number(avatar.style.getPropertyValue("--mouth"))).toBeGreaterThan(0.5);
  act(() => playbackLevel.publish(0, "fp|one"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  act(() => vi.advanceTimersByTime(300));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.7, "fp|one"));
  view.rerender(<CharacterAvatar spec={avatarFor("fp|one")} mood="speaking" size="stage" mouth="playback" playbackThreadId="fp|two" />);
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  act(() => playbackLevel.publish(0.7, "fp|two"));
  expect(avatar).toHaveAttribute("data-mouth-active");
  view.rerender(<CharacterAvatar spec={avatarFor("fp|one")} mood="idle" size="stage" mouth="playback" playbackThreadId="fp|one" />);
  expect(avatar).not.toHaveAttribute("data-mouth-active");
  view.unmount();
  act(() => playbackLevel.publish(0.8, "fp|one"));
  expect(avatar).not.toHaveAttribute("data-mouth-active");
});

test("smoothing is bounded and silence is immediate", () => {
  expect(smoothPlaybackLevel(0, 0.8)).toBeCloseTo(0.56);
  expect(smoothPlaybackLevel(0.56, 0.8)).toBeGreaterThan(0.56);
  expect(smoothPlaybackLevel(0.8, 0.04)).toBe(0);
  expect(smoothPlaybackLevel(0.8, Number.NaN)).toBe(0);
});

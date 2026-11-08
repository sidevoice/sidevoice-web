import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ANIMATED_THUMBNAILS_KEY, animatedThumbnails, setAnimatedThumbnails, useAnimatedThumbnails } from "./animated-thumbnails";

afterEach(() => localStorage.clear());

test("off until it is switched on, and kept on this device", () => {
  expect(animatedThumbnails()).toBe(false);
  setAnimatedThumbnails(true);
  expect(localStorage.getItem(ANIMATED_THUMBNAILS_KEY)).toBe("1");
  expect(animatedThumbnails()).toBe(true);
  setAnimatedThumbnails(false);
  expect(localStorage.getItem(ANIMATED_THUMBNAILS_KEY)).toBeNull();
  expect(animatedThumbnails()).toBe(false);
});

test("a component follows it as it changes, and another window's change", () => {
  const { result } = renderHook(() => useAnimatedThumbnails());
  expect(result.current).toBe(false);
  act(() => setAnimatedThumbnails(true));
  expect(result.current).toBe(true);
  localStorage.removeItem(ANIMATED_THUMBNAILS_KEY);
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: ANIMATED_THUMBNAILS_KEY })); });
  expect(result.current).toBe(false);
});

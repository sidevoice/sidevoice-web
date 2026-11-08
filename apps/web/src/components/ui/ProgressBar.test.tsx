import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { ProgressBar } from "./ProgressBar";

const fillOf = (container: HTMLElement) => container.querySelector<HTMLElement>(".ui-progress-fill")!;

test("a bar that waits has no figure, and its first figure is a fill of its own, not the waiting one resized", () => {
  const { container, rerender } = render(<ProgressBar value={null} label="Downloading" />);
  const bar = container.querySelector("[role=progressbar]")!;
  const waiting = fillOf(container);
  expect(bar.hasAttribute("data-indeterminate")).toBe(true);
  expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  expect(waiting.style.width).toBe("");

  // The waiting fill is 35% wide: resized to the figure, its width transition would run the bar backwards from there.
  rerender(<ProgressBar value={0.02} label="Downloading" />);
  const first = fillOf(container);
  expect(first).not.toBe(waiting);
  expect(first.style.width).toBe("2%");
  expect(bar.hasAttribute("data-indeterminate")).toBe(false);
  expect(bar.getAttribute("aria-valuenow")).toBe("2");

  // From there on it is the same fill, so that its width does move between figures.
  rerender(<ProgressBar value={0.5} label="Downloading" />);
  expect(fillOf(container)).toBe(first);
  expect(first.style.width).toBe("50%");
});

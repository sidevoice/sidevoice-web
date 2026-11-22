import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CantReceiveIcon, CaptionsOffIcon, StateGlyph, VoiceBarsIcon, type StateGlyphKind } from "./Icons";

afterEach(cleanup);

/* The decided state icons and the one place that says which one a state wears. */

const KINDS: StateGlyphKind[] = ["listening", "transcribing", "speaking", "working", "muted", "holding", "offline"];

test("every state has an icon of its own, hidden from assistive tech, and the class its colour hangs on", () => {
  const seen = new Set<string>();
  for (const kind of KINDS) {
    const { container, unmount } = render(<StateGlyph kind={kind} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("state-glyph", "state-glyph-" + kind);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // The line of the whole set: round caps and joins, never a fill of its own.
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
    expect(svg).toHaveAttribute("fill", "none");
    seen.add(svg.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, ""));
    unmount();
  }
  // Seven states, seven drawings.
  expect(seen.size).toBe(KINDS.length);
});

test("the icon's size is the caller's, 16 by default", () => {
  const { container } = render(<><StateGlyph kind="holding" /><StateGlyph kind="holding" size={11} /></>);
  const [a, b] = [...container.querySelectorAll("svg")];
  expect([a.getAttribute("width"), b.getAttribute("width")]).toEqual(["16", "11"]);
});

test("can't receive is a tray with a slash, the slash cut out of the tray; two of them never share the cut", () => {
  const { container } = render(<><CantReceiveIcon /><CantReceiveIcon /></>);
  const [a, b] = [...container.querySelectorAll("svg")];
  const mask = (svg: Element) => svg.querySelector("mask")!.getAttribute("id")!;
  expect(mask(a)).not.toBe(mask(b));
  for (const svg of [a, b]) {
    expect(svg.querySelector("g")).toHaveAttribute("mask", "url(#" + mask(svg) + ")");
    // The tray's outline at stroke 2, the slash 2.2: the live-activity design's traySlash.
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg.querySelector(":scope > path")).toHaveAttribute("stroke-width", "2.2");
  }
  expect(a.querySelector("g")!.innerHTML).toContain("M3 13.5h4.3l1.3 2.5h4.8l1.3-2.5H21");
});

test("a struck caption box is cut by its slash too, in the room's stroke", () => {
  const { container } = render(<CaptionsOffIcon />);
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("stroke-width", "2.2");
  expect(svg.querySelector("mask")).not.toBeNull();
});

test("transcribing is the voice mark's five bars", () => {
  const { container } = render(<VoiceBarsIcon />);
  expect(container.querySelector("svg path")!.getAttribute("d")!.match(/M/g)).toHaveLength(5);
});

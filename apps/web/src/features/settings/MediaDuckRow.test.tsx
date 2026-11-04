import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MediaDuckRow } from "./MediaDuckRow";
import { translator } from "../../i18n/translator";
import type { MediaDuckMode, MediaDuckStatus } from "../../host";

const en = translator("en");

afterEach(() => { delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost; });

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host } });
}

const status = (changes: Partial<MediaDuckStatus> = {}): MediaDuckStatus => ({ mode: "lower", lower: "per-app", pause: "media-controls", access: "granted", ...changes });

function bridge(now: MediaDuckStatus, fail = false) {
  return {
    get: vi.fn(async () => now),
    set: vi.fn(async (mode: MediaDuckMode) => { if (fail) throw new Error("nope"); return { ...now, mode }; }),
  };
}

test("a browser, or an app without the member, shows nothing", () => {
  const outside = render(<MediaDuckRow t={en} />);
  expect(outside.container).toBeEmptyDOMElement();
  outside.unmount();
  inApp({ muteShortcut: {} });
  expect(render(<MediaDuckRow t={en} />).container).toBeEmptyDOMElement();
});

test("lowering is what the app reports first, and a choice is sent to the app", async () => {
  const media = bridge(status());
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Pause" }));
  expect(media.set).toHaveBeenCalledWith("pause");
  expect(await screen.findByRole("radio", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
});

test("a choice the app refuses goes back to what it was", async () => {
  inApp({ mediaDuck: bridge(status(), true) });
  render(<MediaDuckRow t={en} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Do nothing" }));
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toHaveAttribute("aria-checked", "true");
});

test("what the system cannot do is disabled, and the hint says how the rest works", async () => {
  inApp({ mediaDuck: bridge(status({ lower: "none", pause: "some-apps", mode: "pause" })) });
  const view = render(<MediaDuckRow t={en} />);
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toBeDisabled();
  expect(screen.getByText(/Only Music and Spotify/)).toBeInTheDocument();
  view.unmount();
  inApp({ mediaDuck: bridge(status({ mode: "pause", pause: "some-apps", access: "denied" })) });
  const denied = render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/isn’t allowed to control Music and Spotify/)).toBeInTheDocument();
  denied.unmount();
  inApp({ mediaDuck: bridge(status({ lower: "system" })) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/whole output volume, Sidevoice’s voice included/)).toBeInTheDocument();
});

import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MediaDuckRow } from "./MediaDuckRow";
import { translator } from "../../i18n/translator";
import type { MediaDuckMode, MediaDuckStatus } from "../../host";

const en = translator("en");

afterEach(() => { delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost; });

function inApp(host: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host } });
}

const status = (changes: Partial<MediaDuckStatus> = {}): MediaDuckStatus => ({ mode: "lower", lower: "per-app", pause: "media-controls", ...changes });

function bridge(now: MediaDuckStatus, fail = false) {
  return {
    allow: vi.fn(async (): Promise<MediaDuckStatus> => ({ ...now, access: "granted" })),
    get: vi.fn(async () => now),
    set: vi.fn(async (mode: MediaDuckMode) => { if (fail) throw new Error("nope"); return { ...now, mode }; }),
  };
}

test("a browser, or an app without the member, shows nothing", () => {
  const outside = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(outside.container).toBeEmptyDOMElement();
  outside.unmount();
  inApp({ muteShortcut: {} });
  expect(render(<MediaDuckRow t={en} openPermissions={() => undefined} />).container).toBeEmptyDOMElement();
});

test("lowering is what the app reports first, and a choice is sent to the app", async () => {
  const media = bridge(status());
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Pause" }));
  expect(media.set).toHaveBeenCalledWith("pause");
  expect(await screen.findByRole("radio", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
});

test("a choice the app refuses goes back to what it was", async () => {
  inApp({ mediaDuck: bridge(status(), true) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Do nothing" }));
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toHaveAttribute("aria-checked", "true");
});

test("what the system cannot do is disabled, and the hint says how the rest works", async () => {
  inApp({ mediaDuck: bridge(status({ lower: "none", pause: "some-apps", mode: "pause" })) });
  const view = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByRole("radio", { name: "Lower volume" })).toBeDisabled();
  expect(screen.getByText(/Only Music and Spotify/)).toBeInTheDocument();
  view.unmount();
  inApp({ mediaDuck: bridge(status({ lower: "some-apps" })) });
  const some = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText(/only Music and Spotify can be lowered/)).toBeInTheDocument();
  some.unmount();
  inApp({ mediaDuck: bridge(status()) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText(/and while the agent is speaking/)).toBeInTheDocument();
});

test("Pause on a Mac says only Music and Spotify are paused, not YouTube, browsers or other apps", async () => {
  inApp({ mediaDuck: bridge(status({ mode: "pause", lower: "per-app", pause: "some-apps", access: "granted", capture: "granted" })) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText("Only Music and Spotify can be paused, not YouTube, browsers or other apps.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

test("a permission the choice needs is said with a link to Permissions; the row itself never asks", async () => {
  const openPermissions = vi.fn();
  const cases: [Partial<MediaDuckStatus>, RegExp][] = [
    [{ lower: "some-apps", pause: "some-apps", access: "granted", capture: "undetermined" }, /Without System Audio Recording, only Music and Spotify can be lowered/],
    [{ lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "denied" }, /Without System Audio Recording/],
    [{ lower: "some-apps", pause: "some-apps", access: "denied" }, /needs permission to control Music and Spotify/],
    [{ mode: "pause", lower: "per-app", pause: "some-apps", access: "undetermined", capture: "granted" }, /needs permission to control Music and Spotify/],
  ];
  for (const [changes, hint] of cases) {
    const media = bridge(status(changes));
    inApp({ mediaDuck: media });
    const view = render(<MediaDuckRow t={en} openPermissions={openPermissions} />);
    expect(await screen.findByText(hint)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Permissions" }));
    expect(media.allow).not.toHaveBeenCalled();
    view.unmount();
  }
  expect(openPermissions).toHaveBeenCalledTimes(cases.length);
});

test("no link when nothing is missing: elsewhere, doing nothing, allowed, or Music and Spotify not open to tell", async () => {
  const cases: Partial<MediaDuckStatus>[] = [
    {},
    { mode: "off", lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "undetermined" },
    { lower: "per-app", pause: "some-apps", access: "denied", capture: "granted" },
    { lower: "some-apps", pause: "some-apps", access: "unknown" },
  ];
  for (const changes of cases) {
    inApp({ mediaDuck: bridge(status(changes)) });
    const view = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
    await screen.findAllByRole("radio");
    expect(screen.queryByRole("button", { name: "Open Permissions" })).toBeNull();
    view.unmount();
  }
});

test("Lower where this computer cannot lower says to choose Pause", async () => {
  inApp({ mediaDuck: bridge(status({ lower: "none", pause: "media-controls" })) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText(/Choose Pause instead/)).toBeInTheDocument();
});

test("a late answer does not overwrite a newer choice; coming back to the window reads again", async () => {
  let release: (value: MediaDuckStatus) => void = () => undefined;
  const media = bridge(status({ mode: "off" }));
  media.set.mockImplementationOnce(() => new Promise<MediaDuckStatus>((resolve) => { release = resolve; }));
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Lower volume" }));
  fireEvent.click(screen.getByRole("radio", { name: "Do nothing" }));
  expect(await screen.findByRole("radio", { name: "Do nothing" })).toHaveAttribute("aria-checked", "true");
  await act(async () => { release(status({ mode: "lower" })); });
  expect(screen.getByRole("radio", { name: "Do nothing" })).toHaveAttribute("aria-checked", "true");
  const reads = media.get.mock.calls.length;
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(media.get).toHaveBeenCalledTimes(reads + 1);
});

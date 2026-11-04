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

const status = (changes: Partial<MediaDuckStatus> = {}): MediaDuckStatus => ({ mode: "lower", lower: "per-app", pause: "media-controls", access: "granted", ...changes });

function bridge(now: MediaDuckStatus, fail = false) {
  return {
    allow: vi.fn(async (): Promise<MediaDuckStatus> => ({ ...now, access: "granted" })),
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
  expect(await screen.findByText(/can’t lower or pause Music and Spotify/)).toBeInTheDocument();
  denied.unmount();
  inApp({ mediaDuck: bridge(status({ lower: "some-apps" })) });
  const some = render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/only Music and Spotify can be lowered/)).toBeInTheDocument();
  some.unmount();
  inApp({ mediaDuck: bridge(status()) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/and while the agent is speaking/)).toBeInTheDocument();
});

test("on a Mac where the app has not been allowed, Lower says it needs it and Allow asks, once, when pressed", async () => {
  const media = bridge(status({ lower: "some-apps", pause: "some-apps", access: "undetermined" }));
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/needs permission to control them/)).toBeInTheDocument();
  expect(media.allow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Allow" }));
  expect(media.allow).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/only Music and Spotify can be lowered/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
});

test("nothing to allow elsewhere, or when the choice is to do nothing, or once the system has said no", async () => {
  inApp({ mediaDuck: bridge(status()) });
  const view = render(<MediaDuckRow t={en} />);
  await screen.findByRole("radio", { name: "Lower volume" });
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  view.unmount();
  inApp({ mediaDuck: bridge(status({ mode: "off", lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "undetermined" })) });
  const off = render(<MediaDuckRow t={en} />);
  await screen.findByRole("radio", { name: "Do nothing" });
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  off.unmount();
  inApp({ mediaDuck: bridge(status({ lower: "some-apps", pause: "some-apps", access: "denied" })) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/can’t lower or pause Music and Spotify/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
});

test("neither Music nor Spotify open: the hint says to open one first and there is nothing to press yet; coming back to the window reads again", async () => {
  const states = [status({ lower: "some-apps", pause: "some-apps", access: "unknown" }), status({ lower: "some-apps", pause: "some-apps", access: "undetermined" })];
  const media = bridge(states[0]);
  media.get.mockImplementation(async () => states.shift() ?? status({ lower: "some-apps", pause: "some-apps", access: "undetermined" }));
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/Open one of them, then choose Allow/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(await screen.findByRole("button", { name: "Allow" })).toBeEnabled();
});

test("System Audio Recording not asked yet: Lower explains it and Allow asks; once given, any app is lowered", async () => {
  const media = bridge(status({ lower: "some-apps", pause: "some-apps", access: "granted", capture: "undetermined" }));
  media.allow.mockImplementation(async () => status({ lower: "per-app", pause: "some-apps", access: "granted", capture: "granted" }));
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/macOS asks for System Audio Recording/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Allow" }));
  expect(media.allow).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/and while the agent is speaking/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
});

test("System Audio Recording refused: only Music and Spotify, and a way to System Settings; Pause says the others are lowered", async () => {
  const media = { ...bridge(status({ lower: "some-apps", pause: "some-apps", access: "granted", capture: "denied" })), openSettings: vi.fn(async () => status()) };
  inApp({ mediaDuck: media });
  const view = render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/Without System Audio Recording, Sidevoice can only reach Music and Spotify/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  expect(media.openSettings).toHaveBeenCalledTimes(1);
  view.unmount();
  // Music and Spotify cannot be seen yet: that comes first, as without it nothing is lowered at all.
  inApp({ mediaDuck: bridge(status({ lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "denied" })) });
  const both = render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/needs permission to control them/)).toBeInTheDocument();
  both.unmount();
  inApp({ mediaDuck: bridge(status({ mode: "pause", lower: "per-app", pause: "some-apps", capture: "granted" })) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/Other apps are lowered instead/)).toBeInTheDocument();
});

test("Pause with System Audio Recording refused says what is reached, not that Music and Spotify are lowered", async () => {
  inApp({ mediaDuck: bridge(status({ mode: "pause", lower: "some-apps", pause: "some-apps", access: "granted", capture: "denied" })) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/Sidevoice can only reach Music and Spotify/)).toBeInTheDocument();
});

test("Lower where this computer cannot lower says to choose Pause", async () => {
  inApp({ mediaDuck: bridge(status({ lower: "none", pause: "media-controls" })) });
  render(<MediaDuckRow t={en} />);
  expect(await screen.findByText(/Choose Pause instead/)).toBeInTheDocument();
});

test("a late answer (the system's question took a while) does not overwrite a newer choice, and Allow waits for it", async () => {
  let release: (value: MediaDuckStatus) => void = () => undefined;
  const media = bridge(status({ mode: "off", lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "undetermined" }));
  media.set.mockImplementationOnce(() => new Promise<MediaDuckStatus>((resolve) => { release = resolve; }));
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Lower volume" }));
  expect(await screen.findByRole("button", { name: "Allow" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Do nothing" }));
  expect(await screen.findByRole("radio", { name: "Do nothing" })).toHaveAttribute("aria-checked", "true");
  await act(async () => { release(status({ mode: "lower", lower: "per-app", capture: "granted" })); });
  expect(screen.getByRole("radio", { name: "Do nothing" })).toHaveAttribute("aria-checked", "true");
});

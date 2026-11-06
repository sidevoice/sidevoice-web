import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MediaDuckRow } from "./MediaDuckRow";
import { useMediaDuck } from "../permissions/media-permissions";
import { translator } from "../../i18n/translator";
import type { MediaDuckLevel, MediaDuckMode, MediaDuckStatus } from "../../host";

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

test("a permission the choice needs is a note under the row: Allow where it can be asked, else a link to Permissions; the row keeps its neutral hint", async () => {
  const openPermissions = vi.fn();
  const cases: [Partial<MediaDuckStatus>, RegExp, "Allow" | null][] = [
    [{ lower: "some-apps", pause: "some-apps", access: "granted", capture: "undetermined" }, /Lowering needs System Audio Recording\./, "Allow"],
    [{ lower: "some-apps", pause: "some-apps", access: "undetermined", capture: "denied" }, /Lowering needs System Audio Recording\./, null],
    [{ lower: "some-apps", pause: "some-apps", access: "denied" }, /Controlling Music and Spotify needs access\./, null],
    [{ mode: "pause", lower: "per-app", pause: "some-apps", access: "undetermined", capture: "granted" }, /Controlling Music and Spotify needs access\./, null],
  ];
  for (const [changes, note, allow] of cases) {
    const media = bridge(status(changes));
    inApp({ mediaDuck: media });
    const view = render(<MediaDuckRow t={en} openPermissions={openPermissions} />);
    expect(await screen.findByText(note)).toBeInTheDocument();
    // The row's own line is the neutral one, and the Segmented control stands alone in it.
    expect(screen.queryByText(/Allow it in Permissions/)).toBeNull();
    expect(screen.getByRole("radiogroup").closest(".ui-row")!.querySelector("button:not([role=radio])")).toBeNull();
    expect(screen.queryByRole("button", { name: "Allow" }) !== null).toBe(allow === "Allow");
    if (!allow) fireEvent.click(screen.getByRole("button", { name: "Open Permissions ›" }));
    view.unmount();
  }
  expect(openPermissions).toHaveBeenCalledTimes(3);
});

test("Allow in the note asks the app for capture and the note follows the answer", async () => {
  const media = bridge(status({ lower: "some-apps", pause: "some-apps", capture: "undetermined" }));
  media.allow = vi.fn(async () => status({ lower: "some-apps", pause: "some-apps", capture: "restart" })) as never;
  const restart = vi.fn(async () => status());
  inApp({ mediaDuck: { ...media, restart } });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
  expect(media.allow).toHaveBeenCalledWith("capture");
  expect(await screen.findByText("Allowed. Restart Sidevoice to apply it.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
  expect(restart).toHaveBeenCalledTimes(1);
});

test("allowed and waiting for a restart: the note offers Restart now, or a link to Permissions where the app cannot restart", async () => {
  const waiting = status({ lower: "some-apps", pause: "some-apps", capture: "restart" });
  const restart = vi.fn(async () => waiting);
  inApp({ mediaDuck: { ...bridge(waiting), restart } });
  const view = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Restart now" }));
  expect(restart).toHaveBeenCalledTimes(1);
  view.unmount();
  inApp({ mediaDuck: bridge(waiting) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText("Allowed. Restart Sidevoice to apply it.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Restart now" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open Permissions ›" })).toBeInTheDocument();
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

test("how far to lower is a row for Lower only, sent to the app, and the default is A lot", async () => {
  const media = { ...bridge(status({ level: "quarter" })), setLevel: vi.fn(async (level: MediaDuckLevel) => status({ level })) };
  inApp({ mediaDuck: media });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText("How much to lower")).toBeInTheDocument();
  expect(screen.getByText("Leaves other apps at 50% of their volume (A little), at 25% (A lot) or silent (Mute).")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "A lot" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Mute" }));
  expect(media.setLevel).toHaveBeenCalledWith("mute");
  expect(await screen.findByRole("radio", { name: "Mute" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Pause" }));
  expect(await screen.findByRole("radio", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("How much to lower")).toBeNull();
});

test("a level the app refuses goes back; no level row where the app has none to choose or cannot lower", async () => {
  const media = { ...bridge(status({ level: "half" })), setLevel: vi.fn(async (): Promise<MediaDuckStatus> => { throw new Error("nope"); }) };
  inApp({ mediaDuck: media });
  const view = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Mute" }));
  expect(await screen.findByRole("radio", { name: "A little" })).toHaveAttribute("aria-checked", "true");
  view.unmount();
  for (const [now, setLevel] of [[status({ level: "quarter" }), false], [status(), true], [status({ level: "quarter", lower: "none" }), true]] as const) {
    inApp({ mediaDuck: { ...bridge(now), ...(setLevel ? { setLevel: vi.fn() } : {}) } });
    const other = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
    await screen.findAllByRole("radio");
    expect(screen.queryByText("How much to lower")).toBeNull();
    other.unmount();
  }
});

test("Pause through the system's media controls says only players shown there can be paused", async () => {
  inApp({ mediaDuck: bridge(status({ mode: "pause", pause: "media-controls" })) });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  expect(await screen.findByText("Only players that show in the system’s media controls can be paused.")).toBeInTheDocument();
});

test("a read another screen sent before the choice, answering late, does not undo the choice anywhere", async () => {
  const media = bridge(status());
  inApp({ mediaDuck: media });
  function Elsewhere() { return <output data-testid="elsewhere">{useMediaDuck().status?.mode ?? ""}</output>; }
  render(<><Elsewhere /><MediaDuckRow t={en} openPermissions={() => undefined} /></>);
  await screen.findByRole("radio", { name: "Lower volume" });
  // Coming back to the window: every screen reads again, and those reads stay pending.
  const pending: ((value: MediaDuckStatus) => void)[] = [];
  media.get.mockImplementation(() => new Promise<MediaDuckStatus>((resolve) => { pending.push(resolve); }));
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(pending.length).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("radio", { name: "Pause" }));
  expect(await screen.findByRole("radio", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
  await act(async () => { for (const answer of pending) answer(status({ mode: "lower" })); });
  expect(screen.getByRole("radio", { name: "Pause" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByTestId("elsewhere")).toHaveTextContent("pause");
});

test("a restart that fails or is refused is said in the note and in a polite live region", async () => {
  const waiting = status({ lower: "some-apps", pause: "some-apps", capture: "restart" });
  const failing = vi.fn(async () => { throw new Error("nope"); });
  inApp({ mediaDuck: { ...bridge(waiting), restart: failing } });
  const view = render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Restart now" }));
  const failed = en("perm.capture.restartFailed");
  expect(await screen.findByText(failed, { selector: ".media-need-text" })).toBeInTheDocument();
  const live = screen.getByText(failed, { selector: ".sr-only" });
  expect(live).toHaveAttribute("role", "status");
  expect(live).toHaveAttribute("aria-live", "polite");
  view.unmount();
  const refuse = vi.fn(async () => { throw { key: "media_duck.restart-in-call" }; });
  inApp({ mediaDuck: { ...bridge(waiting), restart: refuse } });
  render(<MediaDuckRow t={en} openPermissions={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Restart now" }));
  expect(await screen.findByText(en("perm.capture.restartInCall"), { selector: ".sr-only" })).toBeInTheDocument();
  expect(screen.getByText(en("settings.call.mediaNeed.restartInCall"), { selector: ".media-need-text" })).toBeInTheDocument();
});

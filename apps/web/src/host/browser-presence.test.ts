import { afterEach, describe, expect, test, vi } from "vitest";
import { host } from ".";
import type { RemoteCommand } from ".";

type Handler = ((details?: unknown) => void) | null;

function mediaSession() {
  const handlers: Record<string, Handler> = {};
  const session = { metadata: null as unknown, setActionHandler: vi.fn((action: string, fn: Handler) => { handlers[action] = fn; }) };
  Object.defineProperty(navigator, "mediaSession", { configurable: true, value: session });
  vi.stubGlobal("MediaMetadata", class { constructor(init: object) { Object.assign(this, init); } });
  return { handlers, session };
}

function loops() {
  const made: { paused: boolean; loop?: boolean; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("Audio", class {
    paused = true; loop = false; src = ""; attributes: Record<string, string> = {};
    constructor() { made.push(this as never); }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
    pause = vi.fn(() => { this.paused = true; });
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:faint" }));
  return made;
}

afterEach(() => {
  host().presence.remote?.clear();
  delete (navigator as { mediaSession?: unknown }).mediaSession;
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  Reflect.deleteProperty(window, "__sidevoiceHost");
  vi.unstubAllGlobals();
});

describe("the lock screen and the headset", () => {
  test("a browser without a Media Session has none, and neither has a page whose media the app owns", () => {
    expect(host().presence.remote).toBeNull();
    mediaSession();
    expect(host().presence.remote).not.toBeNull();
    Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { presence: { media: "app" } } } });
    expect(host().presence.media).toBe("app");
    expect(host().presence.remote).toBeNull();
  });

  test("a platform action asks for a state: play unmutes, pause toggles, togglemicrophone follows isActivating", () => {
    const { handlers } = mediaSession();
    const remote = host().presence.remote!;
    const heard: RemoteCommand[] = [];
    remote.onCommand((command) => heard.push(command));
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: true });
    handlers.play!(); handlers.pause!();
    handlers.togglemicrophone!({ isActivating: true }); handlers.togglemicrophone!({ isActivating: false });
    handlers.togglemicrophone!({}); handlers.togglemicrophone!();
    expect(heard).toEqual([
      { type: "set-muted", muted: false }, { type: "toggle-muted" },
      { type: "set-muted", muted: false }, { type: "set-muted", muted: true },
      { type: "toggle-muted" }, { type: "toggle-muted" },
    ]);
  });

  test("a listener that stops hears no more, and clearing takes the handlers and the tile away", () => {
    const { handlers, session } = mediaSession();
    const remote = host().presence.remote!;
    const heard = vi.fn();
    const stop = remote.onCommand(heard);
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: true });
    expect(session.metadata).toMatchObject({ title: "Sidevoice", artist: "Ana" });
    stop();
    handlers.play!();
    expect(heard).not.toHaveBeenCalled();
    remote.clear();
    expect([handlers.play, handlers.pause, handlers.togglemicrophone]).toEqual([null, null, null]);
    expect(session.metadata).toBeNull();
  });

  test("showing again with the same words keeps the tile, and only a change of them sets a new one", () => {
    const { session } = mediaSession();
    const remote = host().presence.remote!;
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: true });
    const first = session.metadata;
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: false });
    expect(session.metadata).toBe(first);
    remote.show({ title: "Sidevoice", subtitle: "Ben", live: false });
    expect(session.metadata).not.toBe(first);
  });

  test("the faint loop is made once, in the gesture, and plays only while the microphone is open", () => {
    mediaSession();
    const made = loops();
    const remote = host().presence.remote!;
    remote.prime(); remote.prime();
    expect(made).toHaveLength(1);
    expect(made[0].loop).toBe(true);
    expect(made[0].paused).toBe(false);
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: false });
    expect(made[0].paused).toBe(true);
    remote.show({ title: "Sidevoice", subtitle: "Ana", live: true });
    expect(made[0].paused).toBe(false);
    remote.clear();
    expect(made[0].paused).toBe(true);
  });

  test("an action the browser does not know leaves the others set", () => {
    const { handlers, session } = mediaSession();
    session.setActionHandler.mockImplementation((action: string, fn: Handler) => {
      if (action === "togglemicrophone") throw new TypeError("unsupported");
      handlers[action] = fn;
    });
    host().presence.remote!.show({ title: "Sidevoice", subtitle: "Ana", live: true });
    expect(typeof handlers.play).toBe("function");
    expect(typeof handlers.pause).toBe("function");
    expect(session.metadata).toMatchObject({ title: "Sidevoice" });
  });
});

describe("the screen's lock", () => {
  const lock = () => {
    const sentinel = Object.assign(new EventTarget(), { release: vi.fn(async () => { sentinel.dispatchEvent(new Event("release")); }) });
    return sentinel;
  };

  test("a browser says whether it has one, and an app that keeps its computer awake has none to offer", () => {
    expect(host().presence.screenAwake?.supported).toBe(false);
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: vi.fn() } });
    expect(host().presence.screenAwake?.supported).toBe(true);
    Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" } } } });
    expect(host().presence.screenAwake).toBeNull();
  });

  test("is unsupported without a wake lock, failed when it is refused, and held when it is granted", async () => {
    const awake = host().presence.screenAwake!;
    await expect(awake.acquire()).resolves.toBe("unsupported");
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: vi.fn(async () => { throw new DOMException("no", "NotAllowedError"); }) } });
    await expect(awake.acquire()).resolves.toBe("failed");
    const sentinel = lock();
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: vi.fn(async () => sentinel) } });
    await expect(awake.acquire()).resolves.toBe("held");
    awake.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  test("asks inside the gesture, before anything is awaited", () => {
    const request = vi.fn(async () => lock());
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    void host().presence.screenAwake!.acquire();
    expect(request).toHaveBeenCalledWith("screen");
  });

  test("tells when the system takes the lock back, and not when it was let go by the page", async () => {
    const awake = host().presence.screenAwake!;
    const sentinels = [lock(), lock()];
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: vi.fn(async () => sentinels.shift()!) } });
    const told = vi.fn();
    const stop = awake.onReleased(told);
    await awake.acquire();
    awake.release();
    await Promise.resolve();
    expect(told).not.toHaveBeenCalled();
    await awake.acquire();
    // The second lock is the system's to take back.
    const taken = (navigator.wakeLock.request as ReturnType<typeof vi.fn>).mock.results[1].value as Promise<EventTarget>;
    (await taken).dispatchEvent(new Event("release"));
    expect(told).toHaveBeenCalledTimes(1);
    stop();
  });
});

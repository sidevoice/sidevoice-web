import { afterEach, describe, expect, test, vi } from "vitest";
import { pageMicrophone } from ".";

const refused = (name: string, message = name) => Object.assign(new Error(message), { name });

function browser(options: { getUserMedia?: unknown; enumerateDevices?: unknown; tracks?: { readyState: string; stop(): void }[] } = {}) {
  const tracks = options.tracks ?? [{ readyState: "live", stop: vi.fn() }];
  const media = Object.assign(new EventTarget(), {
    getUserMedia: "getUserMedia" in options ? options.getUserMedia : vi.fn(async () => ({ getAudioTracks: () => tracks, getTracks: () => tracks })),
    enumerateDevices: "enumerateDevices" in options ? options.enumerateDevices : vi.fn(async () => [{ kind: "audioinput" }, { kind: "videoinput" }]),
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  return { media, tracks };
}

afterEach(() => {
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  delete (navigator as { permissions?: unknown }).permissions;
});

describe("the browser's microphone", () => {
  test("is none where the page has no media devices, and cannot ask without getUserMedia", () => {
    expect(pageMicrophone()).toBeNull();
    browser({ getUserMedia: undefined });
    expect(pageMicrophone()?.canAsk).toBe(false);
  });

  test("is one per page: readers share its answer", () => {
    browser();
    const first = pageMicrophone()!, second = pageMicrophone()!;
    expect(second).toBe(first);
    first.answer = "granted";
    expect(second.answer).toBe("granted");
  });

  test("asks for the permission alone, in the tap itself, and lets the microphone go", async () => {
    const { media, tracks } = browser();
    const opening = pageMicrophone()!.open();
    expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
    await expect(opening).resolves.toBe("granted");
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  test.each([
    ["NotAllowedError", "denied"], ["SecurityError", "denied"], ["NotFoundError", "missing"], ["OverconstrainedError", "missing"],
    ["NotReadableError", "missing"], ["AbortError", "denied"],
  ])("a %s is %s", async (name, answer) => {
    browser({ getUserMedia: vi.fn(async () => { throw refused(name); }) });
    await expect(pageMicrophone()!.open()).resolves.toBe(answer);
  });

  test("a prompt the browser says it dismissed is not a refusal", async () => {
    browser({ getUserMedia: vi.fn(async () => { throw refused("NotAllowedError", "Permission dismissed"); }) });
    await expect(pageMicrophone()!.open()).resolves.toBe("dismissed");
  });

  test("a stream with no live audio track is no microphone, and is let go", async () => {
    const tracks = [{ readyState: "ended", stop: vi.fn() }];
    browser({ tracks });
    await expect(pageMicrophone()!.open()).resolves.toBe("missing");
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  test("a microphone is plugged in when the device list has an input; null where it cannot say", async () => {
    browser();
    await expect(pageMicrophone()!.plugged()).resolves.toBe(true);
    browser({ enumerateDevices: vi.fn(async () => [{ kind: "videoinput" }]) });
    await expect(pageMicrophone()!.plugged()).resolves.toBe(false);
    browser({ enumerateDevices: vi.fn(async () => { throw new Error("denied"); }) });
    await expect(pageMicrophone()!.plugged()).resolves.toBeNull();
    browser({ enumerateDevices: undefined });
    await expect(pageMicrophone()!.plugged()).resolves.toBeNull();
  });

  test("the permission status is a hint, and none where the browser cannot query it", async () => {
    browser();
    await expect(pageMicrophone()!.permission()).resolves.toBeNull();
    const status = { state: "prompt" };
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn(async () => status) } });
    await expect(pageMicrophone()!.permission()).resolves.toBe(status);
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn(async () => { throw new TypeError("microphone"); }) } });
    await expect(pageMicrophone()!.permission()).resolves.toBeNull();
  });

  test("hears a microphone plugged in or out until it stops", () => {
    const { media } = browser();
    const heard = vi.fn();
    const stop = pageMicrophone()!.onDeviceChange(heard);
    media.dispatchEvent(new Event("devicechange"));
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    media.dispatchEvent(new Event("devicechange"));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

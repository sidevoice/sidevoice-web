import { afterEach, describe, expect, test, vi } from "vitest";
import { host } from ".";

const withHost = (members: Record<string, unknown> | undefined) => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: members && { host: members } });
};

afterEach(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); vi.unstubAllGlobals(); });

describe("the page's voice and catalogues", () => {
  test("run on the page unless an app runs them", () => {
    withHost(undefined);
    expect(host().voice.runs).toBe("page");
    withHost({ voice: {} });
    expect(host().voice.runs).toBe("app");
  });

  test("an app's voice and engine are the call's and the catalogues', as the app gives them", async () => {
    const voice = { say: () => {} };
    const engine = { catalogs: async () => [] };
    withHost({ voice, engine });
    await expect(host().voice.host()).resolves.toBe(voice);
    await expect(host().voice.catalogs()).resolves.toBe(engine);
  });

  test("an app with a voice and no engine of its own has no catalogues to give", async () => {
    withHost({ voice: {} });
    await expect(host().voice.catalogs()).rejects.toMatchObject({ code: "catalogs-unavailable" });
  });

  test("is found where it is asked for: an app that arrives after the page's script is the one asked", async () => {
    const first = host().voice;
    const voice = { say: () => {} };
    withHost({ voice, engine: { catalogs: async () => [] } });
    await expect(first.host()).resolves.toBe(voice);
  });

  test("begins the microphone in the Join gesture on a page, and leaves it to the app where the app runs the voice", () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal("AudioContext", class { resume = resume; close = vi.fn(async () => {}); state = "suspended"; destination = {}; });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    try {
      withHost({ voice: {} });
      expect(host().voice.activate(null)).toBeNull();
      expect(getUserMedia).not.toHaveBeenCalled();
      withHost(undefined);
      const activation = host().voice.activate("mic-1");
      expect(activation).not.toBeNull();
      expect(getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ channelCount: 1, deviceId: { exact: "mic-1" } }) });
      activation?.release();
    } finally {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    }
  });

  test("is not begun where the page has no Web Audio or no microphone", () => {
    withHost(undefined);
    expect(host().voice.activate(null)).toBeNull();
  });
});

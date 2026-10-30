import { describe, expect, onTestFinished, test } from "vitest";
import { cardSeam, host } from ".";

const withHost = (members: Record<string, unknown> | undefined) => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: members && { host: members } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); });
};

describe("a page outside an app", () => {
  test("has no member an app alone offers, and media is the page's", () => {
    withHost(undefined);
    const outside = host();
    expect(outside.identity.build).toBeNull();
    expect(outside.identity.deviceName()).toBeNull();
    expect(outside.presence.media).toBe("page");
    for (const member of [outside.microphone, outside.voice, outside.storage, outside.localHost, outside.reset, outside.muteShortcut,
      outside.callControls, outside.updater, outside.debug]) expect(member).toBeNull();
    expect(cardSeam()).toBeNull();
  });

  test("an app that has injected an empty host offers nothing either", () => {
    withHost({});
    expect(host().storage).toBeNull();
    expect(host().localHost).toBeNull();
  });
});

describe("a host that arrives after the page's script", () => {
  test("is read where it is asked for, not kept", () => {
    withHost(undefined);
    expect(host().localHost).toBeNull();
    const localHost = { state: async () => ({ state: "absent" }), subscribe: () => () => {}, pairing: async () => null };
    withHost({ localHost });
    expect(host().localHost).toBe(localHost);
  });
});

describe("storage and reset", () => {
  const pairings = { read: async () => ({ pairings: [], pendingRevokes: [] }), write: async () => {} };

  test("native pairings are selected on Windows and Linux without the macOS reset capability", () => {
    withHost({ data: { pairings } });
    expect(host().storage?.pairings).toBe(pairings);
    expect(host().reset).toBeNull();
    withHost({ data: { pairings, deleteAll: async () => ({}), resetReport: async () => null } });
    expect(host().reset).not.toBeNull();
  });

  test("a reset without the pairings that go with it is none", () => {
    withHost({ data: { deleteAll: async () => ({}), resetReport: async () => null } });
    expect(host().storage).toBeNull();
    expect(host().reset).toBeNull();
  });

  test("uninstall is the reset's, where the app has it", () => {
    const data = { pairings, deleteAll: async () => ({}), resetReport: async () => null };
    withHost({ data });
    expect(host().reset?.uninstall).toBeUndefined();
    withHost({ data: { ...data, uninstall: async () => ({}) } });
    expect(typeof host().reset?.uninstall).toBe("function");
  });
});

describe("identity", () => {
  test.each(["release", "nightly", "dev"] as const)("reads a %s build as the app says it", (channel) => {
    withHost({ build: { channel, version: "0.5.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" } });
    expect(host().identity.build).toEqual({ channel, version: "0.5.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" });
  });

  test("a build without commit or date has them null", () => {
    withHost({ build: { channel: "dev", version: "0.5.0-dev" } });
    expect(host().identity.build).toEqual({ channel: "dev", version: "0.5.0-dev", commit: null, date: null });
  });

  test("outside the app, or with an app too old to say its build, there is none", () => {
    withHost(undefined);
    expect(host().identity.build).toBeNull();
    withHost({ localHost: {} });
    expect(host().identity.build).toBeNull();
  });

  // A newer app's channel (sidevoice-core#112) is a build all the same, of a channel this version does not know.
  test.each([{ channel: "beta", version: "0.5.0" }, { version: "0.5.0" }, { channel: 7, version: "0.5.0", arch: "arm64" }])("an unknown channel is an unknown one: %j", (build) => {
    withHost({ build });
    expect(host().identity.build).toEqual({ channel: "unknown", version: "0.5.0", commit: null, date: null });
  });

  test("extra fields are ignored, and a field of a shape it does not know is none", () => {
    withHost({ build: { channel: "release", version: "0.5.0", commit: 42, date: { at: "x" }, signed: true } });
    expect(host().identity.build).toEqual({ channel: "release", version: "0.5.0", commit: null, date: null });
  });

  test("a build that is not an object is no build", () => {
    withHost({ build: "nightly" });
    expect(host().identity.build).toBeNull();
  });

  test("the computer's name is trimmed, and none when it is empty or not text", () => {
    withHost({ computerName: "  Mac de Ana " });
    expect(host().identity.deviceName()).toBe("Mac de Ana");
    withHost({ computerName: "   " });
    expect(host().identity.deviceName()).toBeNull();
    withHost({ computerName: 7 });
    expect(host().identity.deviceName()).toBeNull();
  });
});

describe("presence", () => {
  test("the app owns the lock screen's media where it says its media keys are native", () => {
    withHost({ mediaKeys: "native" });
    expect(host().presence.media).toBe("app");
    withHost({ mediaKeys: "page" });
    expect(host().presence.media).toBe("page");
  });
});

describe("voice", () => {
  test("the app's voice and engine are the app's own objects, and an app without a voice runs none", () => {
    const voice = { call: () => {} };
    const engine = { catalogs: async () => [] };
    withHost({ voice, engine });
    expect(host().voice?.voice).toBe(voice);
    expect(host().voice?.engine).toBe(engine);
    withHost({ engine });
    expect(host().voice).toBeNull();
  });
});

describe("the members an app calls through", () => {
  test("a member is offered only with the functions the page calls", () => {
    withHost({
      localHost: { state: async () => ({}), subscribe: () => () => {} },
      muteShortcut: { get: async () => ({}) },
      callControls: { settings: async () => ({}) },
      updater: { cancel: async () => {} },
    });
    expect(host().localHost).toBeNull();
    expect(host().muteShortcut).toBeNull();
    expect(host().callControls).toBeNull();
    expect(host().updater).toBeNull();
  });

  test("a complete member is the app's own object", () => {
    const localHost = { state: async () => ({}), subscribe: () => () => {}, pairing: async () => null };
    const muteShortcut = { get: async () => ({}), set: async () => ({}) };
    const callControls = { settings: async () => ({}), setAlwaysShown: async () => ({}) };
    const updater = { status: async () => ({}), cancel: async () => {} };
    withHost({ localHost, muteShortcut, callControls, updater });
    expect(host().localHost).toBe(localHost);
    expect(host().muteShortcut).toBe(muteShortcut);
    expect(host().callControls).toBe(callControls);
    expect(host().updater).toBe(updater);
  });

  test("the microphone is whatever the app says, a settings link alone included", () => {
    const microphone = { openSettings: async () => {} };
    withHost({ microphone });
    expect(host().microphone).toBe(microphone);
    withHost({ microphone: "granted" });
    expect(host().microphone).toBeNull();
  });
});

describe("debug", () => {
  test("is the app's own object, so its getters stay live", () => {
    let inspectable = false;
    const debug = { available: ["inspectable"], get inspectable() { return inspectable; }, compositingBorders: false, repaintCounters: false, set: async () => {} };
    withHost({ debug });
    expect(host().debug).toBe(debug);
    inspectable = true;
    expect(host().debug?.inspectable).toBe(true);
  });

  test("a platform with no switches still has the seam: an empty list", () => {
    withHost({ debug: { available: [], inspectable: false, compositingBorders: false, repaintCounters: false, set: async () => {} } });
    expect(host().debug?.available).toEqual([]);
  });

  test.each([
    ["none (a release, a browser)", undefined],
    ["not an object", "inspectable"],
    ["no list of switches", { inspectable: false, set: async () => {} }],
    ["a list that is not a list", { available: "inspectable", set: async () => {} }],
    ["no set", { available: ["inspectable"], inspectable: false }],
    ["set that is not a function", { available: ["inspectable"], set: true }],
    ["the seam before this one, with setInspectable", { inspectable: false, setInspectable: async () => {} }],
  ])("is none for %s", (_, debug) => {
    withHost({ debug });
    expect(host().debug).toBeNull();
  });
});

describe("the call controls card's seam", () => {
  test("is the card window's own, whatever it holds", () => {
    const seam = { subscribe: () => () => {}, run: () => {}, layout: () => {}, drag: () => {} };
    withHost({ callControls: seam });
    expect(cardSeam()).toBe(seam);
  });
});

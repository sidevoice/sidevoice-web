import { describe, expect, onTestFinished, test } from "vitest";
import { cardSeam, describeBrowser, host, reachOfOrigin } from ".";
import { nativeHost } from "./native";

const withHost = (members: Record<string, unknown> | undefined) => {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: members && { host: members } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceHost"); });
};

describe("a page outside an app", () => {
  test("has no member an app alone offers, and media is the page's", () => {
    withHost(undefined);
    const outside = host();
    expect(outside.identity.build).toBeNull();
    expect(outside.identity.deviceName()).toBeNull();
    expect(outside.presence.media).toBe("page");
    expect(outside.voice.runs).toBe("page");
    for (const member of [outside.microphone, outside.storage, outside.localHost, outside.reset, outside.muteShortcut,
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
  const reset = { deleteAll: async () => ({}), resetReport: async () => null };

  test("pairings are the app's to keep on every OS, and the reset is offered only where the app can do it", () => {
    withHost({ pairings });
    expect(host().storage?.pairings).toBe(pairings);
    expect(host().reset).toBeNull();
    withHost({ pairings, reset });
    expect(host().reset).toBe(reset);
  });

  test("a store without the functions the page calls is none", () => {
    withHost({ pairings: { read: async () => ({}) } });
    expect(host().storage).toBeNull();
  });

  test("a reset does not depend on the app keeping pairings", () => {
    withHost({ reset });
    expect(host().storage).toBeNull();
    expect(host().reset).toBe(reset);
  });

  test("uninstall is the reset's, where the app has it", () => {
    withHost({ reset });
    expect(host().reset?.uninstall).toBeUndefined();
    withHost({ reset: { ...reset, uninstall: async () => ({}) } });
    expect(typeof host().reset?.uninstall).toBe("function");
  });

  test("the old shape, a data member that holds both, is not read", () => {
    withHost({ data: { pairings, ...reset } });
    expect(host().storage).toBeNull();
    expect(host().reset).toBeNull();
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
    withHost({ deviceName: "  Mac de Ana " });
    expect(host().identity.deviceName()).toBe("Mac de Ana");
    withHost({ deviceName: "   " });
    expect(host().identity.deviceName()).toBeNull();
    withHost({ deviceName: 7 });
    expect(host().identity.deviceName()).toBeNull();
  });
});

describe("presence", () => {
  test("the app owns the lock screen's media where it says so", () => {
    withHost({ presence: { media: "app" } });
    expect(host().presence.media).toBe("app");
    withHost({ presence: { media: "page" } });
    expect(host().presence.media).toBe("page");
    withHost({ mediaKeys: "native" });
    expect(host().presence.media).toBe("page");
  });
});

describe("the system and the transport", () => {
  test("an app says its system, and the browser's reading stands where it says none or one this page does not know", () => {
    withHost({ os: "ios" });
    expect(host().identity.os).toBe("ios");
    withHost({ os: "plan9" });
    expect(host().identity.os).toBe(describeBrowser().os);
    withHost({});
    expect(host().identity.os).toBe(describeBrowser().os);
  });

  test("an app says whether its transport sends plain http to a private address, and the browser's stands where it does not", () => {
    withHost({ reach: { plainHttpPrivate: true } });
    expect(host().reach.plainHttpPrivate).toBe(true);
    withHost({ reach: { plainHttpPrivate: false } });
    expect(host().reach.plainHttpPrivate).toBe(false);
    withHost({ reach: { plainHttpPrivate: "yes" } });
    expect(host().reach.plainHttpPrivate).toBe(reachOfOrigin(window.location.origin).plainHttpPrivate);
  });
});

describe("the old name", () => {
  test("is not read: the web and the app ship together", () => {
    Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, localHost: {
      state: async () => ({}), subscribe: () => () => {}, pairing: async () => null } } } });
    onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); });
    expect(host().identity.build).toBeNull();
    expect(host().localHost).toBeNull();
    expect(cardSeam()).toBeNull();
  });
});

describe("voice", () => {
  test("the app's voice and engine are the app's own objects, and an app without a voice runs none", () => {
    const voice = { call: () => {} };
    const engine = { catalogs: async () => [] };
    withHost({ voice, engine });
    expect(nativeHost().voice?.voice).toBe(voice);
    expect(nativeHost().voice?.engine).toBe(engine);
    expect(host().voice.runs).toBe("app");
    withHost({ engine });
    expect(nativeHost().voice).toBeNull();
    expect(host().voice.runs).toBe("page");
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

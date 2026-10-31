import { describe, expect, test } from "vitest";
import { PAIRINGS_KEY, PENDING_REVOKES_KEY, browserStorage, pagePairings } from "./browser-storage";
import { host } from ".";

const pairing = (fp: string) => ({ fp, public_key: "pk-" + fp, host: fp + "-host", urls: [], device_id: "d-" + fp, token: "t-" + fp, paired_at: 1 });

function store(initial: Record<string, string> = {}) {
  const saved = { ...initial };
  return { saved, getItem: (key: string) => saved[key] ?? null, setItem: (key: string, value: string) => { saved[key] = value; },
    removeItem: (key: string) => { delete saved[key]; } };
}

describe("this browser's pairings", () => {
  test("are read at once, in the format and under the key they have always had", () => {
    const s = store({ [PAIRINGS_KEY]: JSON.stringify({ pairings: [pairing("a"), { fp: "broken" }] }) });
    expect(pagePairings(() => s).readState()).toEqual({ list: [pairing("a")] });
    expect(PAIRINGS_KEY).toBe("sidevoice.pairings");
    expect(PENDING_REVOKES_KEY).toBe("sidevoice.pending-revokes");
  });

  test("never keep the local host the app projects", () => {
    const s = store();
    expect(pagePairings(() => s).write({ list: [pairing("remote"), { ...pairing("local"), local: true }] })).toBe(true);
    expect(JSON.parse(s.saved[PAIRINGS_KEY])).toEqual({ pairings: [pairing("remote")] });
  });

  test("are none from storage that is not there, that holds something else, or that refuses", () => {
    expect(pagePairings(() => null).readState()).toEqual({ list: [] });
    expect(pagePairings(() => store({ [PAIRINGS_KEY]: "{not json" })).readState()).toEqual({ list: [] });
    expect(pagePairings(() => { throw new Error("blocked"); }).readState()).toEqual({ list: [] });
  });

  test("a write that is refused says so, and none to write to is nothing to tell", () => {
    const refusing = { ...store(), setItem() { throw new Error("QuotaExceededError"); } };
    expect(pagePairings(() => refusing).write({ list: [pairing("a")] })).toBe(false);
    expect(pagePairings(() => null).write({ list: [pairing("a")] })).toBe(true);
  });

  test("the machines that could not be told are read each time, as another tab left them, and only whole ones", () => {
    const s = store();
    const book = pagePairings(() => s);
    expect(book.readRevokes()).toEqual([]);
    book.writeRevokes([pairing("gone")]);
    expect(book.readRevokes()).toEqual([pairing("gone")]);
    s.saved[PENDING_REVOKES_KEY] = JSON.stringify([pairing("other"), { fp: "x" }]);
    expect(book.readRevokes().map((p) => p.fp)).toEqual(["other"]);
    book.writeRevokes([]);
    expect(s.saved[PENDING_REVOKES_KEY]).toBeUndefined();
  });
});

describe("the browser's host storage", () => {
  test("is the one async shape every host has, over the same storage", async () => {
    const s = store();
    const { pairings } = browserStorage(() => s);
    await pairings.write({ pairings: [pairing("a")], pendingRevokes: [pairing("gone")] });
    await expect(pairings.read()).resolves.toEqual({ pairings: [pairing("a")], pendingRevokes: [pairing("gone")] });
    expect(pagePairings(() => s).readState()).toEqual({ list: [pairing("a")] });
  });

  test("a write the browser refuses rejects there, as an app's does", async () => {
    const refusing = { ...store(), setItem() { throw new Error("QuotaExceededError"); } };
    await expect(browserStorage(() => refusing).pairings.write({ pairings: [pairing("a")], pendingRevokes: [] })).rejects.toMatchObject({ key: "data.pairings-write" });
  });

  test("is the page's where no app keeps the pairings, and the app's where it does", () => {
    expect(host().storage.page).toBeDefined();
    const pairings = { read: async () => ({ pairings: [] }), write: async () => {} };
    Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { pairings } } });
    try {
      expect(host().storage.pairings).toBe(pairings);
      expect(host().storage.page).toBeUndefined();
    } finally { Reflect.deleteProperty(window, "__sidevoiceHost"); }
  });
});

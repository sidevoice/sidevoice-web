import { expect, test, vi } from "vitest";
import { defaultVoiceSettings, writeVoiceSettings } from "./voice-settings.js";
import { discardSetupDownloadCandidates, forgetSetupInstall, recordSetupInstall, setupModelAbsent, SETUP_DOWNLOADS_KEY } from "./setup-model-cleanup.js";
import type { CatalogView } from "./model-catalogs.js";

const memory = () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  } as Storage;
  return { entries, storage };
};
const catalogue = (rows: Record<string, boolean[]>, stale = false): CatalogView[] => [{
  id: "local", name: null, status: { stale },
  models: Object.entries(rows).map(([id, builds]) => ({ id, installed: builds.some(Boolean),
    capabilities: [id === "turn-model" ? "end-of-turn" : id.startsWith("kokoro") ? "tts" : "stt"],
    builds: builds.map((present, index) => ({ id: `${id}/${index}`, installed: present, available: true })) })),
}] as unknown as CatalogView[];
const candidate = (storage: Storage, id = "whisper-small") => {
  expect(recordSetupInstall(storage, id, setupModelAbsent(catalogue({ [id]: [false] }), id), catalogue({ [id]: [true] }))).toBe(true);
};

test("B1: another tab's saved choice and active engine cannot be protected by A's local engine", () => {
  const { storage } = memory();
  candidate(storage);
  // A's remembered choice remains the default. B shares files and storage, but owns a different engine instance.
  const aChoice = defaultVoiceSettings();
  const bChoice = { ...aChoice, stt: { ...aChoice.stt, model: "whisper-small" } };
  writeVoiceSettings(storage, bChoice);
  const bInUse = new Set(["whisper-small"]);
  const aEngineUninstall = vi.fn(async (_id: string) => { bInUse.clear(); });
  expect(aChoice.stt.model).not.toBe(bChoice.stt.model);
  expect(bInUse.has("whisper-small")).toBe(true);
  // A's engine would accept a whole-model uninstall despite B's selection and load.
  discardSetupDownloadCandidates(storage);
  expect(aEngineUninstall).not.toHaveBeenCalled();
  expect(bInUse.has("whisper-small")).toBe(true);
  expect(storage.getItem(SETUP_DOWNLOADS_KEY)).toBeNull();
});

test("B1: simultaneous finishers sharing one origin cannot issue duplicate deletes", async () => {
  const { storage } = memory();
  candidate(storage);
  const uninstallA = vi.fn();
  const uninstallB = vi.fn();
  await Promise.all([Promise.resolve().then(() => discardSetupDownloadCandidates(storage)), Promise.resolve().then(() => discardSetupDownloadCandidates(storage))]);
  expect(uninstallA).not.toHaveBeenCalled();
  expect(uninstallB).not.toHaveBeenCalled();
  expect(storage.getItem(SETUP_DOWNLOADS_KEY)).toBeNull();
});

test("B2: a later Settings build and a replacement install cannot be deleted through an old model ID", () => {
  const { storage } = memory();
  candidate(storage, "small"); // setup's small/int8
  const builds = new Set(["small/int8", "small/fp32"]); // Settings later installs fp32
  const wholeModelUninstall = vi.fn(() => builds.clear());
  forgetSetupInstall(storage, "small"); // ordinary install invalidates the candidate before the host starts
  discardSetupDownloadCandidates(storage);
  expect(wholeModelUninstall).not.toHaveBeenCalled();
  expect(builds).toEqual(new Set(["small/int8", "small/fp32"]));
  candidate(storage, "small");
  forgetSetupInstall(storage, "small"); // explicit removal, then a new non-setup installation of the same ID
  builds.clear(); builds.add("small/fp32");
  discardSetupDownloadCandidates(storage);
  expect(wholeModelUninstall).not.toHaveBeenCalled();
  expect(builds).toEqual(new Set(["small/fp32"]));
});

test("B2: a concurrent non-setup install between catalogue reads and a deferred setup reload proves no ownership", () => {
  const { storage } = memory();
  const absent = setupModelAbsent(catalogue({ small: [false, false] }), "small");
  // Another context installs fp32 before the setup install observes completion.
  const after = catalogue({ small: [true, true] });
  expect(recordSetupInstall(storage, "small", absent, after)).toBe(true);
  const uninstall = vi.fn();
  // A new page after reload inherits the same candidate, never a store-owned build/generation receipt.
  expect(storage.getItem(SETUP_DOWNLOADS_KEY)).not.toBeNull();
  discardSetupDownloadCandidates(storage);
  expect(uninstall).not.toHaveBeenCalled();
  expect(storage.getItem(SETUP_DOWNLOADS_KEY)).toBeNull();
});

test("B2: pre-existing builds, incomplete installs and uncertain catalogues never become candidates", () => {
  const { storage } = memory();
  expect(recordSetupInstall(storage, "old", setupModelAbsent(catalogue({ old: [true, false] }), "old"), catalogue({ old: [true, true] }))).toBe(false);
  expect(recordSetupInstall(storage, "partial", setupModelAbsent(catalogue({ partial: [false] }), "partial"), catalogue({ partial: [false] }))).toBe(false);
  expect(recordSetupInstall(storage, "uncertain", setupModelAbsent(catalogue({ uncertain: [false] }, true), "uncertain"), catalogue({ uncertain: [true] }))).toBe(false);
  expect(storage.getItem(SETUP_DOWNLOADS_KEY)).toBeNull();
});

test("B3: finishing never dispatches an uninstall that could commit after a new selection", () => {
  const { storage } = memory();
  candidate(storage);
  let selected = false;
  const uninstall = vi.fn(async () => { await Promise.resolve(); if (selected) throw new Error("selection raced deletion"); });
  discardSetupDownloadCandidates(storage);
  selected = true;
  expect(uninstall).not.toHaveBeenCalled();
});

test("storage uncertainty cannot authorize deletion or turn a failed clear into a retry", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => {}, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
  expect(recordSetupInstall(blocked, "spare", setupModelAbsent(catalogue({ spare: [false] }), "spare"), catalogue({ spare: [true] }))).toBe(false);
  expect(() => discardSetupDownloadCandidates(blocked)).not.toThrow();
});

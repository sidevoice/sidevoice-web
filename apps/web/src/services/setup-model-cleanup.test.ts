import { expect, test, vi } from "vitest";
import { defaultVoiceSettings } from "./voice-settings.js";
import { cleanSetupDownloads, recordSetupInstall, SETUP_DOWNLOADS_KEY } from "./setup-model-cleanup.js";
import type { CatalogView, ModelCatalogs } from "./model-catalogs.js";

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

function fixture() {
  const { entries, storage } = memory();
  const installed = new Set<string>();
  const uninstall = vi.fn(async (id: string) => { installed.delete(id); });
  const models = { catalogs: vi.fn(async () => catalogue(Object.fromEntries([...installed].map((id) => [id, [true]])))), uninstall } as unknown as ModelCatalogs;
  const selected = vi.fn(() => [defaultVoiceSettings()]);
  const busy = vi.fn(() => false);
  const changed = vi.fn(async () => {});
  const log = vi.fn();
  const clean = () => cleanSetupDownloads({ storage, models, selected, busy, changed, log });
  const downloaded = (id: string) => {
    const before = catalogue({ [id]: [false] });
    installed.add(id);
    expect(recordSetupInstall(storage, id, before, catalogue({ [id]: [true] }))).toBe(true);
  };
  return { entries, storage, installed, models, uninstall, selected, busy, changed, log, clean, downloaded };
}

test("only confirmed setup downloads are removed after finishing; a reload keeps their provenance", async () => {
  const run = fixture();
  run.downloaded("whisper-small");
  run.installed.add("pre-existing");
  expect(JSON.parse(run.entries.get(SETUP_DOWNLOADS_KEY)!)).toEqual(["whisper-small"]);
  await run.clean();
  expect(run.uninstall).toHaveBeenCalledExactlyOnceWith("whisper-small");
  expect(run.installed).toEqual(new Set(["pre-existing"]));
  expect(run.entries.has(SETUP_DOWNLOADS_KEY)).toBe(false);
  expect(run.changed).toHaveBeenCalledOnce();
});

test("selected transcription, voice and smart-turn models are never uninstalled", async () => {
  const run = fixture();
  for (const id of ["whisper-base", "kokoro-82m-v1.0", "turn-model", "spare"]) run.downloaded(id);
  run.selected.mockReturnValue([{ ...defaultVoiceSettings(), turn_model: "turn-model" }]);
  await run.clean();
  expect(run.uninstall).toHaveBeenCalledExactlyOnceWith("spare");
});

test("pre-existing builds and partially downloaded or failed installs never acquire setup ownership", async () => {
  const { storage, entries } = memory();
  expect(recordSetupInstall(storage, "old", catalogue({ old: [true, false] }), catalogue({ old: [true, true] }))).toBe(false);
  expect(recordSetupInstall(storage, "partial", catalogue({ partial: [false] }), catalogue({ partial: [false] }))).toBe(false);
  expect(recordSetupInstall(storage, "failed", catalogue({ failed: [false] }), catalogue({ failed: [false] }))).toBe(false);
  expect(recordSetupInstall(storage, "uncertain", catalogue({ uncertain: [false] }, true), catalogue({ uncertain: [true] }))).toBe(false);
  expect(entries.has(SETUP_DOWNLOADS_KEY)).toBe(false);
});

test("a model held by the actual voice settings or an active call is not deleted", async () => {
  const run = fixture();
  run.downloaded("whisper-small");
  run.selected.mockReturnValue([defaultVoiceSettings(), { ...defaultVoiceSettings(), stt: { ...defaultVoiceSettings().stt, model: "whisper-small" } }]);
  await run.clean();
  expect(run.uninstall).not.toHaveBeenCalled();
  run.downloaded("spare");
  run.busy.mockReturnValue(true);
  await run.clean();
  expect(run.uninstall).not.toHaveBeenCalled();
});

test("a deletion failure is silent to the setup and is not retried", async () => {
  const run = fixture();
  run.downloaded("spare");
  run.uninstall.mockRejectedValueOnce(new Error("disk busy"));
  await expect(run.clean()).resolves.toBeUndefined();
  expect(run.log).toHaveBeenCalledOnce();
  expect(run.entries.has(SETUP_DOWNLOADS_KEY)).toBe(false);
  await run.clean();
  expect(run.uninstall).toHaveBeenCalledTimes(1);
});

test("storage and catalogue uncertainty authorize no destructive cleanup", async () => {
  const run = fixture();
  run.downloaded("spare");
  run.models.catalogs = vi.fn(async () => catalogue({ spare: [true] }, true));
  await run.clean();
  expect(run.uninstall).not.toHaveBeenCalled();
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => {}, removeItem: () => {} } as unknown as Storage;
  expect(recordSetupInstall(blocked, "spare", catalogue({ spare: [false] }), catalogue({ spare: [true] }))).toBe(false);
  await cleanSetupDownloads({ storage: blocked, models: run.models, selected: run.selected, busy: run.busy, log: run.log });
  expect(run.uninstall).not.toHaveBeenCalled();
});

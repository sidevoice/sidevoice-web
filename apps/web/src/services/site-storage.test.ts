import { expect, test } from "vitest";
import { probeSiteStorage } from "./site-storage.js";

/* Whether the browser lets the page keep anything: each store probed once, a SecurityError from any being a block. */

const blocked = () => new DOMException("The operation is insecure.", "SecurityError");
const memory = () => { const kept = new Map<string, string>(); return { setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k), kept } as unknown as Storage & { kept: Map<string, string> }; };
const openable = () => ({ open: () => { const request: Record<string, unknown> = {}; queueMicrotask(() => { request.result = { close() {} }; (request.onsuccess as () => void)(); }); return request; }, deleteDatabase() {} }) as unknown as IDBFactory;

test("a browser that keeps site data blocks nothing, and the probe leaves nothing behind", async () => {
  const storage = memory();
  expect(await probeSiteStorage({ localStorage: () => storage, indexedDB: openable(), storage: { getDirectory: async () => ({}) } })).toEqual({ blocked: false, refused: [] });
  expect(storage.kept.size).toBe(0);
});

test("site data blocked: reading localStorage, opening a database and the private file system all refuse, and each is named", async () => {
  const probe = await probeSiteStorage({
    localStorage: () => { throw blocked(); },
    indexedDB: { open: () => { throw blocked(); } } as unknown as IDBFactory,
    storage: { getDirectory: async () => { throw blocked(); } },
  });
  expect(probe).toEqual({ blocked: true, refused: [
    { store: "localStorage", code: "SecurityError" }, { store: "indexedDB", code: "SecurityError" }, { store: "opfs", code: "SecurityError" },
  ] });
  // Any one store refused is enough; a store this browser lacks is not asked.
  expect((await probeSiteStorage({ localStorage: () => memory(), indexedDB: null, storage: { getDirectory: async () => { throw blocked(); } } })).blocked).toBe(true);
});

test("another failure (a full disk, a store this browser lacks) is not a block", async () => {
  const probe = await probeSiteStorage({
    localStorage: () => { throw new DOMException("full", "QuotaExceededError"); },
    indexedDB: null,
    storage: null,
  });
  expect(probe).toEqual({ blocked: false, refused: [] });
});

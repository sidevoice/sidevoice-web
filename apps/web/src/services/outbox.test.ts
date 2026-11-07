import { expect, test } from "vitest";
import { createOutbox, OUTBOX_LIMIT, RESEND_BACKOFF_MS, resendDelay } from "./outbox.js";

/* The outbox: entries kept in order until their acknowledgement, bounded by count (never by age), and kept across a
 * reload of the same tab. */

/** IndexedDB as far as the outbox uses it: one database, one store keyed by id, answers on a later turn. The map is the
 *  disk, so two outboxes on the same fake are one tab before and after a reload. */
function fakeIndexedDB(disk = new Map<string, unknown>()) {
  const later = (fn: () => void) => setTimeout(fn, 0);
  let created = false;
  const store = {
    put(value: { id: string }) { disk.set(value.id, structuredClone(value)); },
    delete(id: string) { disk.delete(id); },
    getAll() {
      const request: { result?: unknown[]; onsuccess?: () => void } = {};
      later(() => { request.result = [...disk.values()].map((value) => structuredClone(value)); request.onsuccess?.(); });
      return request;
    },
  };
  const db = { createObjectStore() { created = true; }, transaction: () => ({ objectStore: () => store }) };
  const factory = {
    open() {
      const request: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = {};
      later(() => { request.result = db; if (!created) request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, disk };
}
const entry = (id: string, kind: "user-turn" | "playback" = "user-turn") => ({ id, kind, session_id: "s", node: "mac", payload: { id } });

test("without IndexedDB it keeps entries in memory, oldest first, until each is removed", async () => {
  let now = 1000;
  const box = createOutbox({ indexedDB: null, now: () => now });
  await box.ready;
  box.add(entry("a"));
  box.add(entry("b", "playback"));
  now = 1000;   // the same millisecond: the order they were added in still holds
  box.add(entry("c", "playback"));
  expect(box.list().map((e) => e.id)).toEqual(["a", "b", "c"]);
  expect(box.remove("b")).toBe(true);
  expect(box.remove("b")).toBe(false);
  expect(box.list().map((e) => [e.id, e.kind, e.session_id, e.node])).toEqual([["a", "user-turn", "s", "mac"], ["c", "playback", "s", "mac"]]);
  box.clear();
  expect(box.size).toBe(0);
});

test("it is bounded in count by refusing the newest, never by dropping an older one, and nothing expires with time", async () => {
  let now = 0;
  const box = createOutbox({ indexedDB: null, now: () => now, limit: 3 });
  for (const id of ["a", "b", "c"]) { expect(box.add(entry(id))).not.toBeNull(); now += 100; }
  expect(box.add(entry("d"))).toBeNull();
  expect(box.list().map((e) => e.id)).toEqual(["a", "b", "c"]);
  box.remove("a");
  expect(box.add(entry("d"))).not.toBeNull();
  now += 365 * 24 * 3600 * 1000;
  expect(box.list().map((e) => e.id)).toEqual(["b", "c", "d"]);
  expect(OUTBOX_LIMIT).toBe(2000);
});

test("a reload of the same tab finds what was not acknowledged, and nothing of another tab's", async () => {
  const { factory, disk } = fakeIndexedDB();
  let now = 1000;
  const before = createOutbox({ scope: "tab-1", indexedDB: factory, now: () => now });
  await before.ready;
  before.add({ ...entry("t1"), payload: { type: "voice-user-turn", data: { text: "hola" } } });
  before.add(entry("t2", "playback"));
  before.remove("t2");
  const other = createOutbox({ scope: "tab-2", indexedDB: factory, now: () => now });
  await other.ready;
  other.add(entry("o1"));
  const after = createOutbox({ scope: "tab-1", indexedDB: factory, now: () => now });
  await after.ready;
  expect(after.list().map((e) => e.id)).toEqual(["t1"]);
  expect(after.get("t1")!.payload).toEqual({ type: "voice-user-turn", data: { text: "hola" } });
  // However long it waits, what tab-2 left is still there for it.
  now += 365 * 24 * 3600 * 1000;
  const back = createOutbox({ scope: "tab-2", indexedDB: factory, now: () => now });
  await back.ready;
  expect(back.list().map((e) => e.id)).toEqual(["o1"]);
});

test("what tabs that never came back left stored is let go oldest first, once there is more of it than the cap", async () => {
  const { factory, disk } = fakeIndexedDB();
  let now = 0;
  for (const tab of ["gone-1", "gone-2", "gone-3"]) {
    const box = createOutbox({ scope: tab, indexedDB: factory, now: () => now, limit: 10 });
    await box.ready;
    box.add(entry(tab + "-a")); now++;
    box.add(entry(tab + "-b")); now++;
  }
  expect(disk.size).toBe(6);
  const live = createOutbox({ scope: "live", indexedDB: factory, now: () => now, limit: 2 });
  await live.ready;
  expect([...disk.keys()].sort()).toEqual(["gone-3-a", "gone-3-b"]);
});

test("an entry acknowledged before the stored ones were read does not come back, and one added meanwhile is stored", async () => {
  const { factory, disk } = fakeIndexedDB();
  const first = createOutbox({ scope: "tab", indexedDB: factory });
  await first.ready;
  first.add(entry("acked"));
  const reloaded = createOutbox({ scope: "tab", indexedDB: factory });
  reloaded.remove("acked");          // the database is still opening
  reloaded.add(entry("fresh"));
  await reloaded.ready;
  expect(reloaded.list().map((e) => e.id)).toEqual(["fresh"]);
  expect([...disk.keys()]).toEqual(["fresh"]);
});

test("a database that cannot be opened leaves the outbox working in memory", async () => {
  const failing = { open() { const request: { onerror?: () => void } = {}; setTimeout(() => request.onerror?.(), 0); return request; } } as unknown as IDBFactory;
  const box = createOutbox({ indexedDB: failing });
  box.add(entry("a"));
  await box.ready;
  expect(box.list().map((e) => e.id)).toEqual(["a"]);
  const throwing = { open() { throw Error("SecurityError"); } } as unknown as IDBFactory;
  const other = createOutbox({ indexedDB: throwing });
  await other.ready;
  other.add(entry("b"));
  expect(other.size).toBe(1);
});

test("a message unacknowledged on an open socket waits 1 s, 2 s, 5 s, 10 s and then 15 s, steadily, before it is said again", () => {
  expect(RESEND_BACKOFF_MS).toEqual([1000, 2000, 5000, 10000, 15000]);
  expect([1, 2, 3, 4, 5, 6, 50].map(resendDelay)).toEqual([1000, 2000, 5000, 10000, 15000, 15000, 15000]);
  expect(resendDelay(0)).toBe(1000);
});

test("what is added while the store loads goes after what it kept, even in the same millisecond", async () => {
  const disk = new Map<string, unknown>();
  disk.set("old", { id: "old", scope: "page", kind: "user-turn", session_id: "s", node: "mac", payload: {}, created: 1000, order: 5 });
  const { factory } = fakeIndexedDB(disk);
  const box = createOutbox({ indexedDB: factory, now: () => 1000 });
  box.add(entry("new"));
  await box.ready;
  expect(box.list().map((e) => e.id)).toEqual(["old", "new"]);
  expect(box.add(entry("later"))!.order).toBeGreaterThan(box.get("new")!.order);
});

test("order alone ranks entries: a clock that moved back never puts a new one before a kept one", async () => {
  let now = 5000;
  const box = createOutbox({ indexedDB: null, now: () => now });
  await box.ready;
  box.add(entry("kept"));
  now = 10;
  box.add(entry("new"));
  expect(box.list().map((e) => e.id)).toEqual(["kept", "new"]);
});

test("nothing is stored under an order that restarted: an entry added before the stored maximum is read stays in memory", async () => {
  const puts: Array<{ id: string; order: number }> = [];
  let release = () => {};
  const old = { id: "old", scope: "page", kind: "user-turn", session_id: "s", node: "mac", payload: {}, created: 1, order: 5 };
  const store = {
    put(value: { id: string; order: number }) { puts.push({ id: value.id, order: value.order }); },
    delete() {},
    getAll() { const request: { result?: unknown[]; onsuccess?: () => void } = {}; release = () => { request.result = [old]; request.onsuccess?.(); }; return request; },
  };
  const db = { createObjectStore() {}, transaction: () => ({ objectStore: () => store }) };
  const factory = { open() { const request: { result?: unknown; onsuccess?: () => void } = {}; setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0); return request; } } as unknown as IDBFactory;
  const box = createOutbox({ indexedDB: factory, now: () => 1000 });
  await new Promise((resolve) => setTimeout(resolve, 5));   // the database is open, the stored entries are not read yet
  box.add(entry("new"));
  expect(puts).toEqual([]);   // a crash here must not leave "new" stored under order 1
  release();
  await box.ready;
  expect(box.list().map((e) => e.id)).toEqual(["old", "new"]);
  expect(puts.find((put) => put.id === "new")!.order).toBeGreaterThan(5);
});

test("with the order kept apart, an entry added while the store loads is stored at once, in its final place", async () => {
  const puts: Array<{ id: string; order: number }> = [];
  let release = () => {};
  const old = { id: "old", scope: "page", kind: "user-turn", session_id: "s", node: "mac", payload: {}, created: 1, order: 5 };
  const store = {
    put(value: { id: string; order: number }) { puts.push({ id: value.id, order: value.order }); },
    delete() {},
    getAll() { const request: { result?: unknown[]; onsuccess?: () => void } = {}; release = () => { request.result = [old]; request.onsuccess?.(); }; return request; },
  };
  const db = { createObjectStore() {}, transaction: () => ({ objectStore: () => store }) };
  const factory = { open() { const request: { result?: unknown; onsuccess?: () => void } = {}; setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0); return request; } } as unknown as IDBFactory;
  const kept = new Map<string, string>([["sidevoice.outbox-order.page", "5"]]);
  const orderStore = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); } };
  const box = createOutbox({ indexedDB: factory, now: () => 1000, orderStore });
  await new Promise((resolve) => setTimeout(resolve, 5));   // the database is open, the stored entries are not read yet
  box.add(entry("new"));
  expect(puts).toEqual([{ id: "new", order: 6 }]);   // durable now, already behind what is stored
  release();
  await box.ready;
  expect(box.list().map((e) => e.id)).toEqual(["old", "new"]);
  expect(puts.filter((put) => put.id === "new").every((put) => put.order === 6)).toBe(true);
});

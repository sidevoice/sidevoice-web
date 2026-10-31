import type { Pairing, Pairings } from "../services/device-pairing.js";
import type { HostStorage, PagePairings } from "./types";

/* Where this browser keeps the machines it is paired with (the keys and the format are unchanged since the first pairing):
 * its own storage, read at once and written as well as it can be. A browser that keeps nothing (a private window, a full
 * quota) still pairs for this visit, and the person is told it will not be kept; it is not a failed pairing, as an app's
 * refusal is (`PairingsStore.write` rejects). The resume ticket of a call is not here: it stays in the tab's
 * `sessionStorage`, rotated and read as the call goes (room-session-controller.js). */

export const PAIRINGS_KEY = "sidevoice.pairings";
/** A forgotten machine that could not be told: its token is still good there until it is. */
export const PENDING_REVOKES_KEY = "sidevoice.pending-revokes";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function pageStorage(): Store | null {
  try { return localStorage; } catch { return null; }
}

function validPairing(p: Partial<Pairing> | null | undefined): boolean {
  return !!p && typeof p === "object" && typeof p.fp === "string" && typeof p.token === "string" && typeof p.public_key === "string" &&
    typeof p.device_id === "string" && Array.isArray(p.urls);
}

/** This browser's pairings, over `storageOf`: the page's \`localStorage\`, read where it is asked for (it may refuse). */
export function pagePairings(storageOf: () => Store | null = pageStorage): PagePairings {
  return {
    // Stored pairings never contain the desktop-owned local host: the bridge projects it.
    readState() {
      try {
        const stored = JSON.parse(storageOf()?.getItem(PAIRINGS_KEY) || "null");
        return { list: Array.isArray(stored?.pairings) ? stored.pairings.filter(validPairing) : [] };
      } catch { return { list: [] }; }
    },
    write(book: Pairings) {
      const store = storageOf();
      if (!store) return true;
      try { store.setItem(PAIRINGS_KEY, JSON.stringify({ pairings: book.list.filter((p) => !p.local) })); return true; }
      catch { return false; }
    },
    // Read each time, as another tab left them.
    readRevokes() {
      try {
        const kept = JSON.parse(storageOf()?.getItem(PENDING_REVOKES_KEY) || "[]");
        return Array.isArray(kept) ? kept.filter((p) => p && typeof p.fp === "string" && typeof p.token === "string" && typeof p.device_id === "string") : [];
      } catch { return []; }
    },
    writeRevokes(list: Pairing[]) {
      try {
        if (list.length) storageOf()?.setItem(PENDING_REVOKES_KEY, JSON.stringify(list));
        else storageOf()?.removeItem(PENDING_REVOKES_KEY);
      } catch { /* Kept for this visit only. */ }
    },
  };
}

/** The browser's `HostStorage`: the page's own storage, as `PairingsStore` for any reader that wants the one async shape
 *  every host has, and as `page` for the one that needs what only a browser's storage does. */
export function browserStorage(storageOf?: () => Store | null): HostStorage {
  const page = pagePairings(storageOf);
  return {
    page,
    pairings: {
      async read() {
        return { pairings: page.readState().list, pendingRevokes: page.readRevokes() };
      },
      async write(value) {
        if (!page.write({ list: value.pairings })) throw Object.assign(new Error("pairings-write"), { key: "data.pairings-write" });
        page.writeRevokes(value.pendingRevokes);
      },
    },
  };
}

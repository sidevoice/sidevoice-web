import { afterEach, expect, test, vi } from "vitest";
import { createCallLayoutStore, NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, SIDEBAR_COLLAPSED_KEY } from "./call-layout";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = { ...seed };
  return { values, getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; } };
}

afterEach(() => vi.restoreAllMocks());

test("the sidebar's collapse is remembered: a reload starts as it was left", () => {
  const storage = memoryStorage();
  const first = createCallLayoutStore(storage);
  expect(first.getState().sidebarCollapsed).toBe(false);
  first.getState().toggleSidebar();
  expect(first.getState().sidebarCollapsed).toBe(true);
  expect(storage.values[SIDEBAR_COLLAPSED_KEY]).toBe("1");
  expect(createCallLayoutStore(storage).getState().sidebarCollapsed).toBe(true);
  first.getState().toggleSidebar();
  expect(createCallLayoutStore(storage).getState().sidebarCollapsed).toBe(false);
  // A storage that refuses is an expanded sidebar, kept for this page only.
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  const page = createCallLayoutStore(broken);
  expect(page.getState().sidebarCollapsed).toBe(false);
  page.getState().toggleSidebar();
  expect(page.getState().sidebarCollapsed).toBe(true);
});

test("the transcript and the phone's panel start closed and are not remembered", () => {
  const storage = memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "1" });
  const layout = createCallLayoutStore(storage);
  expect(layout.getState()).toMatchObject({ transcriptOpen: false, conversationsOpen: false });
  layout.getState().toggleTranscript();
  expect(layout.getState().transcriptOpen).toBe(true);
  layout.getState().toggleTranscript();
  layout.getState().toggleTranscript();
  layout.getState().closeTranscript();
  expect(layout.getState().transcriptOpen).toBe(false);
  expect(Object.keys(storage.values)).toEqual([SIDEBAR_COLLAPSED_KEY]);
});

function windowIs({ narrow = false, crowded = false }) {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: (media === NARROW_QUERY && narrow) || (media === RAIL_WITH_TRANSCRIPT_QUERY && (narrow || crowded)),
  }) as MediaQueryList);
}

test("showing the conversations never changes the saved sidebar: a phone drops its panel, a crowded desktop makes room", () => {
  windowIs({ narrow: true });
  const phone = createCallLayoutStore(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "1" }));
  phone.getState().showConversations();
  expect(phone.getState()).toMatchObject({ conversationsOpen: true, sidebarCollapsed: true });

  windowIs({});
  const storage = memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "1" });
  const desktop = createCallLayoutStore(storage);
  desktop.getState().showConversations();
  // The rail the person chose is already the conversations, on screen: nothing to do.
  expect(desktop.getState()).toMatchObject({ conversationsOpen: false, sidebarCollapsed: true });
  expect(storage.values[SIDEBAR_COLLAPSED_KEY]).toBe("1");

  windowIs({ crowded: true });
  const crowded = createCallLayoutStore(memoryStorage());
  crowded.getState().toggleTranscript();
  crowded.getState().showConversations();
  // The docked transcript squeezed them into the rail: it makes room, and the saved choice is untouched.
  expect(crowded.getState()).toMatchObject({ transcriptOpen: false, sidebarCollapsed: false });
});

test("on a phone the panel and the transcript are never both open: one opening puts the other away", () => {
  windowIs({ narrow: true });
  const layout = createCallLayoutStore(memoryStorage());
  layout.getState().toggleTranscript();
  layout.getState().openConversations();
  expect(layout.getState()).toMatchObject({ conversationsOpen: true, transcriptOpen: false });
  layout.getState().toggleTranscript();
  expect(layout.getState()).toMatchObject({ conversationsOpen: false, transcriptOpen: true });
  // A desktop shows both side by side.
  windowIs({});
  layout.getState().openConversations();
  expect(layout.getState()).toMatchObject({ conversationsOpen: true, transcriptOpen: true });
});

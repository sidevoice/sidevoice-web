import { afterEach, expect, test, vi } from "vitest";
import { createCallLayoutStore, NARROW_QUERY } from "./call-layout";
import { createRoomStore, installRoomBridge } from "./room-store";

afterEach(() => vi.restoreAllMocks());

test("the app's call surface opens the conversations' list through the room's seam", () => {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: query === NARROW_QUERY } as MediaQueryList));
  const layout = createCallLayoutStore(null);
  installRoomBridge(createRoomStore(), layout);
  expect(layout.getState().conversationsOpen).toBe(false);
  window.sidevoiceUI?.openConversations?.();
  expect(layout.getState().conversationsOpen).toBe(true);
});

test("without a layout the seam does nothing", () => {
  installRoomBridge(createRoomStore());
  expect(() => window.sidevoiceUI?.openConversations?.()).not.toThrow();
});

import { afterEach, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { VARIANTS_KEY } from "../../lib/variants";
import { useChatColors } from "./chat-colors";

afterEach(() => localStorage.clear());

test("the chat's palette is worn only when it is not today's, and follows the panel live", () => {
  const { result } = renderHook(() => useChatColors());
  expect(result.current).toBeUndefined();
  for (const palette of ["soft", "filled", "today"]) {
    act(() => {
      localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "chat-colors": palette }));
      window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
    });
    expect(result.current).toBe(palette === "today" ? undefined : palette);
  }
});

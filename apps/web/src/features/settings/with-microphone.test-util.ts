import { onTestFinished, vi } from "vitest";

/** A browser that can ask for the microphone, its permission in the given state (jsdom has no media devices): without
 *  one there is nothing to ask and Settings hides Permissions. */
export function withMicrophone(state: PermissionState = "prompt") {
  const status = { state, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn().mockResolvedValue(status) } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  onTestFinished(() => { delete (navigator as { mediaDevices?: unknown }).mediaDevices; delete (navigator as { permissions?: unknown }).permissions; });
}

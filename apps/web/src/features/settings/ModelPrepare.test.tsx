import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ModelPrepare, STALL_AFTER_MS } from "./ModelPrepare";
import { translator } from "../../i18n/translator";

/* A download that shows no new bytes for a while says so, before the engine gives up on its own; a failed one offers
 * Retry. */

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const stalled = () => translator()("voice.prepare.stalled");

function prepare(props: Partial<React.ComponentProps<typeof ModelPrepare>>) {
  return <ModelPrepare status="downloading" model="whisper-small" size={466e6} fraction={0.4} {...props} />;
}

test("a download with no new bytes for a while reads as stalled", () => {
  render(prepare({}));
  expect(screen.queryByText(stalled())).toBeNull();
  act(() => { vi.advanceTimersByTime(STALL_AFTER_MS); });
  expect(screen.getByText(stalled())).toBeTruthy();
});

test("bytes arriving again clear the stalled state and restart the wait", () => {
  const view = render(prepare({}));
  act(() => { vi.advanceTimersByTime(STALL_AFTER_MS); });
  view.rerender(prepare({ fraction: 0.5 }));
  expect(screen.queryByText(stalled())).toBeNull();
  act(() => { vi.advanceTimersByTime(STALL_AFTER_MS - 1); });
  expect(screen.queryByText(stalled())).toBeNull();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.getByText(stalled())).toBeTruthy();
});

test("a failed download offers Retry", () => {
  const onRetry = vi.fn();
  render(prepare({ status: "failed", error: "It stopped.", onRetry }));
  expect(screen.queryByText(stalled())).toBeNull();
  screen.getByRole("button", { name: translator()("voice.prepare.retry") }).click();
  expect(onRetry).toHaveBeenCalled();
});

test("a note about a model of this device is a line of its own above its spec sheet, never a Languages row", () => {
  const build = { id: "b", backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", acceleratorClass: "cpu" as const, downloadBytes: 1e6, memoryMb: 1, available: true, reasons: [], installed: true };
  const { container } = render(<ModelPrepare status="ready" model="whisper-base" build={build} meta="Best for short phrases" />);
  const parts = [...container.querySelector(".model-prepare")!.children].map((child) => child.className);
  expect(parts).toEqual(["model-prepare-meta", "model-prepare-sheet"]);
  expect(container.querySelector(".model-prepare-meta")).toHaveTextContent(/^Best for short phrases$/);
  expect([...container.querySelectorAll(".model-sheet dt")].map((label) => label.textContent)).toEqual(["Runs on", "Size", "Status"]);
});

test("in its spec sheet, where a model stands is its last row, said as it changes; what to do about it at the card's foot", () => {
  const build = { id: "b", backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", acceleratorClass: "cpu" as const, downloadBytes: 1e6, memoryMb: 1, available: true, reasons: [], installed: false };
  const at = (status: React.ComponentProps<typeof ModelPrepare>["status"], extra: Partial<React.ComponentProps<typeof ModelPrepare>> = {}) => {
    const { container } = render(prepare({ status, build, actionIds: "stt-model", error: "It stopped.", ...extra }));
    const state = container.querySelector(".model-sheet-state")!;
    const seen = { state: state.textContent, live: [state.getAttribute("role"), state.getAttribute("aria-live")],
      footer: [...container.querySelectorAll(".model-sheet-footer button")].map((button) => button.id || button.textContent),
      bar: !!container.querySelector(".model-sheet-footer [role=progressbar]"), row: !!container.querySelector(".model-prepare-status") };
    cleanup();
    return seen;
  };
  expect(at("absent")).toEqual({ state: "Not downloaded", live: ["status", "polite"], footer: ["stt-model-download"], bar: false, row: false });
  expect(at("downloading")).toEqual({ state: "Downloading… 40%", live: ["status", "polite"], footer: ["stt-model-cancel"], bar: true, row: false });
  expect(at("verifying").state).toBe(translator()("voice.prepare.verifying"));
  expect(at("ready", { build: { ...build, installed: true } })).toEqual({ state: "Ready", live: ["status", "polite"], footer: [], bar: false, row: false });
  // Failed: still not downloaded; why, and Retry, in an alert of its own at the foot.
  const failed = at("failed");
  expect(failed.state).toBe("Not downloaded");
  expect(failed.footer).toContain("stt-model-retry");
});

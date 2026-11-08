import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ThinkingSoundRows, TRY_SECONDS, gainText } from "./ThinkingSoundRows";
import { translator } from "../../i18n/translator";
import { THINKING_SOUNDS } from "../../services/thinking-sounds";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

/* Settings → Call's thinking sound, as the approved prototype has it: the sound (16, the soft heartbeat first and the
 * default), the volume as an offset in dB with ↺ back to 0, and a try of about 15 s that plays the sound at its cadence;
 * all three disabled while the sound is off. */

const preview = vi.hoisted(() => ({ started: [] as { sound: string; gainDb: number }[], gains: [] as number[], playing: 0 }));
vi.mock("../../services/thinking-sound", () => ({
  previewThinkingSound: (choice: { sound: string; gainDb: number }) => {
    preview.started.push(choice); preview.playing++;
    let stopped = false;
    return { setGain: (gainDb: number) => { preview.gains.push(gainDb); }, stop: () => { if (!stopped) { stopped = true; preview.playing--; } } };
  },
}));

beforeEach(() => { vi.useFakeTimers(); preview.started = []; preview.gains = []; preview.playing = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const t = translator("en");

/** The rows as Call holds them: the choice kept by the caller, as Settings keeps it in the call's preferences. */
function Rows({ off = false, active = true, initial = { sound: "soft-heartbeat", gainDb: 0 } }: { off?: boolean; active?: boolean; initial?: { sound: string; gainDb: number } }) {
  const [choice, setChoice] = useState(initial);
  return <ThinkingSoundRows t={t} sound={choice.sound} gainDb={choice.gainDb} disabled={off} active={active}
    onChange={(patch) => setChoice((now) => ({ sound: patch.sound ?? now.sound, gainDb: patch.soundGainDb ?? now.gainDb }))} />;
}

const volume = () => screen.getByRole("slider", { name: "Volume" });
const restore = () => document.getElementById("thinking-sound-restore") as HTMLButtonElement;
const tryButton = () => document.getElementById("thinking-sound-try") as HTMLButtonElement;

test("the sixteen sounds in the approved order, each by its own name, the soft heartbeat chosen", () => {
  render(<Rows />);
  expect(screen.getByText("Choose which one plays.")).toBeInTheDocument();
  const listed = listOptions("thinking-sound");
  expect(listed.map((option) => option.value)).toEqual(THINKING_SOUNDS.map((sound) => sound.id));
  expect(listed).toHaveLength(16);
  expect(listed.map((option) => option.label)).toEqual(["Soft heartbeat", "Warm pad pulse", "Slow heartbeat", "Echoing heartbeat", "Pulsing hum",
    "Muffled heartbeat", "Slow double beat", "Single beat", "Heartbeat in a room", "Breathing pad", "Double pad pulse", "Slow breath",
    "Deep heartbeat", "Warm heartbeat", "Soft pad pulse", "Low breath"]);
  expect(selectedValue("thinking-sound")).toBe("soft-heartbeat");
});

test("the volume is an offset from the sound's own level, −20 to +10 dB a step at a time, read with its sign", () => {
  render(<Rows />);
  expect(volume()).toHaveAttribute("min", "-20");
  expect(volume()).toHaveAttribute("max", "10");
  expect(volume()).toHaveAttribute("step", "1");
  expect(volume()).toHaveValue("0");
  expect(volume()).toHaveAttribute("aria-valuetext", "0 dB");
  fireEvent.change(volume(), { target: { value: "3" } });
  expect(screen.getByText("+3 dB")).toBeInTheDocument();
  fireEvent.change(volume(), { target: { value: "-6" } });
  expect(screen.getByText("−6 dB")).toBeInTheDocument();
  expect(volume()).toHaveAttribute("aria-valuetext", "−6 dB");
  expect(gainText(translator("es"), 10)).toBe("+10 dB");
});

test("↺ brings the volume back to 0 dB, and there is nothing to bring back at 0 dB", () => {
  render(<Rows />);
  expect(restore()).toBeDisabled();
  expect(restore()).toHaveAccessibleName("Restore default: 0 dB");
  fireEvent.change(volume(), { target: { value: "-4" } });
  expect(restore()).toBeEnabled();
  fireEvent.click(restore());
  expect(volume()).toHaveValue("0");
  expect(restore()).toBeDisabled();
});

test("Try plays the sound for about 15 s at the volume set, counting down, and stops by itself or by Stop", () => {
  render(<Rows initial={{ sound: "slow-breath", gainDb: -2 }} />);
  expect(screen.getByText("About 15 seconds.")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(tryButton());
  expect(preview.started).toEqual([{ sound: "slow-breath", gainDb: -2 }]);
  expect(tryButton()).toHaveTextContent("Stop");
  expect(screen.getByRole("progressbar", { name: "Try" })).toBeInTheDocument();
  expect(screen.getByText(`${TRY_SECONDS} s`)).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.getByText("10 s")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(10_250); });
  expect(preview.playing).toBe(0);
  expect(tryButton()).toHaveTextContent("Try");
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(tryButton());
  fireEvent.click(tryButton());
  expect(preview.playing).toBe(0);
  expect(preview.started).toHaveLength(2);
});

test("another sound while it plays starts that one from the beginning; another volume applies at once", () => {
  render(<Rows />);
  fireEvent.click(tryButton());
  act(() => { vi.advanceTimersByTime(6000); });
  expect(screen.getByText("9 s")).toBeInTheDocument();
  fireEvent.change(volume(), { target: { value: "5" } });
  expect(preview.gains).toEqual([5]);
  expect(preview.started).toHaveLength(1);
  chooseOption("thinking-sound", "deep-heartbeat");
  expect(preview.started).toEqual([{ sound: "soft-heartbeat", gainDb: 0 }, { sound: "deep-heartbeat", gainDb: 5 }]);
  expect(preview.playing).toBe(1);
  expect(screen.getByText(`${TRY_SECONDS} s`)).toBeInTheDocument();
  // Not playing, a change of sound starts nothing.
  fireEvent.click(tryButton());
  chooseOption("thinking-sound", "single-beat");
  expect(preview.started).toHaveLength(2);
});

test("with the sound off, Sound, Volume and Try are disabled, their words in the disabled ink, and a try that played stops", () => {
  const { rerender } = render(<Rows />);
  fireEvent.click(tryButton());
  expect(preview.playing).toBe(1);
  rerender(<Rows off />);
  expect(preview.playing).toBe(0);
  expect(document.getElementById("thinking-sound")).toBeDisabled();
  expect(volume()).toBeDisabled();
  expect(restore()).toBeDisabled();
  expect(tryButton()).toBeDisabled();
  const rows = [...document.querySelectorAll(".ui-row")];
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.hasAttribute("data-disabled"))).toBe(true);
});

test("the section left, or Settings closed, stops the try", () => {
  const { rerender, unmount } = render(<Rows />);
  fireEvent.click(tryButton());
  rerender(<Rows active={false} />);
  expect(preview.playing).toBe(0);
  rerender(<Rows />);
  fireEvent.click(tryButton());
  unmount();
  expect(preview.playing).toBe(0);
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ThinkingSoundRows, TRY_SECONDS, frequencyText, gainText } from "./ThinkingSoundRows";
import { translator } from "../../i18n/translator";
import { THINKING_SOUNDS } from "../../services/thinking-sounds";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

/* Settings → Call's thinking sound, as the approved prototype has it: the sound (16, the soft heartbeat first and the
 * default), the volume as an offset in dB with ↺ back to 0, the frequency as steps on the sound's gaps with ↺ back to its
 * own cadence, and a try of about 15 s that plays the sound at the volume and frequency set; all disabled while the sound
 * is off. */

type Choice = { sound: string; gainDb: number; intervalScale: number };
const preview = vi.hoisted(() => ({ started: [] as Choice[], gains: [] as number[], scales: [] as number[], playing: 0 }));
vi.mock("../../services/thinking-sound", () => ({
  previewThinkingSound: (choice: Choice) => {
    preview.started.push(choice); preview.playing++;
    let stopped = false;
    return {
      setGain: (gainDb: number) => { preview.gains.push(gainDb); },
      setIntervalScale: (scale: number) => { preview.scales.push(scale); },
      stop: () => { if (!stopped) { stopped = true; preview.playing--; } },
    };
  },
}));

beforeEach(() => { vi.useFakeTimers(); preview.started = []; preview.gains = []; preview.scales = []; preview.playing = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); document.documentElement.lang = ""; });

const t = translator("en");

/** The rows as Call holds them: the choice kept by the caller, as Settings keeps it in the call's preferences. */
function Rows({ off = false, active = true, initial = {} }: { off?: boolean; active?: boolean; initial?: Partial<Choice> }) {
  const [choice, setChoice] = useState<Choice>({ sound: "soft-heartbeat", gainDb: 0, intervalScale: 1, ...initial });
  return <ThinkingSoundRows t={t} sound={choice.sound} gainDb={choice.gainDb} intervalScale={choice.intervalScale} disabled={off} active={active}
    onChange={(patch) => setChoice((now) => ({
      sound: patch.sound ?? now.sound, gainDb: patch.soundGainDb ?? now.gainDb, intervalScale: patch.soundIntervalScale ?? now.intervalScale,
    }))} />;
}

const volume = () => screen.getByRole("slider", { name: "Volume" });
const frequency = () => screen.getByRole("slider", { name: "Frequency" });
const restore = () => document.getElementById("thinking-sound-restore") as HTMLButtonElement;
const restoreFrequency = () => document.getElementById("thinking-sound-frequency-restore") as HTMLButtonElement;
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
  expect(preview.started).toEqual([{ sound: "slow-breath", gainDb: -2, intervalScale: 1 }]);
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
  expect(preview.started).toEqual([{ sound: "soft-heartbeat", gainDb: 0, intervalScale: 1 }, { sound: "deep-heartbeat", gainDb: 5, intervalScale: 1 }]);
  expect(preview.playing).toBe(1);
  expect(screen.getByText(`${TRY_SECONDS} s`)).toBeInTheDocument();
  // Not playing, a change of sound starts nothing.
  fireEvent.click(tryButton());
  chooseOption("thinking-sound", "single-beat");
  expect(preview.started).toHaveLength(2);
});

test("with the sound off, Sound, Volume, Frequency and Try are disabled, their words in the disabled ink, and a try that played stops", () => {
  const { rerender } = render(<Rows />);
  fireEvent.click(tryButton());
  expect(preview.playing).toBe(1);
  rerender(<Rows off />);
  expect(preview.playing).toBe(0);
  expect(document.getElementById("thinking-sound")).toBeDisabled();
  expect(volume()).toBeDisabled();
  expect(restore()).toBeDisabled();
  expect(frequency()).toBeDisabled();
  expect(restoreFrequency()).toBeDisabled();
  expect(tryButton()).toBeDisabled();
  const rows = [...document.querySelectorAll(".ui-row")];
  expect(rows).toHaveLength(4);
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

test("the frequency reads as the gaps it makes for the sound chosen: every 7–10 s for the soft heartbeat, as it ships", () => {
  render(<Rows />);
  expect(screen.getByText("More or less often than normal.")).toBeInTheDocument();
  expect(frequency()).toHaveAttribute("aria-valuetext", "every 7–10 s");
  expect(screen.getByText("every 7–10 s")).toBeInTheDocument();
  chooseOption("thinking-sound", "single-beat");
  expect(frequency()).toHaveAttribute("aria-valuetext", "every 2–3 s");
  // In the interface's language, its numbers as it writes them.
  document.documentElement.lang = "es";
  expect(frequencyText(translator("es"), "soft-heartbeat", 1)).toBe("cada 7–10 s");
  expect(frequencyText(translator("es"), "soft-heartbeat", 1.25)).toBe("cada 8,8–12,5 s");
  expect(frequencyText(translator("de"), "soft-heartbeat", 0.5)).toBe("alle 3,5–5 s");
  document.documentElement.lang = "en";
  expect(frequencyText(t, "soft-heartbeat", 0.75)).toBe("every 5.3–7.5 s");
  expect(frequencyText(t, "soft-heartbeat", 3)).toBe("every 21–30 s");
});

test("the frequency steps from three times as long between plays to half; further right is more often", () => {
  render(<Rows />);
  expect(frequency()).toHaveAttribute("min", "0");
  expect(frequency()).toHaveAttribute("max", "6");
  expect(frequency()).toHaveAttribute("step", "1");
  expect(frequency()).toHaveValue("4");
  const readings = ["0", "1", "2", "3", "4", "5", "6"].map((step) => {
    fireEvent.change(frequency(), { target: { value: step } });
    return frequency().getAttribute("aria-valuetext");
  });
  expect(readings).toEqual(["every 21–30 s", "every 14–20 s", "every 10.5–15 s", "every 8.8–12.5 s", "every 7–10 s", "every 5.3–7.5 s", "every 3.5–5 s"]);
});

test("↺ brings the frequency back to the sound's own cadence, and there is nothing to bring back there", () => {
  render(<Rows initial={{ intervalScale: 2 }} />);
  expect(frequency()).toHaveValue("1");
  expect(restoreFrequency()).toBeEnabled();
  expect(restoreFrequency()).toHaveAccessibleName("Restore default: every 7–10 s");
  fireEvent.click(restoreFrequency());
  expect(frequency()).toHaveValue("4");
  expect(screen.getByText("every 7–10 s")).toBeInTheDocument();
  expect(restoreFrequency()).toBeDisabled();
  // The volume's ↺ is its own: the frequency moved leaves it with nothing to bring back.
  fireEvent.change(frequency(), { target: { value: "6" } });
  expect(restore()).toBeDisabled();
  expect(restoreFrequency()).toBeEnabled();
});

test("Try plays at the frequency set, and another frequency applies to the try that plays", () => {
  render(<Rows initial={{ intervalScale: 1.5 }} />);
  fireEvent.click(tryButton());
  expect(preview.started).toEqual([{ sound: "soft-heartbeat", gainDb: 0, intervalScale: 1.5 }]);
  fireEvent.change(frequency(), { target: { value: "6" } });
  expect(preview.scales).toEqual([0.5]);
  expect(preview.started).toHaveLength(1);
  // Another sound starts it again, at the frequency now set.
  chooseOption("thinking-sound", "deep-heartbeat");
  expect(preview.started.at(-1)).toEqual({ sound: "deep-heartbeat", gainDb: 0, intervalScale: 0.5 });
});

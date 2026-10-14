import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TryTake } from "./TryTake";
import { takeColumns, takeWav } from "./take-audio";
import { translator } from "../../i18n/translator";
import type { VoiceTake } from "../../services/voice-take";

/* A try's take, played from memory: jsdom plays nothing and has no object URLs, so the page's player is watched
 * through them (`play`, `pause`, `createObjectURL`, `revokeObjectURL`); it has no PointerEvent either, so a mouse's
 * stands in for it. The interface speaks English here (the test's system). */

const RATE = 16000;
/** `ms` of a take: silence, and a tone where `loud` says, with `turns` as its marks. */
function takeOf(ms: number, { loud = [] as [number, number][], turns = [] as VoiceTake["turns"] } = {}): VoiceTake {
  const samples = new Float32Array((ms * RATE) / 1000);
  for (const [from, to] of loud) for (let i = (from * RATE) / 1000; i < (to * RATE) / 1000; i++) samples[i] = 0.5 * Math.sin(i / 8);
  return { sampleRate: RATE, samples, started_at: 1_000, ended_at: 1_000 + ms, turns };
}
const TURN = { turn_id: "t1", speech_ms: 500, pauses: [{ from_ms: 1500, to_ms: 2000 }], end_ms: 3200 };

let urls: string[] = [];
beforeEach(() => {
  urls = [];
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => { const url = `blob:take-${urls.length}-${blob.size}`; urls.push(url); return url; }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  if (!("PointerEvent" in window)) Object.assign(window, { PointerEvent: class extends MouseEvent { pointerId = 1; } });
});
afterEach(() => { vi.restoreAllMocks(); });

const t = translator("en");
const slider = () => screen.getByRole("slider", { name: "Where you are in your recording" });
const play = () => screen.getByRole("button", { name: "Play your recording" });

test("the whole take, from the moment the voice listened to the moment it stopped, with its marks over it and in words", () => {
  render(<TryTake take={takeOf(4000, { loud: [[500, 1500], [2000, 3000]], turns: [TURN] })} id="stt-take" t={t} />);
  const figure = document.getElementById("stt-take")!;
  expect(figure).toHaveTextContent("Your recording");
  expect(figure.querySelector(".try-take-clock")).toHaveTextContent("0.0 / 4.0 s");
  // The marks where they fall in it: speech at an eighth, the pause from 1.5 s to 2 s, the end at 80 %.
  const at = (selector: string) => (figure.querySelector(selector) as HTMLElement).style;
  expect(at(".try-take-mark[data-kind='speech']").left).toBe("12.5%");
  expect(at(".try-take-pause").left).toBe("37.5%");
  expect(at(".try-take-pause").width).toBe("12.5%");
  expect(at(".try-take-mark[data-kind='end']").left).toBe("80%");
  // In words: how long it lasts and each mark's time — the slider's description.
  const words = document.getElementById(slider().getAttribute("aria-describedby")!)!;
  expect(words).toHaveTextContent("4.0 s recorded");
  expect(words).toHaveTextContent("speech starts at 0.5 s");
  expect(words).toHaveTextContent("pause from 1.5 to 2.0 s");
  expect(words).toHaveTextContent("turn ends at 3.2 s");
  expect(slider()).toHaveAttribute("aria-valuemin", "0");
  expect(slider()).toHaveAttribute("aria-valuemax", "4");
  expect(slider()).toHaveAttribute("aria-valuenow", "0");
  expect(slider()).toHaveAttribute("aria-valuetext", "0.0 s of 4.0 s");
  // Drawn, never read out.
  expect(figure.querySelector(".try-take-bars")).toHaveAttribute("aria-hidden", "true");
});

test("a take with no speech in it says so", () => {
  render(<TryTake take={takeOf(2000)} id="turn-try-take" t={t} />);
  expect(document.getElementById("turn-try-take")).toHaveTextContent("2.0 s recorded");
  expect(document.getElementById("turn-try-take")).toHaveTextContent("no speech detected");
  expect(document.querySelector(".try-take-mark")).toBeNull();
});

test("Play is a toggle button: the take plays from a copy in memory, made at the first Play, and let go with the take", async () => {
  const view = render(<TryTake take={takeOf(1000, { turns: [TURN] })} id="stt-take" t={t} />);
  expect(play()).toHaveAttribute("aria-pressed", "false");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(play()); });
  expect(play()).toHaveAttribute("aria-pressed", "true");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  // A WAV of its 16 000 samples, 16-bit: 44 bytes of header and two per sample.
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(urls).toEqual(["blob:take-0-32044"]);
  await act(async () => { fireEvent.click(play()); });
  expect(play()).toHaveAttribute("aria-pressed", "false");
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  // To the end, it is back at the start for the next Play.
  await act(async () => { fireEvent.click(play()); });
  const media = (HTMLMediaElement.prototype.play as unknown as { mock: { contexts: HTMLMediaElement[] } }).mock.contexts.at(-1)!;
  act(() => { media.dispatchEvent(new Event("ended")); });
  expect(play()).toHaveAttribute("aria-pressed", "false");
  expect(slider()).toHaveAttribute("aria-valuenow", "0");
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:take-0-32044");
});

test("another take lets the last one's copy go", async () => {
  const view = render(<TryTake take={takeOf(1000)} id="stt-take" t={t} />);
  await act(async () => { fireEvent.click(play()); });
  view.rerender(<TryTake take={takeOf(500)} id="stt-take" t={t} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[0]);
  expect(play()).toHaveAttribute("aria-pressed", "false");
  expect(slider()).toHaveAttribute("aria-valuetext", "0.0 s of 0.5 s");
});

test("the arrow keys, Page Up and Down, Home and End move in the take; a press on the waveform goes there, and a drag follows it", () => {
  render(<TryTake take={takeOf(4000, { turns: [TURN] })} id="stt-take" t={t} />);
  const wave = slider();
  expect(wave).toHaveAttribute("tabindex", "0");
  const key = (name: string) => fireEvent.keyDown(wave, { key: name });
  key("ArrowRight");
  expect(wave).toHaveAttribute("aria-valuenow", "0.5");
  expect(wave).toHaveAttribute("aria-valuetext", "0.5 s of 4.0 s");
  key("ArrowUp");
  key("PageUp");
  expect(wave).toHaveAttribute("aria-valuenow", "3");
  key("ArrowLeft");
  expect(wave).toHaveAttribute("aria-valuenow", "2.5");
  key("End");
  expect(wave).toHaveAttribute("aria-valuenow", "4");
  key("ArrowRight");
  expect(wave).toHaveAttribute("aria-valuenow", "4");
  key("Home");
  expect(wave).toHaveAttribute("aria-valuenow", "0");
  expect(document.querySelector(".try-take-clock")).toHaveTextContent("0.0 / 4.0 s");

  wave.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 40, right: 300, bottom: 40, x: 100, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(wave, { button: 0, clientX: 200 });
  expect(wave).toHaveAttribute("aria-valuenow", "2");
  expect((document.querySelector(".try-take-head") as HTMLElement).style.left).toBe("50%");
  fireEvent.pointerMove(wave, { clientX: 250 });
  expect(wave).toHaveAttribute("aria-valuenow", "3");
  expect(document.querySelector(".try-take-clock")).toHaveTextContent("3.0 / 4.0 s");
  fireEvent.pointerUp(wave, { clientX: 250 });
  fireEvent.pointerMove(wave, { clientX: 120 });
  expect(wave).toHaveAttribute("aria-valuenow", "3");
});

test("its columns are the live waveform's loudness, the loudest moment each covers; its WAV is the take, 16-bit", () => {
  const take = takeOf(1000, { loud: [[500, 600]] });
  const columns = takeColumns(take, 10);
  expect(columns).toHaveLength(10);
  expect(columns.slice(0, 5).every((value) => value === 0)).toBe(true);
  expect(columns[5]).toBeGreaterThan(0.8);
  expect(takeColumns(take, 1)).toEqual([columns[5]]);

  const wav = takeWav({ ...take, samples: new Float32Array([0, 1, -1, 2]) });
  expect(wav.type).toBe("audio/wav");
  expect(wav.size).toBe(44 + 8);
});

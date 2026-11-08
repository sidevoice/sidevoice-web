import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SLOW_TRANSCRIPTION_MS, TryTiming } from "./ModelSetup";
import { translator } from "../../i18n/translator";

/* The "slow on this device" line after a transcription try: only past 5 s; a 1.9 s or 2.9 s transcription says nothing. */

afterEach(cleanup);
const show = (recognition_ms: number) => render(<TryTiming task="stt" timings={{ ready_ms: 300, recognition_ms }} t={translator()} />);

test.each([400, 1900, 2900, SLOW_TRANSCRIPTION_MS])("a transcription of %i ms shows its time and no slow warning", (ms) => {
  const { container } = show(ms);
  expect(container.querySelector("#stt-timing")).toBeInTheDocument();
  expect(container.querySelector(".voice-try-slow")).toBeNull();
  expect(container.querySelector("[data-slow]")).toBeNull();
});

test("a transcription over 5 s shows the slow warning", () => {
  const { container } = show(SLOW_TRANSCRIPTION_MS + 1);
  expect(container.querySelector(".voice-try-slow")).toHaveTextContent("Slow on this device");
});

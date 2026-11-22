import { afterEach, expect, test } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_THINKING_SOUND, THINKING_SOUNDS, THINKING_SOUND_INTERVAL_SCALES, nextGapSeconds, scaledInterval, thinkingSound, thinkingSoundGain,
  thinkingSoundIntervalScale, thinkingSoundUrl,
} from "./thinking-sounds";
import { DEFAULT_CALL_PREFERENCES, CALL_PREFERENCES_KEY, readCallPreferences, writeCallPreferences } from "./call-preferences";
import { UI_LANGUAGES, translator, type MessageKey } from "../i18n/translator";

/* The thinking sounds as the web ships them: the manifest (public/sounds/thinking/sounds.json) the page and the iOS app
 * read, its files beside it, each sound's name in every language, and the person's choice of sound, volume and frequency. */

const folder = join(import.meta.dirname, "../../public/sounds/thinking");
afterEach(() => { localStorage.clear(); });

test("sixteen sounds, the soft heartbeat first and the default, each played now and then within its interval", () => {
  expect(THINKING_SOUNDS).toHaveLength(16);
  expect(DEFAULT_THINKING_SOUND).toBe("soft-heartbeat");
  expect(THINKING_SOUNDS[0].id).toBe(DEFAULT_THINKING_SOUND);
  expect(new Set(THINKING_SOUNDS.map((sound) => sound.id)).size).toBe(16);
  for (const sound of THINKING_SOUNDS) {
    // An id is a word or two in English, kebab-case: what the app keeps, not the lab's letters.
    expect(sound.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
    const [min, max] = sound.interval;
    expect(min, sound.id).toBeGreaterThan(0);
    expect(max, sound.id).toBeGreaterThanOrEqual(min);
    expect(nextGapSeconds(sound, 1, () => 0)).toBe(min);
    expect(nextGapSeconds(sound, 1, () => 0.999999)).toBeCloseTo(max, 3);
  }
});

test("the soft heartbeat plays every 7 to 10 s; every other sound at the cadence it was approved at", () => {
  expect(Object.fromEntries(THINKING_SOUNDS.map((sound) => [sound.id, sound.interval]))).toEqual({
    "soft-heartbeat": [7, 10], "warm-pad-pulse": [6, 9], "slow-heartbeat": [5, 8], "echoing-heartbeat": [6, 9], "pulsing-hum": [8, 12],
    "muffled-heartbeat": [6, 9], "slow-double-beat": [3, 4], "single-beat": [2, 3], "room-heartbeat": [3, 4], "breathing-pad": [5, 8],
    "double-pad-pulse": [4, 6], "slow-breath": [5, 8], "deep-heartbeat": [3, 5], "warm-heartbeat": [3, 4], "soft-pad-pulse": [5, 8],
    "low-breath": [5, 8],
  });
  // The gap after a play of the default: from 7 s to 10 s, never the 4 to 6 it was.
  const soft = thinkingSound(DEFAULT_THINKING_SOUND);
  expect(nextGapSeconds(soft, 1, () => 0)).toBe(7);
  expect(nextGapSeconds(soft, 1, () => 0.5)).toBe(8.5);
  expect(nextGapSeconds(soft, 1, () => 1)).toBe(10);
});

test("the frequency stretches or shortens a sound's gaps in steps, from 3× as long to half; 1 is the sound's own cadence", () => {
  expect(THINKING_SOUND_INTERVAL_SCALES).toEqual([3, 2, 1.5, 1.25, 1, 0.75, 0.5]);
  const soft = thinkingSound("soft-heartbeat");
  expect(scaledInterval(soft)).toEqual([7, 10]);
  expect(scaledInterval(soft, 1)).toEqual([7, 10]);
  expect(scaledInterval(soft, 0.5)).toEqual([3.5, 5]);
  expect(scaledInterval(soft, 1.25)).toEqual([8.75, 12.5]);
  expect(scaledInterval(soft, 3)).toEqual([21, 30]);
  expect(nextGapSeconds(soft, 2, () => 0)).toBe(14);
  expect(nextGapSeconds(soft, 2, () => 1)).toBe(20);
  expect(nextGapSeconds(thinkingSound("single-beat"), 0.75, () => 0.5)).toBeCloseTo(1.875, 6);
  // A factor between steps is the nearest; anything that is not one, the sound's own cadence.
  expect(thinkingSoundIntervalScale(1.1)).toBe(1);
  expect(thinkingSoundIntervalScale(1.2)).toBe(1.25);
  expect(thinkingSoundIntervalScale(7)).toBe(3);
  expect(thinkingSoundIntervalScale(0.1)).toBe(0.5);
  for (const junk of [undefined, null, "2", 0, -1, Number.NaN, Infinity]) expect(thinkingSoundIntervalScale(junk)).toBe(1);
  expect(scaledInterval(soft, Number.NaN)).toEqual([7, 10]);
});

test("every sound's files are there, beside the manifest, in the format each says: Opus in WebM, AAC in MP4", () => {
  for (const sound of THINKING_SOUNDS) {
    const webm = readFileSync(join(folder, sound.files.webm));
    const m4a = readFileSync(join(folder, sound.files.m4a));
    expect(webm.subarray(0, 4).toString("hex"), sound.files.webm).toBe("1a45dfa3");
    expect(webm.includes(Buffer.from("OpusHead")), sound.files.webm).toBe(true);
    expect(m4a.subarray(4, 8).toString("latin1"), sound.files.m4a).toBe("ftyp");
    expect(m4a.includes(Buffer.from("mp4a")), sound.files.m4a).toBe(true);
    // Compact: no file of a few seconds is a WAV's size.
    for (const file of [sound.files.webm, sound.files.m4a]) expect(statSync(join(folder, file)).size, file).toBeLessThan(80_000);
  }
});

test("each sound has a short name of its own in every language, and none says it was made by AI", () => {
  const AI = /\(|\b(IA|AI|KI|SI)\b|人工知能|人工智能|인공지능|एआई/;
  for (const language of UI_LANGUAGES) {
    const t = translator(language);
    const names = THINKING_SOUNDS.map((sound) => t(`settings.call.sound.${sound.id}` as MessageKey));
    expect(new Set(names).size, language).toBe(names.length);
    for (const name of names) {
      expect(name, language).not.toMatch(/^settings\./);
      expect(name, language).not.toMatch(AI);
      expect(name.length, `${language}: ${name}`).toBeLessThanOrEqual(28);
    }
  }
  expect(translator("es")("settings.call.sound.soft-heartbeat")).toBe("Latido suave");
});

test("the volume is whole dB from −20 to +10; anything else is the nearest, or the sound as it is", () => {
  expect(thinkingSoundGain(3)).toBe(3);
  expect(thinkingSoundGain(-6.4)).toBe(-6);
  expect(thinkingSoundGain(25)).toBe(10);
  expect(thinkingSoundGain(-40)).toBe(-20);
  for (const junk of [undefined, null, "3", Number.NaN, Infinity]) expect(thinkingSoundGain(junk)).toBe(0);
});

test("a sound's file is served beside the page, with the build in its URL", () => {
  (globalThis as { sidevoiceBuildId?: string }).sidevoiceBuildId = "b1";
  const url = new URL(thinkingSoundUrl("soft-heartbeat.webm"));
  expect(url.pathname.endsWith("/sounds/thinking/soft-heartbeat.webm")).toBe(true);
  expect(url.searchParams.get("v")).toBe("b1");
  delete (globalThis as { sidevoiceBuildId?: string }).sidevoiceBuildId;
});

test("by default the soft heartbeat at its own level and cadence; the choice is kept, and one no longer shipped is the default again", () => {
  expect(readCallPreferences()).toEqual(DEFAULT_CALL_PREFERENCES);
  expect(DEFAULT_CALL_PREFERENCES).toMatchObject({ presence: "hidden", sound: "soft-heartbeat", soundGainDb: 0, soundIntervalScale: 1 });
  writeCallPreferences({ sound: "low-breath", soundGainDb: -7 });
  expect(readCallPreferences()).toMatchObject({ sound: "low-breath", soundGainDb: -7 });
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ presence: "always", sound: "breath", soundGainDb: 99 }));
  expect(readCallPreferences()).toMatchObject({ presence: "always", sound: "soft-heartbeat", soundGainDb: 10 });
  // What was kept before the sounds (when and the screen) reads as it was, the sound the default.
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ presence: "off", keepAwake: true }));
  expect(readCallPreferences()).toEqual({ presence: "off", sound: "soft-heartbeat", soundGainDb: 0, soundIntervalScale: 1, keepAwake: true });
});

test("the frequency is kept beside the volume, and comes back as it was set; one it cannot be is the nearest, or the default", () => {
  writeCallPreferences({ soundIntervalScale: 2 });
  expect(JSON.parse(localStorage.getItem(CALL_PREFERENCES_KEY)!)).toMatchObject({ soundGainDb: 0, soundIntervalScale: 2 });
  expect(readCallPreferences().soundIntervalScale).toBe(2);
  // Another setting changed keeps it; restored, it is the sound's own cadence again.
  writeCallPreferences({ soundGainDb: -4 });
  expect(readCallPreferences()).toMatchObject({ soundGainDb: -4, soundIntervalScale: 2 });
  writeCallPreferences({ soundIntervalScale: 1 });
  expect(readCallPreferences()).toMatchObject({ soundGainDb: -4, soundIntervalScale: 1 });
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ soundIntervalScale: 2.2 }));
  expect(readCallPreferences().soundIntervalScale).toBe(2);
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ soundIntervalScale: "slow" }));
  expect(readCallPreferences().soundIntervalScale).toBe(1);
});

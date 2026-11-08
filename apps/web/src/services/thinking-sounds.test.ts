import { afterEach, expect, test } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_THINKING_SOUND, THINKING_SOUNDS, nextGapSeconds, thinkingSound, thinkingSoundGain, thinkingSoundUrl } from "./thinking-sounds";
import { DEFAULT_CALL_PREFERENCES, CALL_PREFERENCES_KEY, readCallPreferences, writeCallPreferences } from "./call-preferences";
import { UI_LANGUAGES, translator, type MessageKey } from "../i18n/translator";

/* The thinking sounds as the web ships them: the manifest (public/sounds/thinking/sounds.json) the page and the iOS app
 * read, its files beside it, each sound's name in every language, and the person's choice of sound and volume. */

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
    expect(nextGapSeconds(sound, () => 0)).toBe(min);
    expect(nextGapSeconds(sound, () => 0.999999)).toBeCloseTo(max, 3);
  }
  expect(thinkingSound("soft-heartbeat").interval).toEqual([4, 6]);
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

test("by default the soft heartbeat at its own level; the choice is kept, and one no longer shipped is the default again", () => {
  expect(readCallPreferences()).toEqual(DEFAULT_CALL_PREFERENCES);
  expect(DEFAULT_CALL_PREFERENCES).toMatchObject({ presence: "hidden", sound: "soft-heartbeat", soundGainDb: 0 });
  writeCallPreferences({ sound: "low-breath", soundGainDb: -7 });
  expect(readCallPreferences()).toMatchObject({ sound: "low-breath", soundGainDb: -7 });
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ presence: "always", sound: "breath", soundGainDb: 99 }));
  expect(readCallPreferences()).toMatchObject({ presence: "always", sound: "soft-heartbeat", soundGainDb: 10 });
  // What was kept before the sounds (when and the screen) reads as it was, the sound the default.
  localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ presence: "off", keepAwake: true }));
  expect(readCallPreferences()).toEqual({ presence: "off", sound: "soft-heartbeat", soundGainDb: 0, keepAwake: true });
});

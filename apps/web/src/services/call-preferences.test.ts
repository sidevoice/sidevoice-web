import { beforeEach, expect, test } from "vitest";
import { CALL_PREFERENCES_KEY, DEFAULT_CALL_PREFERENCES, readCallPreferences, withSpeakingStyle, writeCallPreferences } from "./call-preferences";

beforeEach(() => globalThis.localStorage.clear());

test("how the agent speaks is normal until the person chooses another", () => {
  expect(DEFAULT_CALL_PREFERENCES.speakingStyle).toBe("normal");
  expect(readCallPreferences().speakingStyle).toBe("normal");
});

test("the choice is kept on this device, and a value nobody offers falls back to the default", () => {
  writeCallPreferences({ speakingStyle: "brief" });
  expect(readCallPreferences().speakingStyle).toBe("brief");
  expect(JSON.parse(globalThis.localStorage.getItem(CALL_PREFERENCES_KEY)!).speakingStyle).toBe("brief");
  globalThis.localStorage.setItem(CALL_PREFERENCES_KEY, JSON.stringify({ speakingStyle: "poetic" }));
  expect(readCallPreferences().speakingStyle).toBe("normal");
});

test("each message the person sends carries speaking_style as chosen", () => {
  expect(withSpeakingStyle({ text: "hi" })).toEqual({ text: "hi", speaking_style: "normal" });
  writeCallPreferences({ speakingStyle: "detailed" });
  expect(withSpeakingStyle({ turn_id: "t", phase: "finished" })).toEqual({ turn_id: "t", phase: "finished", speaking_style: "detailed" });
});

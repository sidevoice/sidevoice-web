import { expect, test } from "vitest";
import { avatarFor, avatarKey, avatarTone, PERSON_AVATAR, SIDEVOICE_MASCOT } from "./avatar-spec";
import { bichoSpec, personSpec } from "./bicho-draw";
import { specFromSeed } from "./engine/bichos/seed";

test("an agent's bicho comes from its conversation's identity alone: the same id rolls the same bicho every time", () => {
  expect(avatarFor("t-login")).toEqual({ kind: "bicho", seed: "t-login" });
  expect(specFromSeed("t-login")).toEqual(specFromSeed("t-login"));
  expect(bichoSpec("t-login")).toEqual(specFromSeed("t-login"));
  // Pinned: nothing is stored, so a reload or another device rolls exactly these (the engine's v4 roller). Changing
  // the roller changes every conversation's bicho, and has to be a decision.
  expect(specFromSeed("7f3c2a91-thread")).toEqual({
    body: "round",
    parts: { top: "fox", mouth: "cat", tail: "fox", pattern: ["belly"], nose: "nose", cheeks: "blush", arms: "nubs", legs: "feet", eyes: "two", pins: "pins" },
    color: { hue: 20.520338946487755, sat: 78, light: 56, spot: 160 },
    shape: "7f3c2a91-thread",
    name: "zorro",
  });
  expect(specFromSeed("t-login")).toEqual({
    body: "stack",
    parts: { top: "antenna", arms: "nubs", legs: "wheels", eyes: "led-pill", mouth: "led-bar", earwear: "headphones" },
    color: { hue: 150, sat: 46.1132085127756, light: 67.25349287316203, spot: 180 },
    shape: "t-login",
    name: "cabezón",
  });
});

test("conversations get varied bichos: bodies, members and colours all spread", () => {
  const specs = Array.from({ length: 400 }, (_, index) => specFromSeed("thread-" + index));
  expect(new Set(specs.map((spec) => JSON.stringify(spec))).size).toBe(400);
  expect(new Set(specs.map((spec) => spec.body)).size).toBeGreaterThanOrEqual(12);
  expect(new Set(specs.map((spec) => spec.name)).size).toBeGreaterThan(40);
  expect(new Set(specs.map((spec) => Math.round(spec.color.hue / 30))).size).toBeGreaterThanOrEqual(12);
});

test("the person keeps one bicho of their own, pinned, not rolled", () => {
  expect(PERSON_AVATAR).toEqual({ kind: "person" });
  expect(personSpec()).toMatchObject({ body: "round", parts: { eyes: "two", mouth: "smile", headgear: "beanie" }, color: { hue: 214, sat: 75, light: 75 } });
  expect(personSpec()).toBe(personSpec());
});

test("each figure has one key, and a tone the stage and the small avatars are tinted with", () => {
  expect(avatarKey(avatarFor("a"))).toBe("bicho:a");
  expect(avatarKey(PERSON_AVATAR)).toBe("person");
  expect(avatarKey(SIDEVOICE_MASCOT)).toBe("mascot:sidevoice");
  // A seed that spells a mascot's name is still a conversation's bicho.
  expect(avatarKey(avatarFor("sidevoice"))).toBe("bicho:sidevoice");
  expect(avatarTone("#d97757")).toEqual({ "--av-color": "#d97757", "--av-bg": "color-mix(in srgb, #d97757 22%, var(--sv-surface))" });
});

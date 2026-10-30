import { expect, test } from "vitest";
import { avatarFor, avatarKey, avatarTone, PERSON_AVATAR, SIDEVOICE_MASCOT } from "./avatar-spec";
import { bichoSpec, personSpec } from "./bicho-draw";
import { specFromSeed } from "./engine/bichos/generate";

test("an agent's bicho comes from its conversation's identity alone: the same id rolls the same bicho every time", () => {
  expect(avatarFor("t-login")).toEqual({ kind: "bicho", seed: "t-login" });
  expect(specFromSeed("t-login")).toEqual(specFromSeed("t-login"));
  expect(bichoSpec("t-login")).toEqual(specFromSeed("t-login"));
  // Pinned: nothing is stored, so a reload or another device rolls exactly these (the engine's v5 generator, SHA-256 into
  // PCG32). Changing the generator, its tables or its streams changes every conversation's bicho, and has to be a decision.
  const pinned = (seed: string) => { const { color, tints, ...rest } = specFromSeed(seed); return { ...rest, hue: Math.round(color.hue), tints: Object.keys(tints ?? {}).length }; };
  expect(pinned("7f3c2a91-thread")).toEqual({
    body: "pill",
    parts: { eyes: "button", mouth: "tiny", arms: "nubs", legs: "boots", top: "frosting", pattern: ["wrapper"], cheeks: "blush", neckwear: "bow" },
    shape: "7f3c2a91-thread",
    name: "dulce",
    hue: 45,
    tints: 15,
  });
  expect(pinned("t-login")).toEqual({
    body: "wide",
    parts: { eyes: "big", mouth: "gap", arms: "claws", legs: "many", top: "eyestalks", pattern: ["spots"], eyewear: "sunglasses" },
    shape: "t-login",
    name: "marino/cangrejo",
    hue: 42,
    tints: 9,
  });
});

test("conversations get varied bichos: bodies, kinds and colours all spread", () => {
  const specs = Array.from({ length: 400 }, (_, index) => specFromSeed("thread-" + index));
  expect(new Set(specs.map((spec) => JSON.stringify(spec))).size).toBe(400);
  expect(new Set(specs.map((spec) => spec.body)).size).toBeGreaterThanOrEqual(12);
  expect(new Set(specs.map((spec) => spec.name)).size).toBeGreaterThan(25);
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

import { expect, test } from "vitest";
import { avatarFor, avatarKey, avatarTone, PERSON_AVATAR, SIDEVOICE_MASCOT } from "./avatar-spec";
import { avatarColor, personSpec } from "./bicho-draw";
import { creatureFromSeed } from "./creature/catalogue";

test("an agent's creature comes from its conversation's identity alone: the same id rolls the same creature every time", () => {
  expect(avatarFor("t-login")).toEqual({ kind: "bicho", seed: "t-login" });
  expect(creatureFromSeed("t-login")).toEqual(creatureFromSeed("t-login"));
  // Pinned: nothing is stored, so a reload or another device rolls exactly these (the creator's roll, its Math.random
  // replaced by a stream seeded with SHA-256 of ["creature-v1", id] into PCG32). Changing a table, a rate, the order of
  // the draws or the version changes every conversation's creature, and has to be a decision.
  expect(creatureFromSeed("7f3c2a91-thread")).toEqual({ body: "pear", color: "#5e6b7a", accent: "#f0b45a", iris: "#3d78c4", ears: "bunny", head: "curl", face: "none", eyewear: "none", eyes: "normal" });
  expect(creatureFromSeed("t-login")).toEqual({ body: "bean", color: "#f2a7c3", accent: "#8fd0b8", iris: "#7a56c0", ears: "none", head: "bobble hat", face: "none", eyewear: "none", eyes: "normal" });
  expect(creatureFromSeed("Ünïcødé ✓")).toEqual({ body: "can", color: "#4fb3c8", accent: "#9fb2c6", iris: "#b07a3a", ears: "none", head: "none", face: "muzzle", eyewear: "none", eyes: "normal" });
  // The stage and the small avatars are tinted with its body colour.
  expect(avatarColor(avatarFor("t-login"))).toBe("#f2a7c3");
});

test("conversations get varied creatures: bodies, colours and parts all spread", () => {
  const all = Array.from({ length: 400 }, (_, index) => creatureFromSeed("thread-" + index));
  expect(new Set(all.map((c) => JSON.stringify(c))).size).toBeGreaterThan(390);
  expect(new Set(all.map((c) => c.body)).size).toBe(18);
  expect(new Set(all.map((c) => c.color)).size).toBeGreaterThanOrEqual(17);
  expect(new Set(all.map((c) => c.head)).size).toBeGreaterThan(20);
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
  // A seed that spells a mascot's name is still a conversation's creature.
  expect(avatarKey(avatarFor("sidevoice"))).toBe("bicho:sidevoice");
  expect(avatarTone("#d97757")).toEqual({ "--av-color": "#d97757", "--av-bg": "color-mix(in srgb, #d97757 22%, var(--sv-surface))" });
});

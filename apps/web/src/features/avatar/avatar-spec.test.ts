import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { AVATAR_EXTRAS, AVATAR_EYES, AVATAR_SHAPES, AVATAR_TONES, avatarFor, avatarTone, PERSON_AVATAR, PERSON_TONE } from "./avatar-spec";

test("an agent's avatar comes from its conversation's identity alone: the same id gives the same face every time", () => {
  expect(avatarFor("t-login")).toEqual(avatarFor("t-login"));
  // Pinned: nothing is stored, so a reload or another device derives exactly these. Changing the derivation
  // changes every conversation's face, and has to be a decision.
  expect(avatarFor("7f3c2a91-thread")).toEqual({ shape: "square", eyes: "dots", extra: "beanie", tone: 1 });
  expect(avatarFor("t-login")).toEqual({ shape: "drop", eyes: "sleepy", extra: "antenna", tone: 1 });
});

test("conversations get varied avatars from every part, and never the person's own colour", () => {
  const specs = Array.from({ length: 400 }, (_, index) => avatarFor("thread-" + index));
  expect(new Set(specs.map((spec) => JSON.stringify(spec))).size).toBeGreaterThan(250);
  expect(new Set(specs.map((spec) => spec.shape))).toEqual(new Set(AVATAR_SHAPES));
  expect(new Set(specs.map((spec) => spec.eyes))).toEqual(new Set(AVATAR_EYES));
  expect(new Set(specs.map((spec) => spec.extra))).toEqual(new Set(AVATAR_EXTRAS));
  const tones = new Set(specs.map((spec) => spec.tone));
  expect(tones.has(PERSON_TONE)).toBe(false);
  expect(tones.size).toBe(AVATAR_TONES - 1);
  expect(PERSON_AVATAR.tone).toBe(PERSON_TONE);
});

test("every tone an avatar can wear is a token pair the room defines", () => {
  const tokens = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
  for (let tone = 1; tone <= AVATAR_TONES; tone += 1) {
    expect(tokens).toMatch(new RegExp(`--sv-avatar-${tone}:`));
    expect(tokens).toMatch(new RegExp(`--sv-avatar-${tone}-bg:`));
  }
  expect(avatarTone({ ...PERSON_AVATAR, tone: 3 })).toEqual({ "--av-color": "var(--sv-avatar-3)", "--av-bg": "var(--sv-avatar-3-bg)" });
});

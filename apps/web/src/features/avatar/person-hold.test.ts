import { expect, test } from "vitest";
import { avatarKey } from "./avatar-spec";
import { drawAvatar, personSpec } from "./bicho-draw";

test("the person's bicho can hold the microphone: its own figure, its own drawing; plain, it holds nothing", () => {
  expect(personSpec().parts.held).toBeUndefined();
  expect(personSpec("microphone").parts.held).toBe("microphone");
  expect(avatarKey({ kind: "person", hold: "microphone" })).not.toBe(avatarKey({ kind: "person" }));
  expect(drawAvatar({ kind: "person", hold: "microphone" }, "stage").html).not.toBe(drawAvatar({ kind: "person" }, "stage").html);
});

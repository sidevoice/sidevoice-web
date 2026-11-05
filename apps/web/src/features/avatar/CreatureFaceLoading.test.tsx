import { expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { avatarFor } from "./avatar-spec";

/* The first time a creature is drawn its code is still loading (creature/host.ts, a chunk of its own): here it never
 * lands. A face that must never show blank (the transcript's) shows its outline meanwhile; any other copy, as before,
 * nothing yet. */

vi.mock("./creature/host", () => new Promise(() => {}));
const { CharacterAvatar } = await import("./CharacterAvatar");

test("while the creature's code loads, a face asked for at once shows its outline in the body colour; any other, nothing yet", () => {
  const view = render(<>
    <CharacterAvatar spec={avatarFor("t-login")} state={{ mood: "present" }} size="small" immediate />
    <CharacterAvatar spec={avatarFor("t-login")} state={{ mood: "present" }} size="small" />
  </>);
  const [asked, other] = view.container.querySelectorAll(".sv-avatar");
  expect(asked).toHaveAttribute("data-fallback");
  expect(asked.querySelector(".creature-fallback path")).not.toBeNull();
  expect(other).not.toHaveAttribute("data-fallback");
  expect(other.querySelector(".creature-fallback")).toBeNull();
});

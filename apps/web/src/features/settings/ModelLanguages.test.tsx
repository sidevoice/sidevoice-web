import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ModelLanguageNotice, ModelLanguages } from "./ModelLanguages";

/* The languages line of a model's block (sidevoice-web#339): the rest a popover away; the interface speaks English here
 * (the test's system). */

afterEach(cleanup);

const LANGUAGES = ["ko", "ja", "en", "de", "es", "fr"];

function line(chosen: string | null, languages = LANGUAGES) {
  const { container } = render(<p><ModelLanguages languages={languages} chosen={chosen} note="Best for short phrases" /></p>);
  const more = container.querySelector<HTMLButtonElement>("button.model-languages-more");
  return { text: container.textContent, bold: [...container.querySelectorAll("strong")].map((name) => name.textContent), more };
}

test("the interface's and the chosen language first, four named, the rest a popover away; the one in use bold", () => {
  const { text, bold, more } = line("es");
  expect(text).toBe("Best for short phrases · English, Spanish, Korean, Japanese +2 more");
  expect(bold).toEqual(["Spanish"]);
  expect(more).toHaveAttribute("type", "button");
  expect(more).toHaveAttribute("aria-haspopup", "dialog");
  // Its name holds what it shows.
  expect(more).toHaveAccessibleName("+2 more languages");
  cleanup();
  // Automatic: the interface's language is the one in use.
  expect(line(null).bold).toEqual(["English"]);
});

test("four languages or fewer are all named, with nothing to reveal", () => {
  const { text, more } = line(null, ["es", "en", "de", "fr"]);
  expect(text).toBe("Best for short phrases · English, Spanish, German, French");
  expect(more).toBeNull();
});

test("a language in use the model does not list is said under the line, in a region that stays", () => {
  const notice = (languages: string[], chosen: string | null) => {
    const { container } = render(<ModelLanguageNotice languages={languages} chosen={chosen} />);
    const region = container.querySelector(".model-prepare-notice")!;
    expect(region).toHaveAttribute("aria-live", "polite");
    const text = region.textContent;
    cleanup();
    return text;
  };
  expect(notice(["es"], null)).toBe("This model doesn't support English.");
  expect(notice(["es"], "fr")).toBe("This model doesn't support French.");
  expect(notice(["es", "en-US"], null)).toBe("");
  // A model that lists no languages says nothing about them.
  expect(notice([], "fr")).toBe("");
});

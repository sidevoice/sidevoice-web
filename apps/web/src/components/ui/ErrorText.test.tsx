import { afterEach, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { Alert } from "./Alert";
import { ErrorText } from "./ErrorText";

/* A failure where it happened: its sentence, a provider's words after it, and what was raw about it closed behind
 * Details — in the interface's language, and never translated itself. */

afterEach(() => localStorage.removeItem("sidevoice.settings"));

test("the sentence is the text; what was raw is closed behind Details, untranslated", () => {
  const { container } = render(<ErrorText role="alert" message={{ text: "Something went wrong with the voice.", details: "format-model\nformat model q5 unsupported" }} />);
  const shown = container.querySelector(".ui-error-text > p")!;
  expect(shown).toHaveTextContent(/^Something went wrong with the voice\.$/);
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")).toHaveTextContent("Details");
  expect(details.querySelector("pre")).toHaveAttribute("translate", "no");
  expect(details.querySelector("pre")!.textContent).toBe("format-model\nformat model q5 unsupported");
});

test("a provider's words follow the sentence; with nothing raw there is no Details", () => {
  const { container } = render(<ErrorText message={{ text: "The provider didn't accept the key.", said: "invalid_api_key" }} />);
  expect(container.querySelector(".ui-error-text > p")).toHaveTextContent("The provider didn't accept the key. invalid_api_key");
  expect(container.querySelector(".ui-error-said")).toHaveAttribute("translate", "no");
  expect(container.querySelector("details")).toBeNull();
});

test("Details speaks the interface's language, in an Alert too", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  const { container } = render(<Alert tone="danger" title="Algo falló con la sala." details="TypeError\nFailed to fetch" />);
  expect(container.querySelector(".ui-alert-title")).toHaveTextContent(/^Algo falló con la sala\.$/);
  expect(container.querySelector("details > summary")).toHaveTextContent("Detalles");
});

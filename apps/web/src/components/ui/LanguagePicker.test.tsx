import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguagePicker } from "./LanguagePicker";

afterEach(cleanup);

test("searches a long language list by name or code, with accents ignored, and chooses from the keyboard", () => {
  const change = vi.fn();
  const options = [{ value: "", label: "Automatic" }, ...Array.from({ length: 64 }, (_, n) => ({ value: `lang-${n}`, label: `Language ${n}` })),
    { value: "es", label: "Español" }];
  render(<LanguagePicker id="language" value="" onValueChange={change} options={options} label="Language" />);
  const trigger = screen.getByRole("button", { name: "Language: Automatic" });
  fireEvent.click(trigger);
  const input = screen.getByRole("combobox", { name: "Search languages" });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "espanol" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: "Español" })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(change).toHaveBeenCalledWith("es");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("shows no language icon unless asked to", () => {
  const options = [{ value: "", label: "Automatic" }];
  const { rerender } = render(<LanguagePicker id="language" value="" onValueChange={() => {}} options={options} label="Language" />);
  expect(document.querySelector("#language .lucide-languages")).toBeNull();
  rerender(<LanguagePicker id="language" value="" onValueChange={() => {}} options={options} label="Language" showLanguageIcon />);
  expect(document.querySelector("#language .lucide-languages")).toBeInTheDocument();
});

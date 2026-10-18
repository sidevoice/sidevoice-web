import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VoicePicker } from "./VoicePicker";

afterEach(() => { cleanup(); localStorage.removeItem("sidevoice.variants"); });

const voices = [
  { id: "luna", name: "Luna", languages: ["es"] },
  { id: "river", name: "River", languages: ["en", "es"] },
  { id: "ash", name: "Ash", languages: [] },
];
const names = () => [...document.querySelectorAll(".voice-picker-name")].map((node) => node.textContent);

test("search and language filter use the same catalogue choices, then pick a voice", () => {
  const change = vi.fn();
  render(<VoicePicker id="voice" value="" automatic="Automatic" voices={voices} onValueChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic" }));
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search voices" }));
  expect(names()).toEqual(["Automatic", "Luna", "River", "Ash"]);
  fireEvent.click(screen.getByRole("button", { name: "Language: All languages" }));
  const languageSearch = screen.getByRole("combobox", { name: "Search languages" });
  expect(document.activeElement).toBe(languageSearch);
  fireEvent.change(languageSearch, { target: { value: "spa" } });
  fireEvent.keyDown(languageSearch, { key: "Enter" });
  expect(change).not.toHaveBeenCalled();
  expect(names()).toEqual(["Luna", "River"]);
  fireEvent.change(screen.getByRole("combobox", { name: "Search voices" }), { target: { value: "riv" } });
  expect(names()).toEqual(["River"]);
  fireEvent.click(screen.getByText("River"));
  expect(change).toHaveBeenCalledWith("river");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Automatic" }));
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search voices" }));
});

test("language filter is absent when no voice has language data", () => {
  render(<VoicePicker id="voice" value="" automatic="Automatic" voices={[{ id: "ash", name: "Ash", languages: [] }]} onValueChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Automatic" }));
  expect(screen.queryByRole("button", { name: /Language:/ })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Search voices" }), { target: { value: "missing" } });
  expect(screen.getByText("No voices found.")).toBeInTheDocument();
});

import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Select, type SelectItems } from "./Select";
import { Field } from "./Field";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

afterEach(cleanup);

/* The shared Select: "" a value like any other, options that say more, groups, the keyboard, a label and a field. */

const LANGUAGES: SelectItems = [
  { value: "", label: "Automatic" },
  { label: "Common", options: [{ value: "en", label: "English", description: "The fallback" }, { value: "es", label: "Español" }] },
  { label: "Others", options: [{ value: "de", label: "Deutsch", disabled: true, reason: "No voice for it yet" }, { value: "fr", label: "Français" }] },
];

test("lists its options in their groups, each named by its label and described by its lines, the chosen one checked", () => {
  render(<Select id="lang" aria-label="Language" value="es" options={LANGUAGES} />);
  expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("Español");
  expect(listOptions("lang")).toEqual([
    { value: "", label: "Automatic", detail: "", disabled: false, selected: false },
    { value: "en", label: "English", detail: "The fallback", disabled: false, selected: false },
    { value: "es", label: "Español", detail: "", disabled: false, selected: true },
    { value: "de", label: "Deutsch", detail: "No voice for it yet", disabled: true, selected: false },
    { value: "fr", label: "Français", detail: "", disabled: false, selected: false },
  ]);
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(screen.getByRole("combobox"));
  expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-labelledby") && document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent))
    .toEqual(["Common", "Others"]);
});

test("\"\" is a choice like any other: chosen, it shows; picked, it is what the change says", () => {
  const change = vi.fn();
  render(<Select id="lang" aria-label="Language" value="" onValueChange={change} options={LANGUAGES} />);
  expect(screen.getByRole("combobox")).toHaveTextContent("Automatic");
  expect(listOptions("lang")[0].selected).toBe(true);
  chooseOption("lang", "fr");
  expect(change).toHaveBeenLastCalledWith("fr");
  cleanup();
  render(<Select id="lang" aria-label="Language" value="fr" onValueChange={change} options={LANGUAGES} />);
  chooseOption("lang", "");
  expect(change).toHaveBeenLastCalledWith("");
});

test("a disabled option cannot be picked; with no value of its own, the placeholder shows", () => {
  const change = vi.fn();
  render(<Select id="lang" aria-label="Language" defaultValue="en" onValueChange={change} options={LANGUAGES} />);
  chooseOption("lang", "de");
  expect(change).not.toHaveBeenCalled();
  chooseOption("lang", "es");
  expect(selectedValue("lang")).toBe("es");
  cleanup();
  render(<Select id="family" aria-label="Family" value="" placeholder="Choose a family" options={[{ value: "whisper", label: "Whisper" }]} />);
  expect(screen.getByRole("combobox")).toHaveTextContent("Choose a family");
});

test("the keyboard opens it on the chosen option, moves past disabled ones, and Escape closes only the list", async () => {
  const change = vi.fn();
  const outer = vi.fn();
  window.addEventListener("keydown", outer);
  render(<Select id="lang" aria-label="Language" value="es" onValueChange={change} options={LANGUAGES} />);
  const box = screen.getByRole("combobox");
  // Focus moves once the list is placed, and from option to option, a moment after the key (Radix's own timing).
  const press = async (target: Element, key: string) => {
    fireEvent.keyDown(target, { key });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };
  await press(box, "Enter");
  expect(box).toHaveAttribute("aria-expanded", "true");
  expect(document.activeElement).toHaveAttribute("data-value", "es");
  await press(document.activeElement!, "ArrowDown");
  // Deutsch is disabled: the next is Français.
  expect(document.activeElement).toHaveAttribute("data-value", "fr");
  await press(document.activeElement!, "Home");
  expect(document.activeElement).toHaveAttribute("data-value", "");
  await press(document.activeElement!, "Escape");
  expect(box).toHaveAttribute("aria-expanded", "false");
  // What else listens for Escape is told it was taken (a bar, a panel or a dialog it is in stays open).
  expect(outer.mock.calls.at(-1)?.[0].defaultPrevented).toBe(true);
  window.removeEventListener("keydown", outer);
  await press(box, "Enter");
  await press(document.activeElement!, "End");
  await press(document.activeElement!, "Enter");
  expect(change).toHaveBeenLastCalledWith("fr");
});

test("a Field labels it, describes it and marks it invalid; size and disabled reach its box", () => {
  render(<Field label="Speaker" hint="It plays through the system's speaker." error="Not available"><Select id="speaker" size="sm" disabled value="" options={[{ value: "", label: "System default" }]} /></Field>);
  const box = screen.getByLabelText("Speaker");
  expect(box).toBe(document.getElementById("speaker"));
  expect(box).toHaveAccessibleDescription(/Not available.*system's speaker/);
  expect(box).toHaveAttribute("aria-invalid", "true");
  expect(box).toBeDisabled();
  expect(box).toHaveClass("ui-control--sm");
});

test("in a form, a value and the options that hold it, changed together, are not taken back as a choice of nothing", () => {
  // Radix keeps a hidden native select for the form, set to the new value before the new options are drawn in it: it
  // reports "" (no option has the value yet). Taken as a choice, that clears the value it echoes, and whatever sets it
  // again loops (the first-run setup choosing a model of another family while Settings, a form, is drawn behind it).
  const change = vi.fn();
  const kokoro = [{ value: "kokoro-82m-v0.19", label: "kokoro-82m-v0.19" }, { value: "kokoro-82m-v1.0", label: "kokoro-82m-v1.0" }];
  const supertonic = [{ value: "supertonic-3", label: "supertonic-3" }, { value: "supertonic-2", label: "supertonic-2" }];
  const { rerender } = render(<form><Select id="model" aria-label="Model" value="kokoro-82m-v1.0" onValueChange={change} options={kokoro} /></form>);
  rerender(<form><Select id="model" aria-label="Model" value="supertonic-3" onValueChange={change} options={supertonic} /></form>);
  expect(change).not.toHaveBeenCalled();
  expect(selectedValue("model")).toBe("supertonic-3");
  // With "" a choice of its own (Automatic), it is no more picked by it.
  const voices = (ids: string[]) => [{ value: "", label: "Automatic" }, ...ids.map((value) => ({ value, label: value }))];
  rerender(<form><Select id="voice" aria-label="Voice" value="af_heart" onValueChange={change} options={voices(["af_heart"])} /></form>);
  rerender(<form><Select id="voice" aria-label="Voice" value="ef_dora" onValueChange={change} options={voices(["ef_dora", "em_alex"])} /></form>);
  expect(change).not.toHaveBeenCalled();
  chooseOption("voice", "em_alex");
  expect(change).toHaveBeenLastCalledWith("em_alex");
});

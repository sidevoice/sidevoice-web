import { fireEvent } from "@testing-library/react";

/* The shared Select (components/ui/Select) driven as a person does: a tap opens it, a tap on an option picks it. Its
 * list is drawn only while it is open, so each of these opens it and leaves it closed. */

function trigger(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`no select #${id}`);
  return node;
}

function openList(id: string) {
  const node = trigger(id);
  if (node.getAttribute("aria-expanded") !== "true") fireEvent.click(node);
  const list = document.getElementById(node.getAttribute("aria-controls") ?? "");
  if (!list) throw new Error(`select #${id} did not open`);
  return list;
}

const text = (ids: string | null) => (ids ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");

export interface ListedOption {
  value: string;
  /** Its name: the label alone. */
  label: string;
  /** What describes it: the line under it, and why it is disabled. */
  detail: string;
  disabled: boolean;
  selected: boolean;
}

/** What the select lists, in order, as it is read: each option's value, name, description and state. */
export function listOptions(id: string): ListedOption[] {
  const list = openList(id);
  const options = [...list.querySelectorAll<HTMLElement>("[role=option]")].map((option) => ({
    value: option.getAttribute("data-value") ?? "",
    label: text(option.getAttribute("aria-labelledby")),
    detail: text(option.getAttribute("aria-describedby")),
    disabled: option.getAttribute("aria-disabled") === "true",
    // Radix says aria-selected only of the chosen option while it has focus; its check is drawn from data-state.
    selected: option.getAttribute("data-state") === "checked",
  }));
  fireEvent.keyDown(list, { key: "Escape" });
  return options;
}

/** Picks the option whose value is `value`, as a tap would; a disabled one is tapped and nothing happens. */
export function chooseOption(id: string, value: string) {
  const list = openList(id);
  const option = [...list.querySelectorAll<HTMLElement>("[role=option]")].find((item) => item.getAttribute("data-value") === value);
  if (!option) throw new Error(`select #${id} has no option ${JSON.stringify(value)}`);
  fireEvent.click(option);
  if (list.isConnected) fireEvent.keyDown(list, { key: "Escape" });
}

/** The value the select has chosen. */
export function selectedValue(id: string) {
  return trigger(id).getAttribute("data-value") ?? "";
}

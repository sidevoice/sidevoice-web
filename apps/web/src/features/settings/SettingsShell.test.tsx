import { expect, test } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SettingsShell } from "./SettingsShell";

test("the section sidebar has an accessible mobile toggle and offers This App only when supported", () => {
  render(<SettingsShell hasMachines appAvailable={false}><p>Settings content</p></SettingsShell>);
  const navigation = screen.getByRole("navigation", { name: "Settings sections" });
  const toggle = screen.getByRole("button", { name: "Settings sections" });

  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(navigation).not.toHaveAttribute("data-mobile-open");
  expect(screen.queryByRole("button", { name: "This App" })).toBeNull();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(navigation).toHaveAttribute("data-mobile-open", "true");
  expect(screen.getByRole("button", { name: "Hide sections" })).toBeInTheDocument();
});

test("This App is present only when its bridge capability is available", () => {
  render(<SettingsShell hasMachines appAvailable><p>Settings content</p></SettingsShell>);
  expect(screen.getByRole("button", { name: "This App" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Machines" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
  act(() => { window.dispatchEvent(new CustomEvent("sidevoice:settings-section", { detail: { name: "machines" } })); });
  expect(screen.getByRole("button", { name: "Machines" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "General" })).toHaveAttribute("aria-pressed", "false");
});

test("Escape folds the mobile drawer and returns focus to its accessible toggle", () => {
  render(<SettingsShell hasMachines appAvailable={false}><p>Settings content</p></SettingsShell>);
  const toggle = screen.getByRole("button", { name: "Settings sections" });
  const navigation = screen.getByRole("navigation", { name: "Settings sections" });
  fireEvent.click(toggle);

  expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(navigation).not.toHaveAttribute("data-mobile-open");
  expect(document.activeElement).toBe(toggle);
});

test("a pointer tap outside the mobile sidebar folds the drawer", () => {
  render(<SettingsShell hasMachines appAvailable={false}><p>Settings content</p></SettingsShell>);
  const toggle = screen.getByRole("button", { name: "Settings sections" });
  const navigation = screen.getByRole("navigation", { name: "Settings sections" });
  fireEvent.click(toggle);
  expect(navigation).toHaveAttribute("data-mobile-open", "true");

  fireEvent.pointerDown(screen.getByText("Settings content"));

  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(navigation).not.toHaveAttribute("data-mobile-open");
});

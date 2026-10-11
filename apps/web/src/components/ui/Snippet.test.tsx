import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Snippet } from "./Snippet";

afterEach(cleanup);

test("a snippet copies its text as it is, says so, and says what to do when the clipboard refuses", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<Snippet text="Connect to Sidevoice (use its voice_connect tool)" label="Copy the message" />);
  expect(document.querySelector("blockquote")).toHaveTextContent("Connect to Sidevoice");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy the message" })); });
  expect(writeText).toHaveBeenCalledWith("Connect to Sidevoice (use its voice_connect tool)");
  expect(screen.getByRole("status")).toHaveTextContent("Copied.");
  writeText.mockRejectedValueOnce(new Error("denied"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy the message" })); });
  expect(screen.getByRole("status")).toHaveTextContent("Select it and copy it.");
});

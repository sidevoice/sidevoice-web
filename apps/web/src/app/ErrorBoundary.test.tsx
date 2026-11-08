import { expect, test, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): never {
  throw new Error("name.trim is not a function");
}

afterEach(() => {
  delete window.sidevoiceReportError;
  vi.restoreAllMocks();
});

test("a failing panel is contained, said in words with what it threw behind Details, reported to the room, and the rest of the page stays", () => {
  const reports: unknown[] = [];
  window.sidevoiceReportError = (report) => reports.push(report);
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <div>
      <div id="live">Puedes entrar</div>
      <ErrorBoundary area="transcript"><Broken /></ErrorBoundary>
    </div>,
  );
  const alert = screen.getByRole("alert");
  expect(alert.querySelector("b")).toHaveTextContent("This part of the page failed.");
  // What it threw is no sentence for people: closed, behind Details.
  expect(alert.querySelector("b")).not.toHaveTextContent("name.trim");
  expect(alert.querySelector("details:not([open]) > summary")).toHaveTextContent("Details");
  expect(alert.querySelector("details > pre")).toHaveTextContent("name.trim is not a function");
  expect(document.getElementById("live")).not.toBeNull();
  expect(reports).toHaveLength(1);
  const report = reports[0] as { kind: string; message: string; component: string };
  expect(report.kind).toBe("render:transcript");
  expect(report.message).toBe("name.trim is not a function");
  expect(report.component).toContain("Broken");
});

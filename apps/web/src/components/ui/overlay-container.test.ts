import { expect, test } from "vitest";
import { overlayContainer } from "./Tooltip";

/* Where an overlay is drawn: a container given wins; else the open dialog its trigger is in (a modal dialog is in the
 * top layer, and anything drawn outside it is beneath it); else the body (undefined, Radix's default). */
test("an overlay is drawn in the container given, else its trigger's open dialog, else the body", () => {
  const given = document.createElement("div");
  const open = document.createElement("dialog");
  open.setAttribute("open", "");
  const closed = document.createElement("dialog");
  const inOpen = open.appendChild(document.createElement("button"));
  const inClosed = closed.appendChild(document.createElement("button"));
  document.body.append(open, closed);
  expect(overlayContainer(given, inOpen)).toBe(given);
  expect(overlayContainer(null, inOpen)).toBe(open);
  expect(overlayContainer(null, inClosed)).toBeUndefined();
  expect(overlayContainer(null, null)).toBeUndefined();
  open.remove(); closed.remove();
});

import { expect, test, vi } from "vitest";
import { CALL_END_REASONS, logCallEnd, logCallParked } from "./call-end.js";

test("a call end is one line with a dotted code the host's log forwarder lets through", () => {
  const code = /^call\.[a-z0-9_]{1,32}(\.[a-z0-9_]{1,32}){0,3}$/;
  for (const reason of CALL_END_REASONS) {
    const warn = vi.fn();
    logCallEnd(reason, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("The call ended.", { code: `call.ended.${reason}` });
    expect(warn.mock.calls[0][1].code).toMatch(code);
  }
});

test("a reason outside the list is unknown, never free text; a failing log is silent", () => {
  const warn = vi.fn();
  logCallEnd("The room said: hello Ana", warn);
  expect(warn).toHaveBeenCalledWith("The call ended.", { code: "call.ended.unknown" });
  expect(() => logCallEnd("idle", () => { throw new Error("x"); })).not.toThrow();
});

test("a page going away parks the call: its line says parked, never ended", () => {
  const warn = vi.fn();
  logCallParked(warn);
  expect(warn).toHaveBeenCalledWith("The page is going away; the call is parked.", { code: "call.parked.page_unload" });
  expect(CALL_END_REASONS).not.toContain("page_unload");
});

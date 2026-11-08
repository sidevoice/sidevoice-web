import { expect, test } from "vitest";
import { engineFailureCode, failureCode } from "./failure-code.js";

/* The stable code of a failure: never a DOMException's legacy number. */

test("a string code is the code; a browser's exception is its name, never its number; else the fallback", () => {
  const security = new DOMException("The operation is insecure.", "SecurityError");
  expect(security.code).toBe(18);
  expect(failureCode(security)).toBe("SecurityError");
  expect(failureCode(new DOMException("no", "NotAllowedError"))).toBe("NotAllowedError");
  expect(failureCode(Object.assign(new Error("no key"), { code: "credential-missing" }))).toBe("credential-missing");
  expect(failureCode(new Error("plain"), "voice-failed")).toBe("voice-failed");
  expect(failureCode(null, "")).toBe("");
  expect(failureCode({ code: 18 }, "x")).toBe("x");
});

test("the engine refused its storage (a SecurityError) is storage-blocked; its own codes stay", () => {
  expect(engineFailureCode(new DOMException("insecure", "SecurityError"))).toBe("storage-blocked");
  expect(engineFailureCode(Object.assign(new Error("x"), { code: "host-capabilities" }))).toBe("host-capabilities");
  expect(engineFailureCode(new Error("x"))).toBe("engine-unavailable");
});

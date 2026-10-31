import { describe, expect, test } from "vitest";
import { host, describeBrowser } from ".";

const nav = (platform: string, userAgent = "", maxTouchPoints = 0) => ({ platform, userAgent, maxTouchPoints });

describe("os: where the system's settings are", () => {
  test("the platform the page runs on, a phone none", () => {
    expect(describeBrowser(nav("MacIntel")).os).toBe("macos");
    expect(describeBrowser(nav("Win32")).os).toBe("windows");
    expect(describeBrowser(nav("Linux x86_64")).os).toBe("linux");
    expect(describeBrowser(nav("Linux armv8l", "Mozilla/5.0 (Linux; Android 14)")).os).toBe("android");
    expect(describeBrowser(nav("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).os).toBe("ios");
    expect(describeBrowser(nav("", "")).os).toBe("other");
  });

  test("an iPad asking for the desktop site says it is a Mac, and has a touch screen: it is not one", () => {
    expect(describeBrowser(nav("MacIntel", "", 5)).os).toBe("ios");
    expect(describeBrowser(nav("MacIntel", "", 1)).os).toBe("macos");
  });

  test("the system's word is read from the platform the browser states, in any case", () => {
    expect(describeBrowser({ userAgent: "", userAgentData: { platform: "macOS" } }).os).toBe("macos");
    expect(describeBrowser({ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)" }).os).toBe("linux");
    expect(describeBrowser({ userAgent: "Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0" }).os).toBe("linux");
  });

  test("the host reports it", () => {
    expect(host().identity.os).toBe(describeBrowser().os);
  });
});

describe("system and app: a device's default name", () => {
  const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  test.each([
    [{ userAgent: SAFARI_IPHONE }, "Safari", "iPhone"],
    [{ userAgent: CHROME_MAC, platform: "MacIntel" }, "Chrome", "Mac"],
    [{ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0" }, "Edge", "Windows"],
    [{ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0" }, "Opera", "Windows"],
    [{ userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" }, "Firefox", "Android"],
    [{ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" }, "Chrome", "ChromeOS"],
    [{ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, "", "iPhone"],
    [{ userAgent: "", userAgentData: { platform: "Windows" } }, "", "Windows"],
    [{ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1" }, "Safari", "iPad"],
  ])("%j", (facts, app, system) => {
    expect(describeBrowser(facts)).toMatchObject({ app, system });
  });

  test("a page that says nothing is neither", () => {
    expect(describeBrowser({})).toEqual({ os: "other", system: "", app: "" });
    expect(describeBrowser(undefined)).toMatchObject({ app: expect.any(String) });
  });

  // Names keep their exact, case-sensitive reading: jsdom's lower-case "linux" is not a system a device name states.
  test("the name's words are read case-sensitively", () => {
    expect(describeBrowser({ userAgent: "Mozilla/5.0 (linux) jsdom/26.1.0" })).toMatchObject({ system: "", app: "" });
  });
});

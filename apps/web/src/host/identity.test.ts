import { describe, expect, test } from "vitest";
import { translator } from "../i18n/translator";
import { browserDeviceName, browserShortcutModifier, parseBrowser } from "./identity";
import { browserMicrophoneHelp } from "./browser-microphone-help";

const nav = (platform: string, userAgent = "", maxTouchPoints = 0) => ({ platform, userAgent, maxTouchPoints });

describe("os: the system a browser runs on, which only the host's own words are chosen by", () => {
  test("the platform the page runs on, a phone none", () => {
    expect(parseBrowser(nav("MacIntel")).os).toBe("macos");
    expect(parseBrowser(nav("Win32")).os).toBe("windows");
    expect(parseBrowser(nav("Linux x86_64")).os).toBe("linux");
    expect(parseBrowser(nav("Linux armv8l", "Mozilla/5.0 (Linux; Android 14)")).os).toBe("android");
    expect(parseBrowser(nav("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).os).toBe("ios");
    expect(parseBrowser(nav("", "")).os).toBe("other");
  });

  test("an iPad asking for the desktop site says it is a Mac, and has a touch screen: it is not one", () => {
    expect(parseBrowser(nav("MacIntel", "", 5)).os).toBe("ios");
    expect(parseBrowser(nav("MacIntel", "", 1)).os).toBe("macos");
  });

  test("the system's word is read from the platform the browser states, in any case", () => {
    expect(parseBrowser({ userAgent: "", userAgentData: { platform: "macOS" } }).os).toBe("macos");
    expect(parseBrowser({ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)" }).os).toBe("linux");
    expect(parseBrowser({ userAgent: "Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0" }).os).toBe("linux");
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
    expect(parseBrowser(facts)).toMatchObject({ app, system });
  });

  test("a page that says nothing is neither", () => {
    expect(parseBrowser({})).toEqual({ os: "other", system: "", app: "" });
    expect(parseBrowser(undefined)).toMatchObject({ app: expect.any(String) });
  });

  // Names keep their exact, case-sensitive reading: jsdom's lower-case "linux" is not a system a device name states.
  test("the name's words are read case-sensitively", () => {
    expect(parseBrowser({ userAgent: "Mozilla/5.0 (linux) jsdom/26.1.0" })).toMatchObject({ system: "", app: "" });
  });
});

describe("what the browser's host answers from it", () => {
  const MAC = nav("MacIntel");
  const WINDOWS = nav("Win32");
  const LINUX = nav("Linux x86_64");
  const IPHONE = nav("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
  const IPAD_AS_MAC = nav("MacIntel", "", 5);

  test("the shortcut modifier is the Mac's and the iPhone's command key, and control elsewhere", () => {
    expect(browserShortcutModifier(MAC)).toBe("⌘");
    expect(browserShortcutModifier(IPHONE)).toBe("⌘");
    expect(browserShortcutModifier(IPAD_AS_MAC)).toBe("⌘");
    expect(browserShortcutModifier(WINDOWS)).toBe("Ctrl");
    expect(browserShortcutModifier(LINUX)).toBe("Ctrl");
    expect(browserShortcutModifier(nav("", ""))).toBe("Ctrl");
  });

  test("the default name is said in the page's language: the browser and the system, a Browser it cannot tell, or Sidevoice", () => {
    const en = translator("en");
    const es = translator("es");
    const chromeMac = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "MacIntel" };
    expect(browserDeviceName(chromeMac, en)).toBe("Chrome on Mac");
    expect(browserDeviceName(chromeMac, es)).toBe("Chrome en Mac");
    expect(browserDeviceName({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, en)).toBe("Browser on iPhone");
    expect(browserDeviceName({ userAgent: "", userAgentData: { platform: "Windows" } }, en)).toBe("Browser on Windows");
    expect(browserDeviceName({}, en)).toBe("Sidevoice");
  });

  test("the microphone's help is the site's permission, and where the system blocks the browser, the Mac's or Windows' settings", () => {
    const en = translator("en");
    expect(browserMicrophoneHelp("en", MAC).steps).toEqual([en("wizard.mic.denied.site"), en("wizard.mic.denied.siteMac")]);
    expect(browserMicrophoneHelp("en", WINDOWS).steps).toEqual([en("wizard.mic.denied.site"), en("wizard.mic.denied.siteWindows")]);
    for (const other of [LINUX, IPHONE, IPAD_AS_MAC, nav("", "")]) expect(browserMicrophoneHelp("en", other).steps).toEqual([en("wizard.mic.denied.site")]);
    expect(browserMicrophoneHelp("es", MAC).steps[1]).toBe(translator("es")("wizard.mic.denied.siteMac"));
  });

  test("a browser cannot open the system's settings, so its help names no button", () => {
    expect(browserMicrophoneHelp("en", MAC).openSettings).toBeUndefined();
  });
});

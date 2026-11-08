import { describe, expect, test } from "vitest";
import { applyViewport, DEFAULT_VIEWPORT, viewportContent } from "./viewport";

const nav = (platform: string, userAgent = "", maxTouchPoints = 0) => ({ platform, userAgent, maxTouchPoints });
const iphone = nav("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148");
const ipadAsMac = nav("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5);
const android = nav("Linux armv8l", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
const mac = nav("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
const windows = nav("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

const LOCK = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

describe("the viewport per host and system", () => {
  test("the native iOS app cannot zoom at all", () => {
    expect(viewportContent(true, iphone)).toBe(LOCK);
    expect(viewportContent(true, ipadAsMac)).toBe(LOCK);
  });

  test("the native Android app cannot zoom at all", () => {
    expect(viewportContent(true, android)).toBe(LOCK);
  });

  test("Safari on iOS only stops the focus zoom: it still pinches", () => {
    const content = viewportContent(false, iphone);
    expect(content).toContain("maximum-scale=1");
    expect(content).not.toContain("user-scalable");
    expect(content).toContain("viewport-fit=cover");
    expect(viewportContent(false, ipadAsMac)).toBe(content);
  });

  test("Chrome on Android keeps the default: maximum-scale would block its pinch", () => {
    expect(viewportContent(false, android)).toBe(DEFAULT_VIEWPORT);
  });

  test("a desktop browser keeps the default", () => {
    expect(viewportContent(false, mac)).toBe(DEFAULT_VIEWPORT);
    expect(viewportContent(false, windows)).toBe(DEFAULT_VIEWPORT);
    expect(viewportContent(false, nav("", ""))).toBe(DEFAULT_VIEWPORT);
  });

  test("the desktop app keeps the default", () => {
    expect(viewportContent(true, mac)).toBe(DEFAULT_VIEWPORT);
    expect(viewportContent(true, windows)).toBe(DEFAULT_VIEWPORT);
    expect(viewportContent(true, nav("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)"))).toBe(DEFAULT_VIEWPORT);
  });
});

describe("applying it", () => {
  test("patches the page's viewport meta, and leaves a page without one alone", () => {
    document.head.innerHTML = `<meta name="viewport" content="${DEFAULT_VIEWPORT}">`;
    applyViewport(document, true, iphone);
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(LOCK);
    document.head.innerHTML = "";
    expect(() => applyViewport(document, true, iphone)).not.toThrow();
    expect(document.head.children).toHaveLength(0);
  });
});

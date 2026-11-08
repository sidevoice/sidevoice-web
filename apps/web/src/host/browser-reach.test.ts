import { afterEach, describe, expect, test, vi } from "vitest";
import { host, reachOfOrigin } from ".";

afterEach(() => { vi.unstubAllGlobals(); });

describe("the browser's transport", () => {
  test("a page served over https cannot send plain http to a private address; one served over http can", () => {
    expect(reachOfOrigin("https://room.example").plainHttpPrivate).toBe(false);
    expect(reachOfOrigin("http://localhost:5173").plainHttpPrivate).toBe(true);
    expect(reachOfOrigin("tauri://localhost").plainHttpPrivate).toBe(true);
    expect(reachOfOrigin("").plainHttpPrivate).toBe(true);
  });

  test("the host reports the page's own, read where it is asked for", () => {
    vi.stubGlobal("location", { origin: "https://room.example" });
    expect(host().reach.plainHttpPrivate).toBe(false);
    vi.stubGlobal("location", { origin: "http://127.0.0.1:8768" });
    expect(host().reach.plainHttpPrivate).toBe(true);
  });

  test("only reports a fact: a host's transport carries none of the pairing's policy", () => {
    expect(Object.keys(host().reach)).toEqual(["plainHttpPrivate"]);
  });
});

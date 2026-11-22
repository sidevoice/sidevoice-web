import { afterEach, describe, expect, it, vi } from "vitest";
import { browserCallLink } from "./browser-call-link";

describe("the browser's call link", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is the page's own websocket, with the subprotocols asked", () => {
    const made: unknown[][] = [];
    class FakeSocket { readyState = 0; constructor(...args: unknown[]) { made.push(args); } }
    vi.stubGlobal("WebSocket", FakeSocket);
    const link = browserCallLink();
    const socket = link.open("wss://core.example/api/presentation/ws", ["sidevoice", "sidevoice.token.t"]);
    expect(link.runs).toBe("page");
    expect(socket).toBeInstanceOf(FakeSocket);
    expect(made).toEqual([["wss://core.example/api/presentation/ws", ["sidevoice", "sidevoice.token.t"]]]);
  });
});

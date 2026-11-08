import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { App } from "../app/App";
import { createRoomStore } from "../state/room-store";
import { setUiLanguage } from "./translator";
import { messages as en } from "./locales/en";
import { messages as es } from "./locales/es";
import sources from "./legacy-spanish-sources.json";

vi.mock("../services/room-session-controller.js", () => ({}));
afterEach(() => act(() => setUiLanguage("en")));

/* The page used to be written in Spanish and translated on screen (the legacy DOM translator, removed): every text it
 * translated is listed here as it was written, and none of it may reach a page in another language. Nor may any text of
 * the Spanish catalogue that English says otherwise. */
const spanish = new Set<string>([...sources, ...Object.entries(es).filter(([key, text]) => text !== en[key as keyof typeof en]).map(([, text]) => text)]);
const said = () => [
  ...[...document.body.querySelectorAll("*")].flatMap((element) => [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent!.trim())),
  ...[...document.body.querySelectorAll("[aria-label], [title], [placeholder]")]
    .flatMap((element) => ["aria-label", "title", "placeholder"].map((name) => element.getAttribute(name)?.trim() ?? "")),
].filter(Boolean);

/** A call on a machine, a conversation that holds what it is sent, a few replies whose sound went wrong in every way. */
function busyRoom() {
  const store = createRoomStore();
  const thread = "fp-mac|a";
  const reply = (segment: string, extra: object) => ({ segment, thread, role: "assistant", name: "", text: "…", time: 2, session: "s1", ...extra });
  act(() => store.patch({
    ws: {} as WebSocket, sessionId: "s1", callNode: "fp-mac", roomBinding: { thread_id: "a", title: "" } as never, machinesReady: true,
    pairings: [{ fp: "fp-mac", host: "mac" }] as never, machineLinks: { "fp-mac": { reach: "ok", via: "node" } },
    people: [{ node: "fp-mac", thread_id: "a", title: "", available: true, reach: { state: "holding" }, route: "cursor-editor-view",
      capabilities: { experimental: ["deliver", "sessionIdentity"] } }] as never,
    history: [
      { segment: "u1", thread, role: "user", name: "", text: "hi", time: 1, session: "s1", status: "not_sent", audio_reason: "expired" },
      reply("r1", { audio: "text_only", audio_reason: "queue_full" }),
      reply("r2", { audio: "interrupted", audio_reason: "user_skipped" }),
      reply("r3", { audio: "failed", audio_reason: "unconfirmed" }),
      reply("r4", { audio: "waiting_for_turn" }),
    ] as never,
    joinStep: "conversation", screenLock: { state: "off", note: "session.screen.failed" }, micEnabled: false,
  }));
  return store;
}

test("in English, the room and its diagnostics say nothing in Spanish", () => {
  render(<App store={busyRoom()} />);
  document.getElementById("connection-stats")!.setAttribute("open", "");
  const words = said();
  expect(words.length).toBeGreaterThan(20);
  expect(words.filter((text) => spanish.has(text))).toEqual([]);
  expect(screen.getByRole("button", { name: "Leave the call" })).toBeInTheDocument();
});

test("a language chosen while the room is open redraws it, and the page says which it speaks", () => {
  render(<App store={busyRoom()} />);
  act(() => setUiLanguage("de"));
  expect(document.documentElement.lang).toBe("de");
  expect(screen.getByRole("button", { name: "Anruf verlassen" })).toBeInTheDocument();
  act(() => setUiLanguage("es"));
  expect(screen.getByRole("button", { name: "Salir de la llamada" })).toBeInTheDocument();
});

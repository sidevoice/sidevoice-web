import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { OnboardingProvider } from "../onboarding/onboarding-context";
import { createOnboardingRepository } from "../../services/onboarding-state";
import { CRASH_REPORTS_KEY, markCrashReportsNoticeSeen, resetCrashReportsNotice } from "../../services/crash-reports";
import { removeApp } from "../../host/testing";
import { createRoomStore } from "../../state/room-store";
import { CrashReportsNotice } from "./CrashReportsNotice";
import { withApp } from "./crash-reports.test-util";

/* The first-run notice: one line, once, after the setup — also for a device that updates — asking and blocking nothing. */

afterEach(() => { cleanup(); resetCrashReportsNotice(); removeApp(); localStorage.removeItem("sidevoice.settings"); });
const storedSeen = () => (JSON.parse(localStorage.getItem(CRASH_REPORTS_KEY) ?? "{}") as { noticeSeen?: boolean }).noticeSeen === true;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
const memory = () => { const kept = new Map<string, string>(); return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) }; };

/** The room with the notice in it; `setUp` false: a device whose first setup is not finished (an empty record of its own). */
async function show({ setUp = true } = {}) {
  const store = createRoomStore();
  const patch = vi.spyOn(store, "patch");
  const repository = setUp ? undefined : createOnboardingRepository(memory());
  render(<RoomProvider store={store} runtime={false}><OnboardingProvider repository={repository}><CrashReportsNotice /></OnboardingProvider></RoomProvider>);
  await settle();
  return { store, patch };
}
/** The live region, in the page whether or not there is anything to say; and the notice in it. */
const region = () => document.querySelector<HTMLElement>(".crash-reports-notice");
const notice = () => region()?.querySelector<HTMLElement>(".crash-notice") ?? null;

describe("when it shows", () => {
  test("once the setup is done, on a device whose app sends crash reports: its sentence, a link to Settings and a ×", async () => {
    withApp();
    await show();
    expect(notice()).not.toBeNull();
    expect(region()).toHaveAttribute("role", "status");
    expect(notice()).toHaveTextContent("Sidevoice sends crash reports to help us fix errors. You can turn it off in Settings.");
    expect(within(notice()!).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(within(notice()!).getByRole("button", { name: "Close notice" })).toBeInTheDocument();
    // It asks nothing: no choice to make, nothing to confirm, and the room is not held back.
    expect(within(notice()!).queryByRole("radio")).toBeNull();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  test("not while the setup is not done: it comes after it", async () => {
    withApp();
    await show({ setUp: false });
    expect(notice()).toBeNull();
  });

  test("a device that updates from a version without it sees it once: nothing of its own is stored, the setup is done", async () => {
    withApp();
    expect(localStorage.getItem(CRASH_REPORTS_KEY)).toBeNull();
    await show();
    expect(notice()).not.toBeNull();
  });

  test("not in a browser: nothing is sent there, so nothing is said", async () => {
    await show();
    expect(notice()).toBeNull();
  });

  test("not to someone who has already chosen not to send", async () => {
    withApp({}, "never");
    await show();
    expect(notice()).toBeNull();
  });

  test("nor to a page that lost its storage while the app holds Don't send: the mode is the app's, so the notice never says it sends", async () => {
    localStorage.clear();
    withApp({}, "never");
    await show();
    expect(notice()).toBeNull();
  });

  test("not before the app has said which it is: it is not claimed to send, and then it says so", async () => {
    let answer!: (mode: "auto" | "never") => void;
    withApp({ crashReports: { get: () => new Promise((resolve) => { answer = resolve; }), set: async () => undefined } });
    await show();
    expect(notice()).toBeNull();
    await act(async () => { answer("auto"); });
    expect(notice()).not.toBeNull();
  });

  test("goes when the app's own setting turns sending off", async () => {
    const app = withApp();
    await show();
    expect(notice()).not.toBeNull();
    await act(async () => { app.change("never"); });
    expect(notice()).toBeNull();
  });

  test("not again once it was put away", async () => {
    withApp();
    markCrashReportsNoticeSeen();
    await show();
    expect(notice()).toBeNull();
  });
});

describe("being read out", () => {
  test("its region is in the page before its words, and the words go into that same region", async () => {
    let answer!: (mode: "auto" | "never") => void;
    withApp({ crashReports: { get: () => new Promise((resolve) => { answer = resolve; }), set: async () => undefined } });
    await show();
    const before = region()!;
    expect(before).toHaveAttribute("role", "status");
    expect(before).toBeEmptyDOMElement();
    await act(async () => { answer("auto"); });
    expect(region()).toBe(before);
    expect(before).toHaveTextContent("Sidevoice sends crash reports");
  });

  test("in a browser the region is there too, empty: nothing is said", async () => {
    await show();
    expect(region()).toBeEmptyDOMElement();
  });
});

describe("putting it away", () => {
  test("the × closes it for good, and the choice is untouched", async () => {
    withApp();
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Close notice" }));
    expect(notice()).toBeNull();
    expect(storedSeen()).toBe(true);
    cleanup();
    await show();
    expect(notice()).toBeNull();
  });

  test("the link opens Settings at Crash reports and puts the notice away too", async () => {
    withApp();
    const opener = document.createElement("button");
    opener.id = "settings-open";
    const opened = vi.fn();
    opener.addEventListener("click", opened);
    document.body.append(opener);
    onTestFinished(() => opener.remove());
    const { patch } = await show();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ settingsSection: "crash-reports", settingsLevel: "page" }));
    expect(notice()).toBeNull();
    expect(storedSeen()).toBe(true);
  });
});

test("in Spanish, as the design words it, the link in the middle of its sentence", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  withApp();
  await show();
  expect(notice()).toHaveTextContent("Sidevoice envía informes de fallos para ayudarnos a arreglar errores. Puedes desactivarlo en Configuración.");
  expect(within(notice()!).getByRole("button", { name: "Configuración" })).toBeInTheDocument();
  expect(within(notice()!).getByRole("button", { name: "Cerrar aviso" })).toBeInTheDocument();
});

test("in a language that puts the link before the end of its sentence, the words around it are the language's own", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "ja" }));
  withApp();
  await show();
  const text = notice()!.querySelector(".ui-alert-title")!;
  const link = text.querySelector("button")!;
  expect(link.textContent).toBeTruthy();
  expect(text.textContent!.replace(link.textContent!, "")).not.toContain("\u0001");
  // The sentence is whole around the link: something before it or after it, and the link's own word inside.
  expect(text.textContent!.length).toBeGreaterThan(link.textContent!.length);
});

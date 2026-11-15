import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { OnboardingProvider } from "../onboarding/onboarding-context";
import { createOnboardingRepository } from "../../services/onboarding-state";
import { CRASH_REPORTS_KEY, readCrashReports, writeCrashReports } from "../../services/crash-reports";
import { removeApp } from "../../host/testing";
import { createRoomStore } from "../../state/room-store";
import { CrashReportsNotice } from "./CrashReportsNotice";
import { withApp } from "./crash-reports.test-util";

/* The first-run notice: one line, once, after the setup — also for a device that updates — asking and blocking nothing. */

afterEach(() => { cleanup(); removeApp(); localStorage.removeItem(CRASH_REPORTS_KEY); localStorage.removeItem("sidevoice.settings"); });

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
const notice = () => document.querySelector<HTMLElement>(".crash-reports-notice");

describe("when it shows", () => {
  test("once the setup is done, on a device whose app sends crash reports: its sentence, a link to Settings and a ×", async () => {
    withApp();
    await show();
    expect(notice()).not.toBeNull();
    expect(notice()).toHaveAttribute("role", "status");
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
    withApp();
    writeCrashReports({ mode: "never" });
    await show();
    expect(notice()).toBeNull();
  });

  test("not again once it was put away", async () => {
    withApp();
    writeCrashReports({ noticeSeen: true });
    await show();
    expect(notice()).toBeNull();
  });
});

describe("putting it away", () => {
  test("the × closes it for good, and the choice is untouched", async () => {
    withApp();
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Close notice" }));
    expect(notice()).toBeNull();
    expect(readCrashReports()).toEqual({ mode: "auto", noticeSeen: true });
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
    expect(readCrashReports().noticeSeen).toBe(true);
  });
});

test("in Spanish, as the design words it, the link in the middle of its sentence", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  withApp();
  await show();
  expect(notice()).toHaveTextContent("Sidevoice envía informes de fallos para ayudarnos a arreglar errores. Puedes desactivarlo en Ajustes.");
  expect(within(notice()!).getByRole("button", { name: "Ajustes" })).toBeInTheDocument();
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

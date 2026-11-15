import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { removeApp } from "../../host/testing";
import { CRASH_REPORTS_KEY, readCrashReports } from "../../services/crash-reports";
import { installLogSources } from "./log-sources";
import { NUC, THIS, event, roomWith, serving, withApp } from "./crash-reports.test-util";

/* Settings → Crash reports: the one setting, what a report holds, the logs under it. */

afterEach(() => { cleanup(); removeApp(); localStorage.removeItem(CRASH_REPORTS_KEY); localStorage.removeItem("sidevoice.settings"); installLogSources({ open: () => null })(); });

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

function open(section = "crash-reports", members: Record<string, unknown> | null = {}) {
  if (members) withApp(members);
  const store = roomWith([[NUC, "ok"]], { settingsSection: section });
  render(<RoomProvider store={store} runtime={false}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return store;
}
const pane = () => within(document.getElementById("pane-crash-reports")!);
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));
const inSpanish = () => { localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" })); };

describe("where it is", () => {
  test("a section of the app's, between Updates and Advanced, with its own icon", async () => {
    open("general", { build: { channel: "release", version: "0.9.0" } });
    await settle();
    const entry = document.getElementById("settings-crash-reports")!;
    expect(entry).toHaveTextContent(/^Crash reports$/);
    expect(entry.querySelector("svg.lucide-activity")).not.toBeNull();
    expect(navOrder().slice(-3)).toEqual(["updates", "crash-reports", "advanced"]);
  });

  test("a browser sends no crash reports, so it has neither the section nor a page for it", async () => {
    open("general", null);
    await settle();
    expect(document.getElementById("settings-crash-reports")).toBeNull();
    expect(document.getElementById("pane-crash-reports")).toBeNull();
  });

  test("a section left on where the host sends no crash reports goes to General", async () => {
    open("crash-reports", null);
    await settle();
    expect(document.getElementById("settings-general")).toHaveAttribute("aria-current", "page");
  });
});

describe("the setting", () => {
  test("two ways, Send automatically (the default) and Don't send, and one explanation of what the chosen one does", async () => {
    open();
    await settle();
    expect(pane().getByRole("heading", { name: "Crash reports", level: 2 })).toBeInTheDocument();
    expect(pane().getByText("What happens when something fails, and what Sidevoice writes down while it works.")).toBeInTheDocument();
    const choice = pane().getByRole("radiogroup", { name: "When something fails" });
    const [auto, never] = within(choice).getAllByRole("radio");
    expect([auto.textContent, never.textContent]).toEqual(["Send automatically", "Don't send"]);
    expect(auto).toHaveAttribute("aria-checked", "true");
    expect(pane().getByText(/^When Sidevoice fails, we send an anonymous report so we can fix it\./)).toBeInTheDocument();
    expect(pane().queryByText(/^Nothing is sent when something fails\./)).toBeNull();
  });

  test("Don't send is kept, told to the app, and said in the words under it and as Saved", async () => {
    const set = vi.fn(async () => undefined);
    open("crash-reports", { crashReports: { set } });
    await settle();
    fireEvent.click(pane().getByRole("radio", { name: "Don't send" }));
    await settle();
    expect(set).toHaveBeenCalledWith("never");
    expect(readCrashReports().mode).toBe("never");
    expect(pane().getByRole("radio", { name: "Don't send" })).toHaveAttribute("aria-checked", "true");
    expect(pane().getByText(/^Nothing is sent when something fails\. You can turn it back on whenever you want\./)).toBeInTheDocument();
    const saved = pane().getAllByRole("status").find((status) => status.classList.contains("settings-saved"))!;
    expect(saved).toHaveTextContent("Saved");
    expect(saved).toHaveTextContent("No crash report will be sent.");
    fireEvent.click(pane().getByRole("radio", { name: "Send automatically" }));
    await settle();
    expect(set).toHaveBeenLastCalledWith("auto");
    expect(saved).toHaveTextContent("Crash reports will be sent automatically.");
  });

  test("the choice the page already has is no change: nothing is told and nothing is saved", async () => {
    const set = vi.fn(async () => undefined);
    open("crash-reports", { crashReports: { set } });
    await settle();
    set.mockClear();
    fireEvent.click(pane().getByRole("radio", { name: "Send automatically" }));
    await settle();
    expect(set).not.toHaveBeenCalled();
    expect(document.querySelector(".settings-saved")).toHaveTextContent("");
  });

  test("an app that does not take the choice leaves it as it was, and Settings says why", async () => {
    const store = open("crash-reports", { crashReports: { set: vi.fn(async () => { throw new Error("refused"); }) } });
    await settle();
    fireEvent.click(pane().getByRole("radio", { name: "Don't send" }));
    await settle();
    await waitFor(() => expect(pane().getByRole("radio", { name: "Send automatically" })).toHaveAttribute("aria-checked", "true"));
    expect(readCrashReports().mode).toBe("auto");
    expect(store.getState().facts.settingsError).toEqual({ text: "Sidevoice could not apply this change. Try again." });
  });

  test("the arrows move between the two and choose as they go", async () => {
    const set = vi.fn(async () => undefined);
    open("crash-reports", { crashReports: { set } });
    await settle();
    fireEvent.keyDown(pane().getByRole("radio", { name: "Send automatically" }), { key: "ArrowRight" });
    await settle();
    expect(set).toHaveBeenCalledWith("never");
  });
});

describe("what is sent, and the logs", () => {
  test("See what is sent opens its panel under the row and closes again, as the agents' disclosure does", async () => {
    open();
    await settle();
    const toggle = pane().getByRole("button", { name: "See what is sent" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.className).toContain("ui-disclosure");
    expect(pane().queryByText("Failure trace")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel).toHaveClass("crash-row-panel");
    // The row it opens under holds the setting too: the panel is a child of the row, across its whole width.
    expect(panel.parentElement).toContainElement(pane().getByRole("radiogroup"));
    const fields = [...panel.querySelectorAll("dt")].map((term) => term.textContent);
    expect(fields).toEqual(["Version", "Operating system", "Error code", "Failure trace", "Last 50 lines of the log"]);
    expect(within(panel).getByText(/^This is an example/)).toBeInTheDocument();
    expect(within(panel).getByText("Never sent:")).toBeInTheDocument();
    expect(panel).toHaveTextContent("the content of your conversations, tokens or keys, pairing codes or the names of your devices");
    fireEvent.click(toggle);
    expect(pane().queryByText("Failure trace")).toBeNull();
  });

  test("the logs row has its advice for when something does not work, and See logs, the same disclosure with no line above it", async () => {
    serving([event("1", "app", "14:32:07.412  INFO audio: Microphone opened and listening")]);
    open();
    await settle();
    expect(pane().getByText("Logs")).toBeInTheDocument();
    expect(pane().getByText(/^What Sidevoice writes down while it works, on this device and on each machine\./)).toBeInTheDocument();
    expect(pane().getByText("Something not working? Ask your agent: it can check Sidevoice's state. If it needs this app's logs, copy and paste them to it.")).toBeInTheDocument();
    expect(pane().queryByRole("tablist")).toBeNull();
    fireEvent.click(pane().getByRole("button", { name: "See logs" }));
    await settle();
    expect(pane().getByRole("tablist", { name: "Devices" })).toBeInTheDocument();
    expect(document.querySelectorAll("#pane-crash-reports .logs-line")).toHaveLength(1);
    // Both rows are one card; neither disclosure's panel brings a rule of its own.
    expect(document.querySelectorAll("#pane-crash-reports .ui-group-card > .ui-row")).toHaveLength(2);
  });

  test("the logs are read only once they are asked for, and let go when they are closed", async () => {
    const served = serving([event("1", "app", "14:32:07.412  INFO audio: Microphone opened and listening")]);
    open();
    await settle();
    expect(served.reads).toHaveLength(0);
    fireEvent.click(pane().getByRole("button", { name: "See logs" }));
    await settle();
    expect(served.reads).toHaveLength(1);
    expect(served.followers.size).toBe(1);
    fireEvent.click(pane().getByRole("button", { name: "See logs" }));
    await settle();
    expect(served.followers.size).toBe(0);
  });
});

describe("in Spanish, as the design has it", () => {
  test("the section, the setting, its words, the report and the logs' advice", async () => {
    inSpanish();
    onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
    open();
    await settle();
    expect(document.getElementById("settings-crash-reports")).toHaveTextContent("Informes de fallos");
    expect(pane().getByText("Qué se hace cuando algo falla, y lo que Sidevoice anota mientras funciona.")).toBeInTheDocument();
    const choice = pane().getByRole("radiogroup", { name: "Cuando algo falla" });
    expect(within(choice).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Enviar automáticamente", "No enviar"]);
    expect(pane().getByText("Cuando Sidevoice falla, enviamos un informe anónimo para poder arreglarlo. No incluye lo que hablas con tu agente. Puedes dejar de enviarlos.")).toBeInTheDocument();
    fireEvent.click(pane().getByRole("button", { name: "Ver qué se envía" }));
    expect([...document.querySelectorAll("#pane-crash-reports dt")].map((term) => term.textContent)).toEqual(
      ["Versión", "Sistema operativo", "Código de error", "Traza del fallo", "Últimas 50 líneas del registro"]);
    expect(pane().getByText("Registros")).toBeInTheDocument();
    expect(pane().getByText("¿Algo no va? Pregúntale a tu agente: puede revisar el estado de Sidevoice. Si necesita los registros de esta app, cópialos y pégaselos.")).toBeInTheDocument();
    expect(pane().getByRole("button", { name: "Ver registros" })).toBeInTheDocument();
  });
});

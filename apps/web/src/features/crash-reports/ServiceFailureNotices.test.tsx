import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { ServiceFailureNotices, failureDetails } from "./ServiceFailureNotices";
import { MAX_FAILURE_STRIPS, dismissServiceFailure, groupFailures, reportServiceFailure, resetServiceFailures, type ServiceFailure } from "./service-failures";
import { NUC, renderInRoom, roomWith } from "./crash-reports.test-util";
import { translator } from "../../i18n/translator";

/* A connector or a core that failed and restarted, told as the app tells any failure: the danger strip, Details, a ×. */

afterEach(() => { cleanup(); act(() => resetServiceFailures()); localStorage.removeItem("sidevoice.settings"); });

const AT = new Date(2026, 10, 14, 14, 32, 4).getTime();
const connectorHere: ServiceFailure = { id: "f-1", piece: "connector", machine: null, code: "connector.process_exited", at: AT, version: "0.21.0", exit: { code: 101 } };
const coreOnNuc: ServiceFailure = { id: "f-2", piece: "core", machine: NUC.fp, code: "core.panic", at: AT + 47_000, version: "0.9.3" };
const notices = () => [...document.querySelectorAll<HTMLElement>(".service-failure-notices .ui-alert")];

const again = (n: number, base: ServiceFailure = connectorHere): ServiceFailure => ({ ...base, id: `${base.id}-again-${n}`, at: base.at + n * 60_000 });

describe("a service that keeps failing", () => {
  test("is one strip with how many times, not a wall of them: the newest one's details, and one × for all", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure(again(1)); reportServiceFailure(again(2)); });
    expect(notices()).toHaveLength(1);
    expect(notices()[0].querySelector(".ui-alert-title")).toHaveTextContent("The connector on this device failed and restarted ×3");
    expect(notices()[0].querySelector("pre")!.textContent).toContain(`Time: ${new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(again(2).at)}`);
    fireEvent.click(within(notices()[0]).getByRole("button", { name: "Close notice" }));
    expect(document.querySelector(".service-failure-notices")).toBeNull();
  });

  test("a failure alone has no count, and the strip does not start again as the count grows", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); });
    expect(notices()[0].querySelector(".crash-count")).toBeNull();
    const strip = notices()[0];
    act(() => { reportServiceFailure(again(1)); });
    expect(notices()[0]).toBe(strip);
    expect(strip.querySelector(".crash-count")).toHaveTextContent("×2");
  });

  test("only the same piece, on the same place, with the same code is the same strip", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => {
      reportServiceFailure(connectorHere);
      reportServiceFailure(again(1, { ...connectorHere, machine: NUC.fp }));
      reportServiceFailure(again(2, { ...connectorHere, code: "connector.panic" }));
      reportServiceFailure(again(3, { ...coreOnNuc }));
    });
    expect(groupFailures([connectorHere, again(1, { ...connectorHere, machine: NUC.fp }), again(2, { ...connectorHere, code: "connector.panic" }), again(3, { ...coreOnNuc })])).toHaveLength(4);
    expect(notices().length).toBe(MAX_FAILURE_STRIPS);
  });

  test("no more than three strips are in sight: the others come up as these are put away", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    const codes = ["a", "b", "c", "d", "e"].map((code, i) => ({ ...connectorHere, id: `f-${code}`, code: `connector.${code}`, at: AT + i }));
    act(() => { for (const failure of codes) reportServiceFailure(failure); });
    expect(MAX_FAILURE_STRIPS).toBe(3);
    expect(notices()).toHaveLength(3);
    // Newest first: e, d, c.
    expect(notices().map((notice) => notice.querySelector("pre")!.textContent!.split("\n")[0])).toEqual([
      "Error code: connector.e", "Error code: connector.d", "Error code: connector.c"]);
    fireEvent.click(within(notices()[0]).getByRole("button", { name: "Close notice" }));
    expect(notices().map((notice) => notice.querySelector("pre")!.textContent!.split("\n")[0])).toEqual([
      "Error code: connector.d", "Error code: connector.c", "Error code: connector.b"]);
  });

  test("in Spanish the count is the same sign and number", () => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure(again(1)); });
    expect(notices()[0].querySelector(".ui-alert-title")).toHaveTextContent("El conector de este dispositivo falló y se reinició ×2");
  });
});

describe("the notice", () => {
  test("is the app's failure strip: danger, live, its sentence naming the piece and where it ran", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    expect(notices()).toHaveLength(0);
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure(coreOnNuc); });
    const [newest, first] = notices();
    expect(first).toHaveAttribute("data-tone", "danger");
    expect(first).toHaveAttribute("role", "alert");
    expect(first.querySelector(".ui-alert-title")).toHaveTextContent("The connector on this device failed and restarted");
    expect(newest.querySelector(".ui-alert-title")).toHaveTextContent("The core on “NUC” failed and restarted");
  });

  test("keeps its facts behind Details: the code, the time, the version and how it ended — raw, untranslated", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); });
    const details = notices()[0].querySelector("details")!;
    expect(details.querySelector("summary")).toHaveTextContent("Details");
    expect(details.open).toBe(false);
    const text = details.querySelector("pre")!;
    expect(text).toHaveAttribute("translate", "no");
    expect(text.textContent!.split("\n")).toEqual([
      "Error code: connector.process_exited",
      `Time: ${new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(AT)}`,
      "Version: Connector 0.21.0",
      "Process exit: code 101",
    ]);
  });

  test("a failure whose process ended no way that is known has no such line", () => {
    expect(failureDetails(coreOnNuc, translator()).split("\n")).toHaveLength(3);
    expect(failureDetails(coreOnNuc, translator())).toContain("Version: Core 0.9.3");
  });

  test("the × puts one away, and only that one", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure(coreOnNuc); });
    fireEvent.click(within(notices()[0]).getByRole("button", { name: "Close notice" }));
    expect(notices()).toHaveLength(1);
    expect(notices()[0].querySelector(".ui-alert-title")).toHaveTextContent("The connector on this device");
    act(() => dismissServiceFailure("f-1"));
    expect(document.querySelector(".service-failure-notices")).toBeNull();
  });

  test("a failure told twice is shown once", () => {
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure({ ...connectorHere }); });
    expect(notices()).toHaveLength(1);
  });

  test("a machine forgotten since has nothing left to name it by: its notice goes", () => {
    const store = roomWith([[NUC, "ok"]]);
    renderInRoom(<ServiceFailureNotices />, store);
    act(() => { reportServiceFailure(coreOnNuc); reportServiceFailure(connectorHere); });
    expect(notices()).toHaveLength(2);
    act(() => { store.patch({ pairings: [], machineLinks: {} } as never); });
    expect(notices()).toHaveLength(1);
    expect(notices()[0].querySelector(".ui-alert-title")).toHaveTextContent("this device");
  });

  test("in Spanish, as the design words it", () => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
    renderInRoom(<ServiceFailureNotices />, roomWith([[NUC, "ok"]]));
    act(() => { reportServiceFailure(connectorHere); reportServiceFailure(coreOnNuc); });
    const [newest, first] = notices();
    expect(first.querySelector(".ui-alert-title")).toHaveTextContent("El conector de este dispositivo falló y se reinició");
    expect(newest.querySelector(".ui-alert-title")).toHaveTextContent("El núcleo de «NUC» falló y se reinició");
    expect(first.querySelector("summary")).toHaveTextContent("Detalles");
    expect(first.querySelector("pre")!.textContent!.split("\n").filter((line, i) => i !== 1)).toEqual([
      "Código de error: connector.process_exited", "Versión: Conector 0.21.0", "Salida del proceso: código 101"]);
    expect(within(first).getByRole("button", { name: "Cerrar aviso" })).toBeInTheDocument();
  });
});

import { useEffect, useState } from "react";
import { host, type AppBuild } from "../../host";
import { translator, type Translate } from "../../i18n/translator";

/* "See what is sent": the fields a crash report holds, in the order it holds them, as one report reads. The values are an
 * example: this page cannot know the system the app runs on (the host answers no `os`) nor a failure that has not happened, so
 * what it shows is a report's shape with plausible content, and says so in its first line. The version is the one thing it does
 * know: the app's own build, as the host says it (`host().identity.build`); an app that says none shows the product's name alone,
 * never a number made up. The report itself is the app's. */

const EXAMPLE_TRACE = [
  "called `Option::unwrap()` on a `None` value",
  " 0: sidevoice_core::audio::input::Capture::open",
  "      at shared/core/src/audio/input.rs:212",
  " 1: sidevoice_core::voice::host::start",
  "      at shared/core/src/voice/host.rs:345",
  " 2: sidevoice_desktop::run::{{closure}}",
  "      at desktop/tauri/src/lib.rs:226",
].join("\n");

/* The app's own report (docs/logging.md §9-§10, the closed field list): the install id is the app's own when it offers
 * `crashReports.installId()` (null: none is kept, as under "never"), else a placeholder (an app before that method); the error is
 * its type and code location; the message is the literal panic text or the fixed marker with its length (formatted text is never
 * sent); the modules are the loaded images, by file name; the log lines are the last WARN/ERROR ones, times relative to the crash
 * and ids re-keyed. */
const EXAMPLE_INSTALL_ID = "3f9a1c7e5b2d4086a1e9c0d7b4f25a68";
const EXAMPLE_MODULES = "sidevoice-desktop, libsystem_c.dylib, libc++.1.dylib";
const EXAMPLE_ERROR = "panic · desktop/tauri/src/lib.rs:226";
const EXAMPLE_MESSAGE = "<formatted panic message omitted> (len 38)";
const EXAMPLE_LOGS = [
  "-12.4s WARN  audio input restarted · device=d1",
  "-0.3s  ERROR core connection dropped · core=c1",
].join("\n");

/** Code, as it is written: not translated, not wrapped. */
function Block({ text }: { text: string }) {
  return <pre translate="no">{text}</pre>;
}

/** The build as a report names it: "Sidevoice 0.33.1", and a nightly or a development build says so, with its day. */
export function versionOf(build: AppBuild | null): string {
  if (!build?.version) return "Sidevoice";
  const day = /^\d{4}-\d{2}-\d{2}/.exec(build.date ?? "")?.[0];
  const kind = build.channel === "nightly" || build.channel === "dev" ? [build.channel, day].filter(Boolean).join(" ") : "";
  return `Sidevoice ${build.version}${kind ? ` (${kind})` : ""}`;
}

/** The install id the app holds: a string, null (none: under "never" it is not created, and a created one is forgotten), "pending"
 *  while the app answers, or "unknown" where the app cannot say (no method, or one that fails). Read again when `mode` changes. */
function useInstallId(mode: string | null): string | null | "pending" | "unknown" {
  const [id, setId] = useState<string | null | "pending" | "unknown">("pending");
  useEffect(() => {
    const bridge = host().crashReports;
    if (typeof bridge?.installId !== "function") { setId("unknown"); return; }
    let live = true;
    bridge.installId().then(
      (answer) => { if (live) setId(typeof answer?.installId === "string" && answer.installId ? answer.installId : null); },
      () => { if (live) setId("unknown"); });
    return () => { live = false; };
  }, [mode]);
  return id;
}

export function ReportPreview({ t = translator(), mode = null }: { t?: Translate; mode?: string | null }) {
  const installId = useInstallId(mode);
  return (
    <div className="crash-report">
      <p className="crash-report-example">{t("crashReports.report.example")}</p>
      <dl className="crash-report-rows">
        <dt>{t("crashReports.report.version")}</dt><dd translate="no">{versionOf(host().identity.build)}</dd>
        <dt>{t("crashReports.report.system")}</dt><dd>macOS 15.1 · arm64</dd>
        <dt>{t("crashReports.report.code")}</dt><dd translate="no">{EXAMPLE_ERROR}</dd>
        <dt>{t("crashReports.report.message")}</dt><dd translate="no">{EXAMPLE_MESSAGE}</dd>
        <dt>{t("crashReports.report.installId")}</dt><dd>{installId === "pending" ? null
          : installId === null ? <span className="crash-report-example">{t("crashReports.report.installIdNone")}</span>
          : installId === "unknown" ? <><span translate="no">{EXAMPLE_INSTALL_ID}</span> <span className="crash-report-example">{t("crashReports.report.installIdNote")}</span></>
          : <span translate="no" className="crash-report-id">{installId}</span>}</dd>
        <dt>{t("crashReports.report.trace")}</dt><dd><Block text={EXAMPLE_TRACE} /></dd>
        <dt>{t("crashReports.report.modules")}</dt><dd translate="no">{EXAMPLE_MODULES}</dd>
        <dt>{t("crashReports.report.logs")}</dt><dd><Block text={EXAMPLE_LOGS} /><span className="crash-report-example">{t("crashReports.report.logsNote")}</span></dd>
      </dl>
      <p className="crash-report-scope">{t("crashReports.report.scope")}</p>
      <p className="crash-report-never"><b>{t("crashReports.report.neverLead")}</b> {t("crashReports.report.neverBody")}</p>
    </div>
  );
}

import { translator, type Translate } from "../../i18n/translator";

/* "See what is sent": the fields a crash report holds, in the order it holds them, as one report reads. The values are an
 * example: this page cannot know the system the app runs on (the host answers no `os`) nor a failure that has not happened, so
 * what it shows is a report's shape with plausible content, and says so in its first line. The report itself is the app's. */

const EXAMPLE_TRACE = [
  "called `Option::unwrap()` on a `None` value",
  " 0: sidevoice_core::audio::input::Capture::open",
  "      at shared/core/src/audio/input.rs:212",
  " 1: sidevoice_core::voice::host::start",
  "      at shared/core/src/voice/host.rs:345",
  " 2: sidevoice_desktop::run::{{closure}}",
  "      at desktop/tauri/src/lib.rs:226",
].join("\n");

const EXAMPLE_LOG = [
  "14:32:07.412  INFO audio: stream opened stream=microphone sample_rate=48000",
  "14:32:09.031  WARN call{call=c-7f3a}: core link lost attempt=2",
  "14:32:09.538  INFO call{call=c-7f3a}: core link up duration_ms=507",
  "14:32:11.204 ERROR call{call=c-7f3a}: capture failed error.type=desktop.audio-capture-stalled",
  "14:32:11.205 ERROR panic: panic code.filepath=shared/core/src/audio/input.rs code.lineno=212",
].join("\n");

/** Code, as it is written: not translated, not wrapped. `more` is the line that says how much was left out. */
function Block({ text, more }: { text: string; more?: string }) {
  return <pre translate="no">{more ? text + "\n" + more : text}</pre>;
}

export function ReportPreview({ t = translator() }: { t?: Translate }) {
  return (
    <div className="crash-report">
      <p className="crash-report-example">{t("crashReports.report.example")}</p>
      <dl className="crash-report-rows">
        <dt>{t("crashReports.report.version")}</dt><dd>Sidevoice 0.21.0 (nightly 2026-11-14)</dd>
        <dt>{t("crashReports.report.system")}</dt><dd>macOS 15.1 · arm64</dd>
        <dt>{t("crashReports.report.code")}</dt><dd translate="no">desktop.panic</dd>
        <dt>{t("crashReports.report.trace")}</dt><dd><Block text={EXAMPLE_TRACE} /></dd>
        <dt>{t("crashReports.report.logs")}</dt><dd><Block text={EXAMPLE_LOG} more={t("crashReports.report.moreLines")} /></dd>
      </dl>
      <p className="crash-report-never"><b>{t("crashReports.report.neverLead")}</b> {t("crashReports.report.neverBody")}</p>
    </div>
  );
}

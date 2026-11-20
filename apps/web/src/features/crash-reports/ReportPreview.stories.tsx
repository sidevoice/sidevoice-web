import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ReportPreview } from "./ReportPreview";
import { AppHost, desktopApp } from "../../journeys/catalogue-kit";
import { translator } from "../../i18n/translator";
import "./crash-reports.css";

/* "See what is sent" (Settings › Crash reports): the fields a crash report holds, in the order it holds them, as a key-value
 * list with the stack trace as code, and a closing note on what is never sent. The values are an example (the page cannot
 * know the system or a failure that has not happened), and the first line says so. The two things it does read are the app's
 * build (`host().identity.build`: the version, and "nightly 2026-11-19" on a nightly) and the app's install id
 * (`host().crashReports.installId()`). The page has one host, so each state of those is its own story, with an app stood in
 * for the page as the journeys' storyboard does. */

/** The catalogue's desktop app, with what this state of the preview changes about it. */
function App({ build, installId, children }: { build?: Record<string, unknown>; installId?: (() => Promise<{ installId: string | null }>) | null; children: ReactNode }) {
  return <AppHost members={desktopApp({ build, installId })}>{children}</AppHost>;
}

const meta = {
  title: "Product/Crash reports/ReportPreview",
  component: ReportPreview,
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  args: { mode: "auto" },
  argTypes: { mode: { control: "inline-radio", options: ["auto", "never"] } },
  parameters: { docs: { source: { type: "code" } } },
} satisfies Meta<typeof ReportPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A release build that keeps an install id: the id is shown as the app holds it. */
export const Default: Story = {
  render: (args) => <App><ReportPreview {...args} t={translator()} /></App>,
};

/** Under "Don't send" the app creates no id (and forgets the one it had): the row says so instead of showing one. */
export const NoInstallId: Story = {
  args: { mode: "never" },
  render: (args) => <App installId={async () => ({ installId: null })}><ReportPreview {...args} t={translator()} /></App>,
};

/** An app from before `installId()`: an example id, and a note that it is a random number replaced every year. */
export const AppWithoutInstallId: Story = {
  render: (args) => <App installId={null}><ReportPreview {...args} t={translator()} /></App>,
};

/** A nightly says so in the version, with its day; a build that names no version shows the product's name alone. */
export const NightlyBuild: Story = {
  render: (args) => <App build={{ channel: "nightly", version: "0.35.0", date: "2026-11-19T04:00:00Z" }}><ReportPreview {...args} t={translator()} /></App>,
};

/* Pending in web#630 ("the preview shows what is really sent", open, not merged): the report's rows change to the real ones —
 * "Error type and location" (`panic · file:line`) and a new "Message" row (the literal text, or a marker with its length), modules
 * by file name, an example of the last 20 WARN/ERROR lines with times relative to the crash, and a paragraph on who sends what.
 * The component on main is the one above; this specimen is drawn by hand from the PR's diff with the same classes, to look at the
 * result before it lands. Delete it when #630 merges: the real ReportPreview is then this. */
function AfterWeb630() {
  const t = translator();
  const trace = ["called `Option::unwrap()` on a `None` value", " 0: sidevoice_core::audio::input::Capture::open", "      at shared/core/src/audio/input.rs:212",
    " 1: sidevoice_core::voice::host::start", "      at shared/core/src/voice/host.rs:345", " 2: sidevoice_desktop::run::{{closure}}", "      at desktop/tauri/src/lib.rs:226"].join("\n");
  const logs = ["-12.400s WARN audio_input: input restarted device=d1", "-0.300s ERROR core_link: connection dropped client=c1"].join("\n");
  return (
    <div className="crash-report">
      <p className="crash-report-example">{t("crashReports.report.example")}</p>
      <dl className="crash-report-rows">
        <dt>{t("crashReports.report.version")}</dt><dd translate="no">Sidevoice 0.34.1</dd>
        <dt>{t("crashReports.report.system")}</dt><dd>macOS · arm64</dd>
        <dt>Error type and location</dt><dd translate="no">panic · desktop/tauri/src/lib.rs:226</dd>
        <dt>Message</dt><dd translate="no">{"<formatted panic message omitted> (len 38)"}</dd>
        <dt>{t("crashReports.report.installId")}</dt><dd><span translate="no" className="crash-report-id">9c1e4b27f08a4d63b5e2a7d19c3f6e80</span></dd>
        <dt>{t("crashReports.report.trace")}</dt><dd><pre translate="no">{trace}</pre></dd>
        <dt>Modules in the trace (file names)</dt><dd translate="no">sidevoice-desktop, libsystem_c.dylib, libc++.1.dylib</dd>
        <dt>{t("crashReports.report.logs")}</dt><dd><pre translate="no">{logs}</pre><span className="crash-report-example">The last warnings and errors (up to 20), with times relative to the crash and identifiers swapped for generic ones (d1, c1…).</span></dd>
      </dl>
      <p className="crash-report-never">Each part of Sidevoice sends its own reports; none passes on another’s. This same setting also sends the known errors Sidevoice catches, at most one a day of each kind: only the type, the place in the code, the version, the system and the installation ID.</p>
      <p className="crash-report-never"><b>{t("crashReports.report.neverLead")}</b> the content of your conversations, tokens or keys, pairing codes or the names of your devices. Nor a failure message that includes data: only fixed text from the code, or a marker in its place. Paths in your home folder show as ~.</p>
    </div>
  );
}
export const PendingWeb630: Story = { name: "Pending: web#630 (open PR)", render: () => <AfterWeb630 /> };

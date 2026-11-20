import type { Meta, StoryObj } from "@storybook/react-vite";
import { CrashReportsSettings } from "./CrashReportsSettings";
import { AppHost, LogSourcesHost, LogsRoom, desktopApp, drawn } from "../../journeys/catalogue-kit";
import { translator } from "../../i18n/translator";
import "../settings/settings.css";
import "../conversation/transcript.css";
import "./crash-reports.css";

/* Settings › Crash reports, whole: one card of two rows, each with a disclosure under its words (the agents' "I'll do it myself"
 * button, its panel under the row with no rule above it). The first row is the one setting (Send automatically, the default, or
 * Don't send; saved says so) with "See what is sent" opening the report's preview; the second is the logs with the line of
 * advice for when something does not work and "See logs" opening the viewer in this very panel. It exists only where the app sends
 * crash reports (a browser sends none and shows no such section). The app is the catalogue's desktop app, holding the choice as an
 * app does: change it in the story and it stays. The panels' own pages: ReportPreview, LogsViewer. */

function Settings({ mode = "auto" }: { mode?: "auto" | "never" }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <AppHost members={desktopApp({ mode })}><LogsRoom><LogSourcesHost options={{}}><CrashReportsSettings t={translator()} /></LogSourcesHost></LogsRoom></AppHost>
    </div>
  );
}

/** Presses the row's disclosure (0: See what is sent, 1: See logs) in every copy of the section the page draws (light and dark). */
const open = (row: 0 | 1) => async () => {
  await drawn(250);
  document.querySelectorAll(".ui-section").forEach((section) => section.querySelectorAll<HTMLElement>(".crash-disclosure")[row]?.click());
  await drawn(500);
};

const meta = {
  title: "Product/Crash reports/CrashReportsSettings",
  tags: ["!autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Send automatically, both rows closed. */
export const Default: Story = { render: () => <Settings /> };

/** "See what is sent" opened: the report's preview under the first row. */
export const ReportOpen: Story = {
  render: () => <Settings />,
  play: open(0),
};

/** "See logs" opened: the viewer under the second row, the whole width of the card. */
export const LogsOpen: Story = {
  render: () => <Settings />,
  play: open(1),
};

/** Don't send chosen: its words say nothing is sent, and the preview stays one press away. */
export const DontSend: Story = { render: () => <Settings mode="never" /> };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogsViewer } from "./LogsViewer";
import { AppHost, desktopApp, LogSourcesHost, LogsRoom, drawn, typeInto } from "../../journeys/catalogue-kit";
import type { FixtureOptions } from "../../journeys/log-fixtures";
import "../conversation/transcript.css";
import "./crash-reports.css";

/* The logs, as Settings › Crash reports opens them under "See logs": one tab per place (this device, then each paired machine,
 * each with the machine's connected mark), the search and Filters with what is on as chips that come off, the lines as the file
 * has them in a tall box that follows the end, and under it how many, how many to ask for, Copy and Open folder. Every part has
 * its own page under Crash reports (LogControls, LogView); this is the whole of it, over the sample logs the journeys' storyboard
 * uses (seeded: the same lines on every visit; nothing here is real) and a room with this device, the NUC (answering) and an old
 * laptop (not). Pending: web#629 (open) installs the real sources, the app's own log and each machine's core; it changes no
 * component, so every state here is already what it will draw. */

function Viewer({ logs = {} }: { logs?: FixtureOptions | "none" }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <AppHost members={desktopApp()}><LogsRoom><LogSourcesHost options={logs}><LogsViewer /></LogSourcesHost></LogsRoom></AppHost>
    </div>
  );
}

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
/** The lines (or what says there are none) drawn: the places are read after a beat. */
async function ready() {
  for (let tries = 0; tries < 60 && !document.querySelector(".logview, .logs-status-box, .logs-offline"); tries++) await drawn(50);
  await drawn(250);
}
const openFilters = async () => { all(".logs-row > button").forEach((button) => button.click()); await drawn(); };

const meta = {
  title: "Product/Crash reports/LogsViewer",
  tags: ["!autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** This device's tab, the latest 200 lines of its three pieces merged by time: a panic with its backtrace in full, WARN and ERROR tinted. */
export const Default: Story = { render: () => <Viewer /> };

/** Filters open with Warnings and errors and the Connector chosen: the level as cards with counts, the pieces as chips with counts,
 *  and under the search what is on, as chips that come off. (The popover draws over the page, in the page's theme: pick Light or Dark in the toolbar.) */
export const FiltersOpen: Story = {
  render: () => <Viewer />,
  play: async () => {
    await ready();
    await openFilters();
    all(".logs-pop [role=radio][data-level=warn]").forEach((card) => card.click());
    await drawn();
    all(".logs-pop .logs-chip").filter((chip) => chip.textContent?.startsWith("Connector")).forEach((chip) => chip.click());
  },
};

/** A search that matches: the hits marked in the lines. */
export const SearchHits: Story = {
  render: () => <Viewer />,
  play: async () => {
    await ready();
    all("[role=searchbox]").forEach((field) => typeInto(field as HTMLInputElement, "room"));
    await drawn(400);
  },
};

/** A search nothing matches: the log says so, and Clear filters brings the lines back. */
export const SearchWithoutMatch: Story = {
  render: () => <Viewer />,
  play: async () => {
    await ready();
    all("[role=searchbox]").forEach((field) => typeInto(field as HTMLInputElement, "no such text"));
    await drawn(400);
  },
};

/** A machine that is not connected: its tab says so, and its logs appear when it reconnects (the app keeps none of them). */
export const MachineAway: Story = {
  render: () => <Viewer />,
  play: async () => {
    await ready();
    all("[role=tab]").filter((tab) => tab.textContent?.includes("Old laptop")).forEach((tab) => tab.click());
    await drawn();
  },
};

/** The log scrolled up from its end while new lines keep arriving: it keeps its place, and the chat's way back to the latest floats over it with a dot. */
export const ScrolledUpWithNewLines: Story = {
  render: () => <Viewer logs={{ liveEveryMs: 300 }} />,
  play: async () => {
    await ready();
    all(".logview").forEach((log) => { log.scrollTop = 0; log.dispatchEvent(new Event("scroll")); });
    await drawn(1200);
  },
};

/** A place being read: the box keeps its size and says so, so nothing moves when the lines arrive. */
export const Loading: Story = { render: () => <Viewer logs={{ delayMs: 2 ** 31 - 1 }} /> };

/** Where no log can be read from (a browser's own device tab): the tab says so. */
export const NothingToReadFromHere: Story = { render: () => <Viewer logs="none" /> };

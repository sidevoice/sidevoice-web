import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { CrashReportsNotice } from "./CrashReportsNotice";
import { ServiceFailureNotices } from "./ServiceFailureNotices";
import { reportServiceFailure, resetServiceFailures, type ServiceFailure } from "./service-failures";
import { AppHost, LogsRoom, desktopApp, drawn } from "../../journeys/catalogue-kit";
import { OnboardingProvider } from "../onboarding/onboarding-context";
import { createOnboardingRepository, emptyOnboardingRecord } from "../../services/onboarding-state";
import { resetCrashReportsNotice } from "../../services/crash-reports";
import "./crash-reports.css";

/* What the room says about crash reports and failures, as the app's ordinary strips under the header (the room's banners: an
 * Alert stretched into a bar with only its bottom edge, polite or live). They are the Alert primitive with a close × as its
 * action and, for a service that failed, its raw facts behind Details.
 *
 * - CrashReportsNotice: said once, after the first setup is done (and once on a device that updates): crash reports are sent, a
 *   link to the setting, and a ×. It asks nothing and the room behind works. Put away, it never comes back; the catalogue forgets
 *   that between stories, so each one shows it.
 * - ServiceFailureNotices: a connector or core that failed and restarted, on this device or on a machine by the name the person
 *   gave it, in the danger tone and live. A service that keeps failing is one strip with its count; at most three strips show. */

/** The first setup done on this release, kept in memory. */
const DONE = { ...emptyOnboardingRecord(), basics_done: true, choice: "remote" as const, agents_done: true, turn_done: true, completed_at: 1, baseline_release: 2 };

function Room({ children }: { children: ReactNode }) {
  const [repository] = useState(() => {
    const memory = new Map<string, string>([["sidevoice.onboarding", JSON.stringify(DONE)]]);
    return createOnboardingRepository({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value) });
  });
  return <AppHost members={desktopApp()}><LogsRoom><OnboardingProvider repository={repository}>{children}</OnboardingProvider></LogsRoom></AppHost>;
}

const at = (hour: number, minute: number, second: number) => new Date(2026, 10, 14, hour, minute, second).getTime();
const FAILURES: ServiceFailure[] = [
  { id: "f-1", piece: "connector", machine: null, code: "connector.process_exited", at: at(14, 32, 4), version: "0.21.0", exit: { code: 101 } },
  { id: "f-2", piece: "core", machine: "fp-nuc", code: "core.panic", at: at(14, 32, 51), version: "0.9.3", exit: { code: 101 } },
  // The connector failed twice more: the same piece, place and code, so one strip with its count.
  { id: "f-3", piece: "connector", machine: null, code: "connector.process_exited", at: at(14, 33, 40), version: "0.21.0", exit: { code: 101 } },
  { id: "f-4", piece: "connector", machine: null, code: "connector.process_exited", at: at(14, 35, 12), version: "0.21.0", exit: { code: 101 } },
];

/** The failures of the page, known to the catalogue for as long as the story shows them (they are module state, as in the app). */
function Failures({ children }: { children: ReactNode }) {
  useState(() => { resetServiceFailures(); FAILURES.forEach(reportServiceFailure); });
  useEffect(() => () => resetServiceFailures(), []);
  return <>{children}</>;
}

function FirstRun() {
  // The flag that it was put away is the page's own, in this browser's storage: forgotten here, so the story shows it.
  useState(() => resetCrashReportsNotice());
  useEffect(() => () => resetCrashReportsNotice(), []);
  return <Room><CrashReportsNotice /></Room>;
}

const meta = {
  title: "Product/Crash reports/Notices",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The one-line notice: a polite region that is in the page from the first paint, and the words go into it a beat later. */
export const FirstRunNotice: Story = { name: "First-run notice", render: () => <FirstRun /> };

/** A connector that failed three times (one strip with ×3), and a core that failed on the NUC. Details closed. */
export const ServiceFailures: Story = {
  render: () => <Room><Failures><ServiceFailureNotices /></Failures></Room>,
};

/** The same, with the first strip's Details opened: the code, the time, the version and how the process ended, a line each. */
export const ServiceFailureDetails: Story = {
  render: () => <Room><Failures><ServiceFailureNotices /></Failures></Room>,
  play: async () => {
    await drawn();
    document.querySelectorAll<HTMLElement>(".service-failure-notices summary").forEach((summary, index) => { if (index % 2 === 0) summary.click(); });
  },
};

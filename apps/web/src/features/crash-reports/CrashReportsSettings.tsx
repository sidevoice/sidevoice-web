import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { Group, Section } from "../../components/ui/Card";
import { CheckIcon, InfoIcon } from "../../components/ui/Icons";
import { Segmented } from "../../components/ui/Tabs";
import { host, type CrashReportsMode } from "../../host";
import { chooseCrashReports, useCrashReports } from "../../services/crash-reports";
import type { Translate } from "../../i18n/translator";
import { RoomStoreContext } from "../../state/room-store";
import { LogsViewer } from "./LogsViewer";
import { ReportPreview } from "./ReportPreview";
import "./crash-reports.css";

/* Settings → Crash reports. Where something fails, Sidevoice sends a report, on by default and never asked about; the one
 * setting says so and lets the person stop it ("Send automatically", "Don't send"), with "See what is sent" under its words.
 * Under it, the logs: what Sidevoice writes down while it works, on this device and on each machine, opening in this very
 * panel ("See logs"), with the line of advice for when something does not work. Each opens like the agents' "I'll do it
 * myself": a ghost button under the row's words, its panel under the row with no rule above it.
 *
 * Only where the app sends crash reports (it offers `host().crashReports`): a browser sends none, so offers no choice. */

export function useCrashReportsSection(): boolean {
  return host().crashReports !== null;
}

/** A row of a group whose words carry a disclosure (the agents' DisclosureButton), and what it opens below the row's whole
 *  width. `control` is the row's own, at its end. */
function DisclosureRow({ label, description, note, toggle, open, onToggle, panel, control, block }: {
  label: ReactNode; description: ReactNode; note?: ReactNode; toggle: ReactNode; open: boolean; onToggle: () => void; panel: ReactNode; control?: ReactNode; block?: boolean;
}) {
  const panelId = useId();
  return (
    <div className={block ? "ui-row ui-row--block crash-row" : "ui-row crash-row"}>
      <div className="ui-row-text">
        <span className="ui-row-label">{label}</span>
        <p className="ui-row-description">{description}</p>
        {note}
        <DisclosureButton className="crash-disclosure" open={open} controls={panelId} onClick={onToggle}>{toggle}</DisclosureButton>
      </div>
      {control && <div className="ui-row-control">{control}</div>}
      {open && <div className="crash-row-panel" id={panelId}>{panel}</div>}
    </div>
  );
}

export function CrashReportsSettings({ t }: { t: Translate }) {
  const store = useContext(RoomStoreContext);
  const { mode } = useCrashReports();
  const [open, setOpen] = useState({ report: false, logs: false });
  const [saved, setSaved] = useState<CrashReportsMode | null>(null);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);
  const choose = async (next: CrashReportsMode) => {
    if (next === mode) return;
    store?.patch({ settingsError: null });
    // Seen at once; given back, with the reason, when the app did not take it.
    if (await chooseCrashReports(next)) setSaved(next);
    else store?.patch({ settingsError: { text: t("crashReports.applyFailed") } });
  };
  return (
    <Section id="crash-reports" title={t("settings.section.crashReports")} description={t("crashReports.description")}
      actions={<span className="settings-saved" role="status">{saved && <><CheckIcon size={14} />{t("settings.saved")}<span className="sr-only">. {t(`crashReports.saved.${saved}`)}</span></>}</span>}>
      <Group>
        <DisclosureRow label={t("crashReports.label")} description={t(`crashReports.mode.${mode}.hint`)}
          toggle={t("crashReports.report.toggle")} open={open.report} onToggle={() => setOpen((value) => ({ ...value, report: !value.report }))}
          control={<Segmented size="sm" label={t("crashReports.label")} value={mode} onChange={(next) => void choose(next)}
            items={[{ value: "auto", label: t("crashReports.mode.auto") }, { value: "never", label: t("crashReports.mode.never") }]} />}
          panel={<ReportPreview t={t} />} />
        <DisclosureRow block label={t("logs.label")} description={t("logs.description")}
          note={<p className="logs-note crash-tip"><InfoIcon size={16} /><span>{t("crashReports.tip")}</span></p>}
          toggle={t("logs.toggle")} open={open.logs} onToggle={() => setOpen((value) => ({ ...value, logs: !value.logs }))} panel={<LogsViewer />} />
      </Group>
    </Section>
  );
}

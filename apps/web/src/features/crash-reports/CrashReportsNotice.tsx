import { useContext, useEffect, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { markCrashReportsNoticeSeen, useCrashReports } from "../../services/crash-reports";
import { translator } from "../../i18n/translator";
import { RoomStoreContext } from "../../state/room-store";
import { useOnboarding } from "../onboarding/onboarding-context";
import { openSettings } from "../settings/open-settings";
import "../settings/banners.css";
import "./crash-reports.css";

/* Said once: Sidevoice sends crash reports, and where to turn that off. One non-blocking line under the header with a link to
 * the setting and a ×, after the first setup is done — on a device that has just finished it, and once on one that updates
 * from a version that had no such notice. It asks nothing; the room behind it works. Put away (×, or Settings opened from it),
 * it never comes back. Not said where the app sends nothing (a browser), nor once the person has chosen not to send, nor
 * while the app has not yet said which it is (the setting is the app's: services/crash-reports.ts).
 *
 * It is a polite live region, and a region that arrives with its words is not reliably read out: the region is in the page from
 * the first paint, empty, and the notice goes into it once that has been committed (a later commit than the region's own). */

/** Stands where the link goes in the sentence's catalogue text: the words around it are the language's own. */
const LINK = "\u0001";

export function CrashReportsNotice() {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const onboarding = useOnboarding();
  const { offered, mode, noticeSeen } = useCrashReports();
  // The region first; its words in a later commit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const due = mounted && offered && onboarding.done && !onboarding.open && !noticeSeen && mode === "auto";
  const [before, after] = due ? t("crashReports.notice", { settings: LINK }).split(LINK) : [];
  const goToSettings = () => {
    markCrashReportsNoticeSeen();
    openSettings({ section: "crash-reports" }, store);
  };
  return (
    <div className="room-banner crash-reports-notice" role="status">
      {due && <Alert tone="accent" className="crash-notice"
        title={<>{before}<button type="button" className="crash-link" onClick={goToSettings}>{t("crashReports.notice.settings")}</button>{after}</>}
        action={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("crashReports.notice.close")} onClick={markCrashReportsNoticeSeen}><CloseIcon size={16} /></Button>} />}
    </div>
  );
}

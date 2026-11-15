import { useContext } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { host } from "../../host";
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
 * it never comes back. Not said where the app sends nothing (a browser), nor once the person has chosen not to send. */

/** Stands where the link goes in the sentence's catalogue text: the words around it are the language's own. */
const LINK = "\u0001";

export function CrashReportsNotice() {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const onboarding = useOnboarding();
  const prefs = useCrashReports();
  const sends = host().crashReports !== null;
  const settled = onboarding.done && !onboarding.open;
  if (!sends || !settled || prefs.noticeSeen || prefs.mode !== "auto") return null;
  const [before, after] = t("crashReports.notice", { settings: LINK }).split(LINK);
  const goToSettings = () => {
    markCrashReportsNoticeSeen();
    openSettings({ section: "crash-reports" }, store);
  };
  return (
    <aside className="room-banner crash-reports-notice" role="status">
      <Alert tone="accent" className="crash-notice"
        title={<>{before}<button type="button" className="crash-link" onClick={goToSettings}>{t("crashReports.notice.settings")}</button>{after}</>}
        action={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("crashReports.notice.close")} onClick={markCrashReportsNoticeSeen}><CloseIcon size={16} /></Button>} />
    </aside>
  );
}

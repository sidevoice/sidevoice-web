import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { Segmented } from "../../components/ui/Tabs";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator } from "../settings/host-i18n";
import { useAppUpdate, type UpdateMode, type UpdaterStatus } from "./useUpdates";
import "./updates.css";

const when = (at: number) => new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(at);

/** The desktop app's updates on This device's service card, by its version (a release's updater only; none, nothing
 *  shows): Updates, automatic or manual, as the app keeps it; Check for updates, busy while it checks, and when it last
 *  checked; what a check found; and a check, a download or an install that failed, with Retry for the first two.
 *  Each part shows where the app has the method for it. */
export function AppUpdateSettings() {
  const t = hostTranslator();
  const update = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [modeFailed, setModeFailed] = useState(false);
  // A call of this page's that failed; and what the person's own check found.
  const [failure, setFailure] = useState<unknown>(null);
  const [found, setFound] = useState<UpdaterStatus | null>(null);
  if (!update.updater) return null;
  const { status, mode, can, checkedAt } = update;

  function change(next: UpdateMode) {
    setModeFailed(false);
    void update.setMode(next).catch(() => setModeFailed(true));
  }
  async function act(action: "check" | "download") {
    if (checking) return;
    setFailure(null); setFound(null);
    if (action === "check") setChecking(true);
    try {
      const next = action === "check" ? await update.check() : await update.download();
      if (action === "check" && next && !next.error) setFound(next);
    } catch (reason) { setFailure(reason); }
    finally { setChecking(false); }
  }
  const error = failure ?? status?.error ?? null;
  const code = (error as { code?: unknown } | null)?.code;
  const retry = code === "update-check-failed" && can.check ? "check" : code === "update-download-failed" && can.download ? "download" : null;
  if (!(can.mode && mode) && !can.check && !error) return null;
  return (
    <div className="app-update-settings">
      {can.mode && mode && <div className="app-update-setting">
        <span className="app-update-setting-copy"><span className="host-status-login-label">{t("updates.mode")}</span>
          <span className="muted">{t(mode === "manual" ? "updates.mode.manualHint" : "updates.mode.automaticHint")}</span>
          {modeFailed && <span className="host-status-error" role="alert">{t("updates.modeFailed")}</span>}</span>
        <Segmented size="sm" label={t("updates.mode")} value={mode} onChange={change}
          items={[{ value: "automatic", label: t("updates.mode.automatic") }, { value: "manual", label: t("updates.mode.manual") }]} />
      </div>}
      {can.check && <div className="app-update-setting">
        <span className="app-update-setting-copy muted">{checkedAt && t("updates.lastChecked", { when: when(checkedAt) })}
          {found && <span role="status">{found.state === "idle" ? t("updates.upToDate") : t("updates.found", { version: found.version ?? "" })}</span>}</span>
        <Button size="sm" variant="secondary" loading={checking} onClick={() => void act("check")}>{t("updates.check")}</Button>
      </div>}
      {!!error && <div className="app-update-failure" role="alert">
        <ErrorText message={updaterFailure(error, { t })} />
        {retry && <Button size="sm" variant="ghost" loading={retry === "check" && checking} onClick={() => void act(retry)}>{t("updates.retry")}</Button>}
      </div>}
    </div>
  );
}

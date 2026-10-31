import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator } from "../../i18n/translator";
import { host } from "../../host";
import {
  isVisibleLocalHostInstall,
  localHostInstallController,
  type LocalHostInstallController,
} from "../../services/local-host-install";
import { InstallCommandHere } from "./ConnectorSteps";
import "./pairing.css";

/** Preparing this computer while nothing is installed on it, two ways, one under the other (the operator's call,
 *  2026-10-14). The app does it: Prepare this computer, the app's own install (`localHost.install`), whose progress, failure
 *  and Retry are the install's panel's (LocalHostInstallEntry, which the screen places above this). Or the person does: "I'll
 *  do it myself", the agents' manual option's control, opening the install command — to run here, or to have one of their
 *  agents run — and the wait for this computer to answer, which is polled: nothing to press. A failed install opens it by
 *  itself, its Retry still in the panel; nothing of either while the install runs or has just finished, one install at a
 *  time. Where the app does not install (a browser, a platform without it), the command is the only way, shown as is. */
export function PrepareThisComputer({ id, controller = localHostInstallController }: {
  /** The Prepare button's; what it opens is `<id>-manual`. */
  id: string;
  controller?: LocalHostInstallController;
}) {
  const t = translator();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const installs = typeof host().localHost?.install === "function";
  const failed = snapshot.phase === "failed";
  const [open, setOpen] = useState(failed);
  useEffect(() => { if (failed) setOpen(true); }, [failed]);
  const manualId = `${id}-manual`;
  const manual = <div className="prepare-here-manual" id={manualId}>
    <InstallCommandHere />
    <p className="prepare-here-wait" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("wizard.prepareWaiting")}</p>
  </div>;
  if (!installs) return <div className="prepare-here">{manual}</div>;
  if (snapshot.phase === "installing" || snapshot.phase === "succeeded") return null;
  return (
    <div className="prepare-here" data-open={open || undefined}>
      {!isVisibleLocalHostInstall(snapshot) && <Button variant="primary" id={id} onClick={() => controller.start("no-machine")}>{t("wizard.prepare")}</Button>}
      <DisclosureButton className="prepare-here-toggle" open={open} controls={manualId} onClick={() => setOpen((value) => !value)}>{t("agents.manual.toggle")}</DisclosureButton>
      {open && manual}
    </div>
  );
}

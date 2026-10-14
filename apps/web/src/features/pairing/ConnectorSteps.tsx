import { Snippet } from "../../components/ui/Snippet";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/** Preparing another machine: install Sidevoice there, then print a pairing code there to paste in the form beside it;
 *  each step's command a Snippet to copy. */
export function ConnectorSteps() {
  const t = hostTranslator();
  return (
    <ol className="connector-steps">
      <li><p>{t("pairing.stepInstall")}</p><Snippet text={CONNECTOR_INSTALL} label={t("noMachine.copyCommand")} /></li>
      <li><p>{t("pairing.stepPair")}</p><Snippet text={CONNECTOR_PAIR_DEVICE} label={t("noMachine.copyPairCommand")} /></li>
    </ol>
  );
}

/** Preparing this computer where the app does not install Sidevoice itself (the desktop app: installing stays the
 *  command's, the operator's call of 2026-10-14): the same install command, to run here in a terminal or to have one of
 *  the person's agents run. */
export function InstallCommandHere() {
  const t = hostTranslator();
  return (
    <div className="install-here">
      <p>{t("localInstall.runHere")}</p>
      <Snippet text={CONNECTOR_INSTALL} label={t("noMachine.copyCommand")} />
      <p className="install-here-agent">{t("localInstall.askAgent")}</p>
    </div>
  );
}

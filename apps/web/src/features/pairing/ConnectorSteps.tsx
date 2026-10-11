import { Snippet } from "../../components/ui/Snippet";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/** Preparing another machine, in two numbered steps: install Sidevoice there, then get a pairing code from it (or from
 *  the agent) to paste in the form that follows; each step's command a Snippet to copy. Shared by the first-run setup
 *  and the pairing dialog. */
export function ConnectorSteps() {
  const t = hostTranslator();
  return (
    <ol className="connector-steps">
      <li><p>{t("noMachine.stepInstall")}</p><Snippet text={CONNECTOR_INSTALL} label={t("noMachine.copyCommand")} /></li>
      <li><p>{t("noMachine.stepPair")}</p><Snippet text={CONNECTOR_PAIR_DEVICE} label={t("noMachine.copyPairCommand")} /></li>
    </ol>
  );
}

import { Snippet } from "../../components/ui/Snippet";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/** Preparing another machine: install Sidevoice there, then print a pairing code there to paste in the form beside it;
 *  each step's command a Snippet to copy. Numbered on their own; `numbered={false}` where they are already one numbered
 *  step of the pairing screen's. */
export function ConnectorSteps({ numbered = true }: { numbered?: boolean }) {
  const t = hostTranslator();
  return (
    <ol className="connector-steps" data-plain={numbered ? undefined : true}>
      <li><p>{t("pairing.stepInstall")}</p><Snippet text={CONNECTOR_INSTALL} label={t("noMachine.copyCommand")} /></li>
      <li><p>{t("pairing.stepPair")}</p><Snippet text={CONNECTOR_PAIR_DEVICE} label={t("noMachine.copyPairCommand")} /></li>
    </ol>
  );
}

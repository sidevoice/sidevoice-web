import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { CopyIcon } from "../../components/ui/Icons";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";

/** One command to run on the other machine, with its copy button; whether the copy worked is said on its own line. */
function CommandRow({ command, copyLabel }: { command: string; copyLabel: string }) {
  const t = hostTranslator();
  const [note, setNote] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(command); setNote(t("noMachine.commandCopied")); }
    catch { setNote(t("noMachine.commandCopyFailed")); }
  }
  return (
    <>
      <div className="setup-command"><code>{command}</code>
        <Button type="button" variant="ghost" size="compact" aria-label={copyLabel} title={copyLabel} onClick={() => void copy()}><CopyIcon size={15} /></Button>
      </div>
      <p className="muted setup-command-note" role="status">{note}</p>
    </>
  );
}

/** Preparing another machine, in two steps: install Sidevoice there, then get a pairing code from it (or from the agent)
 *  to paste in the form that follows. Shared by the first-run setup and the pairing dialog. */
export function ConnectorSteps() {
  const t = hostTranslator();
  return (
    <ol className="connector-steps">
      <li><p>{t("noMachine.stepInstall")}</p><CommandRow command={CONNECTOR_INSTALL} copyLabel={t("noMachine.copyCommand")} /></li>
      <li><p>{t("noMachine.stepPair")}</p><CommandRow command={CONNECTOR_PAIR_DEVICE} copyLabel={t("noMachine.copyPairCommand")} /></li>
    </ol>
  );
}

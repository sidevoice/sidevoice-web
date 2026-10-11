import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { CheckIcon, CopyIcon } from "../../components/ui/Icons";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/** One command to run on the other machine, with its copy button; whether the copy worked is said on its own line. */
function CommandBlock({ command, copyLabel }: { command: string; copyLabel: string }) {
  const t = hostTranslator();
  const [copied, setCopied] = useState<boolean | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(command); setCopied(true); }
    catch { setCopied(false); }
  }
  return (
    <div className="command-block">
      <div className="setup-command"><code>{command}</code>
        <Button type="button" variant="ghost" tone="neutral" size="icon-sm" aria-label={copyLabel} title={copyLabel} onClick={() => void copy()}><CopyIcon /></Button>
      </div>
      <p className="command-note" role="status" data-copied={copied || undefined}>
        {copied && <CheckIcon size={14} />}{copied === null ? "" : t(copied ? "noMachine.commandCopied" : "noMachine.commandCopyFailed")}
      </p>
    </div>
  );
}

/** Preparing another machine, in two numbered steps: install Sidevoice there, then get a pairing code from it (or from
 *  the agent) to paste in the form that follows. Shared by the first-run setup and the pairing dialog. */
export function ConnectorSteps() {
  const t = hostTranslator();
  return (
    <ol className="connector-steps">
      <li><p>{t("noMachine.stepInstall")}</p><CommandBlock command={CONNECTOR_INSTALL} copyLabel={t("noMachine.copyCommand")} /></li>
      <li><p>{t("noMachine.stepPair")}</p><CommandBlock command={CONNECTOR_PAIR_DEVICE} copyLabel={t("noMachine.copyPairCommand")} /></li>
    </ol>
  );
}

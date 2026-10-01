/* «Borrar datos…» (ONBOARDING_AND_HOSTS.md F7): this app's data always; this computer's machine only when asked
 * (O3: off by default). An ordered transaction that stops at the first failure, says what is done and what is left,
 * and «Reintentar» resumes it. Once it is over the app relaunches into the first-run wizard. */
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useT } from "../../i18n";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { useModal } from "../hosts/common";

export function ResetDialog() {
  const t = useT();
  const hosts = useHostsController();
  const reset = useHosts((s) => s.reset);
  const hasLocal = useHosts((s) => !!s.localPairing);
  const [machine, setMachine] = useState(false);
  const ref = useModal(reset.open, () => hosts.closeReset());
  // O3: app only by default — a box checked before a cancel is not carried into the next opening.
  useEffect(() => { if (reset.open && !reset.steps) setMachine(false); }, [reset.open, reset.steps]);
  const failed = reset.steps?.find((step) => step.state === "failed");
  const leaves = reset.steps?.flatMap((step) => step.leaves ?? []) ?? [];
  const started = !!reset.steps;
  return (
    <dialog ref={ref} id="reset-dialog" className="reset-dialog" aria-labelledby="reset-title">
      <h2 id="reset-title">{t("reset.title")}</h2>
      {!started ? <>
        <label className="check-row"><input type="checkbox" checked disabled /> <span>{t("reset.app")}</span></label>
        {hasLocal && <label className="check-row"><input type="checkbox" checked={machine} onChange={(e) => setMachine(e.currentTarget.checked)} /> <span>{t("reset.machine")}</span></label>}
        {machine && <p className="warn-line" role="alert">{t("reset.machineWarning")}</p>}
        <p className="muted small">{t(machine ? "reset.relaunch.both" : hasLocal ? "reset.relaunch.app" : "reset.relaunch.plain")}</p>
      </> : (
        <ol className="reset-steps" aria-live="polite">
          {reset.steps!.map((step) => (
            <li key={step.id} data-state={step.state}>
              <span className="install-mark" aria-hidden="true" />
              <span><span className="sr-only">{t("reset.state." + step.state)}: </span>{t("reset.step." + step.id)}<span className="muted small"> · {t("reset.state." + step.state)}</span>{step.state === "failed" && step.error && <span className="row-error"> · {t("reset.error." + step.error.key, { detail: step.error.detail ?? "" })}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {failed && <p className="muted" role="alert">{t("reset.stopped")}</p>}
      {leaves.length > 0 && !failed && <div className="notice"><p className="small">{t("reset.leaves")}</p><ul className="plain-list small">{leaves.map((l) => <li key={l}>{l}</li>)}</ul></div>}
      <div className="wizard-actions">
        {!reset.running && <Button variant="ghost" onClick={() => hosts.closeReset()}>{t(started && !failed ? "common.close" : "common.cancel")}</Button>}
        {(!started || failed) && <Button variant="danger" disabled={reset.running} onClick={() => void hosts.runReset(machine)}>{failed ? t("common.retry") : t("reset.confirm")}</Button>}
      </div>
    </dialog>
  );
}

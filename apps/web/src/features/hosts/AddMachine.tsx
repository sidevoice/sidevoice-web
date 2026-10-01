/* «Añadir una máquina» (operator, 2026-10-02): if this computer is not one of your machines yet (and can be), first
 * choose — this computer, which installs Sidevoice here (the wizard's install step), or another machine, with its
 * code. Once this computer is a machine, there is nothing to choose: straight to the code. */
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { useT } from "../../i18n";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { PairWithCode } from "./PairWithCode";

export function AddMachine() {
  const t = useT();
  const hosts = useHostsController();
  const canLocal = useHosts((s) => s.inApp && s.canHostAgents && !s.localPairing);
  const [choice, setChoice] = useState<"local" | "remote" | null>(null);
  const [step, setStep] = useState<"choose" | "code">(canLocal ? "choose" : "code");
  async function next() {
    if (choice === "remote") { setStep("code"); return; }
    hosts.closeSettings();
    await hosts.choosePath("agents");
    hosts.openWizard("W2");
  }
  return (
    <section className="pane add-machine">
      <h3>{t("hosts.add")}</h3>
      {step === "choose" ? <>
        <fieldset className="choice-cards">
          <legend className="sr-only">{t("hosts.add")}</legend>
          {(["local", "remote"] as const).map((value) => (
            <label key={value} className="choice-card" data-checked={choice === value || undefined}>
              <input type="radio" name="add-machine" value={value} checked={choice === value} onChange={() => setChoice(value)} />
              <span className="choice-copy">
                <strong>{t(value === "local" ? "hosts.addHere" : "hosts.addOther")}</strong>
                <span className="muted">{t(value === "local" ? "hosts.addHereDetail" : "hosts.addOtherDetail")}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="row-actions"><Button variant="primary" disabled={!choice} onClick={() => void next()}>{t("wizard.continue")}</Button></div>
      </> : <>
        <PairWithCode use={false} submitLabel={t("hosts.addSubmit")} onPaired={(fp) => hosts.openSettings("host", fp)} />
        {canLocal && <Button variant="ghost" size="compact" onClick={() => setStep("choose")}>{t("wizard.back")}</Button>}
      </>}
    </section>
  );
}

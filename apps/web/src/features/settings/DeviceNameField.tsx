import { useState } from "react";
import { Input } from "../../components/ui/Input";
import { currentDeviceName } from "../../state/device-name";
import { translator } from "../../i18n/translator";
import { clampDeviceName, deviceNameProblem } from "../../services/device-name-rules.js";

/* This device's name as the machines it pairs with list it: prefilled with what it would be called (the computer's
 * name, else "Chrome on Mac"), kept for the next pairing, and — once changed — sent to every machine it is paired with
 * (setDeviceName). Saved on Enter or on leaving the field; what could not be told is said. In General and in the setup's
 * basics. */
export function DeviceNameField({ id }: { id: string }) {
  const t = translator();
  const derived = () => currentDeviceName();
  const [value, setValue] = useState(derived);
  const [saved, setSaved] = useState(value);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function save() {
    // Checked as the machines check it: one they would refuse says why and is not kept.
    const problem = deviceNameProblem(value);
    if (problem && problem !== "empty") { setError(t(problem === "tooLong" ? "settings.deviceName.tooLong" : "settings.deviceName.invalid")); return; }
    const name = clampDeviceName(value);
    setError("");
    if (!name || name === saved) { setValue(saved); return; }
    setSaved(name); setValue(name); setNote("");
    const missed = await window.sidevoiceActions?.setDeviceName?.(name) ?? 0;
    setNote(missed ? t("settings.deviceName.partly", { n: missed }) : t("settings.deviceName.saved"));
  }
  return <>
    <Input id={id} value={value} autoComplete="off" spellCheck={false} aria-invalid={error ? true : undefined} aria-describedby={error ? id + "-error" : undefined}
      onChange={(event) => { setValue(event.target.value); setNote(""); setError(""); }}
      onBlur={() => void save()}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setValue(saved); } }} />
    {error && <span id={id + "-error"} className="device-name-error" role="alert">{error}</span>}
    {note && !error && <span className="device-name-note" role="status">{note}</span>}
  </>;
}

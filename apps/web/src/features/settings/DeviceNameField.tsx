import { useState } from "react";
import { Input } from "../../components/ui/Input";
import { currentDeviceName } from "../../state/device-name";
import { hostTranslator } from "./host-i18n";

/* This device's name as the machines it pairs with list it: prefilled with what it would be called (the computer's
 * name, else "Chrome on Mac"), kept for the next pairing, and — once changed — sent to every machine it is paired with
 * (setDeviceName). Saved on Enter or on leaving the field; what could not be told is said. In General and in the setup's
 * basics. */
export function DeviceNameField({ id }: { id: string }) {
  const t = hostTranslator();
  const derived = () => currentDeviceName((_, params) => t("pair.deviceNameBrowser", params));
  const [value, setValue] = useState(derived);
  const [saved, setSaved] = useState(value);
  const [note, setNote] = useState("");
  async function save() {
    const name = value.trim().slice(0, 60);
    if (!name || name === saved) { setValue(saved); return; }
    setSaved(name); setValue(name); setNote("");
    const missed = await window.sidevoiceActions?.setDeviceName?.(name) ?? 0;
    setNote(missed ? t("settings.deviceName.partly", { n: missed }) : t("settings.deviceName.saved"));
  }
  return <>
    <Input id={id} value={value} maxLength={60} autoComplete="off" spellCheck={false}
      onChange={(event) => { setValue(event.target.value); setNote(""); }}
      onBlur={() => void save()}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setValue(saved); } }} />
    {note && <span className="device-name-note" role="status">{note}</span>}
  </>;
}

import { useContext } from "react";
import { Button } from "../../components/ui/Button";
import { VoicesIcon } from "../../components/ui/Icons";
import { RoomStoreContext } from "../../state/room-store";
import { openSettings } from "../settings/open-settings";
import { translator } from "../../i18n/translator";
import { VoiceModels, type VoiceModelRow } from "./VoiceModels";

/* The call's own space while a machine answers but the voice's models are not ready: the rows
 * of the models the call needs, as the call's details have them, each with what it needs done (Download, Try again, Add
 * the key) and its download's progress; a polite live region says how each stands as it changes. */
export function VoiceSetupCard({ rows }: { rows: VoiceModelRow[] }) {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const language = document.documentElement.lang || "en";
  const percent = (fraction: number) => new Intl.NumberFormat(language, { style: "percent" }).format(Math.floor(fraction * 10) / 10);
  // The same words as Ready's recap for what is missing (d).
  const states = { absent: t("wizard.recap.notDownloaded") };
  const said = rows.map(({ slot, label }) => `${label}: ${slot.fraction != null ? t("wizard.recap.downloading", { percent: percent(slot.fraction) })
    : slot.status === "absent" ? states.absent : slot.state}`).join(". ");
  return <section className="voice-setup-card" aria-labelledby="voice-setup-title">
    <span className="voice-setup-mark"><VoicesIcon size={28} /></span>
    <h1 id="voice-setup-title">{t("voiceSetup.title")}</h1>
    <p>{t("voiceSetup.body")}</p>
    {rows.length > 0 ? <VoiceModels rows={rows} states={states} />
      : <Button variant="primary" onClick={() => openSettings({ section: "voice" }, store)}>{t("voiceModels.openSettings")}</Button>}
    <p className="sr-only" role="status" aria-live="polite">{said}</p>
  </section>;
}

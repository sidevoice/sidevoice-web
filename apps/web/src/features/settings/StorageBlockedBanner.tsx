import { Alert } from "../../components/ui/Alert";
import { useRoomStore } from "../../state/room-store";
import { translator } from "../../i18n/translator";
import "./banners.css";

/* What a browser that blocks this page's site data costs, said once on top: no pairing survives a reload, and the
 * call's voice cannot start. Shown only while the probe at start found the page's storage refused. */
export function StorageBlockedBanner() {
  const t = translator();
  const blocked = useRoomStore((state) => state.facts.storageBlocked);
  if (!blocked) return null;
  return <aside className="room-banner storage-blocked-banner" id="storage-blocked">
    <Alert tone="warning" live title={t("storage.blockedTitle")}>{t("storage.blocked")}</Alert>
  </aside>;
}

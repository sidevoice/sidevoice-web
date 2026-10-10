import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "./host-i18n";

/* What a browser that blocks this page's site data costs, said once on top: no pairing survives a reload, and the
 * call's voice cannot start. Shown only while the probe at start found the page's storage refused. */
export function StorageBlockedBanner() {
  const t = hostTranslator();
  const blocked = useRoomStore((state) => state.facts.storageBlocked);
  if (!blocked) return null;
  return <aside className="storage-blocked-banner" role="alert" id="storage-blocked">{t("storage.blocked")}</aside>;
}

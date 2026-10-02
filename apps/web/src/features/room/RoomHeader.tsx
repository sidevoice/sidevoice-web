import { SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { useRoomStore } from "../../state/room-store";
import { actionableHostFingerprints } from "../../services/host-agents";
import { hostTranslator } from "../settings/host-i18n";

/* The name and the mark, and the one control the whole page shares. Nothing that explains itself. */
export function RoomHeader() {
  const t = hostTranslator();
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const pairings = useRoomStore((state) => state.facts.pairings);
  const activeFingerprints = new Set(pairings.filter((pairing) => !pairing.revoked).map((pairing) => pairing.fp));
  const pendingHosts = actionableHostFingerprints(hostAgents, activeFingerprints);
  const hasNotice = pendingHosts.length > 0;
  return <header><h1 className="brand"><SidevoiceMark /> Sidevoice</h1><Button id="settings-open" variant="ghost" size="icon"
    aria-label={t(hasNotice ? "agents.gear.pending" : "settings.open")} title={t(hasNotice ? "agents.gear.pending" : "settings.open")}
    onClick={() => { if (hasNotice) window.sidevoiceActions?.openAgentSettings?.(pendingHosts.length === 1 ? pendingHosts[0] : null); }}>
    <SettingsIcon />{hasNotice && <span className="settings-notice-dot" aria-hidden="true" />}
  </Button></header>;
}

import { Button } from "../../components/ui/Button";
import { ChevronIcon, HARNESS_NAMES, SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { callTranslator, type CallTranslate } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { headerConversations, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { actionableHostFingerprints } from "../../services/host-agents";
import { hostTranslator } from "../settings/host-i18n";

/* The mark and Settings. The conversation on the stage is named on the stage itself; on a phone, where the
 * conversations have no column, the brand gives its room to them instead: the one on the stage, two others at most —
 * those waiting for you, then those working — and a pill with how many there are. Any of them brings the
 * conversations panel down. */
export function RoomHeader() {
  const t = callTranslator();
  return (
    <header className="room-header">
      <h1 className="brand"><SidevoiceMark /> <span className="brand-name">Sidevoice</span></h1>
      <ConversationTrigger t={t} />
      <HeaderConversations t={t} />
      <SettingsButton t={t} />
    </header>
  );
}

function ConversationTrigger({ t }: { t: CallTranslate }) {
  const stage = useStageConversation();
  const open = useCallLayout((state) => state.conversationsOpen);
  const showConversations = useCallLayout((state) => state.showConversations);
  const count = useRoomStore((state) => state.participants.length);
  if (!stage.threadId && !count) return null;
  const harness = stage.row?.harness ? HARNESS_NAMES[stage.row.harness] : null;
  const where = [stage.row?.machine, harness].filter(Boolean).join(" · ");
  return (
    <button type="button" className="conversation-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" onClick={showConversations}>
      {stage.threadId && <CharacterAvatar className="trigger-avatar" spec={avatarFor(stage.threadId)} mood={stage.mood} size="small" />}
      <span className="trigger-copy">
        <strong className="trigger-title" translate="no">{stage.threadId ? stage.title : t("header.noConversation")}</strong>
        <span className="trigger-sub">
          {stage.threadId && <i className="live-dot" data-live={(stage.inCall && stage.isTarget) || undefined} aria-hidden="true" />}
          <span className="trigger-where" translate="no">{stage.row ? where || stateText(stage.row, stage.inCall, t) : t("header.showConversations")}</span>
          <ChevronIcon className="trigger-caret" size={14} />
        </span>
      </span>
    </button>
  );
}

function HeaderConversations({ t }: { t: CallTranslate }) {
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const stage = useStageConversation();
  const open = useCallLayout((state) => state.conversationsOpen);
  const openConversations = useCallLayout((state) => state.openConversations);
  if (!participants.length) return null;
  const label = (row: ParticipantView) => t("header.otherConversation", { title: row.title, state: stateText(row, inCall, t) });
  return (
    <div className="header-conversations">
      {headerConversations(participants, stage.threadId, inCall).map((row) => (
        <button type="button" key={row.threadId} className="header-avatar" aria-label={label(row)} title={label(row)}
          aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" onClick={openConversations}>
          <ConversationAvatar row={row} />
        </button>
      ))}
      <button type="button" className="header-more" aria-label={t("header.allConversations", { n: participants.length })}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" onClick={openConversations}>
        {participants.length}<ChevronIcon size={13} />
      </button>
    </div>
  );
}

/** The paired machines with agents waiting to be connected: the gear shows a dot, and Settings opens at their agents. */
function usePendingAgentHosts() {
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const pairings = useRoomStore((state) => state.facts.pairings);
  const active = new Set(pairings.filter((pairing) => !pairing.revoked).map((pairing) => pairing.fp));
  return actionableHostFingerprints(hostAgents, active);
}

/* The runtime opens Settings from #settings-open's own handler: React must not own that button's click (with an
 * onClick it resets the element's handler on every render), so its wrapper hears it. With agents waiting, Settings
 * then opens at theirs. */
function SettingsButton({ t }: { t: CallTranslate }) {
  const hosts = hostTranslator();
  const pending = usePendingAgentHosts();
  const notice = pending.length > 0;
  const label = notice ? hosts("agents.gear.pending") : t("header.settings");
  return (
    <span className="header-settings" onClick={() => {
      if (notice) window.sidevoiceActions?.openAgentSettings?.(pending.length === 1 ? pending[0] : null);
    }}>
      <Button id="settings-open" variant="ghost" size="icon" aria-label={label} title={label}>
        <SettingsIcon size={20} />{notice && <span className="settings-notice-dot" aria-hidden="true" />}
      </Button>
    </span>
  );
}

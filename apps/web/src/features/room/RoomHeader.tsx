import { useRef } from "react";
import { Button } from "../../components/ui/Button";
import { SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator, type CallTranslate } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { headerConversations, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { actionableHostFingerprints } from "../../services/host-agents";
import { hostTranslator } from "../settings/host-i18n";
import "./room.css";

/* The mark and Settings. The conversation on the stage is named on the stage itself. On a phone, where the
 * conversations have no column, two others at most sit in the header — those waiting for you, then those working —
 * and a tap moves the call to one; the whole list comes down from the handle under the header, and the header stays
 * lit above the dimmed call while it is down. */
export function RoomHeader() {
  const t = callTranslator();
  // A design variant (lib/variants.ts): where a phone's header puts the other conversations — after the mark, in its
  // middle, or by the gear.
  const avatars = useVariant("header-avatars", ["left", "centre", "right"] as const);
  const listDown = useCallLayout((state) => state.conversationsOpen);
  return (
    <>
      <header className="room-header" data-avatars={avatars} data-list-down={listDown || undefined}>
        <h1 className="brand"><SidevoiceMark size={22} /> <span className="brand-name">Sidevoice</span></h1>
        <HeaderConversations t={t} />
        <SettingsButton t={t} />
      </header>
      <ConversationsGrab t={t} />
    </>
  );
}

/** The phone's handle under the header: a tap, or pulling it down, brings the conversations down. */
function ConversationsGrab({ t }: { t: CallTranslate }) {
  const count = useRoomStore((state) => state.participants.length);
  const open = useCallLayout((state) => state.conversationsOpen);
  const openConversations = useCallLayout((state) => state.openConversations);
  const from = useRef<number | null>(null);
  if (!count) return null;
  return (
    <button type="button" className="conversations-grab" aria-label={t("header.allConversations", { n: count })} title={t("header.allConversations", { n: count })}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" onClick={openConversations}
      onPointerDown={(event) => { from.current = event.clientY; }}
      onPointerMove={(event) => { if (from.current !== null && event.clientY - from.current > 24) { from.current = null; openConversations(); } }}
      onPointerUp={() => { from.current = null; }}>
      <i aria-hidden="true" />
    </button>
  );
}

/* A tap on one moves the call there; with the list down (the header stays above it) it also puts the list away, as
 * choosing in the list does. */
function HeaderConversations({ t }: { t: CallTranslate }) {
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const stage = useStageConversation();
  const closeConversations = useCallLayout((state) => state.closeConversations);
  if (!participants.length) return null;
  const label = (row: ParticipantView) => t("header.otherConversation", { title: row.title, state: stateText(row, inCall, t) });
  return (
    <div className="header-conversations">
      {headerConversations(participants, stage.threadId, inCall).map((row) => (
        <button type="button" key={row.threadId} className="header-avatar" aria-label={label(row)} title={label(row)}
          disabled={row.switching} onClick={() => { window.sidevoiceActions?.selectParticipant(row.threadId); closeConversations(); }}>
          <ConversationAvatar row={row} />
        </button>
      ))}
    </div>
  );
}

/** The paired machines with agents waiting to be connected: the gear shows a dot, and Settings opens at their agents. */
export function usePendingAgentHosts() {
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const pairings = useRoomStore((state) => state.facts.pairings);
  const active = new Set(pairings.filter((pairing) => !pairing.revoked).map((pairing) => pairing.fp));
  return actionableHostFingerprints(hostAgents, active);
}

/** Settings from the conversations' foot, where it sits on a desktop: the header's own button, which the runtime opens
 *  Settings from, pressed — kept in the header (shown only on a phone, which has no column), so it is the only one. */
export function openSettings() {
  document.getElementById("settings-open")?.click();
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
      <Button id="settings-open" variant="ghost" tone="neutral" size="icon" aria-label={label} title={label}>
        <SettingsIcon size={20} />{notice && <span className="settings-notice-dot" aria-hidden="true" />}
      </Button>
    </span>
  );
}

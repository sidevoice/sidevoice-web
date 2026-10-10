import { useRef, type SyntheticEvent } from "react";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, HARNESS_NAMES, MoreIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { avatarFor } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { callTranslator, type CallTranslate } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { headerConversations, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";

/* The mark, the conversation on the stage, and the secondary actions behind ⋯. On a phone the brand gives its room
 * to the other conversations: two of them at most beside the title — those waiting for you, then those working —
 * and a pill with how many there are. Any of them, or the title, brings the conversations panel down. */
export function RoomHeader() {
  const t = callTranslator();
  return (
    <header className="room-header">
      <h1 className="brand"><SidevoiceMark /> <span className="brand-name">Sidevoice</span></h1>
      <ConversationTrigger t={t} />
      <HeaderConversations t={t} />
      <HeaderMenu t={t} />
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

/* The secondary actions. Its id and class are the runtime's: it binds the statistics and settings dialogs to these
 * buttons, closes the menu when the statistics open, and closes it on a click outside or Escape (`.call-menu`).
 * However it closes, focus that was in it, or went nowhere, goes back to ⋯; focus a dialog took stays there. */
function returnFocus(event: SyntheticEvent<HTMLDetailsElement>) {
  const menu = event.currentTarget;
  const now = document.activeElement;
  if (!menu.open && (!now || now === document.body || menu.contains(now))) menu.querySelector("summary")?.focus();
}

function HeaderMenu({ t }: { t: CallTranslate }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details id="call-menu" className="call-menu header-menu" ref={menu} onToggle={returnFocus}>
      <summary aria-label={t("header.menu")} title={t("header.menu")}><MoreIcon size={20} /></summary>
      <div className="header-menu-panel" onClick={() => { if (menu.current) menu.current.open = false; }}>
        <Button id="stats-open" variant="ghost" size="compact">{t("header.stats")}</Button>
        <Button id="settings-open" variant="ghost" size="compact">{t("header.settings")}</Button>
      </div>
    </details>
  );
}

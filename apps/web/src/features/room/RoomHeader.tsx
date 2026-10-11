import { Button } from "../../components/ui/Button";
import { ChevronIcon, SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { UpdatesEntry, useUpdatesEntry, useUpdatesWaiting } from "../updates/UpdatesEntry";

/** A phone wide enough for four of the other conversations in its header. */
const ROOMY_PHONE_QUERY = "(min-width: 390px)";
import { RoomStoreContext, useRoomStore, type RoomStore } from "../../state/room-store";
import { useContext } from "react";
import { useHighlights, type Highlight as NewThing } from "../highlights/highlights";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator, type CallTranslate } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { headerConversations, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { hostTranslator } from "../settings/host-i18n";
import "./room.css";

/* The mark and Settings. The conversation on the stage is named on the stage itself. On a phone, where the
 * conversations have no column, two others at most sit in the header — those waiting for you, then those working —
 * and a tap moves the call to one; the whole list comes down from the handle under the header, and the header stays
 * lit above the dimmed call while it is down. */
export function RoomHeader() {
  const t = callTranslator();
  const listDown = useCallLayout((state) => state.conversationsOpen);
  const narrow = useMedia(NARROW_QUERY);
  const updatesHere = useUpdatesEntry();
  return (
    <>
      <header className="room-header" data-list-down={listDown || undefined}>
        <h1 className="brand"><SidevoiceMark size={22} /> <span className="brand-name">Sidevoice</span></h1>
        <HeaderConversations t={t} />
        {narrow && updatesHere === "header" && <UpdatesEntry compact side="bottom" />}
        <SettingsButton t={t} />
      </header>
    </>
  );
}

/** A phone's way to every conversation: the chevron after the header's avatars. A tap drops the conversations (by
 *  machine, a new one, and Settings at their foot) under the header and turns the chevron up; another tap, a tap
 *  outside or Escape puts them away. */
function ConversationsToggle({ t, rest }: { t: CallTranslate; rest: number }) {
  const count = useRoomStore((state) => state.participants.length);
  const open = useCallLayout((state) => state.conversationsOpen);
  const openConversations = useCallLayout((state) => state.openConversations);
  const closeConversations = useCallLayout((state) => state.closeConversations);
  const label = t("header.allConversations", { n: count });
  // Where the updates live in the dropped panel (VARIANTS updates-entry "panel"), the chevron wears their dot.
  const waiting = useUpdatesWaiting();
  const updatesHere = useUpdatesEntry();
  const updates = waiting && updatesHere === "panel";
  return (
    <Button variant="ghost" tone="neutral" size="sm" className="conversations-toggle" aria-label={label} title={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" data-updates={updates || undefined} onClick={open ? closeConversations : openConversations}>
      {rest > 0 && <span className="conversations-rest" aria-hidden="true">+{rest}</span>}<ChevronIcon size={18} />
    </Button>
  );
}

/* A tap on one moves the call there; with the list down (the header stays above it) it also puts the list away, as
 * choosing in the list does. */
function HeaderConversations({ t }: { t: CallTranslate }) {
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const stage = useStageConversation();
  const closeConversations = useCallLayout((state) => state.closeConversations);
  // As many as a phone's width has room for beside the gear: four, or three on the narrowest.
  const roomy = useMedia(ROOMY_PHONE_QUERY);
  const shown = headerConversations(participants, stage.threadId, inCall, roomy ? 4 : 3, true);
  const rest = participants.filter((row) => row.threadId !== stage.threadId).length - shown.length;
  const label = (row: ParticipantView) => t("header.otherConversation", { title: row.title, state: stateText(row, inCall, t) });
  return (
    <div className="header-conversations">
      {shown.map((row) => (
        <button type="button" key={row.threadId} className="header-avatar" aria-label={label(row)} title={label(row)}
          disabled={row.switching} onClick={() => { window.sidevoiceActions?.selectParticipant(row.threadId); closeConversations(); }}>
          <ConversationAvatar row={row} />
        </button>
      ))}
      <ConversationsToggle t={t} rest={rest} />
    </div>
  );
}


/** Settings, opened at what is new first: a machine's agents (its own way in), else the section of a new setting —
 *  after Settings' own opening, which picks a section of its own. Nothing new, as it opens. */
export function openAtHighlight(news: NewThing[], store: RoomStore | null) {
  const first = news[0];
  if (!first) return;
  if (first.machine) window.sidevoiceActions?.openAgentSettings?.(first.machine);
  else queueMicrotask(() => store?.patch({ settingsSection: first.section }));
}

/** Settings from the conversations' foot, where it sits on a desktop: the header's own button, which the runtime opens
 *  Settings from, pressed — kept in the header (shown only on a phone, which has no column), so it is the only one. */
export function openSettings() {
  document.getElementById("settings-open")?.click();
}

/* A phone's gear, at the header's right; on a desktop Settings sits at the conversations' foot, which presses this
 * button. The runtime opens Settings from #settings-open's own handler: React must not own that button's click (with an
 * onClick it resets the element's handler on every render), so its wrapper hears it. With agents waiting, Settings
 * then opens at theirs. */
function SettingsButton({ t }: { t: CallTranslate }) {
  const hosts = hostTranslator();
  const store = useContext(RoomStoreContext);
  const news = useHighlights();
  const label = news.length ? hosts("highlights.gear", { n: news.length }) : t("header.settings");
  return (
    <span className="header-settings" onClick={() => openAtHighlight(news, store)}>
      <Button id="settings-open" variant="ghost" tone="neutral" size="icon" aria-label={label} title={label}>
        <SettingsIcon size={20} />{news.length > 0 && <span className="settings-notice-dot" aria-hidden="true" />}
      </Button>
    </span>
  );
}

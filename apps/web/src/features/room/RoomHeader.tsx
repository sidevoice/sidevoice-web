import { Tooltip } from "../../components/ui/Tooltip";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useCallLayout } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import { useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";
import { GearNewMark, useHighlights } from "../highlights/highlights";
import { useSettingsAttention } from "../settings/settings-attention";
import type { ParticipantView } from "../../state/room-types";
import { translator, type Translate } from "../../i18n/translator";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { headerRow, rowCapacity, UNMEASURED_ROW } from "./header-row";
import { NewConversation } from "./NewConversation";
import "./room.css";

/* The mark and Settings. The conversation on the stage is named on the stage itself. On a phone, where the
 * conversations have no column, they sit in the header as a row of avatars (header-row.ts): as many as fit, the one on
 * the stage marked in place, then "+" for a new one, then the chevron when some are not in the row. A tap moves the call
 * to one; the whole list comes down from the chevron, and the header stays lit above the dimmed call while it is down. */
/** `blocked`: nothing set up to talk to yet: no New conversation here either (as the sidebar). */
export function RoomHeader({ blocked = false }: { blocked?: boolean } = {}) {
  const t = translator();
  const listDown = useCallLayout((state) => state.conversationsOpen);
  // No updates entry on a phone (decided): the page there picks up a new version the next time it is opened.
  return (
    <>
      <header className="room-header" data-list-down={listDown || undefined}>
        <h1 className="brand"><SidevoiceMark size={22} /> <span className="brand-name">Sidevoice</span></h1>
        <HeaderConversations t={t} blocked={blocked} />
        <SettingsButton t={t} />
      </header>
    </>
  );
}

/** A phone's way to every conversation: the chevron after the header's row, with how many are not in it. A tap drops
 *  the conversations (by machine, a new one, and Settings at their foot) under the header and turns the chevron up;
 *  another tap, a tap outside or Escape puts them away. */
function ConversationsToggle({ t, hidden }: { t: Translate; hidden: ParticipantView[] }) {
  const count = useRoomStore((state) => state.participants.length);
  const open = useCallLayout((state) => state.conversationsOpen);
  const openConversations = useCallLayout((state) => state.openConversations);
  const closeConversations = useCallLayout((state) => state.closeConversations);
  // The chevron wears a dot when a conversation behind it has something unread, and says how many in words too.
  const news = hidden.filter((row) => row.unread > 0 || (row.unheard ?? 0) > 0).length;
  const label = news ? t(news === 1 ? "header.allConversationsNews.one" : "header.allConversationsNews.other", { n: count, k: news }) : t("header.allConversations", { n: count });
  return (
    <Tooltip action content={label}>
      <Button variant="ghost" tone="neutral" size="sm" className="conversations-toggle" aria-label={label}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="conversations" onClick={open ? closeConversations : openConversations}>
        {hidden.length > 0 && <span className="conversations-rest" aria-hidden="true">+{Math.min(hidden.length, 99)}</span>}<ChevronIcon size={18} />
        {news > 0 && <span className="conversations-cue" data-cue="unread" aria-hidden="true" />}
      </Button>
    </Tooltip>
  );
}

/** The avatars as placed, held where they were while a pointer is down on them: nothing moves
 *  under a finger when one joins or leaves. Each keeps its row as it is now. */
function useHeldWhilePressed(placed: ParticipantView[], rows: ParticipantView[]): [ParticipantView[], { start(): void; end(): void }] {
  const held = useRef<string[] | null>(null);
  const [, release] = useReducer((n: number) => n + 1, 0);
  const start = () => { held.current = placed.map((row) => row.threadId); };
  // Let go once the tap's click has landed on what was under the finger.
  const end = () => { if (held.current) setTimeout(() => { held.current = null; release(); }, 0); };
  const order = held.current;
  const shown = order ? order.flatMap((id) => rows.filter((row) => row.threadId === id)) : placed;
  return [shown, { start, end }];
}

/** The conversations in the order this page first saw them: one that joins goes last, one that leaves frees its place
 *  (and coming back, joins again). The room lists them by machine, so one new on the first machine would otherwise come
 *  before the second machine's, and move them. */
function useFirstSeen(rows: ParticipantView[]) {
  const seen = useRef<string[]>([]);
  const present = new Map(rows.map((row) => [row.threadId, row]));
  seen.current = [...seen.current.filter((id) => present.has(id)), ...rows.map((row) => row.threadId).filter((id) => !seen.current.includes(id))];
  return seen.current.map((id) => present.get(id)!);
}

/** The row's width, measured as it changes (a rotation, a split screen); until it is laid out, a 360px phone's. */
function useRowWidth(row: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = row.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [row]);
  return width || UNMEASURED_ROW;
}

/* A tap on one moves the call there and the row stays as it is: the one tapped is marked where it is, and keeps the
 * focus. With the list down (the header stays above it) it also puts the list away, as choosing in the list does. */
function HeaderConversations({ t, blocked }: { t: Translate; blocked: boolean }) {
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const stage = useStageConversation();
  const closeConversations = useCallLayout((state) => state.closeConversations);
  const box = useRef<HTMLDivElement>(null);
  const order = useFirstSeen(participants);
  const { avatars, chevron } = rowCapacity(useRowWidth(box), order.length);
  const guest = useRef<string | null>(null);
  const placed = headerRow(order.map((row) => row.threadId), stage.threadId, guest.current, avatars);
  guest.current = placed.guest;
  const [shown, hold] = useHeldWhilePressed(placed.row.map((id) => order.find((row) => row.threadId === id)!), participants);
  const hidden = order.filter((row) => !placed.row.includes(row.threadId));
  const label = (row: ParticipantView) => [t("header.otherConversation", { title: row.title, state: stateText(row, inCall, t) }),
    (row.unheard ?? 0) > 0 ? t("state.unheard", { n: row.unheard ?? 0 }) : null].filter(Boolean).join(" · ");
  const pick = (row: ParticipantView) => {
    // The one on the stage, or the call switching: nothing — focus and the tooltip stay.
    if (row.threadId === stage.threadId || row.switching) return;
    window.sidevoiceActions?.selectParticipant(row.threadId);
    closeConversations();
  };
  // The focused avatar's conversation gone: focus on the avatar now in its place, else "+".
  const focused = useRef<{ id: string; index: number } | null>(null);
  useLayoutEffect(() => {
    const was = focused.current;
    if (!was || shown.some((row) => row.threadId === was.id)) return;
    focused.current = null;
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected) return;
    (box.current?.querySelectorAll<HTMLElement>(".header-avatar")[was.index] ?? box.current?.querySelector<HTMLElement>(".header-new"))?.focus();
  });
  return (
    <div ref={box} className="header-conversations" onPointerDown={hold.start} onPointerUp={hold.end} onPointerCancel={hold.end}>
      {shown.map((row, index) => (
        // While the call switches it stays focusable (`aria-disabled`, not `disabled`), its tooltip with it.
        <button type="button" key={row.threadId} className="header-avatar" data-thread={row.threadId} aria-label={label(row)} title={label(row)}
          aria-pressed={row.threadId === stage.threadId} aria-disabled={row.switching || undefined} onClick={() => pick(row)}
          onFocus={() => { focused.current = { id: row.threadId, index }; }} onBlur={(event) => { if (event.currentTarget.isConnected) focused.current = null; }}>
          <ConversationAvatar row={row} />
        </button>
      ))}
      {!blocked && <NewConversation header />}
      {chevron && <ConversationsToggle t={t} hidden={hidden} />}
    </div>
  );
}

/* A phone's gear, at the header's right; on a desktop Settings sits at the conversations' foot, which presses this
 * button. The runtime opens Settings from #settings-open's own handler: React must not own that button's click (with an
 * onClick it resets the element's handler on every render), so its wrapper hears it. With agents waiting, Settings
 * then opens at theirs. */
function SettingsButton({ t }: { t: Translate }) {
  const news = useHighlights();
  const attention = useSettingsAttention();
  const label = attention ? t("settings.attention") : news.length ? t("highlights.gear", { n: news.length }) : t("header.settings");
  return (
    <span className="header-settings">
      {/* Settings' own trigger (aria-controls) on a phone: focus comes back here when what opened Settings has gone. */}
      <Button id="settings-open" variant="ghost" tone="neutral" size="icon" aria-label={label} title={label} aria-haspopup="dialog" aria-controls="language-settings">
        <SettingsIcon size={20} /><GearNewMark count={news.length} attention={attention} />
      </Button>
    </span>
  );
}

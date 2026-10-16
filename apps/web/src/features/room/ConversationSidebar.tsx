import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { CloseIcon, CloseUpIcon, ConversationsIcon, HarnessIcon, MachinesIcon, MoreIcon, SidebarCollapseIcon, SidebarExpandIcon, SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useSurface } from "../../lib/use-surface";
import { COMPACT_QUERY, isNarrow, NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { GearNewMark, useHighlights } from "../highlights/highlights";
import type { ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { conversationState, isCallRow, machineGroups, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { Tooltip } from "../../components/ui/Tooltip";
import { ConversationRows } from "./ConversationRows";
import { NewConversation } from "./NewConversation";
import { openSettings } from "../settings/open-settings";
import "./room.css";

/** How a conversation's harness is reached, when that matters; the harness itself is its mark, never its name. */
function harnessLine(row: ParticipantView) {
  return [row.model, row.effort].filter(Boolean).join(" · ") + (row.route ? (row.model ? " · " : "") + row.route : "") || null;
}

/** Asked for by the runtime when a call finds no conversation to land on. */
export const OPEN_CONVERSATIONS = "sidevoice-conversations-open";

/* What is talking in this room, grouped by the machine each conversation runs on, each with its agent's avatar and
 * the dot of its state. On a desktop it is a column that collapses into a rail of the same avatars, and stays as it
 * was left; with the transcript docked and no room for both, it is the rail, and opening it puts the transcript away.
 * On a phone (2026-10-10) there is no room for it beside the call: the header carries a few avatars, and this same
 * list drops from it as a dialog over the dimmed call — choosing a conversation, the chevron, a tap outside or Escape
 * puts it away, and focus goes back to what opened it, or, a conversation chosen, to its avatar in the header.
 * A compact desktop window (560–899px, a fine pointer: COMPACT_QUERY, 2026-10-15) has room for the rail alone: its
 * toggle opens the whole list over the dimmed stage, from the rail's own place, without moving the call or touching the
 * saved choice — a dialog as the phone's is, put away the same ways, focus back to the toggle or to the one chosen. */
/** `blocked`: nothing set up to talk to yet (the setup put off, or no machine): no conversations and no New
 *  conversation, only the brand and Settings (operator, 2026-10-16). */
export function ConversationSidebar({ blocked = false }: { blocked?: boolean } = {}) {
  // The conversation on the stage is the one marked in the list, whether or not the call has moved to it yet.
  const onStage = useStageConversation().threadId;
  const t = translator();
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const collapsed = useCallLayout((state) => state.sidebarCollapsed);
  const open = useCallLayout((state) => state.conversationsOpen);
  const transcriptOpen = useCallLayout((state) => state.transcriptOpen);
  const toggleSidebar = useCallLayout((state) => state.toggleSidebar);
  const closeTranscript = useCallLayout((state) => state.closeTranscript);
  const openConversations = useCallLayout((state) => state.openConversations);
  const close = useCallLayout((state) => state.closeConversations);
  const narrow = useMedia(NARROW_QUERY);
  const compact = useMedia(COMPACT_QUERY);
  // A compact window's transcript opens over the call, never beside it: it squeezes nothing.
  const crowded = useMedia(RAIL_WITH_TRANSCRIPT_QUERY) && transcriptOpen && !narrow && !compact;
  const rail = compact ? !open : collapsed || crowded;
  const modal = (narrow || compact) && open;
  const panel = useRef<HTMLElement>(null);

  // The list over the call belongs to the layout it opened in: the window turned into another one, it is put away.
  const layout = narrow ? "phone" : compact ? "compact" : "desktop";
  const laidOut = useRef(layout);
  useEffect(() => {
    if (laidOut.current === layout) return;
    laidOut.current = layout;
    close();
  }, [layout, close]);
  useEffect(() => {
    // On a desktop the list is always on screen; only a phone has to bring it down.
    const show = () => { if (isNarrow()) openConversations(); };
    window.addEventListener(OPEN_CONVERSATIONS, show);
    return () => window.removeEventListener(OPEN_CONVERSATIONS, show);
  }, [openConversations]);
  // The panel hangs from the header's lower edge, wherever a banner above the room has put it: measured once per
  // opening, before it paints.
  useLayoutEffect(() => {
    if (!modal || !narrow) return;
    const header = document.querySelector(".room-header");
    if (header) panel.current?.style.setProperty("--conversations-top", header.getBoundingClientRect().bottom + "px");
  }, [modal, narrow]);
  // Chosen on a phone, a conversation is in the header's row (its last slot if need be): focus goes to its avatar there,
  // not back to the chevron; on a compact desktop, to its avatar in the rail.
  const chosen = useRef<string | null>(null);
  useSurface({
    open: modal, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".participant-row[data-selected] .person:not(:disabled)")
      ?? panel.current?.querySelector<HTMLElement>(".person:not(:disabled)") ?? panel.current?.querySelector<HTMLElement>(".sidebar-close"),
    fallbackFocus: () => narrow
      ? document.querySelector<HTMLElement>("button.conversations-toggle") ?? document.querySelector<HTMLElement>(".room-header .header-new")
      : panel.current?.querySelector<HTMLElement>(".sidebar-collapse"),
    returnFocus: () => {
      const threadId = chosen.current;
      chosen.current = null;
      if (!threadId) return null;
      if (!narrow) return [...panel.current?.querySelectorAll<HTMLElement>(".participant-row") ?? []].find((row) => row.dataset.thread === threadId)?.querySelector<HTMLElement>(".person");
      return [...document.querySelectorAll<HTMLElement>(".room-header .header-avatar")].find((avatar) => avatar.dataset.thread === threadId);
    },
  });

  const select = (threadId: string) => {
    window.sidevoiceActions?.selectParticipant(threadId);
    if (modal) chosen.current = threadId;
    close();
  };
  // One toggle. Opening the rail opens the sidebar; with the docked transcript in the way, the transcript makes room. A
  // compact window opens and closes its list over the stage instead.
  const toggle = () => {
    if (compact) { if (open) close(); else openConversations(); return; }
    if (!rail) { toggleSidebar(); return; }
    if (collapsed) toggleSidebar();
    if (crowded) closeTranscript();
  };
  // The unread count is the row's badge, so the line under the title says the state alone; the tooltip says both. The
  // call's own conversation has none: what it says is heard.
  const unread = (row: ParticipantView) => row.unread > 0 && !isCallRow(row, inCall);

  return (
    <>
      <aside id="conversations" ref={panel} className="conversation-sidebar" data-collapsed={rail || undefined} data-open={open || undefined}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("sidebar.title")}>
        {/* The brand at the column's head, where the room has no header (VARIANTS layout "meet"); hidden otherwise. */}
        <div className="sidebar-brand"><SidevoiceMark size={22} /><span translate="no">Sidevoice</span></div>
        <div className="sidebar-head">
          <h2><ConversationsIcon />{t("sidebar.title")}</h2>
          <Tooltip action content={rail ? t("sidebar.expand") : t("sidebar.collapse")}>
            <Button variant="ghost" tone="neutral" size="icon-sm" className="sidebar-collapse" aria-controls="conversations" aria-expanded={!rail}
              aria-label={rail ? t("sidebar.expand") : t("sidebar.collapse")}
              onClick={toggle}>
              {rail ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
            </Button>
          </Tooltip>
          <Button variant="ghost" tone="neutral" size="icon-sm" className="sidebar-close" aria-label={t("sidebar.close")} title={t("sidebar.close")} onClick={close}>
            <CloseUpIcon />
          </Button>
        </div>
        <div id="participants" className="sidebar-body">
          {!blocked && machineGroups(participants).map((group) => {
            const machine = group.machine || t("sidebar.unknownMachine");
            return (
              <section className="sidebar-group" key={group.key} aria-label={machine}>
                <h3 className="sidebar-group-label" aria-hidden={rail || undefined}><MachinesIcon size={12} /><span translate="no">{machine}</span></h3>
                <ConversationRows
                  className="sidebar-rows"
                  rows={group.rows.map((row) => row.threadId === onStage && !row.selected ? { ...row, selected: true } : row)}
                  onSelect={select}
                  lead={(row) => <ConversationAvatar row={row} />}
                  tooltip={(row) => [row.title + " · " + stateText(row, inCall, t), harnessLine(row), row.detail, row.activityNote].filter(Boolean).join("\n\n")}
                  label={(row) => [row.title, stateText(row, inCall, t), (row.unheard ?? 0) > 0 ? t("state.unheard", { n: row.unheard ?? 0 }) : null].filter(Boolean).join(" · ")}
                  sub={(row) => (
                    <span className="sidebar-state" data-state={conversationState(row, inCall)}>
                      {row.harness && <HarnessIcon harness={row.harness} size={12} />}
                      <span className="sidebar-state-text">{stateText({ ...row, unread: 0 }, inCall, t)}</span>
                    </span>
                  )}
                  end={(row) => <>
                    {(row.unheard ?? 0) > 0 && <Badge tone="accent" className="sidebar-unread">{t("state.unheard", { n: row.unheard ?? 0 })}</Badge>}
                    {unread(row) && <Badge tone="accent" className="sidebar-unread">{t("state.unread", { n: row.unread })}</Badge>}
                  </>}
                  aside={(row) => (
                    <DropdownMenu label={t("sidebar.options", { title: row.title })} trigger={<Button variant="ghost" tone="neutral" size="icon-sm" className="participant-more" aria-label={t("sidebar.options", { title: row.title })}><MoreIcon /></Button>}>
                      <DropdownMenuItem danger onSelect={() => void window.sidevoiceActions?.closeParticipant(row.threadId)}><CloseIcon />{t("sidebar.closeConversation")}</DropdownMenuItem>
                    </DropdownMenu>
                  )}
                />
              </section>
            );
          })}
          {!blocked && !participants.length && <p className="sidebar-empty">{t("sidebar.empty")}</p>}
          {/* A new conversation follows the last one, in either layout. */}
          {!blocked && <div className="sidebar-new"><NewConversation rail={rail && !narrow} /></div>}
        </div>
        {/* Settings holds a desktop's foot (a phone has its gear in the header); what joins it later (notifications…)
            opens upward from here. A phone has no updates entry: its page picks up a new version when next opened. */}
        {!narrow && <div className="sidebar-foot">
          <SidebarSettings rail={rail} onOpen={close} />
        </div>}
      </aside>
      <div className="conversations-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

/** Settings at the conversations' foot: named beside the list, a gear in the rail, named by its label and its tooltip
 *  there; its mark when something is new. */
function SidebarSettings({ rail, onOpen }: { rail: boolean; onOpen: () => void }) {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const news = useHighlights();
  const label = news.length ? t("highlights.gear", { n: news.length }) : t("header.settings");
  return (
    // Settings' own trigger (aria-controls): closed, Settings gives focus back here when what opened it has gone.
    <Button variant="ghost" tone="neutral" size={rail ? "icon" : "md"} block={!rail} className="sidebar-settings" aria-label={label} title={label}
      aria-haspopup="dialog" aria-controls="language-settings"
      onClick={() => { onOpen(); openSettings({}, store); }}>
      <SettingsIcon size={20} />{!rail && <span>{t("header.settings")}</span>}<GearNewMark count={news.length} />
    </Button>
  );
}

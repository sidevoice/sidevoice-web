import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { CloseIcon, CloseUpIcon, ConversationsIcon, HarnessIcon, MoreIcon, SidebarCollapseIcon, SidebarExpandIcon, SettingsIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useSurface } from "../../lib/use-surface";
import { isNarrow, NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { GearNewMark, useHighlights } from "../highlights/highlights";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { conversationState, machineGroups, stateText } from "../call/conversation-state";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { ConversationRows } from "./ConversationRows";
import { NewConversation } from "./NewConversation";
import { hostTranslator } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { UpdateChipLine } from "../updates/UpdateNotice";
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
 * puts it away, and focus goes back to what opened it, or, a conversation chosen, to its avatar in the header. */
export function ConversationSidebar() {
  // The conversation on the stage is the one marked in the list, whether or not the call has moved to it yet.
  const onStage = useStageConversation().threadId;
  const t = callTranslator();
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
  const crowded = useMedia(RAIL_WITH_TRANSCRIPT_QUERY) && transcriptOpen && !narrow;
  const rail = collapsed || crowded;
  const modal = narrow && open;
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    // On a desktop the list is always on screen; only a phone has to bring it down.
    const show = () => { if (isNarrow()) openConversations(); };
    window.addEventListener(OPEN_CONVERSATIONS, show);
    return () => window.removeEventListener(OPEN_CONVERSATIONS, show);
  }, [openConversations]);
  // The panel hangs from the header's lower edge, wherever a banner above the room has put it: measured once per
  // opening, before it paints.
  useLayoutEffect(() => {
    if (!modal) return;
    const header = document.querySelector(".room-header");
    if (header) panel.current?.style.setProperty("--conversations-top", header.getBoundingClientRect().bottom + "px");
  }, [modal]);
  // Chosen on a phone, a conversation is in the header's row (its last slot if need be): focus goes to its avatar there,
  // not back to the chevron.
  const chosen = useRef<string | null>(null);
  useSurface({
    open: modal, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".participant-row[data-selected] .person:not(:disabled)")
      ?? panel.current?.querySelector<HTMLElement>(".person:not(:disabled)") ?? panel.current?.querySelector<HTMLElement>(".sidebar-close"),
    fallbackFocus: () => document.querySelector<HTMLElement>("button.conversations-toggle") ?? document.querySelector<HTMLElement>(".room-header .header-new"),
    returnFocus: () => {
      const threadId = chosen.current;
      chosen.current = null;
      return threadId ? [...document.querySelectorAll<HTMLElement>(".room-header .header-avatar")].find((avatar) => avatar.dataset.thread === threadId) : null;
    },
  });

  const select = (threadId: string) => {
    window.sidevoiceActions?.selectParticipant(threadId);
    if (modal) chosen.current = threadId;
    close();
  };
  // One toggle. Opening the rail opens the sidebar; with the docked transcript in the way, the transcript makes room.
  const toggle = () => {
    if (!rail) { toggleSidebar(); return; }
    if (collapsed) toggleSidebar();
    if (crowded) closeTranscript();
  };
  // The unread count is the row's badge, so the line under the title says the state alone; the tooltip says both.
  const unread = (row: ParticipantView) => row.unread > 0 && conversationState(row, inCall) !== "in-call";

  return (
    <>
      <aside id="conversations" ref={panel} className="conversation-sidebar" data-collapsed={rail || undefined} data-open={open || undefined}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("sidebar.title")}>
        {/* The brand at the column's head, where the room has no header (VARIANTS layout "meet"); hidden otherwise. */}
        <div className="sidebar-brand"><SidevoiceMark size={22} /><span translate="no">Sidevoice</span></div>
        <div className="sidebar-head">
          <h2><ConversationsIcon />{t("sidebar.title")}</h2>
          <Button variant="ghost" tone="neutral" size="icon-sm" className="sidebar-collapse" aria-controls="conversations" aria-expanded={!rail}
            aria-label={rail ? t("sidebar.expand") : t("sidebar.collapse")} title={rail ? t("sidebar.expand") : t("sidebar.collapse")}
            onClick={toggle}>
            {rail ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
          </Button>
          <Button variant="ghost" tone="neutral" size="icon-sm" className="sidebar-close" aria-label={t("sidebar.close")} title={t("sidebar.close")} onClick={close}>
            <CloseUpIcon />
          </Button>
        </div>
        <div id="participants" className="sidebar-body">
          {machineGroups(participants).map((group) => {
            const machine = group.machine || t("sidebar.unknownMachine");
            return (
              <section className="sidebar-group" key={group.key} aria-label={machine}>
                <h3 className="sidebar-group-label" aria-hidden={rail || undefined}><span translate="no">{machine}</span></h3>
                <ConversationRows
                  className="sidebar-rows"
                  rows={group.rows.map((row) => row.threadId === onStage && !row.selected ? { ...row, selected: true } : row)}
                  onSelect={select}
                  lead={(row) => <ConversationAvatar row={row} />}
                  tooltip={(row) => [row.title + " · " + stateText(row, inCall, t), harnessLine(row), row.detail, row.activityNote].filter(Boolean).join("\n\n")}
                  sub={(row) => (
                    <span className="sidebar-state" data-state={conversationState(row, inCall)}>
                      {row.harness && <HarnessIcon harness={row.harness} size={12} />}
                      <span className="sidebar-state-text">{stateText({ ...row, unread: 0 }, inCall, t)}</span>
                    </span>
                  )}
                  end={(row) => unread(row) && <Badge tone="accent" className="sidebar-unread">{t("state.unread", { n: row.unread })}</Badge>}
                  aside={(row) => (
                    <DropdownMenu label={t("sidebar.options", { title: row.title })} trigger={<Button variant="ghost" tone="neutral" size="icon-sm" className="participant-more" aria-label={t("sidebar.options", { title: row.title })}><MoreIcon /></Button>}>
                      <DropdownMenuItem danger onSelect={() => void window.sidevoiceActions?.closeParticipant(row.threadId)}><CloseIcon />{t("sidebar.closeConversation")}</DropdownMenuItem>
                    </DropdownMenu>
                  )}
                />
              </section>
            );
          })}
          {!participants.length && <p className="sidebar-empty">{t("sidebar.empty")}</p>}
          {/* A new conversation follows the last one, in either layout. */}
          <div className="sidebar-new"><NewConversation rail={rail && !narrow} /></div>
        </div>
        {/* Settings holds a desktop's foot (a phone has its gear in the header); what joins it later (notifications…)
            opens upward from here. A phone has no updates entry: its page picks up a new version when next opened. */}
        {!narrow && <div className="sidebar-foot">
          {/* An update waiting: its chip on its own line, above Settings. */}
          <UpdateChipLine rail={rail} />
          <SidebarSettings rail={rail} onOpen={close} />
        </div>}
      </aside>
      <div className="conversations-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

/** Settings at the conversations' foot: named beside the list, a gear in the rail — and beside an update's chip
 *  (`gear`, VARIANTS `update-notice` B2), named by its label and its tooltip as there; its mark when something is new. */
function SidebarSettings({ rail, onOpen, gear = false }: { rail: boolean; onOpen: () => void; gear?: boolean }) {
  const t = callTranslator();
  const hosts = hostTranslator();
  const store = useContext(RoomStoreContext);
  const news = useHighlights();
  const label = news.length ? hosts("highlights.gear", { n: news.length }) : t("header.settings");
  const icon = rail || gear;
  return (
    <Button variant="ghost" tone="neutral" size={icon ? "icon" : "md"} block={!icon} className="sidebar-settings" aria-label={label} title={label}
      onClick={() => { onOpen(); openSettings({}, store); }}>
      <SettingsIcon size={20} />{!icon && <span>{t("header.settings")}</span>}<GearNewMark count={news.length} />
    </Button>
  );
}

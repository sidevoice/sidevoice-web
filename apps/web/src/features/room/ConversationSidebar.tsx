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
import { conversationState, machineGroups, stateText, voiceSwitchState, voiceSwitchStateText } from "../call/conversation-state";
import { useVoiceSwitch } from "../../state/call-model";
import { RowHearIt } from "../call/HearIt";
import { selectInCall, useStageConversation } from "../call/stage-view";
import { ConversationRows } from "./ConversationRows";
import { NewConversation } from "./NewConversation";
import { openSettings } from "./RoomHeader";
import { hostTranslator } from "../settings/host-i18n";
import { UpdatesEntry, useUpdatesEntry } from "../updates/UpdatesEntry";
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
 * puts it away, and focus goes back to what opened it. */
export function ConversationSidebar() {
  // The conversation on the stage is the one marked in the list, whether or not the call has moved to it yet.
  const onStage = useStageConversation().threadId;
  const t = callTranslator();
  const participants = useRoomStore((state) => state.participants);
  const inCall = useRoomStore(selectInCall);
  const voiceSwitch = useVoiceSwitch();
  const collapsed = useCallLayout((state) => state.sidebarCollapsed);
  const open = useCallLayout((state) => state.conversationsOpen);
  const transcriptOpen = useCallLayout((state) => state.transcriptOpen);
  const toggleSidebar = useCallLayout((state) => state.toggleSidebar);
  const closeTranscript = useCallLayout((state) => state.closeTranscript);
  const openConversations = useCallLayout((state) => state.openConversations);
  const close = useCallLayout((state) => state.closeConversations);
  const narrow = useMedia(NARROW_QUERY);
  const updatesHere = useUpdatesEntry();
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
  useSurface({
    open: modal, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".participant-row[data-selected] .person:not(:disabled)")
      ?? panel.current?.querySelector<HTMLElement>(".person:not(:disabled)") ?? panel.current?.querySelector<HTMLElement>(".sidebar-close"),
    fallbackFocus: () => document.querySelector<HTMLElement>("button.conversations-toggle"),
  });

  const select = (threadId: string) => {
    window.sidevoiceActions?.selectParticipant(threadId);
    close();
  };
  // One toggle. Opening the rail opens the sidebar; with the docked transcript in the way, the transcript makes room.
  const toggle = () => {
    if (!rail) { toggleSidebar(); return; }
    if (collapsed) toggleSidebar();
    if (crowded) closeTranscript();
  };
  // The unread count is the row's badge, so the line under the title says the state alone; the tooltip says both.
  const unread = (row: ParticipantView) => row.unread > 0 && (voiceSwitch || conversationState(row, inCall) !== "in-call");
  // With the voice switch (call model B) each row says B's states — marks, working on every row, ready — and a row with
  // a mark offers "Hear it" between its unread badge and ⋯ (not in the rail: its avatar's hand says it there).
  const state = (row: ParticipantView) => (voiceSwitch ? voiceSwitchState(row) : conversationState(row, inCall));
  const words = (row: ParticipantView) => (voiceSwitch ? voiceSwitchStateText(row, t) : stateText(row, inCall, t));

  return (
    <>
      <aside id="conversations" ref={panel} className="conversation-sidebar" data-collapsed={rail || undefined} data-open={open || undefined}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("sidebar.title")}>
        {/* The brand at the column's head, where the room has no header (VARIANTS layout "meet"); hidden otherwise. */}
        <div className="sidebar-brand" translate="no"><SidevoiceMark size={22} /><span>Sidevoice</span></div>
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
                  tooltip={(row) => [row.title + " · " + words(row), harnessLine(row), row.detail, row.activityNote].filter(Boolean).join("\n\n")}
                  sub={(row) => (
                    <span className="sidebar-state" data-state={state(row)}>
                      {row.harness && <HarnessIcon harness={row.harness} size={12} />}
                      <span className="sidebar-state-text">{words({ ...row, unread: 0 })}</span>
                    </span>
                  )}
                  end={(row) => unread(row) && <Badge tone="accent" className="sidebar-unread">{t("state.unread", { n: row.unread })}</Badge>}
                  aside={(row) => (<>
                    {voiceSwitch && !(rail && !narrow) && <RowHearIt row={row} />}
                    <DropdownMenu label={t("sidebar.options", { title: row.title })} trigger={<Button variant="ghost" tone="neutral" size="icon-sm" className="participant-more" aria-label={t("sidebar.options", { title: row.title })}><MoreIcon /></Button>}>
                      <DropdownMenuItem danger onSelect={() => void window.sidevoiceActions?.closeParticipant(row.threadId)}><CloseIcon />{t("sidebar.closeConversation")}</DropdownMenuItem>
                    </DropdownMenu>
                  </>)}
                />
              </section>
            );
          })}
          {!participants.length && <p className="sidebar-empty">{t("sidebar.empty")}</p>}
          {/* A new conversation follows the last one, in either layout. */}
          <div className="sidebar-new"><NewConversation rail={rail && !narrow} /></div>
        </div>
        {/* Settings holds a desktop's foot (a phone has its gear in the header); what joins it later (notifications…)
            opens upward from here. */}
        {!narrow && <div className="sidebar-foot"><UpdatesEntry compact={rail} /><SidebarSettings rail={rail} onOpen={close} /></div>}
        {narrow && updatesHere === "panel" && <div className="sidebar-foot sidebar-foot--updates"><UpdatesEntry side="top" /></div>}
        {/* With the voice switch (call model B) a phone's call bar has no ⋮: its connection statistics are here, under the
            same id the runtime opens them by. */}
        {narrow && voiceSwitch && <div className="sidebar-foot sidebar-foot--stats">
          <Button id="stats-open" variant="ghost" tone="neutral" size="md" block onClick={close}>{t("header.stats")}</Button>
        </div>}
      </aside>
      <div className="conversations-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

/** Settings at the conversations' foot: named beside the list, a gear in the rail; its mark when something is new. */
function SidebarSettings({ rail, onOpen }: { rail: boolean; onOpen: () => void }) {
  const t = callTranslator();
  const hosts = hostTranslator();
  const news = useHighlights();
  const label = news.length ? hosts("highlights.gear", { n: news.length }) : t("header.settings");
  return (
    <Button variant="ghost" tone="neutral" size={rail ? "icon" : "md"} block={!rail} className="sidebar-settings" aria-label={label} title={label} onClick={() => { onOpen(); openSettings(); }}>
      <SettingsIcon size={20} />{!rail && <span>{t("header.settings")}</span>}<GearNewMark count={news.length} />
    </Button>
  );
}

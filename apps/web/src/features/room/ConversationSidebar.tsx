import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { CloseUpIcon, HARNESS_NAMES, HarnessIcon, MoreIcon, SidebarCollapseIcon, SidebarExpandIcon } from "../../components/ui/Icons";
import { useSurface } from "../../lib/use-surface";
import { isNarrow, NARROW_QUERY, RAIL_WITH_TRANSCRIPT_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator } from "../call/call-i18n";
import { ConversationAvatar } from "../call/ConversationAvatar";
import { conversationState, machineGroups, stateText } from "../call/conversation-state";
import { selectInCall } from "../call/stage-view";
import { ConversationRows } from "./ConversationRows";

/** The harness a conversation runs in, and how it is reached when that matters, by their own names. */
function harnessLine(row: ParticipantView) {
  const name = row.harness ? HARNESS_NAMES[row.harness] : null;
  return name ? name + (row.route ? " · " + row.route : "") : null;
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
  useSurface({
    open: modal, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".participant-row[data-selected] .person:not(:disabled)")
      ?? panel.current?.querySelector<HTMLElement>(".person:not(:disabled)") ?? panel.current?.querySelector<HTMLElement>(".sidebar-close"),
    fallbackFocus: () => document.querySelector<HTMLElement>("button.conversation-trigger"),
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

  return (
    <>
      <aside id="conversations" ref={panel} className="conversation-sidebar" data-collapsed={rail || undefined} data-open={open || undefined}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("sidebar.title")}>
        <div className="sidebar-head">
          <h2>{t("sidebar.title")}</h2>
          <button type="button" className="sidebar-collapse" aria-controls="conversations" aria-expanded={!rail}
            aria-label={rail ? t("sidebar.expand") : t("sidebar.collapse")} title={rail ? t("sidebar.expand") : t("sidebar.collapse")}
            onClick={toggle}>
            {rail ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
          </button>
          <button type="button" className="sidebar-close" aria-label={t("sidebar.close")} title={t("sidebar.close")} onClick={close}>
            <CloseUpIcon />
          </button>
        </div>
        <div id="participants" className="sidebar-body">
          {machineGroups(participants).map((group) => {
            const machine = group.machine || t("sidebar.unknownMachine");
            return (
              <section className="sidebar-group" key={group.key} aria-label={machine}>
                <h3 className="sidebar-group-label" aria-hidden={rail || undefined}><span translate="no">{machine}</span></h3>
                <ConversationRows
                  className="sidebar-rows"
                  rows={group.rows}
                  onSelect={select}
                  lead={(row) => <ConversationAvatar row={row} />}
                  tooltip={(row) => [row.title + " · " + stateText(row, inCall, t), harnessLine(row), row.detail, row.activityNote].filter(Boolean).join("\n\n")}
                  sub={(row) => <span className="sidebar-state" data-state={conversationState(row, inCall)}>{row.harness && <HarnessIcon harness={row.harness} size={11} />}{stateText(row, inCall, t)}</span>}
                  aside={(row) => (
                    <DropdownMenu label={t("sidebar.options", { title: row.title })} trigger={<Button variant="ghost" size="icon" className="participant-more" aria-label={t("sidebar.options", { title: row.title })}><MoreIcon /></Button>}>
                      <DropdownMenuItem danger onSelect={() => void window.sidevoiceActions?.closeParticipant(row.threadId)}>{t("sidebar.closeConversation")}</DropdownMenuItem>
                    </DropdownMenu>
                  )}
                />
              </section>
            );
          })}
          {!participants.length && <p className="sidebar-empty muted">{t("sidebar.empty")}</p>}
        </div>
      </aside>
      <div className="conversations-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

import { useRef } from "react";
import { useRoomStore } from "../../state/room-store";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useSurface } from "../../lib/use-surface";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { Composer } from "./Composer";
import { translator } from "../../i18n/translator";
import { MessageList } from "./MessageList";
import { useMarkTranscriptSeen } from "./transcript-unread";
import "./transcript.css";

/* The whole conversation, out of the call's way behind the call bar's button (2026-10-10): docked at the call's
 * right on a desktop, the call narrowing to make room; a sheet from the bottom on a phone, a dialog over the dimmed
 * call that holds focus until it closes. It opens on the latest message, with the text box always under it. It stays
 * mounted while closed — the runtime binds the text box by its ids — and is inert then. */
export function TranscriptPanel() {
  const t = translator();
  const conversation = useRoomStore((state) => state.conversation);
  const title = useRoomStore((state) => state.title);
  const open = useCallLayout((state) => state.transcriptOpen);
  const close = useCallLayout((state) => state.closeTranscript);
  const narrow = useMedia(NARROW_QUERY);
  const modal = narrow && open;
  const panel = useRef<HTMLElement>(null);
  useMarkTranscriptSeen();
  useSurface({
    open, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".transcript-close"),
    fallbackFocus: () => document.getElementById("transcript-toggle"),
  });
  return (
    <>
      <section id="transcript" ref={panel} className="transcript" data-open={open || undefined} inert={!open}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("transcript.title")}>
        <div className="transcript-grab" aria-hidden="true" />
        <header className="transcript-head">
          <div className="transcript-heading"><strong>{t("transcript.title")}</strong><span id="transcript-title" title={title} translate="no">{title}</span></div>
          <Button variant="ghost" tone="neutral" size="icon-sm" className="transcript-close" aria-label={t("transcript.close")} title={t("transcript.close")} onClick={close}><CloseIcon /></Button>
        </header>
        <MessageList conversation={conversation} visible={open} />
        <Composer narrow={narrow} />
      </section>
      <div className="transcript-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

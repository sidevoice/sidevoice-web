import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRoomStore } from "../../state/room-store";
import { NARROW_QUERY, useCallLayout, useMedia } from "../../state/call-layout";
import { useSurface } from "../../lib/use-surface";
import { Button } from "../../components/ui/Button";
import { CloseIcon, KeyboardIcon } from "../../components/ui/Icons";
import { conversationTranslator } from "./conversation-i18n";
import { MessageList } from "./MessageList";

/* The whole conversation, out of the call's way behind the call bar's button (2026-10-10): docked at the call's
 * right on a desktop, the call narrowing to make room; a sheet from the bottom on a phone, a dialog over the dimmed
 * call that holds focus until it closes. It opens on the latest message. It stays mounted while closed — the runtime
 * binds the text box by its ids — and is inert then. */
export function TranscriptPanel() {
  const t = conversationTranslator();
  const conversation = useRoomStore((state) => state.conversation);
  const title = useRoomStore((state) => state.title);
  const open = useCallLayout((state) => state.transcriptOpen);
  const close = useCallLayout((state) => state.closeTranscript);
  const modal = useMedia(NARROW_QUERY) && open;
  const panel = useRef<HTMLElement>(null);
  useSurface({
    open, close, container: panel, modal,
    initialFocus: () => panel.current?.querySelector<HTMLElement>(".transcript-close"),
    fallbackFocus: () => document.getElementById("transcript-toggle"),
  });
  // On a phone the text box is away until it is asked for: a keyboard button opens it, and sending — or
  // leaving it empty — puts it away again, so the conversation keeps the height (2026-09-26).
  const [composing, setComposing] = useState(false);
  const composer = useRef<HTMLFormElement>(null);
  // Shown and focused inside the tap itself: the phone only raises its keyboard for a focus a gesture made.
  const compose = () => {
    flushSync(() => setComposing(true));
    composer.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  };
  return (
    <>
      <section id="transcript" ref={panel} className="transcript" data-open={open || undefined} inert={!open}
        role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={t("transcript.title")}>
        <div className="transcript-grab" aria-hidden="true" />
        <div className="transcript-head">
          <div className="transcript-heading"><strong>{t("transcript.title")}</strong><span id="transcript-title" className="muted" title={title} translate="no">{title}</span></div>
          <button type="button" className="compose-toggle" hidden={composing} aria-label={t("transcript.compose")} title={t("transcript.compose")}
            onClick={compose}><KeyboardIcon /></button>
          <Button variant="ghost" size="icon" className="transcript-close" aria-label={t("transcript.close")} title={t("transcript.close")} onClick={close}><CloseIcon /></Button>
        </div>
        <MessageList conversation={conversation} visible={open} />
        <form id="text-composer" className="text-composer" ref={composer} data-open={composing || undefined}
          onSubmitCapture={() => setComposing(false)}
          onBlurCapture={(event) => { const next = event.relatedTarget as Node | null; if (next && composer.current?.contains(next)) return; if (!composer.current?.querySelector<HTMLTextAreaElement>("textarea")?.value.trim()) setComposing(false); }}><textarea id="text-message" rows={2} maxLength={12000} aria-label={t("transcript.message")} placeholder={t("transcript.placeholder")} disabled /><Button id="text-send" type="submit" variant="primary" disabled aria-label={t("transcript.sendLabel")}>{t("transcript.send")}</Button></form>
      </section>
      <div className="transcript-scrim" data-open={open || undefined} aria-hidden="true" onClick={close} />
    </>
  );
}

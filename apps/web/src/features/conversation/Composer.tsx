import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";
import { conversationTranslator } from "./conversation-i18n";

/* The text box is always there, under the conversation (2026-10-11): one row empty, growing with what is written up to
 * eight (five on a phone), never resized by hand. The runtime owns it by its ids — it sends the form, reads and clears
 * the box's value, and enables both — so React renders it once and never touches its value or its disabled state. */
export function Composer({ narrow }: { narrow: boolean }) {
  const t = conversationTranslator();
  const form = useRef<HTMLFormElement>(null);

  // The runtime clears the box by setting its value once the text is sent, and no input event follows: the box kept
  // the height of what was sent. Right after, it always sets the form's state again (enabled, placeholder), so that
  // write is the moment to measure the box again — the way it measures itself as it is typed into.
  useEffect(() => {
    const node = form.current;
    const box = node?.querySelector("textarea");
    if (!node || !box) return;
    const observer = new MutationObserver(() => box.dispatchEvent(new Event("input", { bubbles: true })));
    observer.observe(node, { subtree: true, attributes: true, attributeFilter: ["disabled", "placeholder"] });
    return () => observer.disconnect();
  }, []);

  return (
    <form id="text-composer" className="text-composer" ref={form}>
      <Textarea id="text-message" minRows={1} maxRows={narrow ? 5 : 8} maxLength={12000} aria-label={t("transcript.message")}
        placeholder={t("transcript.placeholder")} disabled />
      <Button id="text-send" type="submit" variant="primary" disabled aria-label={t("transcript.sendLabel")}>{t("transcript.send")}</Button>
    </form>
  );
}

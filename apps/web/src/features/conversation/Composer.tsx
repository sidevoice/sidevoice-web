import { useEffect, useRef, useState } from "react";
import { SendIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";
import { translator } from "../../i18n/translator";

/* The text box is always there, under the conversation (2026-10-11), as a call app's chat has it: a rounded field
 * pinned at the panel's foot with Send as an icon at its end, one row empty, growing with what is written up to eight
 * (five on a phone), never resized by hand. The runtime owns it by its ids — it sends the form, reads and clears
 * the box's value, and enables both — so React renders it once and never touches its value or its disabled state. */
export function Composer({ narrow }: { narrow: boolean }) {
  const t = translator();
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

  // Send waits for something to send, as well as for the runtime: empty, it says so to assistive tech too.
  const [empty, setEmpty] = useState(true);
  return (
    <form id="text-composer" className="text-composer" ref={form}>
      <div className="composer-field">
        <Textarea id="text-message" minRows={1} maxRows={narrow ? 5 : 8} maxLength={12000} aria-label={t("transcript.message")}
          placeholder={t("transcript.placeholder")} disabled onInput={(event) => setEmpty(!event.currentTarget.value.trim())} />
        <Button id="text-send" type="submit" variant="ghost" size="icon-sm" className="composer-send" disabled aria-disabled={empty || undefined}
          data-empty={empty || undefined} aria-label={t("transcript.sendLabel")} title={t("transcript.sendLabel")}><SendIcon /></Button>
      </div>
    </form>
  );
}

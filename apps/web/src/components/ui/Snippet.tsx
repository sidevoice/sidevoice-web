import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, WarningIcon } from "./Icons";
import { translator } from "../../i18n/translator";

/* Something to copy as it is, in one of two kinds and no other: a Snippet is for a terminal or a config file
 * (monospace; it wraps, and scrolls once it is tall), a Quote is a phrase to say to an agent, between the landing's
 * guillemets (landing: .pair-snippet--message). Either has one copy button that says how the copy went by turning into
 * a ✓ for about a second and a half, the same words said to a screen reader; nothing else appears, so nothing moves.
 * Where the clipboard API is not there (a page over plain http) the older way copies instead. If both fail, the text is
 * selected for the person to copy, and "Select and copy" shows by the button — in words, on a phone too — for about four
 * seconds. A tap or a click on the text selects all of it, too.
 *
 * The button is faint until the pointer is over the snippet or the keyboard is in it, then solid. */


/** How long the button says how the copy went before it is the copy button again: a failure, longer — it asks for
 *  something. */
export const COPY_FEEDBACK_MS = 1500;
export const COPY_FAILED_MS = 4000;

/** The older way to copy, where the clipboard API is not (a page over plain http): a hidden field, selected, copied. */
function legacyCopy(text: string) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed"; field.style.opacity = "0"; field.style.pointerEvents = "none";
  // Inside the open dialog where there is one: focus may not leave a modal.
  (document.querySelector("dialog[open]") ?? document.body).appendChild(field);
  field.select();
  let done = false;
  try { done = document.execCommand("copy"); } catch { done = false; }
  field.remove();
  return done;
}

/** Selects all of `element`'s text, for the person to copy by hand. */
function selectAll(element: Element | null) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export type CopyFeedback = "copied" | "failed";

type CopyProps = {
  text: string;
  /** The copy button's name, saying what it copies; "Copy" when there is only one thing it could be. */
  label?: string;
  /** Keeps the button in one feedback state (the design-system page's specimens); otherwise it is its own. */
  feedback?: CopyFeedback;
};

function useCopy(text: string, target: React.RefObject<HTMLElement | null>) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    let next: CopyFeedback = "copied";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(text);
    } catch {
      if (!legacyCopy(text)) next = "failed";
    }
    if (next === "failed") selectAll(target.current);
    window.clearTimeout(timer.current);
    setFeedback(next);
    timer.current = window.setTimeout(() => setFeedback(null), next === "failed" ? COPY_FAILED_MS : COPY_FEEDBACK_MS);
  }
  return [feedback, copy] as const;
}

/** The copy button, and what it says (politely) to a screen reader, hidden from sight. */
function CopyButton({ text, label, feedback: pinned, target }: CopyProps & { target: React.RefObject<HTMLElement | null> }) {
  const t = translator();
  const [own, copy] = useCopy(text, target);
  const feedback = pinned ?? own;
  const name = label ?? t("ui.copy");
  const said = feedback === "copied" ? t("ui.copied") : feedback === "failed" ? t("ui.copyFailed") : "";
  return <>
    <button type="button" className="ui-copy-button" data-state={feedback ?? undefined} aria-label={name} title={said || name} onClick={() => void copy()}>
      {feedback === "copied" ? <CheckIcon size={16} /> : feedback === "failed" ? <WarningIcon size={16} /> : <CopyIcon size={16} />}
    </button>
    {/* Failed, it says what to do in words by the button, not only as a warning sign. */}
    {feedback === "failed" && <span className="ui-copy-failed" aria-hidden="true">{said}</span>}
    <span className="ui-copy-live" role="status">{said}</span>
  </>;
}

/** A command for a terminal, or a file's lines (JSON, TOML), in monospace. */
export function Snippet(props: CopyProps) {
  const text = useRef<HTMLElement>(null);
  return (
    <div className="ui-copy ui-snippet">
      <pre className="ui-snippet-text"><code ref={text}>{props.text}</code></pre>
      <CopyButton {...props} target={text} />
    </div>
  );
}

/** A phrase to say to an agent, quoted. */
export function Quote(props: CopyProps) {
  const text = useRef<HTMLParagraphElement>(null);
  return (
    <div className="ui-copy ui-quote">
      <blockquote className="ui-quote-box"><p className="ui-quote-text" ref={text}>{props.text}</p></blockquote>
      <CopyButton {...props} target={text} />
    </div>
  );
}

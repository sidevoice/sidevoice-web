import { useEffect, useRef, useState } from "react";
import { useVariant } from "../../lib/variants";
import { CheckIcon, CopyIcon, WarningIcon } from "./Icons";
import { uiTranslator } from "./ui-i18n";

/* Something to copy as it is, in one of two kinds and no other: a Snippet is for a terminal or a config file
 * (monospace; it wraps, and scrolls once it is tall), a Quote is a phrase to say to an agent, between the landing's
 * guillemets (landing: .pair-snippet--message). Either has one copy button that says how the copy went by turning into
 * a ✓, or a warning when the clipboard refuses, for about a second and a half, the same words said to a screen reader;
 * nothing else appears, so nothing moves. A tap or a click on the text selects all of it, for when copying failed.
 *
 * How visible the button is waits on the preview's variant (VARIANTS `copy-button`): always; faint until the pointer is
 * over the snippet; or not shown until then, though always on a touch screen. Keyboard focus always shows it. */

export const COPY_BUTTON = ["visible", "faint", "hover"] as const;

/** How long the button says how the copy went before it is the copy button again. */
export const COPY_FEEDBACK_MS = 1500;

export type CopyFeedback = "copied" | "failed";

type CopyProps = {
  text: string;
  /** The copy button's name, saying what it copies; "Copy" when there is only one thing it could be. */
  label?: string;
  /** Keeps the button in one feedback state (the design-system page's specimens); otherwise it is its own. */
  feedback?: CopyFeedback;
};

function useCopy(text: string) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    let next: CopyFeedback = "copied";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    window.clearTimeout(timer.current);
    setFeedback(next);
    timer.current = window.setTimeout(() => setFeedback(null), COPY_FEEDBACK_MS);
  }
  return [feedback, copy] as const;
}

/** The copy button, and what it says (politely) to a screen reader, hidden from sight. */
function CopyButton({ text, label, feedback: pinned }: CopyProps) {
  const t = uiTranslator();
  const [own, copy] = useCopy(text);
  const feedback = pinned ?? own;
  const name = label ?? t("ui.copy");
  const said = feedback === "copied" ? t("ui.copied") : feedback === "failed" ? t("ui.copyFailed") : "";
  return <>
    <button type="button" className="ui-copy-button" data-state={feedback ?? undefined} aria-label={name} title={said || name} onClick={() => void copy()}>
      {feedback === "copied" ? <CheckIcon size={16} /> : feedback === "failed" ? <WarningIcon size={16} /> : <CopyIcon size={16} />}
    </button>
    <span className="ui-copy-live" role="status">{said}</span>
  </>;
}

/** A command for a terminal, or a file's lines (JSON, TOML), in monospace. */
export function Snippet(props: CopyProps) {
  const variant = useVariant("copy-button", COPY_BUTTON);
  return (
    <div className="ui-copy ui-snippet" data-copy-button={variant}>
      <pre className="ui-snippet-text"><code>{props.text}</code></pre>
      <CopyButton {...props} />
    </div>
  );
}

/** A phrase to say to an agent, quoted. */
export function Quote(props: CopyProps) {
  const variant = useVariant("copy-button", COPY_BUTTON);
  return (
    <div className="ui-copy ui-quote" data-copy-button={variant}>
      <blockquote className="ui-quote-box"><p className="ui-quote-text">{props.text}</p></blockquote>
      <CopyButton {...props} />
    </div>
  );
}

import { useState } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon, CopyIcon } from "./Icons";
import { uiTranslator } from "./ui-i18n";

/* Something to copy as it is, with the button that copies it and turns into a check once it has. A `message` is a
 * sentence to say to an agent, quoted as the landing quotes it (landing: .pair-snippet--message); a `command` is a line
 * for a terminal. Either is selected whole on a tap, for when the clipboard is not allowed. */
export function Snippet({ text, kind = "message", label }: { text: string; kind?: "message" | "command"; label?: string }) {
  const t = uiTranslator();
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied("done"); }
    catch { setCopied("failed"); }
  }
  const name = label ?? t("ui.copy");
  const Text = kind === "message" ? "p" : "code";
  const Box = kind === "message" ? "blockquote" : "div";
  return (
    <div className="ui-snippet-wrap">
      <Box className={cn("ui-snippet", "ui-snippet--" + kind)}>
        <Text className="ui-snippet-text">{text}</Text>
        <button type="button" className="ui-snippet-copy" data-state={copied || undefined} aria-label={name} title={name} onClick={() => void copy()}>
          {copied === "done" ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        </button>
      </Box>
      <p className="ui-snippet-note" role="status" data-state={copied || undefined}>{copied === "done" ? t("ui.copied") : copied === "failed" ? t("ui.copyFailed") : ""}</p>
    </div>
  );
}

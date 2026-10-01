import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { CopyIcon } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import type { Dot, Phrase } from "../../state/hosts/host-list";

export function HostDot({ dot, label }: { dot: Dot; label?: string }) {
  return <span className="host-dot" data-dot={dot} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function PhraseText({ phrase }: { phrase: Phrase | null | undefined }) {
  const t = useT();
  if (!phrase) return null;
  const params = { ...phrase.params };
  if (typeof params.unit === "string") params.unit = t("unit." + params.unit);
  return <>{t(phrase.key, params)}</>;
}

/** A `<dialog>` that follows `open`: shown modal while true; Escape asks `onCancel` instead of closing by itself. */
export function useModal(open: boolean, onCancel: () => void): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement | null>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
    if (!open && dialog.open) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onEscape = (event: Event) => { event.preventDefault(); cancel.current(); };
    dialog.addEventListener("cancel", onEscape);
    return () => dialog.removeEventListener("cancel", onEscape);
  }, []);
  return ref;
}

/** Copies `text` and says so for a moment. */
export function CopyButton({ text, label, size = "compact" }: { text: string | (() => string); label?: string; size?: "compact" | "default" }) {
  const t = useT();
  const [state, setState] = useState<"" | "yes" | "no">("");
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => setState(""), 1800);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <Button variant="ghost" size={size} onClick={async () => {
      try { await navigator.clipboard.writeText(typeof text === "function" ? text() : text); setState("yes"); } catch { setState("no"); }
    }}>
      <CopyIcon size={14} /> {state === "yes" ? t("common.copied") : state === "no" ? t("common.copyFailed") : label ?? t("common.copy")}
    </Button>
  );
}

export function formatWhen(seconds: number | null | undefined, now: number, language: string): string {
  if (!seconds) return "—";
  const elapsed = Math.round(now / 1000 - seconds);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (Math.abs(elapsed) < 60) return rtf.format(-elapsed, "second");
  if (Math.abs(elapsed) < 3600) return rtf.format(-Math.round(elapsed / 60), "minute");
  if (Math.abs(elapsed) < 86400) return rtf.format(-Math.round(elapsed / 3600), "hour");
  return rtf.format(-Math.round(elapsed / 86400), "day");
}

export function bytesText(bytes: number, language: string): string {
  const big = bytes >= 1e9;
  return new Intl.NumberFormat(language, { style: "unit", unit: big ? "gigabyte" : "megabyte", maximumFractionDigits: big ? 1 : 0 }).format(big ? bytes / 1e9 : bytes / 1e6);
}

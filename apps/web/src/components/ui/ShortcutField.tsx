import { useEffect } from "react";
import { recordingShortcut } from "../../state/shortcuts";
import { Keys } from "./Keycaps";
import { WarningIcon } from "./Icons";

/* The field a shortcut is recorded in. The whole field is the button: a click starts recording (it turns accent and says
 * what to press; Esc, or another click, stops it). Set, it holds the keys as caps, a Default button that restores the
 * default when it is not the one, and a round quiet × that clears it; empty, it says "Record shortcut". A refused key is
 * the standard field error: a red border and the reason under the field. While it records, no key is the room's own
 * (state/shortcuts.ts `recordingShortcut`). */

export interface ShortcutFieldProps {
  /** Its name for a screen reader: what it sets. */
  label: string;
  /** The keys as they read ("⌃⌥M", "Ctrl+Alt+M", "Right ⌥"); null when none is set. */
  combo: string | null;
  /** How a single key is pressed (hold, tap, double press), written small after it. */
  how?: string;
  recording: boolean;
  /** What it says while it records. */
  recordingText: string;
  placeholder: string;
  /** Why the key just pressed cannot be the shortcut. */
  error?: string | null;
  errorId?: string;
  onToggle(): void;
  /** Clears it; no × without. */
  onClear?(): void;
  clearLabel: string;
  /** Restores the default; no Default button without (the caller offers it only when the shortcut is not the default). */
  onDefault?(): void;
  defaultLabel: string;
  defaultTitle?: string;
  escLabel: string;
  disabled?: boolean;
}

export function ShortcutField({ label, combo, how, recording, recordingText, placeholder, error, errorId, onToggle, onClear, clearLabel, onDefault, defaultLabel, defaultTitle, escLabel, disabled }: ShortcutFieldProps) {
  useEffect(() => {
    if (!recording) return;
    recordingShortcut(true);
    return () => { recordingShortcut(false); };
  }, [recording]);
  const state = recording ? "recording" : combo ? "set" : "empty";
  return <span className="ui-shortcut-wrap">
    <span className="ui-shortcut" data-state={state} data-invalid={error ? true : undefined}>
      <button type="button" className="ui-shortcut-field" disabled={disabled} aria-label={`${label}: ${combo ? (how ? `${combo} (${how})` : combo) : placeholder}`}
        aria-pressed={recording} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onClick={onToggle}>
        {recording
          ? <><span className="ui-shortcut-rec"><i aria-hidden />{recordingText}</span><span className="ui-shortcut-esc" aria-hidden>{escLabel}</span></>
          : combo ? <Keys combo={combo} how={how} /> : <span className="ui-shortcut-placeholder">{placeholder}</span>}
      </button>
      {!recording && onDefault && <button type="button" className="ui-shortcut-default" title={defaultTitle} onClick={onDefault}>{defaultLabel}</button>}
      {!recording && combo && onClear && <button type="button" className="ui-shortcut-clear" aria-label={clearLabel} title={clearLabel} onClick={onClear}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>}
    </span>
    {error && <span className="ui-field-error ui-shortcut-error" id={errorId} role="alert"><WarningIcon />{error}</span>}
  </span>;
}

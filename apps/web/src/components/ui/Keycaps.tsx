import type { ReactNode } from "react";
import { host } from "../../host";
import { shortcutCombo, type ShortcutId } from "../../state/shortcuts";
import { useBinding } from "../../state/use-shortcuts";
import { translator, type Translate } from "../../i18n/translator";

/** A shortcut as key caps, one per key: `⇧⌘M` and `Ctrl+Shift+M` alike become separate caps; words (Space, Press keys)
 *  stay one. A screen reader hears the combination as written (aria-label). `how` is what the key does when it is a single
 *  key (hold, tap, double press), written small after the caps. */
export function Keys({ combo, state, how }: { combo: string; state?: string; how?: string }) {
  return <kbd className="shortcut-keys" data-state={state} aria-label={how ? `${combo} (${how})` : combo}>
    {capsOf(combo).map((key, index) => <kbd key={index} className="shortcut-key" aria-hidden>{key}</kbd>)}
    {how && <span className="shortcut-how" aria-hidden>{how}</span>}
  </kbd>;
}

/** The caps a combination is drawn as. */
export function capsOf(combo: string): string[] {
  return combo.includes("+") && combo !== "+" ? combo.split("+").filter(Boolean)
    : /^[⌘⌥⇧⌃]+./u.test(combo) ? [...combo.match(/^[⌘⌥⇧⌃]+/u)![0]].concat(combo.replace(/^[⌘⌥⇧⌃]+/u, "")) : [combo];
}

/** A room shortcut's key caps, written with the modifier this host uses, following the shortcuts table: none when the
 *  person cleared it. */
export function ShortcutKeys({ id, t = translator() }: { id: ShortcutId; t?: Translate }) {
  useBinding(id);
  const combo = shortcutCombo(id, host().identity.shortcutModifier, t("settings.shortcuts.space"));
  return combo ? <Keys combo={combo} /> : null;
}

/** A tooltip's content: the label, then the keys that do the same, e.g. "Skip  [S]". A cleared shortcut shows no keys.
 *  `hint`: a second, lighter line under it. */
export function shortcutTip(label: ReactNode, id: ShortcutId, hint?: ReactNode): ReactNode {
  const line = <span className="shortcut-tip">{hint ? <span className="shortcut-tip-label">{label}</span> : label}<ShortcutKeys id={id} /></span>;
  return hint ? <span className="shortcut-tip-stack">{line}<span className="shortcut-tip-hint">{hint}</span></span> : line;
}
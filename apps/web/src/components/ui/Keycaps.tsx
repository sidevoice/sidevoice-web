import type { ReactNode } from "react";
import { deviceKind } from "../../state/device-name";
import { shortcutCombo, type ShortcutId } from "../../state/shortcuts";
import { translator, type Translate } from "../../i18n/translator";

/** A shortcut as key caps, one per key: `⇧⌘M` and `Ctrl+Shift+M` alike become separate caps; words (Space, Press keys)
 *  stay one. A screen reader hears the combination as written (aria-label). */
export function Keys({ combo, state }: { combo: string; state?: string }) {
  const keys = combo.includes("+") ? combo.split("+").filter(Boolean)
    : /^[⌘⌥⇧⌃]+./u.test(combo) ? [...combo.match(/^[⌘⌥⇧⌃]+/u)![0]].concat(combo.replace(/^[⌘⌥⇧⌃]+/u, "")) : [combo];
  return <kbd className="shortcut-keys" data-state={state} aria-label={combo}>
    {keys.map((key, index) => <kbd key={index} className="shortcut-key" aria-hidden>{key}</kbd>)}
  </kbd>;
}

export const isMac = () => /^(Mac|iPhone|iPad)$/.test(deviceKind().os);

/** A room shortcut's key caps, as this system writes them. */
export function ShortcutKeys({ id, t = translator() }: { id: ShortcutId; t?: Translate }) {
  return <Keys combo={shortcutCombo(id, isMac(), t("settings.shortcuts.space"))} />;
}

/** A tooltip's content: the label, then the keys that do the same, e.g. "Skip  [S]". */
export function shortcutTip(label: ReactNode, id: ShortcutId): ReactNode {
  return <span className="shortcut-tip">{label}<ShortcutKeys id={id} /></span>;
}

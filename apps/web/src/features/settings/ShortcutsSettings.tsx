import { Fragment, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Group, Row, Section } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { ShortcutField } from "../../components/ui/ShortcutField";
import { useShortcutRecorder, type Captured } from "../../components/ui/use-shortcut-recorder";
import { host, type GlobalShortcut, type HeadsetPress, type HeadsetStatus, type ShortcutAction, type ShortcutsStatus } from "../../host";
import { uiLanguage, type MessageKey, type Translate } from "../../i18n/translator";
import {
  composeAccelerator, acceleratorKey, globalAllowed, isFnKey, isSingle, parseAccelerator, readAccelerator, sameAccelerator, singleAccelerator,
  type Trigger, type Words,
} from "../../state/accelerators";
import {
  SHORTCUTS, bindingClash, bindingCombo, isDefault, keyName, macModifier, resetBinding, sameBinding, setBinding, type Binding, type ShortcutId,
} from "../../state/shortcuts";
import { useBindings } from "../../state/use-shortcuts";

/* Shortcuts, a Settings section of their own: the keys for the microphone, by where they work.
 *  - Anywhere on your computer: the desktop app's global shortcuts (`host.shortcuts`; an app that has only `host.muteShortcut`
 *    shows its mute row alone), each recorded by pressing it, or by tapping a single key once or twice.
 *  - Headset buttons: what a press and a double press of the headset's button do, where the app reports a headset path.
 *  - In Sidevoice: the keys the room answers while it is in front, the same field, kept with the web's settings
 *    (state/shortcuts.ts, which the key handler, the tooltips and these rows all read).
 * A phone has none of them, and no section. */

/** A mouse or a trackpad, where a keyboard is all but certain; a phone, or a tablet on its own, has neither, and no key
 *  here would reach the room there. */
export const KEYBOARD_QUERY = "(any-pointer: fine)";

function subscribeKeyboard(listener: () => void) {
  const query = globalThis.matchMedia?.(KEYBOARD_QUERY);
  query?.addEventListener?.("change", listener);
  return () => query?.removeEventListener?.("change", listener);
}
const keyboardLikely = () => !!globalThis.matchMedia?.(KEYBOARD_QUERY)?.matches;

/** Whether Shortcuts shows: in the desktop app, where it offers shortcuts, or wherever a keyboard is likely
 *  (KEYBOARD_QUERY); never on a phone. */
export function useShortcutsSection() {
  const keyboard = useSyncExternalStore(subscribeKeyboard, keyboardLikely, () => false);
  return !!(host().shortcuts || host().muteShortcut) || keyboard;
}

/* ----- the host's global shortcuts ----- */

const ACTIONS: { action: ShortcutAction; label: MessageKey; hint: MessageKey; singles: readonly Trigger[] }[] = [
  { action: "holdToTalk", label: "settings.shortcuts.holdToTalk", hint: "settings.shortcuts.globalHoldHint", singles: ["hold"] },
  { action: "mute", label: "settings.shortcuts.mute", hint: "settings.shortcuts.globalMuteHint", singles: ["tap"] },
  { action: "oneTurn", label: "settings.shortcuts.oneTurn", hint: "settings.shortcuts.globalOneTurnHint", singles: ["tap", "double"] },
];

const EMPTY_SHORTCUT: GlobalShortcut = { accelerator: null, label: null, state: "off", alternatives: [], voiceOver: false };

interface Global {
  status: ShortcutsStatus | null;
  actions: ShortcutAction[];
  set(action: ShortcutAction, accelerator: string | null): Promise<GlobalShortcut>;
  request?(): Promise<void>;
  setHeadset?(partial: Partial<HeadsetStatus>): Promise<void>;
  record?(action: ShortcutAction): Promise<string | null>;
}

/** The host's global shortcuts and the headset, following what it reports; null where it has none. An app with only the
 *  older `muteShortcut` has its mute row alone. */
function useGlobal(): Global | null {
  const bridge = host().shortcuts;
  const legacy = host().muteShortcut;
  const [status, setStatus] = useState<ShortcutsStatus | null>(null);
  useEffect(() => {
    let gone = false;
    if (bridge) {
      // A snapshot older than the last event must not win: an event that arrives while `get` is in flight is newer.
      let heard = false;
      void bridge.get().then((value) => { if (!gone && !heard) setStatus(value); }).catch(() => {});
      const stop = bridge.subscribe?.((value) => { heard = true; setStatus(value); });
      return () => { gone = true; stop?.(); };
    }
    if (legacy) {
      const only = (mute: GlobalShortcut): ShortcutsStatus => ({ shortcuts: { mute, holdToTalk: EMPTY_SHORTCUT, oneTurn: EMPTY_SHORTCUT }, permission: null, headset: null });
      let heard = false;
      void legacy.get().then((value) => { if (!gone && !heard) setStatus(only(value)); }).catch(() => {});
      const stop = legacy.subscribe?.((value) => { heard = true; setStatus(only(value)); });
      return () => { gone = true; stop?.(); };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const merge = useCallback((action: ShortcutAction, value: GlobalShortcut) => setStatus((now) => now && { ...now, shortcuts: { ...now.shortcuts, [action]: value } }), []);
  if (!bridge && !legacy) return null;
  if (bridge) return {
    status, actions: ["holdToTalk", "mute", "oneTurn"],
    set: async (action, accelerator) => { const value = await bridge.set(action, accelerator); merge(action, value); return value; },
    request: bridge.request ? async () => { const next = await bridge.request!(status?.permission?.kind ?? "inputMonitoring"); setStatus(next); } : undefined,
    setHeadset: bridge.setHeadset ? async (partial) => { const next = await bridge.setHeadset!(partial); setStatus(next); } : undefined,
    record: bridge.record ? (action) => bridge.record!(action) : undefined,
  };
  return {
    status, actions: ["mute"],
    set: async (action, accelerator) => { const value = await legacy!.set(accelerator); merge(action, value); return value; },
  };
}

function useWords(t: Translate): Words {
  return { mac: macModifier(host().identity.shortcutModifier), space: t("settings.shortcuts.space"),
    side: (side, name) => t(side === "right" ? "settings.shortcuts.right" : "settings.shortcuts.left", { key: name }) };
}

/** What the system's own mute shortcut is by default: ⌃⌥M on a Mac, Ctrl+Alt+Shift+M elsewhere (Ctrl+Shift+M is Teams' and
 *  Discord's, and Ctrl+Alt+letter is AltGr on many layouts). The app owns the default it registers; this is the one the
 *  Default button restores. */
export function defaultGlobalMute(mac: boolean) {
  return mac ? "Ctrl+Alt+M" : "Ctrl+Alt+Shift+M";
}

export function ShortcutsSettings({ t }: { t: Translate }) {
  const global = useGlobal();
  const words = useWords(t);
  return <Section id="shortcuts" title={t("settings.section.shortcuts")} description={t("settings.shortcuts.description")}>
    {global && <GlobalGroup t={t} global={global} words={words} />}
    {global?.status?.headset && <HeadsetGroup t={t} global={global} headset={global.status.headset} />}
    <InAppGroup t={t} words={words} />
  </Section>;
}

/** The text `template` with `{name}` slots and **bold** marked, as nodes. */
function rich(template: string, slots: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\}|\*\*[^*]+\*\*)/).filter(Boolean).map((piece, index) => {
    const slot = /^\{(\w+)\}$/.exec(piece);
    if (slot && slots[slot[1]] !== undefined) return <Fragment key={index}>{slots[slot[1]]}</Fragment>;
    return piece.startsWith("**") ? <b key={index}>{piece.slice(2, -2)}</b> : piece;
  });
}

function Caps({ keys }: { keys: string[] }) {
  return <>{keys.map((key, index) => <kbd key={index} className="shortcut-key">{key}</kbd>)}</>;
}

/* ----- Anywhere on your computer ----- */

interface Clash { message: string; alternative: string | null }

function GlobalGroup({ t, global, words }: { t: Translate; global: Global; words: Words }) {
  const status = global.status;
  const rows = ACTIONS.filter((entry) => global.actions.includes(entry.action));
  const value = (action: ShortcutAction) => status?.shortcuts[action] ?? EMPTY_SHORTCUT;
  const tip = rich(t("settings.shortcuts.tip", { combo: "{combo}", single: "{single}" }), {
    combo: <Caps keys={words.mac ? ["⌃", "⌥", "M"] : ["Ctrl", "Alt", "M"]} />,
    single: <Caps keys={[words.mac ? "Fn" : "F13"]} />,
  });
  const reads = (accelerator: string) => { const read = readAccelerator(accelerator, words); return read.combo; };
  const clashOf = (action: ShortcutAction): Clash | null => {
    const shortcut = value(action);
    const accelerator = shortcut.accelerator;
    if (!accelerator) return null;
    const used = (alternative: string) => rows.some((other) => sameAccelerator(value(other.action).accelerator, alternative));
    const alternative = shortcut.alternatives.find((candidate) => !used(candidate) && !sameAccelerator(candidate, accelerator)) ?? null;
    const keys = reads(accelerator);
    if (shortcut.state === "refused") return { message: shortcut.conflictWith ? t("settings.shortcuts.clashTakenBy", { keys, app: shortcut.conflictWith }) : t("settings.shortcuts.clashTaken", { keys }), alternative };
    if (shortcut.state === "unavailable") return { message: t("settings.shortcuts.clashUnavailable", { keys }), alternative: null };
    const other = rows.find((entry) => entry.action !== action && sameAccelerator(value(entry.action).accelerator, accelerator));
    if (other) return { message: t("settings.shortcuts.clashUsed", { action: t(other.label) }), alternative };
    const parsed = parseAccelerator(accelerator);
    if (!words.mac && !parsed.single && parsed.modifiers.length === 2 && parsed.modifiers.includes("ctrl") && parsed.modifiers.includes("alt") && /^[A-Z]$/.test(parsed.key.toUpperCase()) && parsed.key.length === 1)
      return { message: t("settings.shortcuts.clashAltGr", { keys, letter: parsed.key.toUpperCase() }), alternative };
    if (shortcut.voiceOver) return { message: t("settings.shortcuts.clashVoiceOver", { keys }), alternative: null };
    return null;
  };
  const singleRows = rows.filter((entry) => isSingle(value(entry.action).accelerator));
  const needsPermission = words.mac && singleRows.length > 0 && status?.permission?.state !== "granted";
  const language = uiLanguage();
  const names = (() => {
    const quoted = singleRows.map((entry) => `“${t(entry.label)}”`);
    try { return new Intl.ListFormat(language, { type: "conjunction" }).format(quoted); } catch { return quoted.join(", "); }
  })();
  return <Group title={t("settings.shortcuts.global")} note={<Alert tone="accent" className="shortcut-tip-note">{tip}</Alert>}>
    {rows.map((entry) => <GlobalRow key={entry.action} t={t} global={global} words={words} entry={entry} shortcut={value(entry.action)} clash={clashOf(entry.action)} />)}
    {needsPermission && <Alert tone="warning" className="shortcut-note" action={global.request && <Button size="sm" variant="primary" onClick={() => void global.request!().catch(() => {})}>{t("settings.shortcuts.allow")}</Button>}>
      {t(singleRows.length > 1 ? "settings.shortcuts.permissionMany" : "settings.shortcuts.permissionOne", { actions: names })}
      {singleRows.some((entry) => isFnKey(value(entry.action).accelerator)) && " " + t("settings.shortcuts.permissionFn")}
      {status?.permission?.state === "denied" && " " + t("settings.shortcuts.permissionDenied")}
    </Alert>}
  </Group>;
}

function GlobalRow({ t, global, words, entry, shortcut, clash }: { t: Translate; global: Global; words: Words; entry: (typeof ACTIONS)[number]; shortcut: GlobalShortcut; clash: Clash | null }) {
  const { action } = entry;
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const native = !!global.record;
  const accelerator = shortcut.accelerator;
  // What the host reports as the shortcut, written as the system writes keys; a combination as the host's own label says it.
  const read = accelerator ? readAccelerator(accelerator, words) : null;
  const combo = accelerator ? (!read!.single && shortcut.label ? shortcut.label : read!.combo) : null;
  const how = read?.trigger ? t(`settings.shortcuts.trigger${read.trigger[0].toUpperCase()}${read.trigger.slice(1)}` as MessageKey) : undefined;
  const fallback = defaultGlobalMute(words.mac);
  /** Sets it; the reason it could not be, or null. */
  const apply = async (next: string | null): Promise<string | null> => {
    try { await global.set(action, next); setError(null); return null; }
    catch (failure) { return (failure as { key?: string } | null)?.key === "shortcut_invalid" ? t("settings.shortcuts.invalid") : t("settings.shortcuts.failed"); }
  };
  const onCaptured = async (captured: Captured): Promise<string | null> => {
    let next: string;
    if (captured.single) next = singleAccelerator(captured.single.key, captured.single.trigger);
    else {
      const { combo: pressed } = captured;
      next = composeAccelerator({ meta: pressed!.meta, ctrl: pressed!.ctrl, alt: pressed!.alt, shift: pressed!.shift }, acceleratorKey(pressed!.code, pressed!.key));
      if (!globalAllowed(next)) return t(words.mac ? "settings.shortcuts.needsModifierMac" : "settings.shortcuts.needsModifier", { key: keyName(pressed!.code, pressed!.key) });
    }
    const refused = await apply(next);
    if (!refused) setRecording(false);
    return refused;
  };
  useShortcutRecorder(recording && !native, {
    singles: entry.singles, onCaptured, onRefused: setError,
    onCancel: () => { setRecording(false); setError(null); },
    onClear: () => { setRecording(false); setError(null); void apply(null).then(setError); },
  });
  const toggle = () => {
    setError(null);
    if (!native) { setRecording(!recording); return; }
    if (recording) return;
    setRecording(true);
    // The app captures the next key itself, Fn included: null is Esc.
    void global.record!(action).then(async (next) => {
      setRecording(false);
      if (next) setError(await apply(next));
    }).catch(() => setRecording(false));
  };
  const alternative = clash?.alternative ?? null;
  return <div className="shortcut-item">
    <Row label={t(entry.label)} description={t(entry.hint)}>
      <ShortcutField label={t(entry.label)} combo={combo} how={how} recording={recording} recordingText={t("settings.shortcuts.recording")} placeholder={t("settings.shortcuts.record")}
        error={error} errorId={`shortcut-${action}-error`} escLabel={t("settings.shortcuts.escape")}
        onToggle={toggle} clearLabel={t("settings.shortcuts.clear")} onClear={accelerator ? () => { setError(null); void apply(null).then(setError); } : undefined}
        defaultLabel={t("settings.shortcuts.default")} defaultTitle={t("settings.shortcuts.defaultTitle", { keys: readAccelerator(fallback, words).combo })}
        onDefault={action === "mute" && !sameAccelerator(accelerator, fallback) ? () => { setError(null); void apply(fallback).then(setError); } : undefined} />
    </Row>
    {shortcut.managedBySystem && <p className="shortcut-managed">{t("settings.shortcuts.managed")}</p>}
    {clash && <Alert tone="warning" className="shortcut-note" action={alternative && <Button size="sm" variant="ghost" onClick={() => void apply(alternative).then(setError)}>{t("settings.shortcuts.use", { keys: readAccelerator(alternative, words).combo })}</Button>}>
      {clash.message}
    </Alert>}
  </div>;
}

/* ----- Headset buttons ----- */

const HEADSET_CHOICES: { value: HeadsetPress; label: MessageKey }[] = [
  { value: "mute", label: "settings.shortcuts.headsetMute" },
  { value: "oneTurn", label: "settings.shortcuts.headsetOneTurn" },
  { value: "skip", label: "settings.shortcuts.headsetSkip" },
  { value: "none", label: "settings.shortcuts.headsetNone" },
];

function HeadsetGroup({ t, global, headset }: { t: Translate; global: Global; headset: HeadsetStatus }) {
  const options = HEADSET_CHOICES.map((choice) => ({ value: choice.value, label: t(choice.label) }));
  const change = (partial: Partial<HeadsetStatus>) => { void global.setHeadset?.(partial).catch(() => {}); };
  return <Group title={t("settings.shortcuts.headset")}>
    <Row label={t("settings.shortcuts.headsetPress")} description={t("settings.shortcuts.headsetPressHint")}>
      <Select size="sm" aria-label={t("settings.shortcuts.headsetPress")} options={options} value={headset.press} disabled={!global.setHeadset}
        onValueChange={(value) => change({ press: value as HeadsetPress })} />
    </Row>
    {headset.doublePress !== null && <Row label={t("settings.shortcuts.headsetDouble")} description={t("settings.shortcuts.headsetDoubleHint")}>
      <Select size="sm" aria-label={t("settings.shortcuts.headsetDouble")} options={options} value={headset.doublePress} disabled={!global.setHeadset}
        onValueChange={(value) => change({ doublePress: value as HeadsetPress })} />
    </Row>}
  </Group>;
}

/* ----- In Sidevoice ----- */

/** The binding of a key combination pressed, as this system writes its main modifier: Cmd on a Mac and Ctrl elsewhere are
 *  the shortcut's `mod`, as the defaults are. */
export function bindingOf(pressed: NonNullable<Captured["combo"]>, mac: boolean): Binding {
  const bound: Binding = { code: pressed.code, key: keyName(pressed.code, pressed.key) };
  if (pressed.alt) bound.alt = true;
  if (pressed.shift) bound.shift = true;
  if (mac ? pressed.meta && !pressed.ctrl : pressed.ctrl && !pressed.meta) bound.mod = true;
  else { if (pressed.meta) bound.meta = true; if (pressed.ctrl) bound.ctrl = true; }
  return bound;
}

function InAppGroup({ t, words }: { t: Translate; words: Words }) {
  const table = useBindings();
  const modifier = host().identity.shortcutModifier;
  // Warned, never blocked: the person may still keep the key.
  const risk = (bound: Binding | null | undefined) => {
    if (!bound) return null;
    const found = bindingClash(bound, words.mac);
    const keys = bindingCombo(bound, modifier, words.space);
    return found === "altgr" ? t("settings.shortcuts.clashAltGr", { keys, letter: bound.key.toUpperCase() })
      : found === "reserved" ? t("settings.shortcuts.clashReserved", { keys }) : null;
  };
  return <Group title={t("settings.shortcuts.inApp")}>
    {SHORTCUTS.map((entry) => {
      const bound = table[entry.id];
      const clash = bound ? SHORTCUTS.find((other) => other.id !== entry.id && sameBinding(table[other.id], bound)) : undefined;
      return <InAppRow key={entry.id} t={t} words={words} id={entry.id} label={t(entry.label as MessageKey)}
        hint={t(entry.id === "holdToTalk" ? "settings.shortcuts.holdToTalkHint" : "settings.shortcuts.inAppHint")}
        combo={bound ? bindingCombo(bound, modifier, words.space) : null}
        clash={clash ? t("settings.shortcuts.clashUsed", { action: t(clash.label as MessageKey) }) : risk(bound)}
        defaultKeys={bindingCombo(entry.default, modifier, words.space)} />;
    })}
  </Group>;
}

function InAppRow({ t, words, id, label, hint, combo, clash, defaultKeys }: { t: Translate; words: Words; id: ShortcutId; label: string; hint: string; combo: string | null; clash: string | null; defaultKeys: string }) {
  const [recording, setRecording] = useState(false);
  useShortcutRecorder(recording, {
    singles: [],
    onCaptured: (captured) => { setBinding(id, bindingOf(captured.combo!, words.mac)); setRecording(false); return null; },
    onRefused: () => {},
    onCancel: () => setRecording(false),
    onClear: () => { setBinding(id, null); setRecording(false); },
  });
  return <div className="shortcut-item">
    <Row label={label} description={hint}>
      <ShortcutField label={label} combo={combo} recording={recording} recordingText={t("settings.shortcuts.recordingInApp")} placeholder={t("settings.shortcuts.record")}
        escLabel={t("settings.shortcuts.escape")} onToggle={() => setRecording(!recording)}
        clearLabel={t("settings.shortcuts.clear")} onClear={combo ? () => setBinding(id, null) : undefined}
        defaultLabel={t("settings.shortcuts.default")} defaultTitle={t("settings.shortcuts.defaultTitle", { keys: defaultKeys })}
        onDefault={isDefault(id) ? undefined : () => resetBinding(id)} />
    </Row>
    {clash && <Alert tone="warning" className="shortcut-note">{clash}</Alert>}
  </div>;
}


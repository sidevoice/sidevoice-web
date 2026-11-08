import { Fragment, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Group, Row, Section } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { ShortcutField } from "../../components/ui/ShortcutField";
import { useShortcutRecorder, type Captured } from "../../components/ui/use-shortcut-recorder";
import { host, type GlobalShortcut, type HeadsetPress, type HeadsetStatus, type RecordHint, type ShortcutAction, type ShortcutsStatus } from "../../host";
import { uiLanguage, type MessageKey, type Translate } from "../../i18n/translator";
import {
  composeAccelerator, acceleratorKey, globalAllowed, isFnKey, isFunctionKey, isSingle, parseAccelerator, readAccelerator, sameAccelerator, setLayoutMap, singleAccelerator,
  type Trigger, type Words,
} from "../../state/accelerators";
import {
  SHORTCUTS, bindingClash, bindingCombo, isDefault, keyName, macModifier, resetBinding, sameBinding, setBinding, type Binding, type ShortcutId,
} from "../../state/shortcuts";
import { useBindings } from "../../state/use-shortcuts";

/* Shortcuts, a Settings section of their own: the keys for the microphone, by where they work.
 *  - Anywhere on your computer: the desktop app's global shortcuts (`host.shortcuts`; an app that has only `host.muteShortcut`
 *    shows its mute row alone), each recorded by pressing it, or by tapping a single key once or twice.
 *  - Headset buttons: what a press and a double press of the headset's button do, where the app reports a headset path, with only
 *    the actions the host says each press can do: a press with one action is a line, not a choice (an iPhone's system mute).
 *  - In Sidevoice: the keys the room answers while it is in front, the same field, kept with the web's settings
 *    (state/shortcuts.ts, which the key handler, the tooltips and these rows all read).
 * What shows follows what the host reports (`ShortcutsStatus`) and nothing about the platform: the global group has the actions the host
 *  offers and can set (none, or no `set`: no group), the headset group shows when it reports a headset, and these keys show unless it
 *  says `inApp: false` (a phone reports the headset alone). Without a host that reports shortcuts, a keyboard is the one sign
 *  (KEYBOARD_QUERY). */

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
  /** The global actions the host offers, once it has said, and only where it can set them (`set`): a host without it has none. */
  actions: ShortcutAction[];
  /** Whether the keys of the page's own show: a host that reports shortcuts says (`inApp`), and nothing shows before it has. */
  inApp: boolean;
  set?(action: ShortcutAction, accelerator: string | null): Promise<GlobalShortcut>;
  request?(): Promise<void>;
  setHeadset?(partial: Partial<HeadsetStatus>): Promise<void>;
  restore?(action: ShortcutAction): Promise<GlobalShortcut>;
  record?(action: ShortcutAction, onHint?: (hint: RecordHint) => void): Promise<string | null>;
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
  if (bridge) {
    // A host that can only read its global shortcuts (a phone's bridge has no `set`) offers none: no row could change one.
    const { set, restore, request, setHeadset, record } = bridge;
    return {
      status, actions: set ? (["holdToTalk", "mute", "oneTurn"] as ShortcutAction[]).filter((action) => !!status?.shortcuts?.[action]) : [],
      inApp: !!status && status.inApp !== false,
      set: set ? async (action, accelerator) => { const value = await set.call(bridge, action, accelerator); merge(action, value); return value; } : undefined,
      restore: restore ? async (action) => { const value = await restore.call(bridge, action); merge(action, value); return value; } : undefined,
      request: request ? async () => { const next = await request.call(bridge, status?.permission?.kind ?? "inputMonitoring"); setStatus(next); } : undefined,
      setHeadset: setHeadset ? async (partial) => { const next = await setHeadset.call(bridge, partial); setStatus(next); } : undefined,
      record: record ? (action, onHint) => record.call(bridge, action, onHint) : undefined,
    };
  }
  return {
    status, actions: ["mute"], inApp: true,
    set: async (action, accelerator) => { const value = await legacy!.set(accelerator); merge(action, value); return value; },
  };
}

function useWords(t: Translate): Words {
  return { mac: macModifier(host().identity.shortcutModifier), space: t("settings.shortcuts.space"),
    side: (side, name) => t(side === "right" ? "settings.shortcuts.right" : "settings.shortcuts.left", { key: name }) };
}

/** What the system's own mute shortcut is by default: ⌃⌥M on a Mac, Ctrl+Alt+Shift+M elsewhere (Ctrl+Shift+M is Teams' and
 *  Discord's, and Ctrl+Alt+letter is AltGr on many layouts). The app owns the default it registers and reports it
 *  (`GlobalShortcut.default`); this is the one an older app, which reports none, is taken to have. */
export function defaultGlobalMute(mac: boolean) {
  return mac ? "Ctrl+Alt+M" : "Ctrl+Alt+Shift+M";
}

export function ShortcutsSettings({ t }: { t: Translate }) {
  const global = useGlobal();
  // The keycaps read as the layout writes its keys where the browser says (a Spanish BracketRight is `+`), and again if it changes.
  const [, redraw] = useState(0);
  useEffect(() => host().identity.followKeyboardLayout((map) => { setLayoutMap(map); redraw((n) => n + 1); }), []);
  const words = useWords(t);
  // A host that reports the headset alone (a phone) has nothing else to describe.
  const headsetOnly = !!global?.status?.headset && global.actions.length === 0 && !global.inApp;
  return <Section id="shortcuts" title={t("settings.section.shortcuts")} description={t(headsetOnly ? "settings.shortcuts.descriptionHeadset" : "settings.shortcuts.description")}>
    {global?.set && global.actions.length > 0 && <GlobalGroup t={t} global={global} set={global.set} words={words} />}
    {global?.status?.headset && <HeadsetGroup t={t} global={global} headset={global.status.headset} />}
    {(!global || global.inApp) && <InAppGroup t={t} words={words} />}
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

/** What sets a global shortcut: a group shows only where the host has it. */
type SetGlobal = NonNullable<Global["set"]>;

function GlobalGroup({ t, global, set, words }: { t: Translate; global: Global; set: SetGlobal; words: Words }) {
  const status = global.status;
  const rows = ACTIONS.filter((entry) => global.actions.includes(entry.action));
  const value = (action: ShortcutAction) => status?.shortcuts[action] ?? EMPTY_SHORTCUT;
  const tip = rich(t("settings.shortcuts.tip", { combo: "{combo}", single: "{single}" }), {
    combo: <Caps keys={words.mac ? ["⌃", "⌥", "M"] : ["Ctrl", "Alt", "M"]} />,
    single: <Caps keys={[words.mac ? "Fn" : "F9"]} />,
  });
  const reads = (accelerator: string) => { const read = readAccelerator(accelerator, words); return read.combo; };
  const clashOf = (action: ShortcutAction): Clash | null => {
    const shortcut = value(action);
    const accelerator = shortcut.accelerator;
    if (!accelerator) return null;
    const used = (alternative: string) => rows.some((other) => sameAccelerator(value(other.action).accelerator, alternative));
    const alternative = shortcut.alternatives.find((candidate) => !used(candidate) && !sameAccelerator(candidate, accelerator)) ?? null;
    const keys = reads(accelerator);
    if (shortcut.state === "refused" && shortcut.refusal?.reason === "duplicate") {
      const holding = shortcut.refusal.action;
      const holder = ACTIONS.find((entry) => entry.action === holding);
      if (holder) return { message: t("settings.shortcuts.clashUsed", { action: t(holder.label) }), alternative };
    }
    if (shortcut.state === "refused") return { message: shortcut.conflictWith ? t("settings.shortcuts.clashTakenBy", { keys, app: shortcut.conflictWith }) : t("settings.shortcuts.clashTaken", { keys }), alternative };
    if (shortcut.state === "unavailable") return { message: t("settings.shortcuts.clashUnavailable", { keys }), alternative: null };
    const other = rows.find((entry) => entry.action !== action && sameAccelerator(value(entry.action).accelerator, accelerator));
    if (other) return { message: t("settings.shortcuts.clashUsed", { action: t(other.label) }), alternative };
    const parsed = parseAccelerator(accelerator);
    if (!words.mac && !parsed.single && parsed.modifiers.length === 2 && parsed.modifiers.includes("ctrl") && parsed.modifiers.includes("alt") && /^[A-Z]$/.test(parsed.key.toUpperCase()) && parsed.key.length === 1)
      return { message: t("settings.shortcuts.clashAltGr", { keys, letter: parsed.key.toUpperCase() }), alternative };
    if (shortcut.voiceOver) return { message: t("settings.shortcuts.clashVoiceOver", { keys }), alternative: null };
    if (shortcut.layoutBound) return { message: t("settings.shortcuts.clashLayoutKey", { keys }), alternative: null };
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
    {rows.map((entry) => <GlobalRow key={entry.action} t={t} global={global} set={set} words={words} entry={entry} shortcut={value(entry.action)} clash={clashOf(entry.action)} />)}
    {needsPermission && <Alert tone="warning" className="shortcut-note" action={global.request && <Button size="sm" variant="primary" onClick={() => void global.request!().catch(() => {})}>{t("settings.shortcuts.allow")}</Button>}>
      {t(singleRows.length > 1 ? "settings.shortcuts.permissionMany" : "settings.shortcuts.permissionOne", { actions: names })}
      {singleRows.some((entry) => isFnKey(value(entry.action).accelerator)) && " " + t("settings.shortcuts.permissionFn")}
      {status?.permission?.state === "denied" && " " + t("settings.shortcuts.permissionDenied")}
    </Alert>}
  </Group>;
}

function GlobalRow({ t, global, set, words, entry, shortcut, clash }: { t: Translate; global: Global; set: SetGlobal; words: Words; entry: (typeof ACTIONS)[number]; shortcut: GlobalShortcut; clash: Clash | null }) {
  const { action } = entry;
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const native = !!global.record;
  const accelerator = shortcut.accelerator;
  // What the host reports as the shortcut, written as the system writes keys; a combination as the host's own label says it.
  const read = accelerator ? readAccelerator(accelerator, words) : null;
  const combo = accelerator ? (!read!.single && shortcut.label ? shortcut.label : read!.combo) : null;
  const how = read?.trigger ? t(`settings.shortcuts.trigger${read.trigger[0].toUpperCase()}${read.trigger.slice(1)}` as MessageKey) : undefined;
  // The default the host reports; an older host reports none, and has only the mute one.
  const defaultKeys = shortcut.default !== undefined ? shortcut.default : action === "mute" ? defaultGlobalMute(words.mac) : null;
  const onDefault = shortcut.isDefault !== undefined ? shortcut.isDefault : defaultKeys === null || sameAccelerator(accelerator, defaultKeys);
  const [hint, setHint] = useState<string | null>(null);
  const hintOf = (hint: RecordHint) => t(hint === "leftModifier" ? "settings.shortcuts.hintLeftModifier" : "settings.shortcuts.hintLoneModifier");
  const failure = (failed: unknown) => (failed as { key?: string } | null)?.key === "record_timeout" ? t("settings.shortcuts.recordTimeout") : t("settings.shortcuts.recordFailed");
  /** Sets it; the reason it could not be, or null. */
  const apply = async (next: string | null): Promise<string | null> => {
    try { await set(action, next); setError(null); return null; }
    catch (failure) {
      const key = (failure as { key?: string } | null)?.key;
      return key === "shortcut_invalid" ? t("settings.shortcuts.invalid") : key === "shortcut_unsupported" ? t("settings.shortcuts.unsupported") : t("settings.shortcuts.failed");
    }
  };
  const onCaptured = async (captured: Captured): Promise<string | null> => {
    let next: string;
    if (captured.single) next = singleAccelerator(captured.single.key, captured.single.trigger);
    else {
      const { combo: pressed } = captured;
      const key = acceleratorKey(pressed!.code, pressed!.key);
      const alone = !pressed!.meta && !pressed!.ctrl && !pressed!.alt && !pressed!.shift;
      // An F-key on its own, for hold to talk, is a single key held (`F10:hold`), as a right-hand modifier is and as the app records
      // it: its hot key reports the release on every system that has one. For the others it stays a combination, acting at once.
      if (alone && isFunctionKey(key) && entry.singles.includes("hold")) next = singleAccelerator(key, "hold");
      else {
        next = composeAccelerator({ meta: pressed!.meta, ctrl: pressed!.ctrl, alt: pressed!.alt, shift: pressed!.shift }, key);
        if (!globalAllowed(next)) return t(words.mac ? "settings.shortcuts.needsModifierMac" : "settings.shortcuts.needsModifier", { key: keyName(pressed!.code, pressed!.key) });
      }
    }
    const refused = await apply(next);
    if (!refused) setRecording(false);
    return refused;
  };
  // The page hears no modifier or Fn on its own where the app does not record for it: it waits for a real key and says why.
  useShortcutRecorder(recording && !native, {
    singles: [], onCaptured, onRefused: setError, onLoneIgnored: () => setHint(hintOf("loneModifier")),
    onCancel: () => { setRecording(false); setError(null); setHint(null); },
    onClear: () => { setRecording(false); setError(null); setHint(null); void apply(null).then(setError); },
  });
  const toggle = () => {
    setError(null);
    setHint(null);
    if (!native) { setRecording(!recording); return; }
    if (recording) return;
    setRecording(true);
    // The app captures the next key itself, Fn included: null is Esc. A rejection is shown, the timeout as such.
    void global.record!(action, (heard) => setHint(hintOf(heard))).then(async (next) => {
      setRecording(false);
      setHint(null);
      if (next) setError(await apply(next));
    }).catch((failed) => { setRecording(false); setHint(null); setError(failure(failed)); });
  };
  const restore = () => {
    setError(null);
    void (global.restore ? global.restore(action).then(() => null, () => t("settings.shortcuts.failed")) : apply(defaultKeys)).then(setError);
  };
  const alternative = clash?.alternative ?? null;
  return <div className="shortcut-item">
    <Row label={t(entry.label)} description={t(entry.hint)}>
      <ShortcutField label={t(entry.label)} combo={combo} how={how} recording={recording} recordingText={t("settings.shortcuts.recording")} placeholder={t("settings.shortcuts.record")}
        error={error} errorId={`shortcut-${action}-error`} escLabel={t("settings.shortcuts.escape")}
        onToggle={toggle} clearLabel={t("settings.shortcuts.clear")} onClear={accelerator ? () => { setError(null); void apply(null).then(setError); } : undefined}
        restoreLabel={defaultKeys ? t("settings.shortcuts.restore", { keys: readAccelerator(defaultKeys, words).combo }) : undefined}
        onRestore={!onDefault && defaultKeys ? restore : undefined} />
    </Row>
    {recording && native && words.mac && <Alert tone="accent" className="shortcut-note">{t("settings.shortcuts.recordFnHint")}</Alert>}
    {recording && hint && <Alert tone="warning" className="shortcut-note" live>{hint}</Alert>}
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

/** The headset group: each press the host reports, with only the actions it says that press can do (`actions`; none said: every
 *  one). A press with a single action has nothing to choose: its row is drawn as the others, its select disabled on that action, and
 *  a note under it says why (an iPhone's single press, the system's mute); a press with none, or a double press the host reports
 *  `null`, has no row. A value the host reports
 *  outside the press's actions is shown as it is, never as another one: a select with it there, disabled, beside what can be picked. */
function HeadsetGroup({ t, global, headset }: { t: Translate; global: Global; headset: HeadsetStatus }) {
  // The system's call holds the headset: the rows stay, read-only, and say who mutes.
  const locked = !global.setHeadset || !!headset.managedBySystem;
  const change = (partial: Partial<HeadsetStatus>) => { void global.setHeadset?.(partial).catch(() => {}); };
  const presses = [
    { key: "press", value: headset.press, actions: headset.actions?.press, label: "settings.shortcuts.headsetPress", hint: "settings.shortcuts.headsetPressHint" },
    { key: "doublePress", value: headset.doublePress, actions: headset.actions?.doublePress, label: "settings.shortcuts.headsetDouble", hint: "settings.shortcuts.headsetDoubleHint" },
  ] as const;
  return <Group title={t("settings.shortcuts.headset")}>
    {presses.map(({ key, value, actions, label, hint }) => {
      if (value === null) return null;
      const allowed = (choice: HeadsetPress) => !actions || actions.includes(choice);
      if (!HEADSET_CHOICES.some((choice) => allowed(choice.value))) return null;
      const options = HEADSET_CHOICES.filter((choice) => allowed(choice.value) || choice.value === value)
        .map((choice) => ({ value: choice.value, label: t(choice.label), disabled: !allowed(choice.value) }));
      const fixed = options.length === 1;
      return <div key={key} className="shortcut-item">
        <Row label={t(label)} description={t(hint)}>
          <Select size="sm" aria-label={t(label)} options={options} value={value} disabled={locked || fixed}
            aria-describedby={fixed ? `headset-${key}-fixed` : undefined}
            onValueChange={(next) => { if (next !== value) change({ [key]: next as HeadsetPress }); }} />
        </Row>
        {fixed && <p className="shortcut-managed" id={`headset-${key}-fixed`}>{t("settings.shortcuts.headsetFixed")}</p>}
      </div>;
    })}
    {headset.managedBySystem && <Alert tone="accent" className="shortcut-note">{t("settings.shortcuts.headsetSystem")}</Alert>}
    {headset.nonDefaultAddsCard && !headset.managedBySystem && <Alert tone="accent" className="shortcut-note">{t("settings.shortcuts.headsetCard")}</Alert>}
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
        defaultKeys={entry.default ? bindingCombo(entry.default, modifier, words.space) : null} />;
    })}
  </Group>;
}

function InAppRow({ t, words, id, label, hint, combo, clash, defaultKeys }: { t: Translate; words: Words; id: ShortcutId; label: string; hint: string; combo: string | null; clash: string | null; defaultKeys: string | null }) {
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
        restoreLabel={defaultKeys ? t("settings.shortcuts.restore", { keys: defaultKeys }) : undefined}
        onRestore={defaultKeys && !isDefault(id) ? () => resetBinding(id) : undefined} />
    </Row>
    {clash && <Alert tone="warning" className="shortcut-note">{clash}</Alert>}
  </div>;
}


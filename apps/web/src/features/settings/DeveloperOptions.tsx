import { useRef, useState, type ReactNode } from "react";
import { Group, Row, Section } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import type { MessageKey } from "../../i18n/locales/en";
import type { Translate } from "../../i18n/translator";
import { host, type CallAudioMode, type DebugSwitch, type HostDebugBridge } from "../../host";
import { setAnimatedThumbnails, useAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { setDeveloperMode, useDeveloperMode } from "./developer-mode";
import { TurnTuningDev } from "./TurnTuningDev";

/* Developer options: a Settings section for whoever tests Sidevoice, below Advanced. Shown while developer mode is on
 * (a nightly build; click the version in Updates ten times, developer-mode.ts) or, for a browser or a playground that
 * cannot, with the turn-tuning flag (TurnTuningDev.tsx). The section is deliberately English-only and outside the i18n
 * catalogues, as the turn tuning panel it holds is; the phone's "system calls" switch is new and follows the repo's rule
 * (every user-facing text is a catalogue key), so its words and its Calls group come from the catalogues, as do the iPhone's call audio mode's. */

export const DEVELOPER_OPTIONS_TITLE = "Developer options";

/** The switches of the desktop app's `host.debug`, in the order shown, each with the words under it. The app says which
 *  of them its platform has (`available`); the others are not drawn. */
const DEBUG_SWITCHES: { name: DebugSwitch; label: string | MessageKey; description: ReactNode | MessageKey; group: "Rendering" | "Calls"; translated?: true }[] = [
  { name: "inspectable", label: "Web Inspector", group: "Rendering", description: <>
    <span className="developer-howto">Safari → Settings → Advanced → “Show features for web developers”, then Develop → this Mac → Sidevoice → the room or the card.</span>
    <span className="developer-howto">In the inspector, Layers → compositing borders / paint flashing shows the CPU repaints.</span>
  </> },
  { name: "compositingBorders", label: "Compositing borders", group: "Rendering", description: "Outlines each layer the GPU composites." },
  { name: "repaintCounters", label: "Repaint counters", group: "Rendering", description: "Counts on each layer how often the CPU repainted it." },
  { name: "systemCall", translated: true, label: "settings.developer.systemCall", group: "Calls", description: "settings.developer.systemCall.hint" },
];

/** The call audio modes an iPhone's `host.debug` chooses among (`callAudio`), in the order shown, each by its catalogue key. */
const CALL_AUDIO_MODES: { value: CallAudioMode; label: MessageKey }[] = [
  { value: "voiceChat", label: "settings.developer.callAudio.voiceChat" },
  { value: "videoChat", label: "settings.developer.callAudio.videoChat" },
  { value: "default", label: "settings.developer.callAudio.default" },
  { value: "voiceChatInCalls", label: "settings.developer.callAudio.voiceChatInCalls" },
];

/** The call audio mode (iOS): a list of the modes, which moves at once and goes back with a line saying so if the app
 *  refuses, as a switch does; one still being changed ignores another pick. */
function CallAudioRow({ debug, choose, t }: { debug: HostDebugBridge; choose: NonNullable<HostDebugBridge["choose"]>; t: Translate }) {
  const [value, setValue] = useState<string>(() => debug.callAudio ?? "voiceChat");
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const label = t("settings.developer.callAudio");
  async function change(next: string) {
    if (busy.current || next === value) return;
    busy.current = true;
    const before = value;
    setFailed(false);
    setValue(next);
    try { await choose.call(debug, "callAudio", next); setValue(debug.callAudio ?? next); }
    catch { setValue(before); setFailed(true); }
    finally { busy.current = false; }
  }
  return <Row label={label} description={<>
    {t("settings.developer.callAudio.hint")}
    {failed && <span className="developer-howto host-status-error" role="alert">The app could not change it.</span>}
  </>}>
    <Select id="developer-call-audio" aria-label={label} size="sm" value={value} onValueChange={(next) => void change(next)}
      options={CALL_AUDIO_MODES.map((mode) => ({ value: mode.value, label: t(mode.label) }))} />
  </Row>;
}

/** One debugging switch. It moves at once, as the other switches do, and goes back with a line saying so if the app
 *  refuses; one that is still being changed ignores another click. */
function DebugSwitchRow({ debug, name, label, description }: { debug: HostDebugBridge; name: DebugSwitch; label: string; description: ReactNode }) {
  // The app's word when the switch appeared; after that, what it took of the last change.
  const [on, setOn] = useState(() => debug[name] === true);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  async function change(next: boolean) {
    if (busy.current) return;
    busy.current = true;
    setFailed(false);
    setOn(next);
    try { await debug.set(name, next); setOn(debug[name] === true); }
    catch { setOn(!next); setFailed(true); }
    finally { busy.current = false; }
  }
  return <Row label={label} description={<>
    {description}
    {failed && <span className="developer-howto host-status-error" role="alert">The app could not change it.</span>}
  </>}>
    <Switch checked={on} onChange={(next) => void change(next)} aria-label={label} />
  </Row>;
}

export function DeveloperOptions({ t }: { t: Translate }) {
  const mode = useDeveloperMode();
  const animated = useAnimatedThumbnails();
  const debug = host().debug;
  const switches = debug ? DEBUG_SWITCHES.filter(({ name }) => debug.available.includes(name)) : [];
  // The call audio mode: a choice, where the app offers it and can take it.
  const choose = debug?.available.includes("callAudio") ? debug.choose : undefined;
  return <Section id="developer" title={DEVELOPER_OPTIONS_TITLE} description="Tools for testing Sidevoice. English only, and not part of the normal app.">
    {mode && <Group>
      <Row label="Developer mode" description="On for this device. Clicking the version in Updates ten times within five seconds turns it off too.">
        <Switch checked onChange={() => setDeveloperMode(false)} aria-label="Developer mode" />
      </Row>
    </Group>}
    {debug && (["Rendering", "Calls"] as const).map((group) => {
      const rows = switches.filter((entry) => entry.group === group);
      const callAudio = group === "Calls" && choose ? <CallAudioRow debug={debug} choose={choose} t={t} /> : null;
      return (rows.length > 0 || callAudio) && <Group key={group} title={group === "Calls" ? t("settings.developer.group.calls") : group}>
        {rows.map(({ group: _, translated, label, description, ...entry }) => translated
          ? <DebugSwitchRow key={entry.name} debug={debug} label={t(label as MessageKey)} description={t(description as MessageKey)} {...entry} />
          : <DebugSwitchRow key={entry.name} debug={debug} label={label} description={description as ReactNode} {...entry} />)}
        {callAudio}
      </Group>;
    })}
    {mode && <Group title="Conversations">
      <Row label="Animate conversation thumbnails" description="The thumbnails in the conversations list move as the creature on the stage does: drawn as GPU layers, with the mouth following the voice. Off: still, with the light. Kept on this device.">
        <Switch checked={animated} onChange={setAnimatedThumbnails} aria-label="Animate conversation thumbnails" />
      </Row>
    </Group>}
    <TurnTuningDev />
  </Section>;
}

import { useRef, useState, type ReactNode } from "react";
import { Group, Row, Section } from "../../components/ui/Card";
import { Switch } from "../../components/ui/Switch";
import { host, type DebugSwitch, type HostDebugBridge } from "../../host";
import { setAnimatedThumbnails, useAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { setDeveloperMode, useDeveloperMode } from "./developer-mode";
import { TurnTuningDev } from "./TurnTuningDev";

/* Developer options: a Settings section for whoever tests Sidevoice, below Advanced. Shown while developer mode is on
 * (a nightly build; click the version in Updates ten times, developer-mode.ts) or, for a browser or a playground that
 * cannot, with the turn-tuning flag (TurnTuningDev.tsx). Deliberately English-only and outside the i18n catalogues, as
 * the turn tuning panel it holds is. */

export const DEVELOPER_OPTIONS_TITLE = "Developer options";

/** The switches of the desktop app's `host.debug`, in the order shown, each with the words under it. The app says which
 *  of them its platform has (`available`); the others are not drawn. */
const DEBUG_SWITCHES: { name: DebugSwitch; label: string; description: ReactNode }[] = [
  { name: "inspectable", label: "Web Inspector", description: <>
    <span className="developer-howto">Safari → Settings → Advanced → “Show features for web developers”, then Develop → this Mac → Sidevoice → the room or the card.</span>
    <span className="developer-howto">In the inspector, Layers → compositing borders / paint flashing shows the CPU repaints.</span>
  </> },
  { name: "compositingBorders", label: "Compositing borders", description: "Outlines each layer the GPU composites." },
  { name: "repaintCounters", label: "Repaint counters", description: "Counts on each layer how often the CPU repainted it." },
];

/** One debugging switch. It moves at once, as the other switches do, and goes back with a line saying so if the app
 *  refuses; one that is still being changed ignores another click. */
function DebugSwitchRow({ debug, name, label, description }: { debug: HostDebugBridge; name: DebugSwitch; label: string; description: ReactNode }) {
  // The app's word when the switch appeared; after that, what it took of the last change.
  const [on, setOn] = useState(() => debug[name]);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  async function change(next: boolean) {
    if (busy.current) return;
    busy.current = true;
    setFailed(false);
    setOn(next);
    try { await debug.set(name, next); setOn(debug[name]); }
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

export function DeveloperOptions() {
  const mode = useDeveloperMode();
  const animated = useAnimatedThumbnails();
  const debug = host().debug;
  const switches = debug ? DEBUG_SWITCHES.filter(({ name }) => debug.available.includes(name)) : [];
  return <Section id="developer" title={DEVELOPER_OPTIONS_TITLE} description="Tools for testing Sidevoice. English only, and not part of the normal app.">
    {mode && <Group>
      <Row label="Developer mode" description="On for this device. Clicking the version in Updates ten times within five seconds turns it off too.">
        <Switch checked onChange={() => setDeveloperMode(false)} aria-label="Developer mode" />
      </Row>
    </Group>}
    {debug && switches.length > 0 && <Group title="Rendering">
      {switches.map((entry) => <DebugSwitchRow key={entry.name} debug={debug} {...entry} />)}
    </Group>}
    {mode && <Group title="Conversations">
      <Row label="Animate conversation thumbnails" description="The thumbnails in the conversations list move as the creature on the stage does: drawn as GPU layers, with the mouth following the voice. Off: still, with the light. Kept on this device.">
        <Switch checked={animated} onChange={setAnimatedThumbnails} aria-label="Animate conversation thumbnails" />
      </Row>
    </Group>}
    <TurnTuningDev />
  </Section>;
}

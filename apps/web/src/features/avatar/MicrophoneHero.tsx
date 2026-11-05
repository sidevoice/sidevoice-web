import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { useMotion } from "../../lib/motion";
import { creatureHostNow, loadCreatureHost, watchCreatureHost } from "./creature-loader";
import { FALLBACK_PATH } from "./creature/fallback";
import type { MicHero } from "./creature/mic-hero";
import { MIC_HERO, micGreyed, type MicState } from "./creature/mic-hero-spec";

/* The microphone permission hero (creature/mic-hero.ts) over the microphone's row: the setup's permissions step and
 * Settings › Permissions. A creature of its own, not the person's: it acts out the microphone's state, and moving (where
 * the page's drawings move: lib/motion.ts) it plays the transition into a new state (excited into allowed, sad into
 * blocked, confused into none found); held still, the state's key pose. Blocked or none found, it is greyed a little, as
 * the product greyed its hero. Where no creature can be drawn, the fallback's outline stands in, in its colour.
 * Decoration: the row says the state.
 *
 * It is drawn only while it is shown: Settings keeps its sections mounted, hidden, and a hero in a hidden section would
 * hold a WebGL context (its stage: creature/mic-hero.ts) and draw frames nobody sees. Hidden, it lets them go; shown
 * again, it is mounted again (and the creature host is loaded the first time one is shown). */
export function MicrophoneHero({ state, className }: { state: MicState; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Shown: it has a box (a hidden section, or a closed screen, gives it none); its box observer says when that changes.
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const read = () => { const box = element.getBoundingClientRect(); setShown(box.width > 0 && box.height > 0); };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hero = useRef<MicHero | null>(null);
  const moving = useMotion() === "gpu";
  // Its code is the creature host's chunk (three.js and the rig), loaded the first time a creature is drawn.
  const { host, failed } = useSyncExternalStore(watchCreatureHost, creatureHostNow);
  useEffect(() => { if (shown && !creatureHostNow().host) loadCreatureHost().catch(() => {}); }, [shown]);
  const [down, setDown] = useState(false);
  // What it shows when its host has loaded, whatever changed in the meantime.
  const now = useRef({ state, moving });
  now.current = { state, moving };
  useEffect(() => {
    const element = canvas.current;
    if (!host || !element || !shown) return;
    const made = host.mountMicHero({ canvas: element, state: now.current.state, moving: now.current.moving, onDown: setDown });
    hero.current = made;
    setDown(!made);
    return () => { made?.dispose(); hero.current = null; };
  }, [host, shown]);
  useEffect(() => { hero.current?.setState(state); }, [state]);
  useEffect(() => { hero.current?.setMoving(moving); }, [moving]);
  const fallback = host ? down : failed;
  return (
    <span ref={root} className={cn("mic-hero", className)} data-state={state} data-greyed={micGreyed(state) || undefined} data-fallback={fallback || undefined}
      style={{ "--av-color": MIC_HERO.color } as CSSProperties} aria-hidden="true">
      <canvas ref={canvas} />
      {fallback && <svg className="creature-fallback" viewBox="0 0 100 100" aria-hidden="true"><path d={FALLBACK_PATH} /></svg>}
    </span>
  );
}

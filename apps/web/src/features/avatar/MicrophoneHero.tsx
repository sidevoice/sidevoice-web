import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { useMotion } from "../../lib/motion";
import { useCreatureHost } from "./creature-loader";
import { FALLBACK_PATH } from "./creature/fallback";
import type { MicHero } from "./creature/mic-hero";
import { MIC_HERO, micGreyed, type MicState } from "./creature/mic-hero-spec";

/* The microphone permission hero (creature/mic-hero.ts) over the microphone's row: the setup's permissions step and
 * Settings › Permissions. A creature of its own, not the person's: it acts out the microphone's state, and moving (where
 * the page's drawings move: lib/motion.ts) it plays the transition into a new state (excited into allowed, sad into
 * blocked, confused into none found); held still, the state's key pose. Blocked or none found, it is greyed a little, as
 * the product greyed its hero. Where no creature can be drawn, the fallback's outline stands in, in its colour.
 * Decoration: the row says the state. */
export function MicrophoneHero({ state, className }: { state: MicState; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hero = useRef<MicHero | null>(null);
  const moving = useMotion() === "gpu";
  // Its code is the creature host's chunk (three.js and the rig), loaded the first time a creature is drawn.
  const { host, failed } = useCreatureHost();
  const [down, setDown] = useState(false);
  // What it shows when its host has loaded, whatever changed in the meantime.
  const now = useRef({ state, moving });
  now.current = { state, moving };
  useEffect(() => {
    const element = canvas.current;
    if (!host || !element) return;
    const made = host.mountMicHero({ canvas: element, state: now.current.state, moving: now.current.moving, onDown: setDown });
    hero.current = made;
    setDown(!made);
    return () => { made?.dispose(); hero.current = null; };
  }, [host]);
  useEffect(() => { hero.current?.setState(state); }, [state]);
  useEffect(() => { hero.current?.setMoving(moving); }, [moving]);
  const fallback = host ? down : failed;
  return (
    <span className={cn("mic-hero", className)} data-state={state} data-greyed={micGreyed(state) || undefined} data-fallback={fallback || undefined}
      style={{ "--av-color": MIC_HERO.color } as CSSProperties} aria-hidden="true">
      <canvas ref={canvas} />
      {fallback && <svg className="creature-fallback" viewBox="0 0 100 100" aria-hidden="true"><path d={FALLBACK_PATH} /></svg>}
    </span>
  );
}

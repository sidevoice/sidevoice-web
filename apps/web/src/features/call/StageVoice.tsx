import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { StageFrame, voiceType, type FrameCards } from "../avatar/creature/stage-frame";
import "./stage-voice.css";

/* What is said on the stage, laid under the creature as the design reference lays it (T21–T24, T28, T33, T36, T43): the
 * agent's reply and the person's turn in white cards, a gap under the creature's lowest drawn row, never over it. The
 * cards are the stage's (CallStage: AgentCards, PersonTurn's card look); this is their layer: it sizes their type by the
 * tile, measures each at its largest and asks the stage's framing (creature/stage-frame.ts) for room for them, which the
 * creature host solves on what it draws, and places them where that framing says. */

/** The stage's framing channel, one per tile: the voice text asks, the creature drawn under it answers. */
export function useStageFrame(): StageFrame {
  const [frame] = useState(() => new StageFrame());
  return frame;
}

/** Text that measures as three lines of a card at its widest: never shown (visibility hidden), so never read. */
const FILL = Array.from({ length: 90 }, () => "mmmm").join(" ");

/** The microphone, as the reference's pill draws it. */
export function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/** The ×, as the reference's cancel draws it. */
export function CancelGlyph() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

/** The layer: `turn`, whose turn the agent's state says it is (null between turns: a desktop then stands closer while no
 *  card shows), `phone` for the phone's framing (one for all states). */
export function StageVoice({ frame, turn, phone, children }: { frame: StageFrame; turn: "listening" | "speaking" | null; phone: boolean; children?: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  const agent = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const sent = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number; dx: number; dy: number; sh: number } | null>(null);
  const [cards, setCards] = useState<(FrameCards & { sent: number }) | null>(null);
  const [up, setUp] = useState(false);

  // The tile's inner size, and where the creature's canvas sits in it (its scene may overhang the tile's border).
  useLayoutEffect(() => {
    const node = layer.current, tile = node?.parentElement;
    if (!node || !tile) return;
    const read = () => {
      const w = tile.clientWidth, h = tile.clientHeight;
      if (!(w > 0 && h > 0)) return;
      const box = tile.getBoundingClientRect(), scene = tile.querySelector(".stage-agent canvas") ?? tile.querySelector(".stage-scene");
      const at = scene?.getBoundingClientRect();
      const dx = at ? at.left - box.left - tile.clientLeft : 0, dy = at ? at.top - box.top - tile.clientTop : 0, sh = at?.height || h;
      // Not scaled to the tile yet (its scale comes after this layer's first layout): read again once it is.
      if (at && Math.abs(sh - h) > 4) return;
      setSize((was) => was && was.w === w && was.h === h && Math.abs(was.dx - dx) < 0.01 && Math.abs(was.dy - dy) < 0.01 && Math.abs(was.sh - sh) < 0.01 ? was : { w, h, dx, dy, sh });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    // The scene is scaled to the tile after this layer is laid out (useSceneScale keeps --k on the tile, which sizes the
    // scene): where the creature's canvas sits is read again whenever the tile or the scene changes size.
    const observer = new ResizeObserver(read);
    observer.observe(tile);
    const scene = tile.querySelector(".stage-scene");
    if (scene) observer.observe(scene);
    const mounted = new MutationObserver(read);
    mounted.observe(tile, { attributes: true, attributeFilter: ["style"] });
    const later = requestAnimationFrame(read);
    return () => { observer.disconnect(); mounted.disconnect(); cancelAnimationFrame(later); };
  }, []);

  const type = size ? voiceType(size.w, size.h) : null;
  // Each card at its largest (the agent's: always three lines; the person's pill; what was sent, three lines), measured on
  // the tile with its type, again once the stage's face (DM Sans) has loaded (measured in a fallback face, the framing left
  // too little room and a card could sit on the creature: T33).
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    let gone = false;
    void document.fonts?.load?.('450 16px "DM Sans"').then(() => { if (!gone) setFonts((n) => n + 1); }, () => {});
    return () => { gone = true; };
  }, []);
  useLayoutEffect(() => {
    const node = layer.current, A = agent.current, P = pill.current, S = sent.current;
    if (!node || !A || !P || !S || !size) return;
    const box = node.getBoundingClientRect(), r = A.getBoundingClientRect();
    const next = { below: Math.max(A.offsetHeight, P.offsetHeight, S.offsetHeight), above: 0, xa: r.left - box.left, xb: r.right - box.left, sent: S.offsetHeight };
    setCards((was) => was && was.below === next.below && was.sent === next.sent && was.above === next.above && Math.abs(was.xa - next.xa) < 0.01 && Math.abs(was.xb - next.xb) < 0.01 ? was : next);
  }, [size, fonts, phone]);

  // Whether a card is on the stage: the framing steps back for it, whatever the agent is doing (a reply lingering after
  // its voice, what the person sent while the agent works).
  useLayoutEffect(() => {
    const node = layer.current;
    if (!node) return;
    const read = () => setUp(!!node.querySelector(":scope > .vcap:not(.meas)"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, []);

  const rest = !turn && !up;
  useLayoutEffect(() => {
    if (size) frame.ask({ w: size.w, h: size.h, dx: size.dx, dy: size.dy, phone, rest, cards: cards && { below: cards.below, above: cards.above, xa: cards.xa, xb: cards.xb }, opener: turn });
  }, [frame, size, phone, rest, cards, turn]);

  // The backdrop's ground line follows the creature's feet as the framing moves it (the reference's backdrops: their frame's
  // y 357 on the feet): the tile's canvas says where they are drawn (--stage-feet, px from the tile's inner top) and how far that moves
  // the scene's ground (--stage-ground, the scene's own px: it is drawn 440 tall and scaled to the tile).
  useEffect(() => {
    const scene = layer.current?.parentElement?.querySelector<HTMLElement>(".stage-canvas");
    if (!scene || !size) return;
    return frame.watchFeet((feet) => {
      if (feet == null) { scene.style.removeProperty("--stage-feet"); scene.style.removeProperty("--stage-ground"); return; }
      scene.style.setProperty("--stage-feet", feet.toFixed(2) + "px");
      scene.style.setProperty("--stage-ground", (((feet - size.dy) * 440) / size.sh - 357).toFixed(2) + "px");
    });
  }, [frame, size]);

  const { solved, pending } = useSyncExternalStore(frame.subscribe, frame.snapshot);
  // Under the creature, a gap below its lowest drawn row; never past the tile's foot (the largest card kept inside it).
  // Until the creature is drawn and framed (its host loading, or a browser that cannot draw it), at the cards' floor.
  const floor = size && cards ? size.h - (phone ? 58 : 10) - cards.below : null;
  const top = size && cards ? Math.max(0, Math.min(solved ? solved.below : floor!, size.h - cards.below - 2)) : null;
  const topAny = size && cards ? Math.max(0, Math.min(solved ? solved.belowAny : floor!, size.h - cards.sent - 2)) : null;
  const style = (type ? {
    "--vu": `${type.u}px`, "--fsA": `${type.agent}px`, "--lhA": `${type.agentLine}px`, "--fsP": `${type.person}px`, "--lhP": `${type.personLine}px`,
    "--voice-top": top == null ? undefined : `${top}px`, "--voice-top-sent": topAny == null ? undefined : `${topAny}px`,
  } : {}) as CSSProperties;
  return (
    <div ref={layer} className="stage-voice" data-phone={phone || undefined} data-framed={solved && !pending ? "" : undefined} style={style}>
      <div ref={agent} className="vcap card agent meas" aria-hidden="true"><span className="paged-text"><span className="paged-text-run">{FILL}</span></span></div>
      <div ref={pill} className="vcap card person pill meas" aria-hidden="true">
        <span className="lead"><MicIcon /><span className="voice-bars"><i /><i /><i /><i /><i /></span></span><span className="cancel"><CancelGlyph /></span>
      </div>
      <div ref={sent} className="vcap card person sent meas" aria-hidden="true"><span className="vcap-said"><span>{FILL}</span></span></div>
      {children}
    </div>
  );
}

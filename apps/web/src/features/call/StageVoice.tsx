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
export function StageVoice({ frame, turn, phone, onGround, children }: { frame: StageFrame; turn: "listening" | "speaking" | null; phone: boolean;
  /** Where the creature's feet stand once a framing change settles, a share of the scene's height (null: no creature drawn):
   *  the stage's backdrop paints its ground line there (StageBackdrop `feet`). */
  onGround?: (share: number | null) => void; children?: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  const agent = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const sent = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number; dx: number; dy: number; sh: number } | null>(null);
  const [cards, setCards] = useState<(FrameCards & { sent: number; agent: number; pill: number }) | null>(null);
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
  // A phone's rules are for its portrait tile; turned on its side (a short, wide tile), the desktop's: the phone's room for
  // the name over the creature and for its widest card would leave the creature no room (the reference has no landscape
  // phone: PR "Decisions").
  phone = phone && !!size && size.h >= size.w;
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
    const next = { below: Math.max(A.offsetHeight, P.offsetHeight, S.offsetHeight), above: 0, xa: r.left - box.left, xb: r.right - box.left, sent: S.offsetHeight, agent: A.offsetHeight, pill: P.offsetHeight };
    setCards((was) => was && was.below === next.below && was.sent === next.sent && was.agent === next.agent && was.pill === next.pill && was.above === next.above && Math.abs(was.xa - next.xa) < 0.01 && Math.abs(was.xb - next.xb) < 0.01 ? was : next);
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

  const { solved, pending } = useSyncExternalStore(frame.subscribe, frame.snapshot);
  // Under the creature, a gap below its lowest drawn row, and nowhere else: a card that cannot be there and inside the tile
  // too (the largest in a tile as short as a phone on its side) is held, unseen (data-hold below), never moved up onto the
  // creature to fit. (Clamped to the largest card, the shared place of the agent's card and the person's pill rose onto the
  // creature as soon as the three-line agent's card could not fit, though the pill itself would.)
  // Until the creature is drawn and framed (its host loading, or a browser that cannot draw it), at the cards' floor.
  const floor = size && cards ? size.h - (phone ? 58 : 10) - cards.below : null;
  const top = size && cards ? Math.max(0, solved ? solved.below : floor!) : null;
  const topAny = size && cards ? Math.max(0, Math.min(solved ? solved.belowAny : floor!, size.h - cards.sent - 2)) : null;
  // No card over the creature while it eases back for one (or before its framing is solved), nor out of the tile. Each
  // framing change is said once, as it starts, with how the creature's lowest row will move (FrameMotion): the cards'
  // layer plays it as one composited animation, kept a gap under the creature (no card ever moves up onto it), and a card
  // that cannot be both under it and inside the tile yet (a reply's three lines while the creature still stands close, at
  // rest) is held, unseen and its pop-in not started, until it can (data-hold, released on a timer). Nothing is written
  // per frame; the backdrop's ground line is told where the feet end (onGround).
  const place = useRef({ h: 0, heights: { agent: 0, pill: 0, sent: 0 } });
  const ground = useRef(onGround);
  ground.current = onGround;
  place.current = { h: size?.h ?? 0, heights: { agent: cards?.agent ?? 0, pill: cards?.pill ?? 0, sent: cards?.sent ?? 0 } };
  useEffect(() => {
    const node = layer.current;
    if (!node) return;
    let playing: Animation | null = null;
    const timers: number[] = [];
    const stop = () => { playing?.cancel(); playing = null; for (const t of timers.splice(0)) window.clearTimeout(t); };
    const off = frame.watchMotion((m) => {
      stop();
      if (!m) { node.removeAttribute("data-hold"); ground.current?.(null); return; }
      // The cards rest where the change settles (its last floor, which the answer then gives as the layer's top: the render that
      // writes it comes after this, so the render's own value is the last change's, never the one this plays).
      const { h, heights } = place.current, top = Math.max(0, m.floor[m.floor.length - 1]), sh = size?.sh || h, dy = size?.dy ?? 0;
      // the backdrop's ground line where the feet will stand (its canvas is painted once, there: the ground reaches the
      // tile's foot, as the reference's backdrops do with the feet it is given)
      ground.current?.(Math.round(((m.feet[m.feet.length - 1] - dy) / sh) * 1e4) / 1e4);
      // the cards a gap under the creature as it eases: how far below their place, step by step
      const below = m.floor.map((f) => Math.max(0, f - top));
      if (below.some((d) => d > 0.25)) {
        const keyframes = below.map((d) => ({ transform: `translateY(${d.toFixed(2)}px)` }));
        if (keyframes.length === 1) keyframes.push(keyframes[0]);
        playing = node.animate(keyframes, { duration: Math.max(1, (below.length - 1) * m.step), easing: "linear", fill: "none" });
        playing.startTime = m.t0;
      }
      // a card held until it fits under the creature and inside the tile
      const fitsAt = (height: number) => below.findIndex((d) => top + d + height <= h - 2 + 0.5);
      const kinds = (["agent", "pill", "sent"] as const).map((kind) => [kind, fitsAt(heights[kind])] as const);
      const held = () => kinds.filter(([, n]) => n < 0 || m.t0 + n * m.step > performance.now()).map(([kind]) => kind).join(" ");
      const apply = () => { const hold = held(); if (hold) node.setAttribute("data-hold", hold); else node.removeAttribute("data-hold"); };
      apply();
      for (const [, n] of kinds) if (n > 0) timers.push(window.setTimeout(apply, Math.max(0, m.t0 + n * m.step - performance.now()) + 1));
    });
    return () => { off(); stop(); };
  }, [frame, size]);

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

import { describe, expect, test, vi } from "vitest";
import { capCentre, cardHeight, desktopDevice, easeFraming, FRAME_EASE, OPTIC, StageFrame, stageBands, TURN_HEAD, voiceType, type FrameProbe } from "./stage-frame";

/* The stage's framing (the design reference's fitFrame and capCentre: T21, T24d, T28, T33, T43), on a creature modelled
 * as a camera sees it: `tall` px tall at the nearest step (zk 1), smaller as it steps back (1/zk), its drawn middle
 * `mid0` px from the tile's top at no lift, moving up `slope0 / zk` px per unit of lift. Its shadow reaches `shadow` px
 * under its feet (its lowest drawn row within the cards' columns is that, the lowest anywhere the same). */
function creature({ tall = 300, mid0 = 330, slope0 = 400, shadow = 0 } = {}) {
  const calls: Array<[number, number]> = [];
  const probe: FrameProbe = {
    rows(lift, zk) {
      calls.push([lift, zk]);
      const h = tall / zk, mid = mid0 - (lift * slope0) / zk;
      return { top: mid - h / 2, low: mid + h / 2 + shadow, lowAny: mid + h / 2 + shadow };
    },
    slope: (zk) => slope0 / zk,
  };
  return { probe, calls, tall };
}
const near = (a: number, b: number, tol = 1.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("the tile's bands", () => {
  test("a gap of max(14px, 3.5% of the tile's height) to the creature, always; a phone keeps room for its name and badge", () => {
    expect(stageBands(300, false).gap).toBe(14);
    expect(stageBands(628, false).gap).toBeCloseTo(21.98, 2);
    expect(stageBands(628, false)).toMatchObject({ floor: 618, ceil: 10 });
    expect(stageBands(655, true)).toMatchObject({ floor: 597, ceil: 70 });
  });

  test("the voice text's type follows the tile: u = min(w/900, h/600), the agent's clamp(25.6u, 18, 34), the person's clamp(22.4u, 16, 28), lines on whole px", () => {
    // desktop 1440 × 900: the web's 16:9 tile
    expect(voiceType(1118, 628)).toMatchObject({ agentLine: 37, personLine: 33 });
    expect(voiceType(1118, 628).u).toBeCloseTo(628 / 600, 6);
    expect(voiceType(1118, 628).agent).toBeCloseTo(25.6 * 628 / 600, 6);
    // phone 390 × 844: the floors
    expect(voiceType(364, 655)).toEqual({ u: 364 / 900, agent: 18, agentLine: 25, person: 16, personLine: 23 });
    // a phone on its side (844 x 390: a tile 186 px tall): the type steps down from the floors so the agent's card takes 42% of the tile
    // at most (it took 55%), the person's with it in proportion, the card's lines still whole px
    const side = voiceType(818, 186);
    expect(side.agentLine).toBe(18);
    expect(cardHeight(side.agentLine)).toBeLessThanOrEqual(0.42 * 186);
    expect(side.agent).toBeCloseTo(18 / 1.375, 6);
    // (the person's in proportion where that is above 12px: 932 x 430's tile, 220 px, 16 and 14.2; here it is at the 12)
    const wide = voiceType(513, 220);
    expect(wide.agent).toBeCloseTo(16, 6);
    expect(wide.person / wide.agent).toBeCloseTo(16 / 18, 6);
    expect(cardHeight(wide.agentLine)).toBeLessThanOrEqual(0.42 * 220);
    // ...and neither under 12px, whatever the tile: the person's stops there while the agent's still follows the tile down
    expect(voiceType(300, 120)).toMatchObject({ agent: 12, person: 12 });
    expect(side.person).toBe(12);
    // no card of the person's is taller than the agent's, at any tile
    for (let h = 100; h <= 300; h++) { const t = voiceType(h * 4, h); expect(cardHeight(t.personLine)).toBeLessThanOrEqual(cardHeight(t.agentLine) + 1e-9); }
    // a tile tall enough for the floors' card keeps them (243 px: 102 is 42% of it); the one a px shorter does not
    expect(voiceType(818, 243)).toMatchObject({ agent: 18, agentLine: 25, person: 16, personLine: 23 });
    expect(voiceType(818, 241).agentLine).toBeLessThan(25);
    // the card's height, for the line the css lays it out with (measured: 102 px at 25)
    expect(cardHeight(25)).toBeCloseTo(101.75, 6);
    // a large screen: the ceilings
    expect(voiceType(2400, 1500)).toMatchObject({ agent: 34, agentLine: 47, person: 28, personLine: 40 });
  });
});

describe("capCentre", () => {
  const vh = 628, { floor, ceil, gap } = stageBands(vh, false);

  test("room enough: the creature's drawn middle at the optical centre, 46% from the top, at the nearest step", () => {
    const { probe } = creature();
    const f = capCentre(probe, 0, 100, vh, ceil, floor, gap, 0, 1118);
    expect(f.zk).toBe(1);
    near((f.top + f.low) / 2, vh * OPTIC);
    expect(f.head).toBeCloseTo((f.low - f.top) * TURN_HEAD, 6);
  });

  test("a card that would not fit under it at the centre: it steps back only as far as the card needs, rising off the centre as little as that asks", () => {
    const { probe } = creature();
    const card = 200, f = capCentre(probe, 0, card, vh, ceil, floor, gap, 0, 1118);
    expect(f.zk).toBeGreaterThan(1);
    // never lower than the optical centre: it rises off it for the card, never sinks
    expect((f.top + f.low) / 2).toBeLessThanOrEqual(vh * OPTIC + 1.01);
    // the card fits under it, a gap from its lowest drawn row, and inside the tile's floor; its head's room and a gap under the ceiling
    expect(f.low + gap + card).toBeLessThanOrEqual(floor + 1.01);
    expect(f.top - f.head - gap).toBeGreaterThanOrEqual(ceil - 1.01);
    // one step nearer would not have fitted, at the centre or risen: its top and headroom would touch the ceiling
    const nearer = 300 / (f.zk - 0.08);
    expect(floor - card - gap - nearer * (1 + TURN_HEAD) - gap < ceil).toBe(true);
    // and it is no smaller than it would be kept at the centre: there it steps back to a size at which both ends fit
    let centre = 1;
    while (300 / centre / 2 + vh * OPTIC + gap + card > floor || vh * OPTIC - 300 / centre / 2 - (300 / centre) * TURN_HEAD - gap < ceil) centre += 0.08;
    expect(f.zk).toBeLessThanOrEqual(centre + 1e-9);
  });

  test("a card that fits under it at the centre only at a step back stands where it can, at the centre, when that costs no step; the same card in a tile a pixel shorter or taller never changes the creature's size by more than a step", () => {
    // the size of the creature in tiles from short to tall, the card sized as the stage sizes it for the tile (voiceType, 4:1 tile): no cliff
    // where the centre starts to fit at the furthest step (it was 77 to 22 px at 253 to 254 px of tile, the centre's way)
    let prev = 0, jumps = 0, worst = 1;
    for (let tile = 160; tile <= 460; tile++) {
      const b = stageBands(tile, false), line = voiceType(tile * 4, tile).agentLine;
      const f = capCentre(creature({ tall: 150, mid0: tile * 0.55 }).probe, 0, cardHeight(line), tile, b.ceil, b.floor, b.gap, 0, 1);
      const size = f.low - f.top;
      if (prev > 0) { worst = Math.min(worst, size / prev); if (size < prev * 0.93) jumps++; }
      prev = size;
    }
    expect(jumps, `creature size drops by over 7% when the tile grows a pixel (worst: ${worst.toFixed(3)} of the size before)`).toBe(0);
  });

  test("a creature that is not held still: the room it moves under its key pose is kept under it, besides the gap", () => {
    const sway = 0.01, at = (card: number, k = 0) => capCentre(creature().probe, 0, card, vh, ceil, floor, gap, 0, 1118, 1, k);
    // with the room kept it is never larger than one that keeps none, and the card is under it with the room to spare, whatever the card
    let steppedBack = 0;
    for (let card = 100; card < 300; card++) {
      const held = at(card), live = at(card, sway);
      expect(live.zk).toBeGreaterThanOrEqual(held.zk - 1e-9);
      expect(live.low + sway * (live.low - live.top) + gap + card).toBeLessThanOrEqual(floor + 1.01);
      if (live.zk > held.zk + 1e-9) steppedBack++;
    }
    // ...and for a card the held creature fits under with less than its sway to spare, only a creature that keeps the room steps back for it
    expect(steppedBack).toBeGreaterThan(0);
  });

  test("no step back fits at the centre: it rises off it rather than let the card touch it (T33), the gap kept", () => {
    const { probe } = creature({ tall: 600 });
    const card = 420, f = capCentre(probe, 0, card, vh, ceil, floor, gap, 0, 1118);
    expect(f.zk).toBeCloseTo(3.4, 6);
    // its lowest row a gap over the card at its largest, which ends on the floor
    near(f.low, floor - card - gap);
    expect((f.top + f.low) / 2).toBeLessThan(vh * OPTIC);
    // the card, placed under it, never overlaps it
    const cardTop = f.low + gap;
    expect(cardTop - f.low).toBeGreaterThanOrEqual(Math.max(14, vh * 0.035) - 1e-9);
    expect(cardTop + card).toBeLessThanOrEqual(floor + 1.01);
  });

  test("a tile too short for the card with it at the centre (a phone on its side): it rises off the centre and steps back only as far as the card needs, never to the furthest step", () => {
    // a tile 186 px tall, the agent's card 102: the creature's middle at the centre would leave no room under it at any step
    const vh2 = 186, b = stageBands(vh2, false), card = 102, tall = 60;
    const f = capCentre(creature({ tall, mid0: vh2 / 2 }).probe, 0, card, vh2, b.ceil, b.floor, b.gap, 0, 1);
    // its lowest row a gap over the card, which ends on the floor; its head's room and a gap under the ceiling
    near(f.low, b.floor - card - b.gap);
    expect(f.top - f.head - b.gap).toBeGreaterThanOrEqual(b.ceil - 1e-9);
    // drawn larger than at the furthest step (its size there: tall / 3.4), and one step nearer would not have kept those
    expect(f.low - f.top).toBeGreaterThan(tall / 3.4 + 5);
    const nearer = tall / (f.zk - 0.08);
    expect(f.low - nearer * (1 + TURN_HEAD) - b.gap).toBeLessThan(b.ceil);
  });

  test("risen off the centre, what it acts out is held inside the tile by the step back, not by lowering it onto the card", () => {
    // a phone on its side again, its acts (a hop, the cogs over its head) reaching one and a half of its heights over it: its top at the ceiling
    // would put them out of the tile, and lowering it to take them in would put it on the card
    const vh2 = 186, b = stageBands(vh2, false), card = 102, { probe } = creature({ tall: 60, mid0: vh2 / 2 });
    const reachRows = (lift: number, zk: number) => { const r = probe.rows(lift, zk, 0, 1), h = r.low - r.top; return { top: r.top - 1.5 * h, bottom: r.low + 0.1 * h }; };
    const f = capCentre({ ...probe, reachRows }, 0, card, vh2, b.ceil, b.floor, b.gap, 0, 1);
    expect(reachRows(f.lift, f.zk).top).toBeGreaterThanOrEqual(-0.5);
    expect(reachRows(f.lift, f.zk).bottom).toBeLessThanOrEqual(vh2 + 0.5);
    // its lowest row a gap over the card still (the card is not held unseen, StageVoice)
    expect(f.low).toBeLessThanOrEqual(b.floor - card - b.gap + 1.01);
    // and it is larger than at the furthest step, which the acts alone would not need
    expect(f.zk).toBeLessThan(3.4 - 0.5);
  });

  test("a tile too short for the card and the creature both: it never rises out of the tile, its top kept on it", () => {
    const vh2 = 95, b = stageBands(vh2, false), f = capCentre(creature({ tall: 300, mid0: 60 }).probe, 0, 102, vh2, b.ceil, b.floor, b.gap, 0, 1);
    expect(f.top).toBeGreaterThanOrEqual(-1.01);
    expect(f.low).toBeLessThanOrEqual(vh2);
  });

  test("the gap rule holds for every card size: the card's top a gap or more under the creature's lowest drawn row, shadow included", () => {
    for (const card of [0, 60, 120, 180, 240, 300, 360]) for (const shadow of [0, 12]) {
      const f = capCentre(creature({ shadow }).probe, 0, card, vh, ceil, floor, gap, 0, 1118);
      const top = f.low + gap;
      expect(top - f.low).toBeGreaterThanOrEqual(stageBands(vh, false).gap - 1e-9);
      expect(top + card).toBeLessThanOrEqual(floor + 1.01);
    }
  });

  test("at rest on a desktop it stands as large as a turn's framing of the same creature with no card, stepping back only as far as the tile needs", () => {
    const { probe, calls } = creature({ tall: 240 });
    const f = capCentre(probe, 0, 0, vh, ceil, floor, gap, 0, 1118);
    expect(calls[0][1]).toBe(1);
    expect(f.zk).toBe(1);
    expect(f.head).toBeCloseTo((f.low - f.top) * TURN_HEAD, 6);
    near((f.top + f.low) / 2, vh * OPTIC);
    // the turn's framing with a card under it that fits is the same size; one that does not fit steps back from it
    const turn = capCentre(creature({ tall: 240 }).probe, 0, 144, vh, ceil, floor, gap, 0, 1118);
    expect(turn.zk).toBe(f.zk);
    expect(turn.low - turn.top).toBeCloseTo(f.low - f.top, 6);
    const big = capCentre(creature({ tall: 480 }).probe, 0, 300, vh, ceil, floor, gap, 0, 1118);
    expect(big.zk).toBeGreaterThan(1);
  });
});

describe("easing", () => {
  test("FRAME_EASE of the way a frame, landing once within 1e-3", () => {
    expect(FRAME_EASE).toBe(0.22);
    const to = { lift: 1, zk: 2 };
    let f = { lift: 0, zk: 1 }, frames = 0;
    f = easeFraming(f, to);
    expect(f.lift).toBeCloseTo(0.22, 10);
    expect(f.zk).toBeCloseTo(1.22, 10);
    while ((f.lift !== to.lift || f.zk !== to.zk) && frames < 100) { f = easeFraming(f, to); frames++; }
    expect(f).toEqual(to);
    // (1 - .22)^n under 1e-3: about 28 frames, a little under a second at the creature's 30 a second
    expect(frames).toBeGreaterThan(20);
    expect(frames).toBeLessThan(30);
  });
});

describe("the channel", () => {
  const ask = { w: 1118, h: 628, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: { below: 144, above: 0, xa: 209, xb: 909 }, opener: null };

  test("an ask the same as the last is not passed on; a changed one is", () => {
    const frame = new StageFrame(), heard = vi.fn();
    frame.listen(heard);
    frame.ask(ask);
    frame.ask({ ...ask, cards: { ...ask.cards } });
    expect(heard).toHaveBeenCalledTimes(1);
    frame.ask({ ...ask, rest: false, opener: "listening" });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(frame.request).toMatchObject({ rest: false, opener: "listening" });
  });

  test("the cards' place is published to the stage; the feet only when they move a quarter px or more", () => {
    const frame = new StageFrame(), placed = vi.fn(), feet = vi.fn();
    frame.subscribe(placed);
    const target = { lift: 0.1, zk: 1.2, low: 437, top: 141, head: 98 };
    frame.solve({ target, gap: 22, below: 459, belowAny: 465, above: 21, key: "a" });
    frame.solve({ target, gap: 22, below: 459, belowAny: 465, above: 21, key: "a" });
    expect(placed).toHaveBeenCalledTimes(1);
    expect(frame.snapshot().solved?.below).toBe(459);
    // solving a newer ask: the answer stands, said to be pending, until the new one comes
    frame.working();
    expect(frame.snapshot()).toMatchObject({ pending: true, solved: { below: 459 } });
    frame.solve({ target, gap: 22, below: 470, belowAny: 470, above: 21, key: "b" });
    expect(frame.snapshot()).toMatchObject({ pending: false, solved: { below: 470 } });
    frame.watchFeet(feet);
    expect(feet).toHaveBeenLastCalledWith(null);
    frame.feet(400); frame.feet(400.1); frame.feet(401);
    expect(feet.mock.calls.map((c) => c[0])).toEqual([null, 400, 401]);
  });
});

describe("capCentre finds the reference's step with fewer trial renders", () => {
  /** The reference's search (creator.js capCentre), step by step from zk 1. */
  function scan(probe: FrameProbe, hTop: number, hBot: number, vh: number, ceil: number, floor: number, gap: number) {
    const zk0 = 1, headK = TURN_HEAD;
    const want = vh * OPTIC, mid = (m: { top: number; lowAny: number }) => (m.top + m.lowAny) / 2;
    let best = { zk: zk0, lift: 0, low: 0 }, fits = false;
    for (let zk = zk0; zk <= 3.4001; zk += 0.08) {
      let lift = 0, m = probe.rows(0, zk, 0, 1);
      for (let i = 0; i < 7 && Math.abs(mid(m) - want) > 1; i++) { lift += (mid(m) - want) / probe.slope(zk); m = probe.rows(lift, zk, 0, 1); }
      best = { zk, lift, low: m.low };
      if (m.low + gap + hBot <= floor && m.top - (m.low - m.top) * headK - gap - hTop >= ceil) { fits = true; break; }
    }
    return { ...best, fits };
  }
  test.each([[300, 0], [300, 200], [420, 144], [520, 260], [600, 420], [360, 0], [520, 0], [900, 0]])("a creature %d px tall, a card %d px", (tall, card) => {
    for (const vh of [538, 628, 655]) {
      const { floor, ceil, gap } = stageBands(vh, vh === 655);
      const a = creature({ tall, mid0: vh * 0.55 }), b = creature({ tall, mid0: vh * 0.55 });
      const fast = capCentre(a.probe, 0, card, vh, ceil, floor, gap, 0, 1), ref = scan(b.probe, 0, card, vh, ceil, floor, gap);
      // at rest (no card) where the tile holds it at the centre: the reference's step and lift. For a card, or where no step fits at the
      // centre, the reference's step is the furthest this one goes: it stands no further back (a nearer step, risen off the centre, where
      // that holds the card and all it acts out), and at the reference's own where that is no nearer
      if (ref.fits && !card) { expect(fast.zk).toBeCloseTo(ref.zk, 9); expect(fast.lift).toBeCloseTo(ref.lift, 6); }
      else expect(fast.zk).toBeLessThanOrEqual(ref.zk + 1e-9);
      if (ref.fits && card && Math.abs(fast.zk - ref.zk) < 1e-9) expect(fast.lift).toBeCloseTo(ref.lift, 6);
      if (!card) expect(a.calls.length).toBeLessThanOrEqual(b.calls.length);
    }
  });
});

test("a desktop is a fine pointer with no coarse one, or the desktop app, never a handset: a phone on its side (with a mouse too), or a touch screen past the phone rule, is none", () => {
  expect(desktopDevice({ handset: true, finePointer: false, anyCoarse: true, app: false })).toBe(false); // 844 x 390, coarse
  expect(desktopDevice({ handset: false, finePointer: false, anyCoarse: true, app: false })).toBe(false); // 932 x 430, coarse: wide for the phone rule
  expect(desktopDevice({ handset: false, finePointer: true, anyCoarse: false, app: false })).toBe(true);
  expect(desktopDevice({ handset: false, finePointer: false, anyCoarse: true, app: true })).toBe(true); // the app on a touch laptop
  expect(desktopDevice({ handset: true, finePointer: true, anyCoarse: false, app: true })).toBe(false); // (a narrow window is a phone's layout)
  expect(desktopDevice({ handset: false, finePointer: true, anyCoarse: true, app: false })).toBe(false); // a wide phone with a mouse, a touch laptop in a browser: a phone's fill
  expect(desktopDevice({ handset: false, finePointer: true, anyCoarse: true, app: true })).toBe(true); // the app stays a desktop
});

describe("a tile too narrow for the creature at the nearest step", () => {
  test("the solve starts from the step the tile's width needs (zk0), never nearer, and still steps back for a card from there", () => {
    // at rest: the creature at its floor, its drawn middle at the optical centre, no nearer than zk0
    const rest = creature();
    const atRest = capCentre(rest.probe, 0, 0, 1100, 10, 1090, 38.5, 0, 600, 1.3);
    expect(atRest.zk).toBeCloseTo(1.3, 6);
    expect(rest.calls.every(([, zk]) => zk >= 1.3 - 1e-9)).toBe(true);
    near((atRest.top + atRest.low) / 2, 1100 * OPTIC, 1.5);
    // a card too large for the creature at its floor: stepped back from there, in ZK_STEP steps
    const turn = creature({ tall: 600 });
    const withCard = capCentre(turn.probe, 0, 480, 1100, 10, 1090, 38.5, 0, 600, 1.3);
    expect(withCard.zk).toBeGreaterThan(1.3);
    expect(Math.abs(((withCard.zk - 1.3) / 0.08) - Math.round((withCard.zk - 1.3) / 0.08))).toBeLessThan(1e-6);
  });
});

describe("everything the creature acts out stays on the tile", () => {
  test("where its acts would rise past the tile's top at the nearest step, the solve steps back until they do not", () => {
    // its reach: as tall again as its pose over its head, half that under its feet, scaled with the step back
    const { probe } = creature({ tall: 300 });
    const reachRows = (lift: number, zk: number) => { const r = probe.rows(lift, zk, 0, 600); const h = r.low - r.top; return { top: r.top - h, bottom: r.low + h / 2 }; };
    const short = 420;
    const plain = capCentre(probe, 0, 0, short, 10, short - 10, 14.7, 0, 600);
    const kept = capCentre({ ...probe, reachRows }, 0, 0, short, 10, short - 10, 14.7, 0, 600);
    expect(reachRows(plain.lift, plain.zk).top).toBeLessThan(0);
    expect(kept.zk).toBeGreaterThan(plain.zk);
    expect(reachRows(kept.lift, kept.zk).top).toBeGreaterThanOrEqual(0);
    expect(reachRows(kept.lift, kept.zk).bottom).toBeLessThanOrEqual(short);
  });
});

describe("a tile too short for the creature's reach and a card", () => {
  test("when no step fits, both ends of what it acts out stay on the tile: stepped back until they can, never one end cut for the other", () => {
    // its reach twice its pose's height, over and under it; a card as tall as half the tile
    const { probe } = creature({ tall: 260 });
    const reachRows = (lift: number, zk: number) => { const r = probe.rows(lift, zk, 0, 600); const h = r.low - r.top; return { top: r.top - h, bottom: r.low + h }; };
    const vh = 300;
    const f = capCentre({ ...probe, reachRows }, 0, 150, vh, 10, vh - 10, 14, 0, 600);
    const rr = reachRows(f.lift, f.zk);
    expect(rr.top).toBeGreaterThanOrEqual(-0.5);
    expect(rr.bottom).toBeLessThanOrEqual(vh + 0.5);
    expect(f.zk).toBeGreaterThan(1);
  });
});

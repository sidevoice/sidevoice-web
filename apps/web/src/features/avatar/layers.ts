import { useLayoutEffect, type RefObject } from "react";

/* Layered drawings (web#278, desktop#149). WebKit composites an animation only on a whole HTML layer: one on an element
 * inside an SVG repaints the drawing every frame, on the CPU. A layered drawing is the same SVG cut into HTML layers, so
 * that the same CSS moves it and nothing is painted again.
 *
 * Every element the page's stylesheets move (an animation or a transition, in any state: movingSelectors) and every
 * element above one becomes a twin: an HTML element of the same name, with its attributes, among its siblings in the
 * same order. So every rule that reached the SVG element reaches its twin (by class, by element name, by state, by
 * position), and the twin moves: transform and opacity, on a layer of its own. What lies between twins is drawn in
 * slices, <svg>s in paint order, each holding a run of still elements as they were, inside clones of the elements above
 * them (for what those pass on: attributes, inherited styles, a clip). The clones and the slices hold still, whatever the
 * rules say (the [data-clone] rules, styles/call.css); their twins move instead. The drawing's defs land in its first
 * slice, and every slice paints from them.
 *
 * Geometry. CSS px inside a twin are the drawing's user units: a viewport (the root <svg>, a nested one) maps its viewBox
 * with a zoom on a frame inside its twin, kept as it resizes, so the layers are laid out at the size they show and
 * rasterised sharp. A twin is a box round what it holds, placed where that lies in its parent's user space, and its pivot
 * is set on it in px: the transform-origin its element had (on its fill-box or the view box), measured on the drawing
 * before it is cut. A transform or an opacity attribute moves to its twin under every author rule, as presentation
 * attributes are (the sv-layers layer). */

const SVG_NS = "http://www.w3.org/2000/svg";
/** Room around a slice's content for what its bounding box leaves out (strokes, the ink outline), in user units. */
const BLEED = 8;
/** The drawings a moving rule is scoped under (its first compound): the avatars, the stage's backdrop and scene. */
const SCOPES = /\.(sv-avatar|backdrop|stage-[\w-]+)\b/;

/** Where in `selector` the first character `at` accepts lies outside brackets and parentheses, or -1. */
function topLevel(selector: string, at: (c: string) => boolean): number {
  let depth = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (!depth && at(c)) return i;
  }
  return -1;
}
function splitList(list: string): string[] {
  const out: string[] = [];
  for (let rest = list, i = topLevel(rest, (c) => c === ","); ; i = topLevel(rest, (c) => c === ",")) {
    out.push((i < 0 ? rest : rest.slice(0, i)).trim());
    if (i < 0) return out.filter(Boolean);
    rest = rest.slice(i + 1);
  }
}
/** The part of `selector` inside the drawing it is scoped under, or null for a rule not scoped under one. */
function inside(selector: string): string | null {
  const i = topLevel(selector, (c) => /[\s>+~]/.test(c));
  if (i < 0 || !SCOPES.test(selector.slice(0, i))) return null;
  const rest = selector.slice(i).replace(/^[\s>+~]+/, "");
  return rest.includes(".") && !rest.includes("::") ? rest : null;
}

let selectors: string[] | null = null;
/** What the page's stylesheets move inside a drawing: the inner part of the selector of every rule scoped under one
 *  that starts an animation or a transition, in whatever state. Read from the stylesheets once. */
function movingSelectors(): string[] {
  if (selectors) return selectors;
  const found = new Set<string>();
  const read = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        // An animation (its name, or the timing of one an element names itself: the nails, the pages) or a transition.
        const style = rule.style, animation = style.getPropertyValue("animation-name");
        const timed = (property: string) => /[1-9]/.test(style.getPropertyValue(property));
        if ((!animation || animation === "none") && !timed("animation-duration") && !timed("transition-duration")) continue;
        for (const selector of splitList(rule.selectorText)) {
          const inner = inside(selector);
          if (inner) found.add(inner);
        }
      } else if ("cssRules" in rule) read((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { read(sheet.cssRules); } catch { /* another origin's: none of ours */ }
  }
  return (selectors = [...found]);
}

/** The elements of `svg` something moves. */
function movingIn(svg: SVGSVGElement): Set<Element> {
  const list = movingSelectors();
  let found: Element[];
  try { found = list.length ? Array.from(svg.querySelectorAll(list.join(","))) : []; }
  catch { found = list.flatMap((selector) => { try { return Array.from(svg.querySelectorAll(selector)); } catch { return []; } }); }
  return new Set(found.filter((element) => element instanceof SVGElement));
}

interface Box { x: number; y: number; w: number; h: number }
/** A piece of a layered drawing, and its box in its parent's user space. */
interface Part { node: HTMLElement | SVGSVGElement; box: Box }
const unite = (a: Box | null, b: Box): Box => !a ? b : {
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
};
/** An element's box in its parent's user space (its bounding box through its own transform attribute), or in its own
 *  (`own`: for one whose twin carries that transform). */
function boxIn(element: Element, own = false): Box | null {
  if (!(element instanceof SVGGraphicsElement)) return null;
  let b: DOMRect;
  try { b = element.getBBox(); } catch { return null; }
  if (!(b.width > 0 || b.height > 0)) return null;
  const m = own ? null : element.transform?.baseVal.consolidate()?.matrix;
  if (!m) return { x: b.x, y: b.y, w: b.width, h: b.height };
  const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const force = (element: Element, property: string, value: string) => (element as SVGElement).style.setProperty(property, value, "important");

/** The pivot (transform-origin, in its parent's user space) of every twin-to-be, and the box of every run of still
 *  elements, measured on a copy of the drawing beside it: first with the twins shown and still (each pivot is the one it
 *  has on the box it has when it shows), then with everything shown (a run's box holds whatever it may show). */
function measure(svg: SVGSVGElement, twins: Set<Element>) {
  const probe = svg.cloneNode(true) as SVGSVGElement;
  probe.setAttribute("aria-hidden", "true");
  svg.after(probe);
  const copy = [probe, ...probe.querySelectorAll("*")];
  const index = new Map([svg, ...svg.querySelectorAll("*")].map((element, i) => [element, i]));
  const twin = (element: Element) => copy[index.get(element)!];
  const pivots = new Map<Element, [number, number]>(), boxes = new Map<Element, Box>();
  try {
    for (const element of twins) {
      const c = twin(element);
      force(c, "display", "inline");
      force(c, "animation", "none");
      force(c, "transition", "none");
    }
    for (const element of twins) {
      const c = twin(element), style = getComputedStyle(c);
      const [ox, oy] = style.transformOrigin.split(" ").map(parseFloat);
      let at: [number, number] = [ox || 0, oy || 0];
      if (style.transformBox !== "view-box") {
        try { const b = (c as SVGGraphicsElement).getBBox(); at = [b.x + at[0], b.y + at[1]]; } catch { /* no box: from its origin */ }
      }
      pivots.set(element, at);
    }
    for (const c of copy) if (c !== probe) force(c, "display", "inline");
    // Each run's box, keyed by its first element; a twin with no twin inside is drawn whole, in a box of its own.
    for (const parent of [svg, ...twins]) {
      const kids = Array.from(parent.children), whole = !kids.some((kid) => twins.has(kid));
      if (whole && parent !== svg) {
        const b = boxIn(twin(parent), true);
        if (b) boxes.set(parent, b);
        continue;
      }
      let run: Box | null = null, first: Element | null = null;
      for (const kid of [...kids, null]) {
        if (!kid || twins.has(kid)) {
          if (first && run) boxes.set(first, run);
          run = null; first = null;
          continue;
        }
        first ??= kid;
        const b = boxIn(twin(kid));
        if (b) run = unite(run, b);
      }
    }
  } finally {
    probe.remove();
  }
  return { pivots, boxes };
}

/** A viewport's mapping of its viewBox onto its box `w` × `h`: zoom `k`, then the shift (x, y) in the box's px. */
function fit(svg: SVGSVGElement, w: number, h: number): { kx: number; ky: number; x: number; y: number } {
  const vb = svg.hasAttribute("viewBox") ? svg.viewBox.baseVal : null;
  if (!vb || !(vb.width > 0 && vb.height > 0)) return { kx: 1, ky: 1, x: 0, y: 0 };
  const par = svg.preserveAspectRatio.baseVal, sx = w / vb.width, sy = h / vb.height;
  if (par.align === SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE) return { kx: sx, ky: sy, x: -vb.x * sx, y: -vb.y * sy };
  const k = par.meetOrSlice === SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE ? Math.max(sx, sy) : Math.min(sx, sy);
  const ax = ((par.align - 2) % 3) / 2, ay = Math.floor((par.align - 2) / 3) / 2;
  return { kx: k, ky: k, x: (w - vb.width * k) * ax - vb.x * k, y: (h - vb.height * k) * ay - vb.y * k };
}

/** A length of a nested viewport, in its parent's user units (`of`: the parent's size along it, for a percentage). */
const length = (l: SVGAnimatedLength, of: number) => l.baseVal.unitType === SVGLength.SVG_LENGTHTYPE_PERCENTAGE ? (l.baseVal.valueInSpecifiedUnits * of) / 100 : l.baseVal.value;
/** The size of a viewport's user space: its viewBox's, or its own box's. */
const userSize = (svg: SVGSVGElement, w: number, h: number): [number, number] =>
  svg.hasAttribute("viewBox") && svg.viewBox.baseVal.width > 0 ? [svg.viewBox.baseVal.width, svg.viewBox.baseVal.height] : [w, h];

const px = (v: number) => `${Math.round(v * 1000) / 1000}px`;

/** `svg` cut into twins and slices (see the header), in its place. Returns what puts the drawing back as it was. */
export function layerize(svg: SVGSVGElement): () => void {
  const moving = movingIn(svg);
  if (!moving.size) return () => {};
  const twins = new Set<Element>();
  for (const element of moving) for (let e: Element | null = element; e && e !== svg; e = e.parentElement) twins.add(e);
  const { pivots, boxes } = measure(svg, twins);
  const viewports: { svg: SVGSVGElement; twin: HTMLElement; frame: HTMLElement; parent: SVGSVGElement | null }[] = [];
  /** Where the box a piece was laid in lies in user space. */
  const offsets = new Map<Element, { x: number; y: number }>();

  const twinOf = (element: Element): HTMLElement => {
    let t: HTMLElement = document.createElement(element.localName);
    // An SVG name that is also an HTML element's (<a>, <title>…) would be that element: a plain box instead.
    if (!(t instanceof HTMLUnknownElement)) t = document.createElement("div");
    for (const { name, value } of Array.from(element.attributes)) if (name !== "id" && name !== "transform" && name !== "opacity") t.setAttribute(name, value);
    t.setAttribute("data-twin", "");
    const m = element instanceof SVGGraphicsElement && element.hasAttribute("transform") ? element.transform.baseVal.consolidate()?.matrix : null;
    if (m) { t.setAttribute("data-lyr-t", ""); t.style.setProperty("--lyr-t", `translate(${px(m.e)}, ${px(m.f)}) matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, 0, 0)`); }
    if (element.hasAttribute("opacity")) { t.setAttribute("data-lyr-o", ""); t.style.setProperty("--lyr-o", element.getAttribute("opacity")!); }
    return t;
  };
  const clone = (element: Element, deep: boolean) => {
    const c = element.cloneNode(deep) as Element;
    // Its twin has its transform and opacity (and WebKit draws a transform attribute even under transform: none).
    for (const name of ["id", "transform", "opacity"]) c.removeAttribute(name);
    c.setAttribute("data-clone", "");
    return c;
  };
  /** A slice: `chain` (clones of the twins above, from the viewport down) round `content`, in a box that holds it. */
  const slice = (chain: Element[], content: Node[], box: Box | undefined): Part => {
    const b = box ? { x: box.x - BLEED, y: box.y - BLEED, w: box.w + 2 * BLEED, h: box.h + 2 * BLEED } : { x: 0, y: 0, w: 0, h: 0 };
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("data-slice", "");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
    s.setAttribute("style", `position:absolute;width:${px(b.w)};height:${px(b.h)};overflow:visible`);
    let at: Element = s;
    for (const element of chain) { const c = clone(element, false); at.append(c); at = c; }
    at.append(...content);
    return { node: s, box: b };
  };
  /** `parts` into `into`, placed in it as they lie in user space, `at` being where its own box lies there. */
  const lay = (into: HTMLElement, parts: Part[], at: { x: number; y: number }) => {
    for (const { node, box } of parts) {
      node.style.left = px(box.x - at.x);
      node.style.top = px(box.y - at.y);
      offsets.set(node, at);
      into.append(node);
    }
  };

  /** The twin of `element` (in `twins`, or the root), with what is inside it, and its box (where it lies in its parent's
   *  user space: what it holds, so that WebKit gives its layer what it draws); `chain`: the twins above it to its viewport. */
  const cut = (element: Element, chain: Element[], viewport: SVGSVGElement | null): Part => {
    const t = twinOf(element);
    const parts: Part[] = [];
    const isViewport = element instanceof SVGSVGElement;
    // A viewport: a frame inside maps its viewBox (fitted as it resizes, `place`, outer viewports first).
    const frame = isViewport ? document.createElement("div") : null;
    if (isViewport) viewports.push({ svg: element, twin: t, frame: frame!, parent: viewport });
    if (isViewport) chain = [];
    else chain = [...chain, element];
    const kids = Array.from(element.childNodes);
    if (!isViewport && !kids.some((kid) => twins.has(kid as Element))) {
      // Nothing moves inside it: it is drawn whole, its clone holding still in its own slice.
      parts.push(slice(chain.slice(0, -1), [clone(element, true)], boxes.get(element)));
    } else {
      let run: Node[] = [];
      const flush = () => {
        const first = run.find((node) => node instanceof Element);
        if (first) parts.push(slice(chain, run.map((node) => node.cloneNode(true)), boxes.get(first)));
        run = [];
      };
      for (const kid of kids) {
        if (twins.has(kid as Element)) { flush(); parts.push(cut(kid as Element, chain, isViewport ? element : viewport)); }
        else run.push(kid);
      }
      flush();
    }
    if (frame) {
      // Its parts lie in user space in its frame.
      frame.setAttribute("data-frame", "");
      frame.style.cssText = "position:absolute;left:0;top:0";
      lay(frame, parts, { x: 0, y: 0 });
      t.append(frame);
      t.style.overflow = getComputedStyle(element).overflow;
      if (element !== svg) t.style.position = "absolute";
      return { node: t, box: { x: 0, y: 0, w: 0, h: 0 } };
    }
    // A box round what it holds (never empty: WebKit drops the opacity of a layer with an empty box), its pivot in it.
    const held = parts.reduce<Box | null>((all, part) => (part.box.w || part.box.h ? unite(all, part.box) : all), null) ?? { x: 0, y: 0, w: 1, h: 1 };
    const [ox, oy] = pivots.get(element) ?? [0, 0];
    t.style.cssText += `;position:absolute;width:${px(held.w)};height:${px(held.h)};transform-box:border-box;transform-origin:${px(ox - held.x)} ${px(oy - held.y)}`;
    lay(t, parts, held);
    return { node: t, box: held };
  };

  const root = cut(svg, [], null).node as HTMLElement;
  root.setAttribute("data-layers", "");
  if (getComputedStyle(svg).position === "static") root.style.position = "relative";
  const sizes = new Map<SVGSVGElement, [number, number]>();
  const place = () => {
    for (const v of viewports) {
      let w: number, h: number;
      if (!v.parent) { const box = getComputedStyle(v.twin); w = parseFloat(box.width) || 0; h = parseFloat(box.height) || 0; }
      else {
        const [pw, ph] = sizes.get(v.parent) ?? [0, 0];
        w = length(v.svg.width, pw); h = length(v.svg.height, ph);
        const at = offsets.get(v.twin) ?? { x: 0, y: 0 };
        Object.assign(v.twin.style, { left: px(length(v.svg.x, pw) - at.x), top: px(length(v.svg.y, ph) - at.y), width: px(w), height: px(h) });
      }
      sizes.set(v.svg, userSize(v.svg, w, h));
      const { kx, ky, x, y } = fit(v.svg, w, h);
      // A uniform scale is a zoom, laid out at the size it shows; a stretched one (preserveAspectRatio none) a transform.
      Object.assign(v.frame.style, kx === ky ? { zoom: String(kx), left: px(x / kx), top: px(y / kx), transform: "" }
        : { zoom: "", left: px(x), top: px(y), transform: `scale(${kx}, ${ky})`, transformOrigin: "0 0" });
    }
  };
  svg.replaceWith(root);
  place();
  const resized = new ResizeObserver(place);
  resized.observe(root);
  return () => {
    resized.disconnect();
    root.replaceWith(svg);
  };
}

/** Layers the drawing in `host` (its root <svg>) while `on`, and again when the drawing changes; off, it is put back. A
 *  drawing not laid out yet (in a hidden part of the page) has nothing to measure: it is layered once it shows. */
export function useLayers(host: RefObject<HTMLElement | null>, on: boolean, drawing: unknown) {
  useLayoutEffect(() => {
    const svg = on ? host.current?.querySelector(":scope > svg") : null;
    if (!(svg instanceof SVGSVGElement)) return;
    let undo: (() => void) | undefined;
    const cut = () => {
      try {
        undo = layerize(svg);
      } catch (error) {
        // A drawing that cannot be cut stays one still SVG.
        console.warn("[sidevoice] a drawing could not be layered; it stays still", error);
      }
    };
    const shown = () => svg.getClientRects().length > 0 && svg.getBoundingClientRect().width > 0;
    if (shown()) { cut(); return () => undo?.(); }
    const wait = new ResizeObserver(() => { if (!undo && shown()) { wait.disconnect(); cut(); } });
    wait.observe(svg);
    return () => { wait.disconnect(); undo?.(); };
  }, [on, drawing]);
}

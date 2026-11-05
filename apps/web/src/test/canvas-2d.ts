/* A 2D canvas for tests: jsdom has none (getContext gives null, and there is no Path2D or DOMPoint). This one draws
 * nothing and keeps what was asked of it, so a drawing can be held to what it does: which calls, with what. */

export type Call = [name: string, args: unknown[]];

/** A context that records every call (and every property set, as "set:<name>"). */
export function recordingContext(width = 300, height = 150) {
  const calls: Call[] = [];
  const canvas = { width, height };
  const state: Record<string | symbol, unknown> = {
    canvas, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", letterSpacing: "0px",
  };
  const answers: Record<string, (...args: unknown[]) => unknown> = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: (text) => ({ width: String(text).length * 10 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Number(w) * Number(h) * 4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Number(w) * Number(h) * 4) }),
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === "string" && key in answers) return (...args: unknown[]) => { calls.push([key, args]); return answers[key](...args); };
      if (key in target) return target[key];
      if (typeof key !== "string" || key === "then") return undefined;
      return (...args: unknown[]) => { calls.push([key, args]); };
    },
    set(target, key, value) { target[key] = value; if (typeof key === "string") calls.push(["set:" + key, [value]]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, canvas };
}

/** jsdom's canvas, Path2D and DOMPoint, made to draw into recording contexts. Returns what puts them back. */
export function installCanvas2d(): () => void {
  const g = globalThis as Record<string, unknown>;
  const kept = { Path2D: g.Path2D, DOMPoint: g.DOMPoint, getContext: HTMLCanvasElement.prototype.getContext };
  g.Path2D = class { constructor(public d?: unknown) {} } as unknown;
  // every method of a path is a no-op
  for (const name of ["addPath", "arc", "arcTo", "bezierCurveTo", "closePath", "ellipse", "lineTo", "moveTo", "quadraticCurveTo", "rect", "roundRect"])
    (g.Path2D as { prototype: Record<string, unknown> }).prototype[name] = () => {};
  g.DOMPoint = class { constructor(public x = 0, public y = 0) {} matrixTransform() { return this; } } as unknown;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) { return recordingContext(this.width, this.height).ctx; } as never;
  return () => { g.Path2D = kept.Path2D; g.DOMPoint = kept.DOMPoint; HTMLCanvasElement.prototype.getContext = kept.getContext; };
}

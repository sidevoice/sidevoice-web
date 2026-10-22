import { afterEach, describe, expect, it } from "vitest";
import { addStage, reportStage, type StageRect } from "./stage-visibility";

/** An IntersectionObserver the test drives: `look(element, onScreen)` is the browser's answer for it. */
function fakeSight() {
  const observers: { callback: IntersectionObserverCallback; watched: Set<Element> }[] = [];
  class Sight {
    watched = new Set<Element>();
    constructor(public callback: IntersectionObserverCallback) { observers.push(this); }
    observe(element: Element) { this.watched.add(element); }
    unobserve(element: Element) { this.watched.delete(element); }
    disconnect() { this.watched.clear(); }
  }
  const look = (element: Element, onScreen: boolean) => {
    for (const o of observers) {
      if (!o.watched.has(element)) continue;
      o.callback([{ target: element, isIntersecting: onScreen } as unknown as IntersectionObserverEntry], o as unknown as IntersectionObserver);
    }
  };
  return { Sight: Sight as unknown as typeof IntersectionObserver, look };
}

function stageTile(box = { left: 160, top: 64, right: 960, bottom: 514 }) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON() {} }) as DOMRect;
  document.body.append(element);
  return element;
}

function settingsPage() {
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog";
  dialog.dataset.layout = "page";
  document.body.append(dialog);
  return dialog;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the stage the room shows, told to the desktop app (sidevoice-desktop#165)", () => {
  const stops: (() => void)[] = [];
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    document.body.innerHTML = "";
  });

  function watch() {
    const heard: [boolean, StageRect | undefined][] = [];
    const { Sight, look } = fakeSight();
    stops.push(reportStage((visible, rect) => heard.push([visible, rect]), { document, window, IntersectionObserver: Sight }));
    return { heard, look };
  }

  it("says the stage is shown, and where, once it is on screen in the page", () => {
    const tile = stageTile();
    stops.push(addStage(tile));
    const { heard, look } = watch();
    expect(heard).toEqual([]);
    look(tile, true);
    expect(heard).toEqual([[true, { x: 160, y: 64, width: 800, height: 450 }]]);
    look(tile, true);
    expect(heard).toHaveLength(1);
  });

  it("says hidden with no stage in the page, and while it is off screen", () => {
    const { heard, look } = watch();
    expect(heard).toEqual([[false, undefined]]);
    const tile = stageTile();
    const remove = addStage(tile);
    look(tile, false);
    expect(heard).toEqual([[false, undefined]]);
    look(tile, true);
    expect(heard.at(-1)?.[0]).toBe(true);
    remove();
    expect(heard.at(-1)).toEqual([false, undefined]);
  });

  it("says hidden while Settings covers the room, and shown again when it closes", async () => {
    const tile = stageTile();
    stops.push(addStage(tile));
    const { heard, look } = watch();
    look(tile, true);
    const settings = settingsPage();
    settings.setAttribute("open", "");
    await flush();
    expect(heard.at(-1)).toEqual([false, undefined]);
    settings.removeAttribute("open");
    await flush();
    expect(heard.at(-1)?.[0]).toBe(true);
    expect(heard.map(([visible]) => visible)).toEqual([true, false, true]);
  });

  it("a small dialog over the stage leaves it shown", async () => {
    const tile = stageTile();
    stops.push(addStage(tile));
    const { heard, look } = watch();
    look(tile, true);
    const small = document.createElement("dialog");
    small.className = "ui-dialog";
    small.dataset.layout = "dialog";
    document.body.append(small);
    small.setAttribute("open", "");
    await flush();
    expect(heard.map(([visible]) => visible)).toEqual([true]);
  });

  it("never says hidden while the choose-a-conversation screen is up, and hidden again once it goes", () => {
    const tile = stageTile();
    const remove = addStage(tile, true);
    const { heard, look } = watch();
    look(tile, true);
    expect(heard).toEqual([[true, undefined]]);
    look(tile, false);
    expect(heard.every(([visible]) => visible)).toBe(true);
    remove();
    expect(heard.at(-1)).toEqual([false, undefined]);
  });

  it("cuts the stage to the viewport", () => {
    const tile = stageTile({ left: -20, top: 100, right: 400, bottom: window.innerHeight + 50 });
    stops.push(addStage(tile));
    const { heard, look } = watch();
    look(tile, true);
    expect(heard[0][1]).toEqual({ x: 0, y: 100, width: 400, height: window.innerHeight - 100 });
  });
});

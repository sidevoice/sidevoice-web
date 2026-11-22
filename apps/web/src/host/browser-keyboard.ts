/* What the browser says about the keyboard's layout: `navigator.keyboard.getLayoutMap()` maps each physical key to the
 * character the layout types on it (Chromium only; elsewhere there is no map and nothing follows). */

export interface LayoutMap { get(code: string): string | undefined }
interface KeyboardFacts {
  getLayoutMap?(): Promise<LayoutMap>;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

/** Hands `onMap` the layout map now and again whenever the layout changes; nothing where the browser has none. Answers how to stop. */
export function followKeyboardLayout(onMap: (map: LayoutMap) => void, keyboard: KeyboardFacts | undefined = (globalThis.navigator as { keyboard?: KeyboardFacts } | undefined)?.keyboard): () => void {
  if (!keyboard?.getLayoutMap) return () => {};
  let stopped = false;
  const read = () => { void keyboard.getLayoutMap!().then((map) => { if (!stopped) onMap(map); }).catch(() => {}); };
  read();
  keyboard.addEventListener?.("layoutchange", read);
  return () => { stopped = true; keyboard.removeEventListener?.("layoutchange", read); };
}

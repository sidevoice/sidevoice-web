import { useEffect, useRef, type PropsWithChildren } from "react";
import { createRoomStore, installRoomBridge, RoomStoreContext, type RoomStore } from "../state/room-store";
import { CallLayoutContext, createCallLayoutStore, type CallLayoutStore } from "../state/call-layout";
import { errorMessage } from "../features/settings/error-message";
import { translator } from "../i18n/translator";

let controllerImport: Promise<unknown> | null = null;

interface RoomProviderProps extends PropsWithChildren {
  store?: RoomStore;
  /** Whether the runtime (the controller) runs: off for a storyboard of seeded states. */
  runtime?: boolean;
}

export function RoomProvider({ children, store: suppliedStore, runtime = true }: RoomProviderProps) {
  const started = useRef(false);
  const storeRef = useRef<RoomStore | null>(null);
  if (!storeRef.current) storeRef.current = suppliedStore ?? createRoomStore();
  const store = storeRef.current;
  const layoutRef = useRef<CallLayoutStore | null>(null);
  // How the call view is laid out on this device (state/call-layout.ts).
  if (!layoutRef.current) layoutRef.current = createCallLayoutStore();

  // The theme and the language the page wears (its root's data-theme and lang), in the facts: the desktop card wears
  // the room's (FLOATING-CARD-SPEC FC12).
  useEffect(() => {
    const root = document.documentElement;
    const read = () => store.patch({ pageTheme: root.getAttribute("data-theme") === "dark" ? "dark" : "light", pageLanguage: root.lang || "en" });
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "lang"] });
    return () => observer.disconnect();
  }, [store]);

  useEffect(() => {
    installRoomBridge(store);
    // Without the runtime (the journeys' storyboard) the store is only what was seeded.
    if (started.current || !runtime) return;
    started.current = true;
    // Telemetry first, so `window.sidevoiceTelemetry` exists before the controller opens a call.
    // It is a facade: the OpenTelemetry SDK itself only loads if the room names a collector.
    controllerImport ??= import("../services/telemetry")
      .catch(() => undefined)
      .then(() => import("../services/room-session-controller.js"));
    // What could not load is said in words; what it said, behind Details.
    void controllerImport.catch((error: unknown) => {
      window.sidevoiceUI?.setBootError(errorMessage(error, { generic: translator()("app.startFailed") }));
    });
  }, [store, runtime]);

  return (
    <RoomStoreContext.Provider value={store}>
      <CallLayoutContext.Provider value={layoutRef.current}>{children}</CallLayoutContext.Provider>
    </RoomStoreContext.Provider>
  );
}

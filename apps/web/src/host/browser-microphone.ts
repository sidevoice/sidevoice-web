/* The browser's side of the microphone (web#129): the mechanisms the page has to ask for it and to read it, and nothing
 * of what the page does with them (the states a person sees, the subscriptions and their disposal are `MicrophoneAccess`,
 * services/microphone-access.ts). The permission query to hear a change, the device list and its changes, and the stream
 * opened for the permission alone. Where an app asks for the microphone (`host().microphone`), the app's bridge answers
 * instead and these are used for the device list only. */

/** What the page's `getUserMedia` last answered, shared by every reader of the page (the call's, Settings', the device
 *  list's): the browser's word on the microphone, which its permission query is not (iPhone Safari keeps that at
 *  "prompt", with no change event, once allowed; web#231). A reader that asks tells the others through `readers`. */
export interface PageAnswer {
  answer: "granted" | "denied" | "missing" | null;
  readers: Set<() => void>;
}

/** The browser's permission status for the microphone, as `permissions.query` gives it. */
export interface PermissionView {
  state: string;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

export interface PageMicrophone extends PageAnswer {
  /** Whether this page has a microphone API to ask with. */
  readonly canAsk: boolean;
  /** The browser's permission status, to hear it change; null where the browser cannot say. It is a hint: WebKit can
   *  report denied after `getUserMedia` has opened a stream. */
  permission(): Promise<PermissionView | null>;
  /** Whether a microphone is plugged in, as the device list says (it lists them without permission); null where it cannot say. */
  plugged(): Promise<boolean | null>;
  /** A microphone plugged in or out. The list also changes as a stream opens and is let go (WebKit, iPhone Safari's audio
   *  session). Returns how to stop. */
  onDeviceChange(listener: () => void): () => void;
  /** Asks for the permission alone: opens the microphone and lets it go at once. Called in the tap itself, before any
   *  await (iPhone Safari asks only from a gesture). `dismissed`: the prompt was closed without an answer, where the browser
   *  says so (Chromium: "Permission dismissed"); any other refusal is one. A failed open never proves that audio can be
   *  captured. */
  open(): Promise<"granted" | "denied" | "missing" | "dismissed">;
}

function refusal(error: unknown): "missing" | "denied" {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "missing";
  if (name === "NotReadableError" || name === "TrackStartError") return "missing";
  return "denied";
}

function dismissed(error: unknown) {
  const { name, message } = (error ?? {}) as { name?: string; message?: string };
  return name === "NotAllowedError" && /dismissed/i.test(message ?? "");
}

/** Kept per page, by its media devices. */
const pages = new WeakMap<MediaDevices, PageMicrophone>();

/** The browser's microphone for `win`, or null where the page has no media devices at all. */
export function pageMicrophone(win: Window & typeof globalThis = window): PageMicrophone | null {
  const media = win.navigator?.mediaDevices;
  if (!media) return null;
  let page = pages.get(media);
  if (!page) {
    page = {
      answer: null,
      readers: new Set(),
      canAsk: typeof media.getUserMedia === "function",
      async permission() {
        try { return await win.navigator.permissions?.query({ name: "microphone" as PermissionName }) ?? null; } catch { return null; }
      },
      async plugged() {
        if (typeof media.enumerateDevices !== "function") return null;
        try {
          const list = await media.enumerateDevices();
          return list.some((device) => device.kind === "audioinput");
        } catch { return null; }
      },
      onDeviceChange(listener) {
        media.addEventListener?.("devicechange", listener);
        return () => media.removeEventListener?.("devicechange", listener);
      },
      async open() {
        try {
          const stream = await media.getUserMedia({ audio: true });
          const audio = stream.getAudioTracks?.() ?? stream.getTracks();
          if (!audio.length || audio.every((track) => track.readyState === "ended")) {
            for (const track of stream.getTracks()) track.stop();
            throw new DOMException("No live audio track", "NotFoundError");
          }
          // Only the permission was wanted: the microphone is let go at once.
          for (const track of stream.getTracks()) track.stop();
          return "granted";
        } catch (error) {
          return dismissed(error) ? "dismissed" : refusal(error);
        }
      },
    };
    pages.set(media, page);
  }
  return page;
}

import type { Host } from "./types";
import { pageMicrophone as microphoneOfPage } from "./browser-microphone";
import { browserRemote, browserScreenAwake } from "./browser-presence";
import { parseBrowser } from "./identity";
import { nativeCardSeam, nativeHost } from "./native";

export type * from "./types";
export type { PageAnswer, PageMicrophone, PermissionView } from "./browser-microphone";

/** What the browser says of itself: its system and its name, as a device name says them; `os` is the host's. */
export const describeBrowser = parseBrowser;

/** The browser's side of the microphone: the mechanisms only, for `MicrophoneAccess` to build the states a person sees on. */
export const pageMicrophone = microphoneOfPage;

/** The page's host, as it is now: an app may inject its members after the page's script runs, so this is read where it is
 *  needed and not kept. The one way into anything the browser or an app offers beyond the page itself. */
export function host(): Host {
  const app = nativeHost();
  // Each member is read when it is asked for, and not before: the user agent is parsed for the caller that wants the system.
  return {
    ...app,
    identity: { ...app.identity, get os() { return parseBrowser().os; } },
    presence: {
      media: app.presence.media,
      get remote() { return app.presence.media === "page" ? browserRemote() : null; },
      // An app keeps its computer awake as any app does: Settings has never offered the page's lock there.
      get screenAwake() { return app.identity.build === null ? browserScreenAwake() : null; },
    },
  };
}

/** The call controls card's seam, in the card's own window (call-controls/host.ts holds its contract). */
export function cardSeam(): unknown {
  return nativeCardSeam();
}

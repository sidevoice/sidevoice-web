import type { Host, HostMicrophone, MicrophoneBridge, MicrophoneHelp } from "./types";
import { pageMicrophone as microphoneOfPage } from "./browser-microphone";
import { browserMicrophoneHelp } from "./browser-microphone-help";
import { browserRemote, browserScreenAwake } from "./browser-presence";
import { beginBrowserAudioActivation, pageVoice } from "./browser-voice.js";
import { browserReach, reachOfOrigin as reachOfPage } from "./browser-reach";
import { browserStorage } from "./browser-storage";
import { browserDeviceName, browserShortcutModifier } from "./identity";
import { nativeCardSeam, nativeHost } from "./native";

export type * from "./types";
export type { PageAnswer, PageMicrophone, PermissionView } from "./browser-microphone";

/** The browser's side of the microphone: the mechanisms only, for `MicrophoneAccess` to build the states a person sees on. */
export const pageMicrophone = microphoneOfPage;

/** The transport of a page served from an origin: what a pairing judged against that origin may do. */
export const reachOfOrigin = reachOfPage;

/** This page's one voice and one engine, made the first time either is asked for. */
let page: ReturnType<typeof pageVoice> | null = null;
const pageOfVoice = () => (page ??= pageVoice({ app: () => nativeHost().voice }));

/** An app's help for a blocked microphone as the page can draw it: lines of text. Anything else is not help. */
function wordedHelp(found: unknown): found is MicrophoneHelp {
  const help = found as MicrophoneHelp | null | undefined;
  return !!help && Array.isArray(help.steps) && help.steps.length > 0 && help.steps.every((step) => typeof step === "string" && step !== "")
    && (help.openSettings === undefined || typeof help.openSettings === "string");
}

/** The app's microphone, with its help; the browser's own help where the app words none (or words it in something the page
 *  cannot draw). The app's object is the prototype, so what it offers stays as it is, a live member included. */
function hostMicrophone(app: Partial<MicrophoneBridge> | null): HostMicrophone {
  const help = (language: string): MicrophoneHelp => {
    if (typeof app?.help === "function") {
      try {
        const found: unknown = app.help(language);
        if (wordedHelp(found)) return found;
      } catch { /* An app that cannot word it leaves the browser's words. */ }
    }
    return browserMicrophoneHelp(language);
  };
  return Object.create(app, { help: { value: help, enumerable: true } }) as HostMicrophone;
}

/** The page's host, as it is now: an app may inject its members after the page's script runs, so this is read where it is
 *  needed and not kept. The one way into anything the browser or an app offers beyond the page itself. */
export function host(): Host {
  const app = nativeHost();
  // Each member is read when it is asked for, and not before: the user agent is parsed for the caller that wants the system.
  return {
    ...app,
    // The app's when it keeps them; else this browser's own storage.
    storage: app.storage ?? browserStorage(),
    identity: {
      build: app.identity.build,
      // The app's name for the computer; else what this browser is.
      deviceName: () => app.identity.deviceName() ?? browserDeviceName(),
      get shortcutModifier() { return app.identity.shortcutModifier ?? browserShortcutModifier(); },
    },
    microphone: hostMicrophone(app.microphone),
    reach: app.reach ?? browserReach(),
    voice: {
      runs: app.voice ? "app" : "page",
      host: () => pageOfVoice().voice(),
      catalogs: () => pageOfVoice().catalogs(),
      activate: (input) => app.voice ? null : beginBrowserAudioActivation(input),
    },
    presence: {
      media: app.presence.media,
      get remote() { return app.presence.media === "page" ? browserRemote() : null; },
      get screenAwake() { return browserScreenAwake(); },
    },
  };
}

/** The call controls card's seam, in the card's own window (call-controls/host.ts holds its contract). */
export function cardSeam(): unknown {
  return nativeCardSeam();
}

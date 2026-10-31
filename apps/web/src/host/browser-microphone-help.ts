import { translator } from "../i18n/translator";
import { parseBrowser, type NavigatorFacts } from "./identity";
import type { MicrophoneHelp } from "./types";

/* How to allow a blocked microphone in a browser, in the page's language, from the web's own catalogue: the site's
 * permission, and where the system blocks the browser itself (the Mac's and Windows' privacy settings). A browser cannot open
 * the system's settings, so it has no button to name. An app words its own help (`host.microphone.help`) for the system it
 * runs on; this is what is shown where it has none. */
export function browserMicrophoneHelp(language: string, nav: NavigatorFacts | undefined = globalThis.navigator): MicrophoneHelp {
  const t = translator(language);
  const { os } = parseBrowser(nav);
  const system = os === "macos" ? "wizard.mic.denied.siteMac" : os === "windows" ? "wizard.mic.denied.siteWindows" : null;
  return { steps: system ? [t("wizard.mic.denied.site"), t(system)] : [t("wizard.mic.denied.site")] };
}

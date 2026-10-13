/* The page of the desktop app's call controls card (call-controls.html). Built with the room so the card reuses the
 * room's own pieces (the conversation list, the icons, the tokens); the desktop app vendors both and opens this one in
 * its floating card window. Outside the app it shows nothing. */
import { createRoot } from "react-dom/client";
import "../styles/tokens.css";
import "./call-card.css";
import { CallCard } from "./CallCard";
import { callControlsHost } from "./host";
import { SETTINGS_STORAGE_KEY } from "../i18n/translator";
import { cardLanguage, translator } from "./i18n";

const host = callControlsHost();
if (host) {
  const root = createRoot(document.getElementById("root")!);
  // In the language this device's Settings chose (the room saves it in this origin's storage), again when it changes.
  const render = () => {
    const language = cardLanguage();
    document.documentElement.lang = language;
    root.render(<CallCard host={host} t={translator(language)} />);
  };
  render();
  window.addEventListener("storage", (event) => { if (event.key === null || event.key === SETTINGS_STORAGE_KEY) render(); });
}

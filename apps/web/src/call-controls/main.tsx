/* The page of the desktop app's call controls card (call-controls.html). Built with the room so the card reuses the
 * room's own pieces (the conversation list, the icons, the tokens, the bichos and their stage); the desktop app vendors
 * both and opens this one in its floating card window. Outside the app it shows nothing. */
import { createRoot } from "react-dom/client";
// The avatars' drawing and their stage (styles/call.css, the bichos engine's styles/bichos.css), then the design
// tokens in both themes (styles/theme.css), as the room loads them: the floating card's options wear the room's theme.
import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/bichos.css";
import "../styles/theme.css";
import "./call-card.css";
import { CallCard } from "./CallCard";
import { callControlsHost } from "./host";
import { cardLanguage, translator } from "./i18n";

const host = callControlsHost();
const language = cardLanguage();
document.documentElement.lang = language;
if (host) createRoot(document.getElementById("root")!).render(<CallCard host={host} t={translator(language)} />);

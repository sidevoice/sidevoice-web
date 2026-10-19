/* The page of the desktop app's floating call card (call-controls.html). Built with the room so the card draws the call
 * with the room's own components (sidevoice-web#229): the stage, the avatars, the balloons, the call bar, the
 * conversation rows, on a room store of its own (card-room.ts); the desktop app vendors both pages and opens this one in
 * its floating card window. Outside the app it shows nothing. */
import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/bichos.css";
import "../styles/theme.css";
import "../components/ui/ui.css";
import "./call-card.css";
import { createRoot } from "react-dom/client";
import { CallCard } from "./CallCard";
import { callControlsHost, type CallCommand, type CallControlsHost } from "./host";
import { createCardRoom } from "./card-room";
import { RoomProvider } from "../app/RoomProvider";
import { SETTINGS_STORAGE_KEY, setUiLanguage, translator } from "../i18n/translator";
import { applyTheme, readThemePreference, THEME_KEY } from "../lib/theme";
import { cardLanguage } from "./i18n";

const host = callControlsHost();
if (host) {
  // What the room's components ask the room for goes to it as the card's commands.
  const room = createCardRoom((command: CallCommand) => host.run(command));
  // The host's state reaches the card's store before the card draws it.
  const guarded: CallControlsHost = { ...host, subscribe: (listener) => host.subscribe((state) => { room.apply(state); listener(state); }) };
  const root = createRoot(document.getElementById("root")!);
  // The theme and the language this device's Settings chose (the room keeps both in this origin's storage), again when
  // either changes there.
  let stopTheme = applyTheme(readThemePreference());
  const render = () => {
    const language = cardLanguage();
    setUiLanguage(language);
    root.render(<RoomProvider store={room.store} runtime={false}><CallCard host={guarded} t={translator(language)} /></RoomProvider>);
  };
  render();
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === THEME_KEY) { stopTheme(); stopTheme = applyTheme(readThemePreference()); }
    if (event.key === null || event.key === SETTINGS_STORAGE_KEY) render();
  });
}

// The avatars' palette (styles/tokens.css) and drawing (styles/call.css), then the design tokens, which win, the shared
// components and the page — before anything that imports a feature, so each feature's own CSS comes after them and
// wins a tie against a shared component's.
import "./styles/tokens.css";
import "./styles/call.css";
import "./styles/theme.css";
import "./components/ui/ui.css";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Button } from "./components/ui/Button";

import "./i18n/room-i18n.js";
import { startPageTheme } from "./lib/theme";

// Uncaught errors are reported to the room before anything else is loaded: the controller owns the
// socket, so until it exists the reports wait here.
window.sidevoiceClientErrors = [];
function report(kind: string, message: string, stack?: string) {
  const entry = { kind, message, stack: stack ?? "", component: "" };
  if (window.sidevoiceReportError) window.sidevoiceReportError(entry);
  else window.sidevoiceClientErrors?.push(entry);
}
window.addEventListener("error", (event) => report("uncaught", event.message, event.error?.stack));
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string; stack?: string } | undefined;
  report("unhandled-rejection", String(reason?.message ?? event.reason), reason?.stack);
});

// The theme this device chose in Settings, else the system's (lib/theme.ts).
startPageTheme();

const root = createRoot(document.getElementById("root")!);

declare const __BUILD_ID__: string;
const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
(window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId = buildId;

try {
  root.render(<App />);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <main className="startup-error" role="alert">
      <h1>No se pudo iniciar Sidevoice</h1>
      <p>{message}</p>
      <Button variant="primary" onClick={() => location.reload()}>Reintentar</Button>
    </main>,
  );
}

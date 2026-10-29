// The avatars' palette (styles/tokens.css) and drawing (styles/call.css), then the design tokens, which win, the shared
// components and the page — before anything that imports a feature, so each feature's own CSS comes after them and
// wins a tie against a shared component's.
import "./styles/tokens.css";
import "./styles/call.css";
// The bichos (the conversations' agents) and their stage: before the design tokens, which win a tie.
import "./styles/bichos.css";
import "./styles/theme.css";
import "./components/ui/ui.css";
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Button } from "./components/ui/Button";
import { ErrorDetails } from "./components/ui/ErrorText";
import { translator } from "./i18n/translator";

import { startPageTheme } from "./lib/theme";
import { startMotion } from "./lib/motion";
import { forgetVariant } from "./lib/variants";

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
// Whether its drawings move: only where the GPU moves them (lib/motion.ts).
startMotion();

const root = createRoot(document.getElementById("root")!);

// Decided variants: their stored choice is inert, and goes.
forgetVariant("unrunnable-models");

declare const __BUILD_ID__: string;
const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
(window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId = buildId;

try {
  root.render(<App />);
} catch (error) {
  // What it threw is no sentence for people: behind Details.
  const message = error instanceof Error ? error.message : String(error);
  const t = translator();
  root.render(
    <main className="startup-error" role="alert">
      <h1>{t("app.startFailed")}</h1>
      <ErrorDetails details={message} />
      <Button variant="primary" onClick={() => location.reload()}>{t("app.retry")}</Button>
    </main>,
  );
}

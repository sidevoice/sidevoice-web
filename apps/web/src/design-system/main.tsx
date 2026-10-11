import { createRoot } from "react-dom/client";
import { DesignSystemPage } from "./DesignSystemPage";

// Today's avatars, as placeholders (another piece of work designs them): their drawing (styles/call.css, class-scoped)
// and their colours (styles/tokens.css, before the design tokens so those win).
import "../styles/tokens.css";
import "../styles/call.css";
import "../styles/theme.css";
import "../components/ui/ui.css";
import "../features/settings/model-prepare.css";
import "./app-patterns.css";
import "./theme-options.css";
import "./design-system.css";

/* The design system, on a page of its own (design-system.html, served by the dev server only): every shared component
 * in each of its states, in the light theme and the dark one side by side. */
createRoot(document.getElementById("root")!).render(<DesignSystemPage />);

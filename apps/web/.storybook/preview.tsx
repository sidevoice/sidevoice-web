import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect, type ReactNode } from "react";

// As the app loads them (src/main.tsx): the avatars' palette and drawing, the bichos, then the design tokens (which win a
// tie), the shared components and the page.
import "../src/styles/tokens.css";
import "../src/styles/call.css";
import "../src/styles/bichos.css";
import "../src/styles/theme.css";
import "../src/components/ui/ui.css";
import "../src/styles/app.css";
import "./catalogue.css";

import { TooltipProvider } from "../src/components/ui/Tooltip";
import { UI_LANGUAGES, languageName, setUiLanguage } from "../src/i18n/translator";

type Theme = "light" | "dark" | "both";
type Motion = "gpu" | "still";

/* The toolbar's three switches. Theme: the tokens read `data-theme` on any element, so "both" renders the story twice,
 * side by side. Language: the interface's (`setUiLanguage`), every catalogue the app ships. Motion: the page's own
 * decision (`data-motion`, lib/motion.ts) — "still" is what reduced motion and a machine without a GPU get. The media
 * query `prefers-reduced-motion` itself is the browser's: emulate it in the devtools (Rendering) to see those rules. */
const withRoom: Decorator = (Story, context) => {
  const theme = context.globals.theme as Theme;
  const language = context.globals.locale as string;
  const motion = context.globals.motion as Motion;
  // Before the story renders: every component reads its words as it draws.
  setUiLanguage(language);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    root.setAttribute("data-motion", motion);
  }, [theme, motion]);
  const column = (which: "light" | "dark", node: ReactNode) => (
    <div className="catalogue-column" data-theme={which} key={which}>{node}</div>
  );
  const story = <Story key={language} />;
  return (
    <TooltipProvider>
      {theme === "both"
        ? <div className="catalogue-columns">{column("light", story)}{column("dark", <Story key={language + "-dark"} />)}</div>
        : column(theme, story)}
    </TooltipProvider>
  );
};

const preview: Preview = {
  decorators: [withRoom],
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: { title: "Theme", icon: "contrast", dynamicTitle: true, items: [
        { value: "light", title: "Light", icon: "sun" },
        { value: "dark", title: "Dark", icon: "moon" },
        { value: "both", title: "Light + dark", icon: "sidebyside" },
      ] },
    },
    locale: {
      description: "Interface language",
      toolbar: { title: "Language", icon: "globe", dynamicTitle: true, items: UI_LANGUAGES.map((value) => ({ value, title: `${languageName(value)} (${value})` })) },
    },
    motion: {
      description: "Motion (data-motion)",
      toolbar: { title: "Motion", icon: "play", dynamicTitle: true, items: [
        { value: "gpu", title: "Moving (GPU)" },
        { value: "still", title: "Still (reduced motion)" },
      ] },
    },
  },
  initialGlobals: { theme: "light", locale: "en", motion: "gpu" },
  parameters: {
    layout: "padded",
    controls: { expanded: true, sort: "requiredFirst" },
    // The theme decorator paints the background; Storybook's own would sit behind it.
    backgrounds: { disable: true },
    a11y: { test: "todo" },
    options: {
      storySort: { order: ["Foundations", ["Colour", "Type", "Spacing", "Radii", "Icons", "Motion"], "Primitives", "Product"] },
    },
  },
  tags: ["autodocs"],
};

export default preview;

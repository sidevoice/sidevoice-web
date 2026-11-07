import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";
import { CREATE_NEW_STORYFILE_REQUEST, FILE_COMPONENT_SEARCH_REQUEST, GHOST_STORIES_REQUEST, OPEN_IN_EDITOR_REQUEST, SAVE_STORY_REQUEST } from "storybook/internal/core-events";

/* The catalogue is meant to be looked at through a tunnel (a public URL), and Storybook's dev server lets whoever opens
 * its page write files in the project: save a story from the controls, create a story file, open an editor, search
 * files. Those requests are dropped here, so what the catalogue can do from the browser is look. */
const WRITES = [SAVE_STORY_REQUEST, CREATE_NEW_STORYFILE_REQUEST, OPEN_IN_EDITOR_REQUEST, FILE_COMPONENT_SEARCH_REQUEST, GHOST_STORIES_REQUEST];

/** The host names the dev server answers besides localhost (the tunnel's), comma separated: none by default. */
const hosts = (process.env.SIDEVOICE_CATALOGUE_HOSTS ?? "").split(",").map((host) => host.trim()).filter(Boolean);

/* The living catalogue (web#530): every shared piece of the web, rendered from the real component, in its states, in
 * light and dark, in every interface language. `npm run catalogue` serves it with hot reload; `npm run catalogue:build`
 * writes it to storybook-static/. It reuses the app's own vite.config.ts (React plugin, defines, the dev server's
 * tunnel-friendly HMR), so a story renders what the app renders. */
const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  // pseudo-states: a story can show a control hovered, pressed or focused at rest (the States stories), and the toolbar can
  // force those states on any story.
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "storybook-addon-pseudo-states"],
  // The app's fonts and images live under /voice/ (public/), and its CSS names them there.
  staticDirs: [{ from: "../public", to: "/voice" }],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, ...(hosts.length ? { allowedHosts: ["localhost", "127.0.0.1", ...hosts] } : {}) },
  experimental_serverChannel: async (channel: { removeAllListeners(event: string): void }) => {
    for (const event of WRITES) channel.removeAllListeners(event);
    return channel;
  },
  // A reference to look at, not a project to set up: no onboarding checklist.
  features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
  typescript: {
    // The props tables read the TypeScript types themselves (cva variants, unions), not only the defaults.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      // The app's project (tsconfig.json only references it), so the types of src/ are read.
      tsconfigPath: fileURLToPath(new URL("../tsconfig.app.json", import.meta.url)),
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Our own props only: not the hundreds every element inherits from the DOM.
      propFilter: (prop) => !prop.parent || !/node_modules/.test(prop.parent.fileName),
    },
  },
  async viteFinal(config) {
    // The app is served under /voice/; the catalogue from its own root. Behind the tunnel (hosts named), the hot-reload
    // socket is told it arrives over TLS on 443, as the app's own dev server is (vite.config.ts); locally, Storybook's own.
    const hmr = hosts.length ? { ...(typeof config.server?.hmr === "object" ? config.server.hmr : {}), clientPort: 443, protocol: "wss" } : undefined;
    // The app's own dependencies optimised up front: found one by one as stories open, each would reload the page.
    const include = ["@radix-ui/react-context-menu", "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tooltip", "class-variance-authority", "clsx", "cmdk", "lucide-react", "zustand"];
    return { ...config, base: "/", server: { ...config.server, ...(hmr ? { hmr } : {}) }, optimizeDeps: { ...config.optimizeDeps, include: [...(config.optimizeDeps?.include ?? []), ...include] } };
  },
};

export default config;

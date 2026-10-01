/* PROTOTYPE ONLY: builds and serves the onboarding/hosts prototype (prototype.html + prototype-app.html) into
 * dist-prototype/. The production build (vite.config.ts) has index.html as its only input and never sees these. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { Connect } from "vite";

/** "/" opens the switcher, and the card's font (written for the room's /voice/ base) is found at this base. */
const routes: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url === "/" || req.url?.startsWith("/?")) { res.statusCode = 302; res.setHeader("location", "/prototype.html" + (req.url.slice(1))); res.end(); return; }
  if (req.url?.startsWith("/voice/fonts/")) req.url = req.url.slice("/voice".length);
  next();
};

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify("prototype") },
  plugins: [react(), { name: "prototype-routes", configureServer: (server) => { server.middlewares.use(routes); }, configurePreviewServer: (server) => { server.middlewares.use(routes); } }],
  build: {
    outDir: "dist-prototype",
    emptyOutDir: true,
    rollupOptions: { input: { prototype: resolve(__dirname, "prototype.html"), app: resolve(__dirname, "prototype-app.html"), card: resolve(__dirname, "prototype-card.html") } },
  },
  // Served through a tunnel for live review: the hot-reload socket is told it arrives over TLS on 443 at that host.
  server: { host: "127.0.0.1", port: 5191, strictPort: true, allowedHosts: true,
    hmr: process.env.PROTOTYPE_HMR_HOST ? { host: process.env.PROTOTYPE_HMR_HOST, clientPort: 443, protocol: "wss" } : undefined },
  preview: { host: "127.0.0.1", port: 5190, strictPort: true, allowedHosts: true },
});

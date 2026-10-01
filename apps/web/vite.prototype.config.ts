/* PROTOTYPE ONLY: builds and serves the onboarding/hosts prototype (prototype.html + prototype-app.html) into
 * dist-prototype/. The production build (vite.config.ts) has index.html as its only input and never sees these. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify("prototype") },
  plugins: [react()],
  build: {
    outDir: "dist-prototype",
    emptyOutDir: true,
    rollupOptions: { input: { prototype: resolve(__dirname, "prototype.html"), app: resolve(__dirname, "prototype-app.html") } },
  },
  server: { host: "127.0.0.1", port: 5191, strictPort: true, allowedHosts: true },
  preview: { host: "127.0.0.1", port: 5190, strictPort: true, allowedHosts: true },
});

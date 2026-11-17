import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Google Health client library lives inside the skill, so the CLI and the app share one implementation.
const gh = resolve(import.meta.dirname, ".claude/skills/google-health-connect/scripts/lib/google-health.mjs");
const shared = resolve(import.meta.dirname, "src/shared");

export default defineConfig({
  main: {
    resolve: { alias: { "@gh": gh, "@shared": shared } },
  },
  preload: {
    resolve: { alias: { "@shared": shared } },
    // CommonJS preload works with Electron's default sandbox.
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    resolve: { alias: { "@shared": shared, "@renderer": resolve(import.meta.dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss()],
  },
});

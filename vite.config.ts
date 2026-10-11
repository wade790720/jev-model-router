import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Builds the unpacked extension into dist/: options.html + popup.html (React UI) and background.js
// (service worker). public/ (manifest, _locales, content.css) is copied as is; content.js comes from
// scripts/build-content.mjs because content scripts cannot be ES modules. Load dist/ in chrome://extensions.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    target: "chrome116",
    rollupOptions: {
      input: { options: "options.html", popup: "popup.html", background: "src/background.ts" },
      // manifest.json names the service worker by a fixed path.
      output: { entryFileNames: chunk => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js") }
    }
  }
});

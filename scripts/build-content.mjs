// Content scripts cannot be ES modules: bundle src/content/main.ts to an IIFE in vite's output folder dist/.
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
await build({
  entryPoints: [path.join(root, "src/content/main.ts")],
  outfile: path.join(root, "dist/content.js"),
  bundle: true,
  format: "iife",
  target: "chrome116",
  alias: { "@": path.join(root, "src") },
  minify: true
});
console.log("content script built");

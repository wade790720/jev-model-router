import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const palettes = require("@radix-ui/colors");
const version = require("@radix-ui/colors/package.json").version;
const scales = ["violet", "mauve", "sand", "green", "amber", "red"];
const directory = new URL("../extension/vendor/", import.meta.url);
const cssFile = new URL("radix-colors.css", directory);
const licenseFile = new URL("RADIX-LICENSE.txt", directory);
const css = [
  `/* Generated from @radix-ui/colors ${version}. Run npm run colors:sync; do not edit.`,
  " * Copyright (c) 2021 Radix. MIT License: RADIX-LICENSE.txt.",
  " * Settings-only, namespaced palette. Not injected into ChatGPT. */",
  ":root {"
];
for (const scale of scales) {
  for (let step = 1; step <= 12; step++) {
    const key = `${scale}${step}`;
    css.push(`  --sai-${scale}-${step}: light-dark(${palettes[scale][key]}, ${palettes[`${scale}Dark`][key]});`);
  }
}
css.push("}", "");
const output = css.join("\n");
const license = readFileSync(join(dirname(require.resolve("@radix-ui/colors/package.json")), "LICENSE"), "utf8");
if (process.argv.includes("--check")) {
  if (readFileSync(cssFile, "utf8") !== output || readFileSync(licenseFile, "utf8") !== license) {
    throw new Error("Bundled Radix colors are stale; run npm run colors:sync.");
  }
  console.log(`Radix Colors ${version}: bundled CSS and license are current.`);
} else {
  mkdirSync(directory, { recursive: true });
  writeFileSync(cssFile, output);
  writeFileSync(licenseFile, license);
  console.log(`Bundled ${scales.length} light/dark Radix scales in ${fileURLToPath(cssFile)}.`);
}

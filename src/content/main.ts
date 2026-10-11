// Content script entry. Bundled to an IIFE by scripts/build-content.mjs (content scripts cannot be ES modules).
import { createRouter } from "./router";

createRouter();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { captureErrors } from "./lib/error-log";

captureErrors("jev-model-router");

// Theme follows the system, live. Set first so the page never paints in the wrong theme.
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// `npm run dev` opens the pages as plain web pages, where chrome.* does not exist. Not in the build.
if (import.meta.env.DEV && !globalThis.chrome?.storage) await import("./dev/mock");

const { locale, t } = await import("./lib/i18n");
document.documentElement.lang = locale();
document.title = t("optionsTitle");
const { App } = await import("./App");
const { MembershipGate } = await import("./components/MembershipGate");
createRoot(document.getElementById("root")!).render(<StrictMode><MembershipGate><App /></MembershipGate></StrictMode>);

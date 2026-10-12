import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("public/manifest.json"));
const css = read("src/index.css");
beforeEach(() => vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "zh-TW" } }));
afterEach(() => vi.unstubAllGlobals());

test("the own TypeSafe key is the only setting: no hosted service, test access or diagnostics", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toMatch(/<section[^>]*id="advanced"/);
  expect(html).toMatch(/id="typeSafeKey"/);
  expect(html).not.toMatch(/id="(subscriptionFields|usePersonalKey|activationCode|diagnosticsEnabled|exportDiagnostics)"|<details/);
  expect(html).toMatch(/id="consentNote"/);
});

test("field help is associated and status is a polite live region", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toMatch(/id="typeSafeKey"[^>]*aria-describedby="personalNote consentNote"/);
  const status = html.match(/<div[^>]*id="status"[^>]*>/)?.[0];
  expect(status).toContain('role="status"');
  expect(status).toContain('aria-atomic="true"');
  expect(html).toContain("ChatGPT 智慧選模型");
});

test("toolbar popup uses an intrinsic width while settings remain responsive", () => {
  expect(manifest.action.default_popup).toBe("popup.html");
  expect(manifest.options_page).toBe("options.html");
  expect(read("popup.html")).toMatch(/<html[^>]*data-view="popup"/);
  expect(read("options.html")).toMatch(/<html[^>]*data-view="settings"/);
  expect(css).toMatch(/html\[data-view="popup"\][^{]+\{\s*width: 360px; min-width: 360px;/);
  expect(css).toMatch(/width: min\(360px, 100vw\)/);
});

test("no permission to reach arbitrary sites now that the hosted service is gone", () => {
  // Local diagnostics are gone: nothing talks to the developer's machine any more.
  expect(manifest.host_permissions).not.toContain("http://127.0.0.1/*");
  expect(manifest.permissions).not.toContain("alarms");
  expect(manifest.optional_host_permissions).toBeUndefined();
  // Skool keeps its sign-in cookie on .skool.com (shared with api2.skool.com): with only www.skool.com,
  // chrome.cookies filters it out and the hosted sign-in sees a signed-out browser.
  expect(manifest.host_permissions).toContain("https://*.skool.com/*");
  expect(manifest.permissions).toContain("cookies");
});

test("settings bundle the shared brand tokens and status palette locally and never leak them into ChatGPT", () => {
  expect(css).toContain(`@import "./brand.css";`);
  expect(read("src/brand.css")).toMatch(/--primary: #6e56cf;/);
  for (const scale of ["green", "amber", "red"]) {
    expect(css).toContain(`@import "@radix-ui/colors/${scale}.css";`);
    expect(css).toContain(`@import "@radix-ui/colors/${scale}-dark.css";`);
  }
  expect(read("src/components/ui/alert.tsx")).toMatch(/text-\(--red-12\)/);
  expect(read("options.html") + read("popup.html")).not.toMatch(/(?:src|href)="https?:/);
  expect(read("public/RADIX-LICENSE.txt")).toMatch(/Copyright \(c\) 2021 Radix/);
  expect(manifest.content_scripts[0].css).toEqual(["content.css"]);
  expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
});

test("press feedback respects reduced motion", () => {
  expect(read("src/components/ui/button.tsx")).toMatch(/motion-safe:active/);
});

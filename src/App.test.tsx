import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("public/manifest.json"));
const css = read("src/index.css");
beforeEach(() => vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "zh-TW" } }));
afterEach(() => vi.unstubAllGlobals());

test("hosted service is default and personal key is only in advanced settings", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).not.toMatch(/name="connectionMode"|id="manage"|id="routingConsent"/);
  expect(html).toMatch(/<details[^>]*id="advanced"/);
  expect(html).toMatch(/id="usePersonalKey" type="checkbox"/);
  expect(html).toMatch(/<section id="subscriptionFields"(?![^>]*hidden)/);
  expect(html).toMatch(/id="personalFields" hidden/);
  expect(html).toMatch(/id="consentNote"/);
});

test("field help is associated and status is a polite live region", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toMatch(/id="typeSafeKey"[^>]*aria-describedby="personalNote"/);
  expect(html).toMatch(/id="activationCode"[^>]*aria-describedby="testAccessNote"/);
  expect(html).toMatch(/id="diagnosticsEnabled"[^>]*aria-describedby="diagnosticsNote"/);
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

test("local diagnostic permission is required but not duplicated as optional", () => {
  expect(manifest.host_permissions).toContain("http://127.0.0.1/*");
  expect(manifest.optional_host_permissions).not.toContain("http://127.0.0.1/*");
});

test("settings bundle the Sai Radix palette locally and never leak it into ChatGPT", () => {
  for (const scale of ["violet", "mauve", "sand", "green", "amber", "red"]) {
    expect(css).toContain(`@import "@radix-ui/colors/${scale}.css";`);
    expect(css).toContain(`@import "@radix-ui/colors/${scale}-dark.css";`);
  }
  expect(css).toMatch(/--primary: var\(--violet-9\)/);
  expect(read("src/components/ui/alert.tsx")).toMatch(/text-\(--red-12\)/);
  expect(read("options.html") + read("popup.html")).not.toMatch(/(?:src|href)="https?:/);
  expect(read("public/RADIX-LICENSE.txt")).toMatch(/Copyright \(c\) 2021 Radix/);
  expect(manifest.content_scripts[0].css).toEqual(["content.css"]);
  expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
});

test("press feedback respects reduced motion", () => {
  expect(read("src/components/ui/button.tsx")).toMatch(/motion-safe:active/);
});

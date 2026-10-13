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
  expect(html).toMatch(/id="typeSafeKey"/);
  expect(html).not.toMatch(/id="(subscriptionFields|usePersonalKey|activationCode|diagnosticsEnabled|exportDiagnostics)"/);
  expect(html).toMatch(/id="consentNote"/);
});

test("intro and data notice stay visible; key, save and error reporting fold under advanced settings", () => {
  const html = renderToStaticMarkup(<App />);
  const advanced = html.search(/<details[^>]*id="advanced"/);
  expect(advanced, "advanced settings is a <details> below the intro").toBeGreaterThan(-1);
  expect(html).not.toMatch(/<details[^>]*\sopen/);
  expect(html.indexOf('id="consentNote"')).toBeLessThan(advanced);
  for (const id of ["typeSafeKey", "save", "status"]) expect(html.indexOf(`id="${id}"`)).toBeGreaterThan(advanced);
  expect(html).not.toContain("僅文字");
  expect(html).toContain("分析 ChatGPT 文字草稿，並選擇最優解模型；\n僅對輸入的文字做分析，無法分析圖片與附件。");
  expect(html).toContain("輸入停止後，文字會傳送至 TypeSafe 由 Jev AI 模型判斷，不自動切換模型，由使用者自行選擇。");
});

test("field help is associated and status is a polite live region", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toMatch(/id="typeSafeKey"[^>]*aria-describedby="personalNote consentNote"/);
  const status = html.match(/<div[^>]*id="status"[^>]*>/)?.[0];
  expect(status).toContain('role="status"');
  expect(status).toContain('aria-atomic="true"');
  expect(html).toContain("ChatGPT 模型選擇器");
});

test("toolbar popup uses an intrinsic width while settings remain responsive", () => {
  expect(manifest.action.default_popup).toBe("popup.html");
  expect(manifest.options_page).toBe("options.html");
  expect(read("popup.html")).toMatch(/<html[^>]*data-view="popup"/);
  expect(read("options.html")).toMatch(/<html[^>]*data-view="settings"/);
  expect(css).toMatch(/html\[data-view="popup"\][^{]+\{\s*width: 360px; min-width: 360px;/);
  expect(css).toMatch(/width: min\(360px, 100vw\)/);
});

test("permissions stay minimal: no local diagnostics, no arbitrary sites, and Skool cookies for hosted sign-in", () => {
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
  // The accent follows this product's ice-blue orb icon: index.css overrides the brand violet after importing it.
  expect(css.indexOf("--primary: #107d98")).toBeGreaterThan(css.indexOf(`@import "./brand.css";`));
  expect(css).toMatch(/\.dark \{ --ring: #4ccce6; --primary-text: #4ccce6; \}/);
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

test("the orb icon is the toolbar and store icon; ChatGPT may load only the two badge sizes", () => {
  const sizes = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png" };
  expect(manifest.icons).toEqual({ ...sizes, 128: "icons/icon-128.png" });
  expect(manifest.action.default_icon).toEqual(sizes);
  expect(manifest.web_accessible_resources).toEqual([
    { resources: ["icons/icon-32.png", "icons/icon-48.png"], matches: ["https://chatgpt.com/*"] }
  ]);
  expect(renderToStaticMarkup(<App />)).toMatch(/<img src="\/icons\/icon-48.png" alt=""/);
});

test("press feedback respects reduced motion", () => {
  expect(read("src/components/ui/button.tsx")).toMatch(/motion-safe:active/);
});

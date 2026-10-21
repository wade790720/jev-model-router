import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("public/manifest.json"));
const css = read("src/index.css");
const render = (typeSafeKey: string, tried: boolean) => renderToStaticMarkup(<App initial={{ typeSafeKey, tried }} />);
beforeEach(() => vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "zh-TW" } }));
afterEach(() => vi.unstubAllGlobals());

test("first visit: step 1 links to the TypeSafe key page, step 2 takes the key, step 3 waits", () => {
  const html = render("", false);
  expect(html).toMatch(/id="onboarding"/);
  expect(html).toContain('href="https://console.typesafe.ai/keys"');
  // Honest about cost: the tool is free; new TypeSafe accounts get trial credit, then TypeSafe bills the user.
  expect(html).toContain("工具免費。TypeSafe 新帳號有免費試用額度，用完後依用量付費給 TypeSafe。");
  expect(html).toMatch(/id="pricing"[^>]*>TypeSafe 的價格列在官網：(?:(?!<\/p>).)*href="https:\/\/typesafe\.ai\/"/s);
  expect(html).not.toContain("免費使用");
  expect(html).toMatch(/id="typeSafeKey"[^>]*aria-describedby="keyNote consentNote"/);
  expect(html).toContain("驗證並儲存");
  expect(html).toMatch(/<li class="flex gap-3 opacity-50"[^>]*>/); // step 3 is faded
  expect(html).not.toContain('href="https://chatgpt.com/"');
  expect(html.indexOf('id="consentNote"')).toBeLessThan(html.indexOf('id="onboarding"'));
});

test("key saved: steps 1 and 2 are checked, step 3 opens ChatGPT", () => {
  const html = render("synthetic-key", false);
  expect(html).toMatch(/id="onboarding"/);
  expect(html.match(/aria-label="✓"/g)).toHaveLength(2);
  expect(html).toContain('href="https://chatgpt.com/"');
  expect(html).not.toMatch(/id="typeSafeKey"/);
});

test("after the first suggestion only the general settings remain, with the key folded away", () => {
  const html = render("synthetic-key", true);
  expect(html).not.toMatch(/id="onboarding"/);
  const advanced = html.search(/<details[^>]*id="advanced"/);
  expect(advanced).toBeGreaterThan(-1);
  expect(html).not.toMatch(/<details[^>]*\sopen/);
  expect(html.indexOf('id="typeSafeKey"')).toBeGreaterThan(advanced);
  const status = html.match(/<div[^>]*id="status"[^>]*>/)?.[0];
  expect(status).toContain('role="status"');
  expect(status).toContain('aria-atomic="true"');
});

test("the Wonder Pocket Club line sits at the bottom of every state, as a quiet ghost button", () => {
  for (const html of [render("", false), render("synthetic-key", true)]) {
    const club = html.slice(html.indexOf('id="club"'));
    expect(club).toContain("想學更多 AI 工具的用法？百寶袋俱樂部有完整教學。");
    expect(club).toContain('href="https://www.skool.com/wonderpocket/about"');
    expect(club).toContain('data-variant="ghost"');
    expect(club).toContain("看看百寶袋俱樂部");
    expect(html.indexOf('id="club"')).toBeGreaterThan(html.indexOf('id="advanced"'));
  }
});

test("free with your own key: no membership check, no hosted service, minimal permissions", () => {
  expect(manifest.version).toBe("0.5.0");
  expect(manifest.permissions).toEqual(["storage"]);
  expect(manifest.host_permissions).toEqual(["https://chatgpt.com/*", "https://api.typesafe.ai/*"]);
  expect(manifest.optional_host_permissions).toBeUndefined();
  for (const file of ["src/lib/membership.ts", "src/lib/membership.test.ts", "src/components/MembershipGate.tsx"]) {
    expect(existsSync(new URL(`../${file}`, import.meta.url)), file).toBe(false);
  }
  const code = ["src/main.tsx", "src/App.tsx", "src/background.ts", "src/lib/route-draft.ts"].map(read).join("\n");
  expect(code).not.toMatch(/MembershipGate|chrome\.cookies|router\.tekuei\.com\/api\/(?:route|session)/);
});

test("toolbar popup uses an intrinsic width while settings remain responsive", () => {
  expect(manifest.action.default_popup).toBe("popup.html");
  expect(manifest.options_page).toBe("options.html");
  expect(read("popup.html")).toMatch(/<html[^>]*data-view="popup"/);
  expect(read("options.html")).toMatch(/<html[^>]*data-view="settings"/);
  expect(css).toMatch(/html\[data-view="popup"\][^{]+\{\s*width: 360px; min-width: 360px;/);
  expect(css).toMatch(/width: min\(360px, 100vw\)/);
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
  expect(render("", false)).toMatch(/<img src="\/icons\/icon-48.png" alt=""/);
});

test("press feedback respects reduced motion", () => {
  expect(read("src/components/ui/button.tsx")).toMatch(/motion-safe:active/);
});

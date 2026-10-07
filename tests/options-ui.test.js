import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../extension/options.html", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");
const optionsSource = readFileSync(new URL("../extension/options.js", import.meta.url), "utf8");
const radixSource = readFileSync(new URL("../extension/vendor/radix-colors.css", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("../extension/options-view.js", import.meta.url), "utf8");

test("toolbar popup uses an intrinsic width while settings remain responsive", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.action.default_popup, "options.html?view=popup");
  assert.ok(html.indexOf('src="options-view.js"') < html.indexOf('href="vendor/radix-colors.css"'));
  assert.match(html, /html\[data-view="popup"\][^{]+\{\s*width: 360px; min-width: 360px;/);
  for (const [search, expected] of [["?view=popup", "popup"], ["", "settings"]]) {
    const document = { documentElement: { dataset: {} } };
    runInNewContext(viewSource, { document, location: { search }, URLSearchParams });
    assert.equal(document.documentElement.dataset.view, expected);
  }
});

test("local diagnostic permission is required but not duplicated as optional", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1/*"));
  assert.ok(!manifest.optional_host_permissions.includes("http://127.0.0.1/*"));
});

test("settings bundle namespaced light/dark Radix scales without external requests", () => {
  assert.match(html, /href="vendor\/radix-colors\.css"/);
  assert.match(radixSource, /--sai-violet-9: light-dark\(#6e56cf, #6e56cf\)/);
  for (const scale of ["violet", "mauve", "sand", "green", "amber", "red"]) {
    for (let step = 1; step <= 12; step++) assert.ok(radixSource.includes(`--sai-${scale}-${step}: light-dark(`));
  }
  assert.match(html, /--accent: var\(--sai-violet-9\)/);
  assert.match(html, /--error-text: var\(--sai-red-12\)/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.match(readFileSync(new URL("../extension/vendor/RADIX-LICENSE.txt", import.meta.url), "utf8"), /Copyright \(c\) 2021 Radix/);
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].css, ["content.css"], "Settings palette must not leak into ChatGPT");
});

function popup(stored = {}) {
  const element = (value = "") => ({
    value, hidden: false, checked: false, dataset: {}, textContent: "",
    disabled: false, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, handler) { this.listeners ??= {}; this.listeners[type] = handler; }
  });
  const fields = Object.fromEntries(
    ["personalFields", "subscriptionFields", "typeSafeKey", "activationCode", "workerUrl", "status", "save", "subscribe", "manage", "diagnosticsEnabled", "diagnosticsStatus", "exportDiagnostics", "usePersonalKey", "advanced", "login"]
      .map(id => [id, element()])
  );
  const radios = [element("personal"), element("subscription")];
  const writes = [];
  const permissions = [];
  const document = {
    documentElement: { lang: "" },
    title: "",
    getElementById: id => fields[id],
    querySelectorAll: selector => selector === 'input[name="connectionMode"]' ? radios : [],
    querySelector: selector => selector === 'input[name="connectionMode"]:checked'
      ? radios.find(radio => radio.checked) ?? null : null
  };
  const chrome = {
    i18n: { getUILanguage: () => "zh-TW" },
    storage: { local: {
      get: async () => stored,
      set: async value => { writes.push(value); }
    } },
    permissions: { request: async request => { permissions.push(request); return true; } },
    tabs: { create: async () => {} }
  };
  const context = { document, chrome, URL };
  runInNewContext(i18nSource, context);
  runInNewContext(optionsSource, context);
  return { context, fields, radios, writes, permissions };
}

test("hosted service is default and personal key is only in advanced settings", () => {
  assert.doesNotMatch(html, /name="connectionMode"|id="manage"/);
  assert.match(html, /<details class="advanced" id="advanced">/);
  assert.match(html, /id="usePersonalKey" type="checkbox"/);
  assert.doesNotMatch(html, /id="routingConsent"/);
  assert.match(html, /id="consentNote" data-i18n="consentNote"/);
});
test("popup async actions block repeat clicks and restore controls on success", async () => {
  const ui = popup();
  let finish;
  let calls = 0;
  const action = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = ui.context.runAction(ui.fields.save, action);
  assert.equal(ui.fields.save.disabled, true);
  assert.equal(ui.fields.save.attributes["aria-busy"], "true");
  await ui.context.runAction(ui.fields.save, action);
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(ui.fields.save.disabled, false);
  assert.equal(ui.fields.save.attributes["aria-busy"], undefined);
});

test("popup failed actions expose recovery feedback and remain retryable", async () => {
  const ui = popup();
  await ui.context.runAction(ui.fields.save, async () => { throw new Error("Storage unavailable"); });
  assert.equal(ui.fields.status.dataset.kind, "error");
  assert.equal(ui.fields.status.textContent, "Storage unavailable");
  assert.equal(ui.fields.status.hidden, false);
  assert.equal(ui.fields.save.disabled, false);
  assert.equal(ui.fields.save.attributes["aria-busy"], undefined);
});

test("popup associates field help and provides visible keyboard focus", () => {
  assert.match(html, /id="typeSafeKey"[^>]*aria-describedby="personalNote"/);
  assert.match(html, /id="diagnosticsEnabled"[^>]*aria-describedby="diagnosticsNote"/);
  assert.match(html, /\.jev-alert-action:focus-visible|button:focus-visible/);
  assert.match(html, /prefers-reduced-motion: no-preference/);
  assert.match(html, /width: min\(360px, 100vw\)/);
});

test("popup loads an existing personal key and saves without service permission", async () => {
  const ui = popup({ connectionMode: "personal", typeSafeKey: "test-key" });
  await ui.context.load();
  assert.equal(ui.fields.usePersonalKey.checked, true);
  assert.equal(ui.fields.personalFields.hidden, false);
  assert.equal(ui.fields.subscriptionFields.hidden, true);
  assert.equal(ui.fields.typeSafeKey.value, "test-key");

  await ui.context.save();
  assert.equal(ui.writes[0].connectionMode, "personal");
  assert.equal(ui.writes[0].typeSafeKey, "test-key");
  assert.equal(ui.permissions.length, 0);
});

test("popup switches to subscription fields and preserves service permission flow", async () => {
  const ui = popup({ connectionMode: "personal", typeSafeKey: "test-key" });
  await ui.context.load();
  ui.fields.usePersonalKey.checked = false;
  ui.fields.usePersonalKey.listeners.change();
  assert.equal(ui.fields.personalFields.hidden, true);
  assert.equal(ui.fields.subscriptionFields.hidden, false);

  ui.fields.workerUrl.value = "https://router.example.com/";
  ui.fields.activationCode.value = "test-code";
  await ui.context.save();
  assert.equal(ui.writes[0].connectionMode, "subscription");
  assert.equal(ui.writes[0].workerUrl, "https://router.example.com");
  assert.equal(ui.permissions.length, 1);
  assert.equal(ui.permissions[0].origins[0], "https://router.example.com/*");
});


test("fresh install defaults to hosted and save validates access rather than a consent checkbox", async () => {
  const ui = popup();
  await ui.context.load();
  assert.equal(ui.context.selectedMode(), "subscription");
  assert.equal(ui.fields.subscriptionFields.hidden, false);
  await assert.rejects(ui.context.save(), /服務網址/);
  assert.equal(ui.writes.length, 0);
});
test("member login fails honestly until email verification is implemented", async () => {
  const ui = popup();
  await assert.rejects(ui.context.login(), /尚未開通/);
});

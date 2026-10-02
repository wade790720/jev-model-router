import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../extension/options.html", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");
const optionsSource = readFileSync(new URL("../extension/options.js", import.meta.url), "utf8");

function popup(stored = {}) {
  const element = (value = "") => ({
    value, hidden: false, checked: false, dataset: {}, textContent: "",
    addEventListener(type, handler) { this.listeners ??= {}; this.listeners[type] = handler; }
  });
  const fields = Object.fromEntries(
    ["personalFields", "subscriptionFields", "typeSafeKey", "activationCode", "workerUrl", "status", "save", "subscribe", "manage"]
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

test("popup presents two selectable connection cards", () => {
  assert.match(html, /<input type="radio" name="connectionMode" value="personal">/);
  assert.match(html, /<input type="radio" name="connectionMode" value="subscription">/);
  assert.match(html, /\.mode-card input:checked \+ \.mode-content/);
  assert.doesNotMatch(html, /<select\b[^>]*id="connectionMode"/);
});

test("popup loads an existing personal key and saves without service permission", async () => {
  const ui = popup({ connectionMode: "personal", typeSafeKey: "test-key" });
  await ui.context.load();
  assert.equal(ui.radios[0].checked, true);
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
  ui.radios[0].checked = false;
  ui.radios[1].checked = true;
  ui.radios[1].listeners.change();
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

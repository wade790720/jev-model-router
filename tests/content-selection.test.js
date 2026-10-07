import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../extension/content.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");
const instrumented = source.replace(/\n\}\)\(\);\s*$/, "\n  globalThis.__jevTest = { routeDraft, routingFailure, onDraftChange, readText, show, inWorkMode, WORK_TARGETS, state };\n})();");
assert.notEqual(instrumented, source, "content script test hook must be inserted");

test("setup failures name the recovery rather than pretending the API failed", () => {
  const context = { document: {addEventListener() {}}, setInterval() {} };
  loadContent(context);
  for (const [code, text] of [
    ["routing_consent", "同意"], ["routing_key_missing", "TypeSafe API Key"],
    ["routing_service_unconfigured", "尚未開通"], ["routing_membership_missing", "會員憑證"]
  ]) {
    const result = context.__jevTest.routingFailure(code);
    assert.equal(result.kind, "warning");
    assert.ok(result.message.includes(text));
  }
  assert.match(context.__jevTest.routingFailure("routing_auth").message, /驗證失敗/);
  assert.match(context.__jevTest.routingFailure("routing_network").message, /無法連線/);
  assert.equal(context.__jevTest.routingFailure("routing_timeout").kind, "error");
});

function loadContent(context, language = "zh-TW") {
  context.chrome ??= {};
  context.chrome.i18n = { getUILanguage: () => language };
  runInNewContext(i18nSource, context);
  runInNewContext(instrumented, context);
}

test("low-confidence recommendations leave the selected model untouched", async () => {
  let clicked = false;
  const trigger = {
    innerText: "GPT-6 Luna", getBoundingClientRect: () => ({ width: 100, height: 30 }),
    getAttribute: () => null, click() { clicked = true; }
  };
  const element = () => ({ children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 70,
    setAttribute() {}, addEventListener() {},
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  const context = {
    document: { addEventListener() {}, createElement: element,
      body: { appendChild(node) { node.isConnected = true; } },
      querySelectorAll(selector) { return selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : []; } },
    window: { innerWidth: 500 }, getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {},
    chrome: { runtime: { sendMessage(_message, callback) {
      callback({ ok: true, result: { mode: "astra_xhigh", lowConfidence: true,
        topChoices: [{ mode: "astra_xhigh", probability: 0.4 }] } });
    } } }
  };
  loadContent(context);
  const { state, routeDraft } = context.__jevTest;
  state.composer = { closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };
  state.text = "請設計並驗證系統";
  state.surface = "work";
  assert.equal(await routeDraft(state.text, state.version), true);
  assert.equal(clicked, false);
  assert.equal(state.appliedText, state.text);
  assert.equal(state.badge.dataset.kind, "warning");
  assert.match(state.badge.children[0].children[1].textContent, /建議 GPT-6 Astra/);
});

test("draft text keeps code indentation and line breaks for Jev", () => {
  class Textarea {}
  const context = { document: { addEventListener() {} }, HTMLTextAreaElement: Textarea,
    setInterval() {}, setTimeout() {}, clearTimeout() {} };
  loadContent(context);
  const editor = new Textarea();
  editor.value = "  Fix this:\n    if (x) {\n      return y;\n    }  ";
  assert.equal(context.__jevTest.readText(editor), "Fix this:\n    if (x) {\n      return y;\n    }");
});

test("Alert is right-aligned and renders only the returned top choices", () => {
  function element() {
    return {
      children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 80,
      setAttribute() {}, addEventListener() {},
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; }
    };
  }
  const document = {
    addEventListener() {},
    createElement: element,
    body: { appendChild(node) { node.isConnected = true; } }
  };
  const context = { document, window: { innerWidth: 500 }, setInterval() {}, setTimeout() {}, clearTimeout() {},
    chrome: { runtime: { sendMessage() {} } } };
  loadContent(context);
  const { show, state } = context.__jevTest;
  state.composer = { closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };
  state.text = "請分析";
  show(context.JevI18n.t("recommendation", { model: "High" }), "success", [
    { mode: "high", probability: 0.7 }, { mode: "medium", probability: 0.3 }
  ]);
  assert.equal(state.badge.dataset.kind, "success");
  assert.equal(state.badge.style.right, "50px");
  assert.equal(state.badge.style.top, "112px");
  assert.equal(state.badge.children.length, 2, "status and probabilities share a compact alert");
  assert.equal(state.badge.children[0].children[1].textContent, "JEV · 建議使用 High");
  assert.equal(state.badge.children[1].children.length, 2);
  assert.equal(state.badge.children[1].children[0].children[1].textContent, "70%");
});

test("the 200px alert wraps long status text instead of truncating it", () => {
  assert.match(cssSource, /width:\s*min\(200px,/);
  const statusRule = cssSource.match(/#jev-model-router-badge \.jev-alert-status\s*\{([^}]*)\}/)?.[1];
  assert.ok(statusRule);
  assert.match(statusRule, /white-space:\s*normal/);
  assert.doesNotMatch(statusRule, /text-overflow:\s*ellipsis/);
  assert.match(source, /node\.setAttribute\("role", "status"\)/);
  assert.match(source, /node\.setAttribute\("aria-atomic", "true"\)/);
  assert.match(source, /name\.title = name\.textContent/);
  assert.match(cssSource, /\.jev-alert-action:focus-visible/);
  assert.match(cssSource, /\.jev-probability strong\s*\{[^}]*flex:\s*none/);
});

test("Alert follows the browser UI language", () => {
  function element() {
    return { children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 50,
      setAttribute() {}, addEventListener() {},
      append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } };
  }
  const context = {
    document: { addEventListener() {}, createElement: element, body: { appendChild(node) { node.isConnected = true; } } },
    window: { innerWidth: 500 }, setInterval() {}, setTimeout() {}, clearTimeout() {},
    chrome: { runtime: { sendMessage() {} } }
  };
  loadContent(context, "en-US");
  const { show, state } = context.__jevTest;
  state.composer = { closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };
  state.text = "Hello";
  show(context.JevI18n.t("recommendation", { model: "Instant" }), "success", []);
  assert.equal(state.badge.lang, "en");
  assert.equal(state.badge.children[0].children[1].textContent, "JEV · Suggested: Instant");
  assert.equal(state.badge.children[0].children[2].textContent, "Settings");
});

test("Work mode detection does not depend on translated button labels", () => {
  const group = {
    querySelectorAll() {
      return [
        { innerText: "チャット", getAttribute: () => "false" },
        { innerText: "作業", getAttribute: () => "true" }
      ];
    }
  };
  const context = {
    document: { addEventListener() {}, querySelectorAll(selector) { return selector === '[role="group"]' ? [group] : []; } },
    setInterval() {}, setTimeout() {}, clearTimeout() {}
  };
  loadContent(context, "ja-JP");
  assert.equal(context.__jevTest.inWorkMode(), true);
});

test("switching from Chat to Work reroutes a preserved draft after manual choice", () => {
  const editor = { innerText: "幫我查白馬雪場雪票", closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };
  const group = {
    querySelectorAll: () => [
      { innerText: "對話", getAttribute: () => "false" }, { innerText: "工作", getAttribute: () => "true" }
    ]
  };
  const element = () => ({ children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 50,
    setAttribute() {}, addEventListener() {},
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  let scheduled = false;
  const context = {
    document: { addEventListener() {}, querySelectorAll(selector) { return selector === '[role="group"]' ? [group] : []; },
      createElement: element, body: { appendChild(node) { node.isConnected = true; } } },
    HTMLTextAreaElement: class {}, window: { innerWidth: 500 },
    setInterval() {}, setTimeout() { scheduled = true; return 1; }, clearTimeout() {}
  };
  loadContent(context);
  const { state, onDraftChange } = context.__jevTest;
  state.composer = editor;
  state.text = editor.innerText;
  state.surface = "chat";
  state.appliedText = editor.innerText;
  onDraftChange();
  assert.equal(state.surface, "work");
  assert.equal(state.appliedText, "");
  assert.equal(state.badge.dataset.kind, "loading");
  assert.equal(scheduled, true);
});

test("existing Work conversation is identified from its composer model without a mode toggle", () => {
  const trigger = { innerText: "GPT-6.1 Sol 輕度", getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 120, height: 30 }) };
  const context = {
    document: { addEventListener() {}, querySelectorAll(selector) { return selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : []; } },
    getComputedStyle: () => ({ visibility: "visible" }), setInterval() {}
  };
  loadContent(context);
  assert.equal(context.__jevTest.inWorkMode(), true);
});

test("unrelated two-button groups cannot misclassify Chat as Work", () => {
  const group = { querySelectorAll: () => [
    { innerText: "List", getAttribute: () => "false" }, { innerText: "Grid", getAttribute: () => "true" }
  ] };
  const context = { document: { addEventListener() {}, querySelectorAll(selector) { return selector === '[role="group"]' ? [group] : []; } }, setInterval() {} };
  loadContent(context);
  assert.equal(context.__jevTest.inWorkMode(), false);
});

test("IME candidate Enter cannot send while composing or just after commit", () => {
  const handlers = {};
  const editor = {
    innerText: "修正錯字",
    getBoundingClientRect: () => ({ width: 300, height: 60 }),
    closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }),
    contains: () => false
  };
  const element = () => ({ children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 50,
    setAttribute() {}, addEventListener() {},
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  let now = 1_000;
  let schedules = 0;
  const context = {
    document: {
      addEventListener(type, handler) { handlers[type] = handler; },
      querySelectorAll(selector) { return selector.startsWith('#prompt-textarea') ? [editor] : []; },
      createElement: element, body: { appendChild(node) { node.isConnected = true; } }
    },
    HTMLTextAreaElement: class {}, window: { innerWidth: 500 }, Date: { now: () => now },
    getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout() { schedules++; return schedules; }, clearTimeout() {}
  };
  loadContent(context);
  const { state } = context.__jevTest;
  const enter = extra => {
    const event = { key: "Enter", target: editor, isTrusted: true, shiftKey: false,
      isComposing: false, keyCode: 13, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    handlers.keydown(event);
    return event;
  };
  handlers.compositionstart({ target: editor });
  handlers.input({ target: editor, isComposing: true });
  assert.equal(schedules, 0, "partial IME text must not trigger Jev routing");
  assert.equal(enter().prevented, true);
  assert.equal(enter({ isComposing: true }).stopped, true);
  handlers.compositionend({ target: editor });
  assert.equal(state.composing, false);
  assert.equal(schedules, 1, "the committed text is routed once");
  now += 100;
  assert.equal(enter().prevented, true);
  now += 400;
  assert.equal(state.appliedText, "", "recommendation is still pending");
  assert.equal(enter().prevented, false, "a deliberate Enter never waits for a recommendation");
});


test("recommendation-only script cannot operate model menus, focus or sending", () => {
  assert.doesNotMatch(source, /\.click\(|\.focus\(|dispatchEvent\(|new KeyboardEvent|guardSend|selectModel|selectWorkModel/);
});

for (const surface of ["chat", "work"]) {
  test(`high-confidence ${surface} recommendation never changes the selected model`, async () => {
    let clicked = 0;
    const events = [];
    const trigger = { innerText: surface === "work" ? "GPT-6 Luna" : "Instant",
      getBoundingClientRect: () => ({ width: 100, height: 30 }), getAttribute: () => null,
      click() { clicked++; } };
    const element = () => ({ children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 60,
      setAttribute() {}, addEventListener() {}, append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; } });
    const context = {
      document: { addEventListener() {}, createElement: element, body: { appendChild(node) { node.isConnected = true; } },
        querySelectorAll(selector) { return selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : []; } },
      window: { innerWidth: 500 }, getComputedStyle: () => ({ visibility: "visible" }),
      setInterval() {}, setTimeout() {}, clearTimeout() {},
      chrome: { runtime: { sendMessage(message, callback) {
        if (message.type === "JEV_DIAGNOSTIC") { events.push(message.event); callback({ok: true}); return; }
        callback({ok: true, result: {mode: surface === "work" ? "astra_medium" : "high", confidence: .9, topChoices: []}});
      } } }
    };
    loadContent(context);
    const {state, routeDraft} = context.__jevTest;
    state.composer = {closest: () => ({getBoundingClientRect: () => ({top: 200, right: 450})})};
    state.text = "synthetic recommendation fixture"; state.surface = surface;
    assert.equal(await routeDraft(state.text), true);
    assert.equal(clicked, 0);
    assert.equal(state.badge.dataset.kind, "success");
    assert.equal(events[0].outcome, "suggested");
    assert.doesNotMatch(JSON.stringify(events), /synthetic recommendation fixture/);
  });
}

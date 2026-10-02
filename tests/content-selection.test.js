import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../extension/content.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");
const instrumented = source.replace(/\n\}\)\(\);\s*$/, "\n  globalThis.__jevTest = { selectedLabelMatches, selectReasoningSlider, selectModel, workModelMatches, workSelectionMatches, workSelectionLabel, selectWorkModel, routeDraft, onDraftChange, readText, show, inWorkMode, WORK_TARGETS, state };\n})();");
assert.notEqual(instrumented, source, "content script test hook must be inserted");

function loadContent(context, language = "zh-TW") {
  context.chrome ??= {};
  context.chrome.i18n = { getUILanguage: () => language };
  runInNewContext(i18nSource, context);
  runInNewContext(instrumented, context);
}

function fixture(initialEffort = "medium", closeMenuOnKey = true) {
  let menuOpen = true;
  const button = {
    innerText: initialEffort === "none" ? "Instant" : "Medium",
    getAttribute(name) {
      if (name === "data-selected-reasoning-effort") return initialEffort;
      if (name === "aria-expanded") return String(menuOpen);
      if (name === "aria-label") return "選取 ChatGPT 模型";
      return null;
    },
    getBoundingClientRect: () => ({ width: 100, height: 30 }),
    click() { menuOpen = false; }
  };
  const slider = {
    getAttribute(name) {
      return { "aria-valuemin": "0", "aria-valuemax": "2", "aria-valuenow": "1" }[name] ?? null;
    }
  };
  const control = {
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 30 }),
    closest: () => null,
    querySelector: () => slider,
    focus() {},
    dispatchEvent(event) {
      assert.equal(event.key, "ArrowLeft");
      initialEffort = "none";
      button.innerText = "Instant";
      if (closeMenuOnKey) menuOpen = false;
    }
  };
  const document = {
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '[data-composer-navigation-target="reasoning"]') return [button];
      if (selector === '[data-reasoning-slider="true"]') return menuOpen ? [control] : [];
      return [];
    }
  };
  const context = { document, getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {},
    KeyboardEvent: class { constructor(_type, options) { this.key = options.key; } } };
  loadContent(context);
  return { button, api: context.__jevTest };
}

test("Instant is recognized even when ChatGPT calls its reasoning effort none", () => {
  const { button, api } = fixture("none");
  assert.equal(api.selectedLabelMatches(button, ["Instant"]), true);
});

test("a slider change is successful when ChatGPT closes the menu immediately", async () => {
  const { button, api } = fixture("medium", true);
  assert.equal(await api.selectReasoningSlider("instant"), "Instant");
  assert.equal(api.selectedLabelMatches(button, ["Instant"]), true);
});

for (const userNavigatesAway of [false, true]) {
  test(`automatic switch ${userNavigatesAway ? "respects user navigation" : "restores draft focus and caret"}`, async () => {
    const handlers = {};
    let menuOpen = false;
    let model = "Medium";
    class Textarea {
      value = "A draft for routing";
      isConnected = true;
      selectionStart = 7;
      selectionEnd = 7;
      selectionDirection = "none";
      contains() { return false; }
      focus(options) { assert.equal(options.preventScroll, true); document.activeElement = this; }
      setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    }
    const editor = new Textarea();
    const visible = () => ({ width: 100, height: 30 });
    const button = {
      get innerText() { return model; },
      getAttribute(name) { return name === "aria-expanded" ? String(menuOpen) : null; },
      getBoundingClientRect: visible,
      click() { menuOpen = !menuOpen; document.activeElement = this; }
    };
    const item = {
      innerText: "Instant", getAttribute: () => null, getBoundingClientRect: visible,
      closest: () => null,
      click() {
        document.activeElement = this;
        if (userNavigatesAway) handlers.pointerdown({ isTrusted: true, target: this });
        model = "Instant";
        menuOpen = false;
      }
    };
    const document = {
      activeElement: editor,
      addEventListener(type, handler) { handlers[type] = handler; },
      querySelectorAll(selector) {
        if (selector === '[data-composer-navigation-target="reasoning"]') return [button];
        if (selector.startsWith("[role='menuitem']")) return menuOpen ? [item] : [];
        return [];
      }
    };
    const context = { document, HTMLTextAreaElement: Textarea,
      getComputedStyle: () => ({ visibility: "visible" }),
      setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {} };
    loadContent(context);
    const { state, selectModel } = context.__jevTest;
    state.composer = editor;
    state.text = editor.value;
    assert.equal(await selectModel("instant", state.text, state.version), "Instant");
    assert.equal(document.activeElement, userNavigatesAway ? item : editor);
    assert.equal(editor.selectionStart, 7);
  });
}

test("Work success requires both the model and the requested reasoning effort", () => {
  const { api } = fixture();
  const button = {
    innerText: "GPT-6.1 Sol\n輕度\n無\n中\n極高",
    getAttribute(name) { return name === "data-selected-reasoning-effort" ? "low" : null; }
  };
  assert.equal(api.workSelectionMatches(button, api.WORK_TARGETS.sol_low), true);
  assert.equal(api.workSelectionMatches(button, api.WORK_TARGETS.sol_medium), false);
  assert.equal(api.workModelMatches(button, api.WORK_TARGETS.sol_medium), true);
  assert.equal(api.workSelectionMatches(button, api.WORK_TARGETS.astra_low), false);
  assert.equal(api.workSelectionLabel(button, api.WORK_TARGETS.sol_low), "GPT-6.1 Sol · 輕度");
});

test("Work can use an available Sol version but reports the actual model", () => {
  const { api } = fixture();
  const button = {
    innerText: "GPT-6 Sol\n輕度",
    getAttribute(name) { return name === "data-selected-reasoning-effort" ? "low" : null; }
  };
  assert.equal(api.workSelectionMatches(button, api.WORK_TARGETS.sol_low), true);
  assert.equal(api.workSelectionLabel(button, api.WORK_TARGETS.sol_low), "GPT-6 Sol · 輕度");
});

test("Work Luna waits for the model label and commits a reasoning effort", async () => {
  let menuOpen = false;
  let view = "simple";
  let model = "GPT-6.1 Sol";
  let effort = "medium";
  let position = 1;
  let committed = false;
  const visible = () => ({ width: 100, height: 30 });
  const trigger = {
    get innerText() { return committed ? `${model}\n${effort}` : "選取推理強度"; },
    getAttribute(name) {
      if (name === "data-selected-reasoning-effort") return effort;
      if (name === "aria-expanded") return String(menuOpen);
      return null;
    },
    getBoundingClientRect: visible,
    click() { menuOpen = !menuOpen; }
  };
  const toggle = {
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    click() { view = "advanced"; }
  };
  const item = {
    innerText: "GPT-6 Luna",
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    click() { model = "GPT-6 Luna"; effort = "low"; position = 0; view = "simple"; }
  };
  const slider = {
    getAttribute(name) {
      return { "aria-valuemin": "0", "aria-valuemax": "4", "aria-valuenow": String(position) }[name] ?? null;
    }
  };
  const control = {
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    querySelector: () => slider, focus() {},
    dispatchEvent(event) {
      if (event.type !== "keydown") return;
      position += event.key === "ArrowRight" ? 1 : -1;
      effort = position === 0 ? "low" : "medium";
      committed = true;
    }
  };
  const document = {
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '[data-composer-navigation-target="reasoning"]') return [trigger];
      if (selector === '[role="menu"] [role="menuitemradio"]') return menuOpen && view === "advanced" ? [item] : [];
      if (selector === '[data-model-picker-view-toggle="true"]') return menuOpen && view === "simple" ? [toggle] : [];
      if (selector === '[data-reasoning-slider="true"]') return menuOpen && view === "simple" ? [control] : [];
      return [];
    }
  };
  const context = {
    document, getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {},
    KeyboardEvent: class { constructor(type, options) { this.type = type; this.key = options.key; } }
  };
  loadContent(context);
  const { state, selectWorkModel } = context.__jevTest;
  state.text = "幫我查白馬雪場雪票";
  state.surface = "work";
  assert.equal(await selectWorkModel("luna", state.text, state.version), "GPT-6 Luna · 輕度");
  assert.equal(effort, "low");
  assert.equal(menuOpen, false);
});

test("Work selects a model, adjusts effort, and verifies both before success", async () => {
  let menuOpen = false;
  let view = "simple";
  let model = "GPT-6 Luna";
  let effort = "low";
  let position = 0;
  const visible = () => ({ width: 100, height: 30 });
  const trigger = {
    get innerText() { return `${model}\n輕度`; },
    getAttribute(name) {
      if (name === "data-selected-reasoning-effort") return effort;
      if (name === "aria-expanded") return String(menuOpen);
      return null;
    },
    getBoundingClientRect: visible,
    click() { menuOpen = !menuOpen; }
  };
  const toggle = {
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    click() { view = "advanced"; }
  };
  const item = {
    innerText: "GPT-6.1 Sol",
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    click() { model = "GPT-6.1 Sol"; effort = "low"; view = "simple"; }
  };
  const slider = {
    getAttribute(name) {
      return { "aria-valuemin": "0", "aria-valuemax": "4", "aria-valuenow": String(position) }[name] ?? null;
    },
    dispatchEvent(event) {
      if (event.type !== "keydown") return;
      assert.equal(event.key, "ArrowRight");
      assert.equal(event.keyCode, 39);
      position = 1;
      effort = "medium";
    }
  };
  const control = {
    getBoundingClientRect: visible, getAttribute: () => null, closest: () => null,
    querySelector: () => slider, focus() {},
    dispatchEvent(event) {
      assert.equal(event.key, "ArrowRight");
    }
  };
  const document = {
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '[data-composer-navigation-target="reasoning"]') return [trigger];
      if (selector === '[role="menu"] [role="menuitemradio"]') return menuOpen && view === "advanced" ? [item] : [];
      if (selector === '[data-model-picker-view-toggle="true"]') return menuOpen && view === "simple" ? [toggle] : [];
      if (selector === '[data-reasoning-slider="true"]') return menuOpen && view === "simple" ? [control] : [];
      return [];
    }
  };
  const context = {
    document, getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {},
    KeyboardEvent: class { constructor(type, options) { this.type = type; this.key = options.key; this.keyCode = options.keyCode; } }
  };
  loadContent(context);
  const { state, selectWorkModel } = context.__jevTest;
  state.text = "解釋並修正程式碼";
  state.surface = "work";
  assert.equal(await selectWorkModel("sol_medium", state.text, state.version), "GPT-6.1 Sol · 中度");
  assert.equal(menuOpen, false);
  assert.equal(effort, "medium");
});

test("Work reports a partial switch when the model changed but effort did not", async () => {
  const visible = () => ({ width: 100, height: 30 });
  let menuOpen = false;
  const trigger = {
    innerText: "GPT-6 Astra\n輕度",
    getBoundingClientRect: visible,
    getAttribute(name) {
      if (name === "data-selected-reasoning-effort") return "low";
      if (name === "aria-expanded") return String(menuOpen);
      return null;
    },
    click() { menuOpen = !menuOpen; }
  };
  const element = () => ({ children: [], style: {}, dataset: {}, isConnected: false, offsetHeight: 70,
    setAttribute() {}, addEventListener() {},
    append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; } });
  const document = {
    addEventListener() {}, createElement: element,
    body: { appendChild(node) { node.isConnected = true; } },
    querySelectorAll(selector) { return selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : []; }
  };
  const context = {
    document, window: { innerWidth: 500 }, getComputedStyle: () => ({ visibility: "visible" }),
    setInterval() {}, setTimeout(callback) { callback(); }, clearTimeout() {},
    chrome: { runtime: { sendMessage(_message, callback) {
      callback({ ok: true, result: { mode: "astra_medium", topChoices: [{ mode: "astra_medium", probability: 0.81 }] } });
    } } }
  };
  loadContent(context);
  const { state, routeDraft } = context.__jevTest;
  state.composer = { closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };
  state.text = "請設計多人協作筆記系統";
  state.surface = "work";
  assert.equal(await routeDraft(state.text, state.version), false);
  assert.equal(state.failedText, state.text);
  assert.equal(state.partialText, state.text);
  assert.equal(state.badge.dataset.kind, "warning");
  assert.equal(state.badge.children[0].children[1].textContent, "JEV · 模型已切換，強度請手動調整");
});

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
  show(context.JevI18n.t("switched", { model: "High" }), "success", [
    { mode: "high", probability: 0.7 }, { mode: "medium", probability: 0.3 }
  ]);
  assert.equal(state.badge.dataset.kind, "success");
  assert.equal(state.badge.style.right, "50px");
  assert.equal(state.badge.style.top, "112px");
  assert.equal(state.badge.children.length, 2, "status and probabilities share a compact alert");
  assert.equal(state.badge.children[0].children[1].textContent, "JEV · 已切換");
  assert.equal(state.badge.children[1].children.length, 2);
  assert.equal(state.badge.children[1].children[0].children[1].textContent, "70%");
});

test("the 200px alert wraps long status text instead of truncating it", () => {
  assert.match(cssSource, /width:\s*min\(200px,/);
  const statusRule = cssSource.match(/#jev-model-router-badge \.jev-alert-status\s*\{([^}]*)\}/)?.[1];
  assert.ok(statusRule);
  assert.match(statusRule, /white-space:\s*normal/);
  assert.doesNotMatch(statusRule, /text-overflow:\s*ellipsis/);
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
  show(context.JevI18n.t("switched", { model: "Instant" }), "success", []);
  assert.equal(state.badge.lang, "en");
  assert.equal(state.badge.children[0].children[1].textContent, "JEV · Switched");
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
      { getAttribute: () => "false" }, { getAttribute: () => "true" }
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
  state.manualOverride = true;
  state.appliedText = editor.innerText;
  onDraftChange();
  assert.equal(state.surface, "work");
  assert.equal(state.manualOverride, false);
  assert.equal(state.appliedText, "");
  assert.equal(state.badge.dataset.kind, "loading");
  assert.equal(scheduled, true);
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
  state.appliedText = editor.innerText;
  assert.equal(enter().prevented, false, "a later deliberate Enter still works");
});

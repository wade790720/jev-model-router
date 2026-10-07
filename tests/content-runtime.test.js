import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8")
  .replace(/\n\}\)\(\);\s*$/, "\n globalThis.api = {sendRuntime, recordDiagnostic, show, state};\n})();");
const i18n = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");
function fixture(runtime) {
  const handlers = {};
  let intervalCleared = false;
  const element = () => ({children: [], dataset: {}, style: {}, isConnected: false, offsetHeight: 60, listeners: {},
    setAttribute() {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; }});
  const context = {
    chrome: {runtime, i18n: {getUILanguage: () => "zh-TW"}},
    document: {addEventListener(type, handler) {handlers[type] = handler;}, createElement: element,
      body: {appendChild(node) {node.isConnected = true;}}},
    window: {innerWidth: 500}, setInterval: () => 77, clearInterval(id) {assert.equal(id, 77); intervalCleared = true;},
    setTimeout() {}, clearTimeout() {}
  };
  runInNewContext(i18n, context);
  runInNewContext(source, context);
  context.api.state.composer = {closest: () => ({getBoundingClientRect: () => ({top: 200, right: 450})})};
  context.api.state.text = "synthetic fixture";
  return {context, api: context.api, handlers, cleared: () => intervalCleared};
}
test("old Alert settings button handles a missing runtime without uncaught errors", async () => {
  const {context, api, cleared} = fixture({sendMessage() {}});
  api.show("Ready", "success");
  const oldButton = api.state.badge.children[0].children[2];
  context.chrome.runtime = undefined;
  assert.doesNotThrow(() => oldButton.listeners.click());
  await Promise.resolve();
  assert.equal(api.state.disconnected, true);
  assert.equal(cleared(), true);
  assert.match(api.state.badge.children[0].children[1].textContent, /重新整理/);
  assert.equal(api.state.badge.children[0].children[2].disabled, true);
});
test("sendMessage throwing Extension context invalidated stops the orphaned script", async () => {
  const {api, cleared, handlers} = fixture({sendMessage() {throw new Error("Extension context invalidated.");}});
  await assert.rejects(api.sendRuntime({type: "JEV_ROUTE"}), /invalidated/);
  assert.equal(api.state.disconnected, true);
  assert.equal(cleared(), true);
  assert.doesNotThrow(() => handlers.keydown({key: "Enter", isTrusted: true}), "orphaned script must not interfere with sending");
});
test("runtime disappearing before an async callback is also contained", async () => {
  let callback;
  const {context, api} = fixture({sendMessage(_message, cb) {callback = cb;}});
  const pending = api.sendRuntime({type: "JEV_ROUTE"});
  context.chrome.runtime = undefined;
  assert.doesNotThrow(() => callback({ok: true}));
  await assert.rejects(pending, /invalidated/);
  assert.equal(api.state.disconnected, true);
});
test("ordinary messaging failures do not permanently disable the extension", async () => {
  const runtime = {lastError: {message: "Could not establish connection."}, sendMessage(_message, cb) {cb();}};
  const {api} = fixture(runtime);
  await assert.rejects(api.sendRuntime({}), /connection/);
  assert.equal(api.state.disconnected, false);
  runtime.lastError = undefined;
  runtime.sendMessage = (_message, cb) => cb({ok: true});
  assert.equal((await api.sendRuntime({})).ok, true);
});
test("late diagnostic callback after reload never throws", async () => {
  let callback;
  const {context, api} = fixture({sendMessage(_message, cb) {callback = cb;}});
  api.recordDiagnostic({outcome: "suggested"});
  context.chrome.runtime = undefined;
  assert.doesNotThrow(() => callback({ok: true}));
  await Promise.resolve();
  assert.equal(api.state.disconnected, true);
});

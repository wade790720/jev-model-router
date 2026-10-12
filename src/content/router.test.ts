import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { createRouter } from "./router";

// The router runs against hand-made DOM stand-ins: only what each test needs, so a test fails
// if the script starts touching anything else (clicks, focus, synthetic keys).
const source = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../../public/content.css", import.meta.url), "utf8");
const at = { closest: () => ({ getBoundingClientRect: () => ({ top: 200, right: 450 }) }) };

function element(offsetHeight = 60): any {
  return { children: [], style: {}, dataset: {}, isConnected: false, offsetHeight, listeners: {} as Record<string, () => void>,
    setAttribute() {}, addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; },
    append(...nodes: unknown[]) { this.children.push(...nodes); }, replaceChildren() { this.children = []; } };
}

function setup({ document = {}, runtime, language = "zh-TW", offsetHeight }: {
  document?: Record<string, unknown>; runtime?: unknown; language?: string; offsetHeight?: number;
} = {}) {
  vi.useFakeTimers();
  const handlers: Record<string, (event: any) => void> = {};
  vi.stubGlobal("document", { addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler; },
    querySelectorAll: () => [], createElement: () => element(offsetHeight), body: { appendChild(node: any) { node.isConnected = true; } }, ...document });
  vi.stubGlobal("window", { innerWidth: 500 });
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  vi.stubGlobal("HTMLTextAreaElement", class {});
  vi.stubGlobal("chrome", { i18n: { getUILanguage: () => language }, runtime });
  const router = createRouter();
  return { ...router, state: router.state as any, handlers };
}
const text = (badge: any, index: number) => badge.children[0].children[index].textContent;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("setup failures name the recovery rather than pretending the API failed", () => {
  const { routingFailure } = setup();
  for (const [code, words] of [
    ["routing_consent", "同意"], ["routing_key_missing", "TypeSafe API Key"],
    ["routing_service_unconfigured", "尚未開通"], ["routing_membership_missing", "登入 Skool"]
  ]) {
    const result = routingFailure(code);
    expect(result.kind).toBe("warning");
    expect(result.message).toContain(words);
  }
  expect(routingFailure("routing_auth").message).toMatch(/驗證失敗/);
  expect(routingFailure("routing_network").message).toMatch(/無法連線/);
  expect(routingFailure("routing_timeout").kind).toBe("error");
});

test("low-confidence recommendations leave the selected model untouched", async () => {
  const click = vi.fn();
  const trigger = { innerText: "GPT-6 Luna", getBoundingClientRect: () => ({ width: 100, height: 30 }), getAttribute: () => null, click };
  const { state, routeDraft } = setup({
    document: { querySelectorAll: (selector: string) => selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : [] },
    runtime: { sendMessage: (_message: unknown, callback: (value: unknown) => void) => callback({ ok: true,
      result: { mode: "astra_xhigh", lowConfidence: true, topChoices: [{ mode: "astra_xhigh", probability: 0.4 }] } }) }
  });
  state.composer = at;
  state.text = "請設計並驗證系統";
  state.surface = "work";
  expect(await routeDraft(state.text, state.version)).toBe(true);
  expect(click).not.toHaveBeenCalled();
  expect(state.appliedText).toBe(state.text);
  expect(state.badge.dataset.kind).toBe("warning");
  expect(text(state.badge, 1)).toMatch(/建議 GPT-6 Astra/);
});

test("draft text keeps code indentation and line breaks for Jev", () => {
  const { readText } = setup();
  const editor = Object.assign(new (globalThis as any).HTMLTextAreaElement(), { value: "  Fix this:\n    if (x) {\n      return y;\n    }  " });
  expect(readText(editor)).toBe("Fix this:\n    if (x) {\n      return y;\n    }");
});

test("Alert is right-aligned and renders only the returned top choices", () => {
  const { show, state } = setup({ runtime: { sendMessage() {} }, offsetHeight: 80 });
  state.composer = at;
  state.text = "請分析";
  show("建議使用 High", "success", [{ mode: "high", probability: 0.7 }, { mode: "medium", probability: 0.3 }]);
  expect(state.badge.dataset.kind).toBe("success");
  expect(state.badge.style.right).toBe("50px");
  expect(state.badge.style.top).toBe("112px");
  expect(state.badge.children).toHaveLength(2);
  expect(text(state.badge, 1)).toBe("JEV · 建議使用 High");
  expect(state.badge.children[1].children).toHaveLength(2);
  expect(state.badge.children[1].children[0].children[1].textContent).toBe("70%");
});

test("the 200px alert wraps long status text instead of truncating it", () => {
  expect(css).toMatch(/width:\s*min\(200px,/);
  const statusRule = css.match(/#jev-model-router-badge \.jev-alert-status\s*\{([^}]*)\}/)?.[1];
  expect(statusRule).toBeTruthy();
  expect(statusRule).toMatch(/white-space:\s*normal/);
  expect(statusRule).not.toMatch(/text-overflow:\s*ellipsis/);
  expect(source).toMatch(/node\.setAttribute\("role", "status"\)/);
  expect(source).toMatch(/node\.setAttribute\("aria-atomic", "true"\)/);
  expect(source).toMatch(/name\.title = name\.textContent/);
  expect(css).toMatch(/\.jev-alert-action:focus-visible/);
  expect(css).toMatch(/\.jev-probability strong\s*\{[^}]*flex:\s*none/);
});

test("Alert follows the browser UI language", () => {
  const { show, state } = setup({ runtime: { sendMessage() {} }, language: "en-US" });
  state.composer = at;
  state.text = "Hello";
  show("Suggested: Instant", "success", []);
  expect(state.badge.lang).toBe("en");
  expect(text(state.badge, 1)).toBe("JEV · Suggested: Instant");
  expect(text(state.badge, 2)).toBe("Settings");
});

const modeGroup = (labels: [string, string], pressed: [string, string]) => ({ querySelectorAll: () =>
  labels.map((innerText, index) => ({ innerText, getAttribute: () => pressed[index] })) });

test("Work mode detection does not depend on translated button labels", () => {
  const group = modeGroup(["チャット", "作業"], ["false", "true"]);
  const { inWorkMode } = setup({ language: "ja-JP", document: { querySelectorAll: (selector: string) => selector === '[role="group"]' ? [group] : [] } });
  expect(inWorkMode()).toBe(true);
});

test("switching from Chat to Work reroutes a preserved draft after manual choice", () => {
  const editor = { innerText: "幫我查白馬雪場雪票", ...at };
  const group = modeGroup(["對話", "工作"], ["false", "true"]);
  const { state, onDraftChange } = setup({ document: { querySelectorAll: (selector: string) => selector === '[role="group"]' ? [group] : [] } });
  const timeout = vi.spyOn(globalThis, "setTimeout");
  state.composer = editor;
  state.text = editor.innerText;
  state.surface = "chat";
  state.appliedText = editor.innerText;
  onDraftChange();
  expect(state.surface).toBe("work");
  expect(state.appliedText).toBe("");
  expect(state.badge.dataset.kind).toBe("loading");
  expect(timeout).toHaveBeenCalled();
});

test("existing Work conversation is identified from its composer model without a mode toggle", () => {
  const trigger = { innerText: "GPT-6.1 Sol 輕度", getAttribute: () => null, getBoundingClientRect: () => ({ width: 120, height: 30 }) };
  const { inWorkMode } = setup({ document: { querySelectorAll: (selector: string) => selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : [] } });
  expect(inWorkMode()).toBe(true);
});

test("unrelated two-button groups cannot misclassify Chat as Work", () => {
  const group = modeGroup(["List", "Grid"], ["false", "true"]);
  const { inWorkMode } = setup({ document: { querySelectorAll: (selector: string) => selector === '[role="group"]' ? [group] : [] } });
  expect(inWorkMode()).toBe(false);
});

test("IME candidate Enter cannot send while composing or just after commit", () => {
  const editor = { innerText: "修正錯字", getBoundingClientRect: () => ({ width: 300, height: 60 }), contains: () => false, ...at };
  const { state, handlers } = setup({ document: { querySelectorAll: (selector: string) => selector.startsWith("#prompt-textarea") ? [editor] : [] } });
  vi.setSystemTime(1_000);
  const timeout = vi.spyOn(globalThis, "setTimeout");
  const enter = (extra = {}) => {
    const event = { key: "Enter", target: editor, isTrusted: true, shiftKey: false, isComposing: false, keyCode: 13,
      prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    handlers.keydown(event);
    return event;
  };
  handlers.compositionstart({ target: editor });
  handlers.input({ target: editor, isComposing: true });
  expect(timeout, "partial IME text must not trigger Jev routing").not.toHaveBeenCalled();
  expect(enter().prevented).toBe(true);
  expect(enter({ isComposing: true }).stopped).toBe(true);
  handlers.compositionend({ target: editor });
  expect(state.composing).toBe(false);
  expect(timeout, "the committed text is routed once").toHaveBeenCalledTimes(1);
  vi.setSystemTime(1_100);
  expect(enter().prevented).toBe(true);
  vi.setSystemTime(1_500);
  expect(state.appliedText, "recommendation is still pending").toBe("");
  expect(enter().prevented, "a deliberate Enter never waits for a recommendation").toBe(false);
});

test("recommendation-only script cannot operate model menus, focus or sending", () => {
  expect(source).not.toMatch(/\.click\(|\.focus\(|dispatchEvent\(|new KeyboardEvent|guardSend|selectModel|selectWorkModel/);
});

for (const surface of ["chat", "work"] as const) {
  test(`high-confidence ${surface} recommendation never changes the selected model`, async () => {
    const click = vi.fn();
    const sent: string[] = [];
    const trigger = { innerText: surface === "work" ? "GPT-6 Luna" : "Instant", getBoundingClientRect: () => ({ width: 100, height: 30 }), getAttribute: () => null, click };
    const { state, routeDraft } = setup({
      document: { querySelectorAll: (selector: string) => selector === '[data-composer-navigation-target="reasoning"]' ? [trigger] : [] },
      runtime: { sendMessage(message: any, callback: (value: unknown) => void) {
        sent.push(message.type);
        callback({ ok: true, result: { mode: surface === "work" ? "astra_medium" : "high", confidence: .9, topChoices: [] } });
      } }
    });
    state.composer = at;
    state.text = "synthetic recommendation fixture"; state.surface = surface;
    expect(await routeDraft(state.text)).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(state.badge.dataset.kind).toBe("success");
    expect(sent, "only the route request leaves the page").toEqual(["JEV_ROUTE"]);
  });
}

// Runtime loss: after an extension reload the old content script stays in the page without chrome.runtime.
function orphan(runtime: Record<string, any>) {
  const api = setup({ runtime });
  const cleared = vi.spyOn(globalThis, "clearInterval");
  api.state.composer = at;
  api.state.text = "synthetic fixture";
  return { ...api, cleared, chrome: (globalThis as any).chrome };
}

test("old Alert settings button handles a missing runtime without uncaught errors", async () => {
  const { show, state, cleared, chrome } = orphan({ sendMessage() {} });
  show("Ready", "success");
  const oldButton = state.badge.children[0].children[2];
  chrome.runtime = undefined;
  expect(() => oldButton.listeners.click()).not.toThrow();
  await Promise.resolve();
  expect(state.disconnected).toBe(true);
  expect(cleared).toHaveBeenCalledWith(state.pollTimer);
  expect(text(state.badge, 1)).toMatch(/重新整理/);
  expect(state.badge.children[0].children[2].disabled).toBe(true);
});

test("sendMessage throwing Extension context invalidated stops the orphaned script", async () => {
  const { sendRuntime, state, cleared, handlers } = orphan({ sendMessage() { throw new Error("Extension context invalidated."); } });
  await expect(sendRuntime({ type: "JEV_ROUTE" })).rejects.toThrow(/invalidated/);
  expect(state.disconnected).toBe(true);
  expect(cleared).toHaveBeenCalled();
  expect(() => handlers.keydown({ key: "Enter", isTrusted: true }), "orphaned script must not interfere with sending").not.toThrow();
});

test("runtime disappearing before an async callback is also contained", async () => {
  let callback!: (value: unknown) => void;
  const { sendRuntime, state, chrome } = orphan({ sendMessage(_message: unknown, cb: (value: unknown) => void) { callback = cb; } });
  const pending = sendRuntime({ type: "JEV_ROUTE" });
  chrome.runtime = undefined;
  expect(() => callback({ ok: true })).not.toThrow();
  await expect(pending).rejects.toThrow(/invalidated/);
  expect(state.disconnected).toBe(true);
});

test("ordinary messaging failures do not permanently disable the extension", async () => {
  const runtime: Record<string, any> = { lastError: { message: "Could not establish connection." }, sendMessage(_message: unknown, cb: () => void) { cb(); } };
  const { sendRuntime, state } = orphan(runtime);
  await expect(sendRuntime({})).rejects.toThrow(/connection/);
  expect(state.disconnected).toBe(false);
  runtime.lastError = undefined;
  runtime.sendMessage = (_message: unknown, cb: (value: unknown) => void) => cb({ ok: true });
  expect((await sendRuntime({}))?.ok).toBe(true);
});

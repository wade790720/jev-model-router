import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createActionRunner, loadSettings, login, saveSettings, type Status } from "./settings";

let writes: Record<string, unknown>[];
let permissions: { origins: string[] }[];
function storage(stored: Record<string, unknown> = {}) {
  vi.stubGlobal("chrome", {
    i18n: { getUILanguage: () => "zh-TW" },
    storage: { local: { get: async () => stored, set: async (value: Record<string, unknown>) => { writes.push(value); } } },
    permissions: { request: async (request: { origins: string[] }) => { permissions.push(request); return true; } },
    tabs: { create: async () => {} }
  });
}
beforeEach(() => { writes = []; permissions = []; storage(); });
afterEach(() => vi.unstubAllGlobals());

function runner() {
  const ui = { busy: new Set<string>() as ReadonlySet<string>, status: null as Status };
  const run = createActionRunner(busy => { ui.busy = busy; }, status => { ui.status = status; });
  return { ui, run };
}

test("async actions block repeat clicks and restore controls on success", async () => {
  const { ui, run } = runner();
  let finish!: () => void;
  let calls = 0;
  const action = () => { calls++; return new Promise<void>(resolve => { finish = resolve; }); };
  const pending = run("save", action);
  expect(ui.busy.has("save")).toBe(true);
  await run("save", action);
  expect(calls).toBe(1);
  finish();
  await pending;
  expect(ui.busy.has("save")).toBe(false);
});

test("only the pending action is disabled", async () => {
  const { ui, run } = runner();
  let finish!: () => void;
  const pending = run("save", () => new Promise<void>(resolve => { finish = resolve; }));
  await run("export", async () => {});
  expect([...ui.busy]).toEqual(["save"]);
  finish(); await pending;
});

test("failed actions expose recovery feedback and remain retryable", async () => {
  const { ui, run } = runner();
  await run("save", async () => { throw new Error("Storage unavailable"); });
  expect(ui.status).toEqual({ message: "Storage unavailable", kind: "error" });
  expect(ui.busy.has("save")).toBe(false);
});

test("loads an existing personal key and saves without service permission", async () => {
  storage({ connectionMode: "personal", typeSafeKey: "test-key" });
  const form = await loadSettings();
  expect(form.usePersonalKey).toBe(true);
  expect(form.typeSafeKey).toBe("test-key");
  expect(form.diagnosticsEnabled).toBe(true);
  await saveSettings(form);
  expect(writes[0].connectionMode).toBe("personal");
  expect(writes[0].typeSafeKey).toBe("test-key");
  expect(permissions).toHaveLength(0);
});

test("switching to hosted access preserves the service permission flow", async () => {
  storage({ connectionMode: "personal", typeSafeKey: "test-key" });
  const form = { ...await loadSettings(), usePersonalKey: false, workerUrl: "https://router.example.com/", activationCode: "test-code" };
  await saveSettings(form, {});
  expect(writes[0].connectionMode).toBe("subscription");
  expect(writes[0].workerUrl).toBe("https://router.example.com");
  expect(permissions).toEqual([{ origins: ["https://router.example.com/*"] }]);
});

test("fresh install defaults to hosted and save validates access rather than a consent checkbox", async () => {
  const form = await loadSettings();
  expect(form.usePersonalKey).toBe(false);
  await expect(saveSettings(form, {})).rejects.toThrow(/服務網址/);
  expect(writes).toHaveLength(0);
});

test("hosted save rejects non-root and plain-HTTP service URLs", async () => {
  const form = { usePersonalKey: false, typeSafeKey: "", activationCode: "test-code", workerUrl: "" };
  await expect(saveSettings({ ...form, workerUrl: "https://router.example.com/api" }, {})).rejects.toThrow(/根網址/);
  await expect(saveSettings({ ...form, workerUrl: "http://router.example.com" }, {})).rejects.toThrow(/HTTPS/);
  expect(writes).toHaveLength(0);
});

test("member login fails honestly until email verification is implemented", async () => {
  await expect(login()).rejects.toThrow(/尚未開通/);
});

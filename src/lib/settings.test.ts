import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createActionRunner, loadSettings, saveSettings, type Status } from "./settings";

let writes: Record<string, unknown>[];
function storage(stored: Record<string, unknown> = {}) {
  vi.stubGlobal("chrome", {
    i18n: { getUILanguage: () => "zh-TW" },
    storage: { local: { get: async () => stored, set: async (value: Record<string, unknown>) => { writes.push(value); } } }
  });
}
beforeEach(() => { writes = []; storage(); });
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

test("loads the stored key and saves it as the only connection mode", async () => {
  storage({ connectionMode: "subscription", typeSafeKey: " test-key ", activationCode: "old-token" });
  const form = await loadSettings();
  expect(form).toEqual({ typeSafeKey: " test-key " });
  await saveSettings(form);
  expect(writes).toEqual([{ connectionMode: "personal", typeSafeKey: "test-key" }]);
});

test("saving without a key explains what is missing and writes nothing", async () => {
  await expect(saveSettings(await loadSettings())).rejects.toThrow(/TypeSafe/);
  expect(writes).toHaveLength(0);
});

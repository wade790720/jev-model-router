import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { checkKey, createActionRunner, loadSettings, MODELS_URL, verifyAndSaveKey, type Status } from "./settings";

let writes: Record<string, unknown>[];
let requests: { url: string; init: RequestInit }[];
function setup(stored: Record<string, unknown> = {}, reply: number | "offline" = 200) {
  writes = []; requests = [];
  vi.stubGlobal("chrome", {
    i18n: { getUILanguage: () => "zh-TW" },
    storage: { local: { get: async () => stored, set: async (value: Record<string, unknown>) => { writes.push(value); } } }
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (reply === "offline") throw new TypeError("Failed to fetch");
    return Response.json({ models: [] }, { status: reply });
  });
}
beforeEach(() => setup());
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

test("failed actions expose recovery feedback and remain retryable", async () => {
  const { ui, run } = runner();
  await run("save", async () => { throw new Error("Storage unavailable"); });
  expect(ui.status).toEqual({ message: "Storage unavailable", kind: "error" });
  expect(ui.busy.has("save")).toBe(false);
});

test("settings report the key and whether the first suggestion has happened", async () => {
  setup({ typeSafeKey: "synthetic-key", firstSuggestionAt: 1 });
  expect(await loadSettings()).toEqual({ typeSafeKey: "synthetic-key", tried: true });
  setup({});
  expect(await loadSettings()).toEqual({ typeSafeKey: "", tried: false });
});

test("the key check lists models: free, and proves TypeSafe accepts the key", async () => {
  expect(await checkKey("synthetic-key")).toBeNull();
  expect(requests[0].url).toBe(MODELS_URL);
  expect(requests[0].init.method ?? "GET").toBe("GET");
  expect((requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer synthetic-key");
});

test("key problems are explained in plain language", async () => {
  for (const [reply, text] of [
    [401, /不接受這把金鑰/], [403, /不接受這把金鑰/], [429, /太頻繁/], [529, /太忙/], ["offline", /連不上/], [418, /錯誤代碼 418/]
  ] as const) {
    setup({}, reply);
    expect(await checkKey("synthetic-key")).toMatch(text);
  }
});

test("verify and save: an empty or rejected key is never stored; a good one is stored trimmed", async () => {
  await expect(verifyAndSaveKey("  ")).rejects.toThrow(/請先貼上金鑰/);
  expect(requests).toHaveLength(0);
  setup({}, 401);
  await expect(verifyAndSaveKey("synthetic-key")).rejects.toThrow(/不接受這把金鑰/);
  expect(writes).toHaveLength(0);
  setup({}, 200);
  await verifyAndSaveKey(" synthetic-key ");
  expect(writes).toEqual([{ typeSafeKey: "synthetic-key" }]);
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, onTestFinished, test } from "vitest";
import { createCollector } from "../../scripts/diagnostic-collector.js";
import { createDiagnostics, sanitizeDiagnostic, type DiagnosticStorage } from "./diagnostics";

function storage(initial: Record<string, unknown> = {}): DiagnosticStorage {
  const values = structuredClone(initial);
  return { get: async keys => Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])),
    set: async changes => { Object.assign(values, structuredClone(changes)); } };
}
const input = { surface: "work", outcome: "failure", stage: "slider", code: "slider_missing", target: "astra_medium",
  before: "GPT-6.1 Sol", after: "GPT-6 Astra", elapsedMs: 1700, locale: "zh-Hant" };
const ok = (ids: string[]) => ({ ok: true, json: async () => ({ acceptedIds: ids }) });
const ids = (init: RequestInit) => JSON.parse(init.body as string).events.map((event: { id: string }) => event.id);

test("configuration failures retain fixed codes without collecting settings or credentials", () => {
  for (const code of ["routing_consent", "routing_key_missing", "routing_service_unconfigured", "routing_membership_missing"]) {
    const event = sanitizeDiagnostic({ ...input, code, stage: "routing", key: "secret-key", error: "private-error" });
    expect(event.code).toBe(code);
    expect(JSON.stringify(event)).not.toMatch(/secret-key|private-error/);
  }
});

test("diagnostics discard secrets, draft text, DOM, URLs and free-form errors", () => {
  const result = sanitizeDiagnostic({ ...input, prompt: "private-draft", key: "private-key", dom: "private-dom", url: "private-url", error: "private-error",
    before: "GPT-6.1 Sol private-draft", browserVersion: "Chrome/100 private-key", availableModels: ["GPT-6 Astra", "private-draft", "GPT-6 Astra"] });
  expect(JSON.stringify(result)).not.toMatch(/private/);
  expect(result.before).toBe("unknown");
  expect(result.after).toBe("GPT-6 Astra");
  expect(result.code).toBe("slider_missing");
  expect(result.availableModels).toEqual(["GPT-6 Astra"]);
});

test("offline collector keeps pending events, then acknowledges delivery", async () => {
  const store = storage();
  let online = false;
  const diagnostics = createDiagnostics({ storage: store, fetchImpl: async (_url, init) => {
    if (!online) throw new Error("offline");
    return ok(ids(init)) as unknown as Response;
  } });
  await Promise.all([diagnostics.record(input), diagnostics.record({ ...input, outcome: "success", code: "none" })]);
  await expect(diagnostics.flush()).rejects.toThrow();
  expect((await store.get(["diagnosticPending"])).diagnosticPending).toHaveLength(2);
  online = true; await diagnostics.flush();
  const data = await store.get(["diagnosticPending", "diagnosticEvents", "diagnosticStats"]);
  expect(data.diagnosticPending).toHaveLength(0);
  expect(data.diagnosticEvents).toHaveLength(2);
  expect(Object.values(data.diagnosticStats)[0]).toEqual({ failure: 1, success: 1 });
});

test("diagnostic opt-out stops both recording and delivery", async () => {
  const store = storage({ diagnosticsEnabled: false, diagnosticPending: [{ id: "old" }] });
  const diagnostics = createDiagnostics({ storage: store, fetchImpl: () => { throw new Error("must not fetch"); } });
  await diagnostics.record(input); await diagnostics.flush();
  expect((await store.get(["diagnosticEvents"])).diagnosticEvents).toBeUndefined();
});

test("acknowledgements never discard a new event recorded during delivery", async () => {
  const store = storage();
  const diagnostics: ReturnType<typeof createDiagnostics> = createDiagnostics({ storage: store, fetchImpl: async (_url, init) => {
    await diagnostics.record({ ...input, code: "trigger_missing" });
    return ok(ids(init)) as unknown as Response;
  } });
  await diagnostics.record(input); await diagnostics.flush();
  const pending = (await store.get(["diagnosticPending"])).diagnosticPending;
  expect(pending).toHaveLength(1); expect(pending[0].code).toBe("trigger_missing");
});

test("queue and retained browser records are bounded", async () => {
  const store = storage();
  const diagnostics = createDiagnostics({ storage: store });
  for (let i = 0; i < 305; i++) await diagnostics.record(input);
  const values = await store.get(["diagnosticPending", "diagnosticEvents"]);
  expect(values.diagnosticPending).toHaveLength(300); expect(values.diagnosticEvents).toHaveLength(300);
});

test("collector rejects web origins, strips raw data, and deduplicates retries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "smart-chatgpt-diagnostics-test-"));
  const server = createCollector({ directory });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/diagnostics`;
  const event = { ...input, id: crypto.randomUUID(), timestamp: new Date().toISOString(), prompt: "secret-prompt" };
  const post = (origin: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ events: [event, event] }) });
  expect((await post("https://chatgpt.com")).status).toBe(403);
  const origin = `chrome-extension://${"a".repeat(32)}`;
  expect((await post(origin)).status).toBe(200);
  expect((await post(origin)).status).toBe(200);
  const content = await readFile(join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8");
  expect(content.trim().split("\n")).toHaveLength(1);
  expect(content).not.toMatch(/secret-prompt/);
  expect(JSON.parse(content).code).toBe("slider_missing");
});

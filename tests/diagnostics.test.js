import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeDiagnostic, createDiagnostics } from "../extension/diagnostics.js";
import { createCollector } from "../scripts/diagnostic-collector.js";

function storage(initial = {}) {
  let values = structuredClone(initial);
  return { get: async keys => Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])),
    set: async changes => { Object.assign(values, structuredClone(changes)); } };
}
const input = { surface: "work", outcome: "failure", stage: "slider", code: "slider_missing", target: "astra_medium",
    before: "GPT-6.1 Sol", after: "GPT-6 Astra", elapsedMs: 1700, locale: "zh-Hant" };

test("configuration failures retain fixed codes without collecting settings or credentials", () => {
  for (const code of ["routing_consent", "routing_key_missing", "routing_service_unconfigured", "routing_membership_missing"]) {
    const event = sanitizeDiagnostic({ ...input, code, stage: "routing", key: "secret-key", error: "private-error" });
    assert.equal(event.code, code);
    assert.doesNotMatch(JSON.stringify(event), /secret-key|private-error/);
  }
});

test("diagnostics discard secrets, draft text, DOM, URLs and free-form errors", () => {
  const result = sanitizeDiagnostic({ ...input, prompt: "private-draft", key: "private-key", dom: "private-dom", url: "private-url", error: "private-error",
    before: "GPT-6.1 Sol private-draft", browserVersion: "Chrome/100 private-key", availableModels: ["GPT-6 Astra", "private-draft", "GPT-6 Astra"] });
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /private/);
  assert.equal(result.before, "unknown");
  assert.equal(result.after, "GPT-6 Astra");
  assert.equal(result.code, "slider_missing");
  assert.deepEqual(result.availableModels, ["GPT-6 Astra"]);
});

test("offline collector keeps pending events, then acknowledges delivery", async () => {
  const store = storage();
  let online = false;
  const diagnostics = createDiagnostics({ storage: store, fetchImpl: async (_url, init) => {
    if (!online) throw new Error("offline");
    const { events } = JSON.parse(init.body);
    return { ok: true, json: async () => ({ acceptedIds: events.map(event => event.id) }) };
  } });
  await Promise.all([diagnostics.record(input), diagnostics.record({ ...input, outcome: "success", code: "none" })]);
  await assert.rejects(diagnostics.flush());
  assert.equal((await store.get(["diagnosticPending"])).diagnosticPending.length, 2);
  online = true; await diagnostics.flush();
  const data = await store.get(["diagnosticPending", "diagnosticEvents", "diagnosticStats"]);
  assert.equal(data.diagnosticPending.length, 0);
  assert.equal(data.diagnosticEvents.length, 2);
  const counts = Object.values(data.diagnosticStats)[0];
  assert.deepEqual(counts, { failure: 1, success: 1 });
});

test("diagnostic opt-out stops both recording and delivery", async () => {
  const store = storage({ diagnosticsEnabled: false, diagnosticPending: [{ id: "old" }] });
  const diagnostics = createDiagnostics({ storage: store, fetchImpl: () => { throw new Error("must not fetch"); } });
  await diagnostics.record(input); await diagnostics.flush();
  assert.equal((await store.get(["diagnosticEvents"])).diagnosticEvents, undefined);
});

test("acknowledgements never discard a new event recorded during delivery", async () => {
  const store = storage();
  let diagnostics;
  diagnostics = createDiagnostics({ storage: store, fetchImpl: async (_url, init) => {
    await diagnostics.record({ ...input, code: "trigger_missing" });
    return { ok: true, json: async () => ({ acceptedIds: JSON.parse(init.body).events.map(event => event.id) }) };
  } });
  await diagnostics.record(input); await diagnostics.flush();
  const pending = (await store.get(["diagnosticPending"])).diagnosticPending;
  assert.equal(pending.length, 1); assert.equal(pending[0].code, "trigger_missing");
});

test("queue and retained browser records are bounded", async () => {
  const store = storage();
  const diagnostics = createDiagnostics({ storage: store });
  for (let i = 0; i < 305; i++) await diagnostics.record(input);
  const values = await store.get(["diagnosticPending", "diagnosticEvents"]);
  assert.equal(values.diagnosticPending.length, 300); assert.equal(values.diagnosticEvents.length, 300);
});

test("collector rejects web origins, strips raw data, and deduplicates retries", async t => {
  const directory = await mkdtemp(join(tmpdir(), "smart-chatgpt-diagnostics-test-"));
  const server = createCollector({ directory });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/diagnostics`;
  const event = { ...input, id: crypto.randomUUID(), timestamp: new Date().toISOString(), prompt: "secret-prompt" };
  const post = origin => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ events: [event, event] }) });
  assert.equal((await post("https://chatgpt.com")).status, 403);
  const origin = `chrome-extension://${"a".repeat(32)}`;
  assert.equal((await post(origin)).status, 200);
  assert.equal((await post(origin)).status, 200);
  const file = join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const content = await readFile(file, "utf8");
  assert.equal(content.trim().split("\n").length, 1);
  assert.doesNotMatch(content, /secret-prompt/);
  assert.equal(JSON.parse(content).code, "slider_missing");
});

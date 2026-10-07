import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { buildJevRequest, normalizeJevResponse } from "../extension/route.js";

const source = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
test("shipped hosted configuration points to the verified domain and Skool community", () => {
  const context = {};
  runInNewContext(readFileSync(new URL("../extension/service-config.js", import.meta.url), "utf8"), context);
  assert.equal(context.SmartChatGPTConfig.serviceUrl, "https://router.tekuei.com");
  assert.equal(context.SmartChatGPTConfig.skoolUrl, "https://www.skool.com/forge-1085/about");
});
function background(settings, config = {}) {
  const requests = [];
  const context = {
    SmartChatGPTConfig: config, buildJevRequest, normalizeJevResponse,
    createDiagnostics: () => ({ flush: async () => {}, record: async () => {} }),
    navigator: { userAgent: "Chrome/140.0" }, AbortController, AbortSignal, setTimeout, clearTimeout,
    chrome: { storage: { local: { get: async () => settings } }, runtime: { onMessage: { addListener() {} } },
      alarms: { create: async () => {}, onAlarm: { addListener() {} } } },
    fetch: async (url, init) => {
      requests.push({url, init});
      return Response.json(settings.connectionMode === "personal"
        ? {answers: {response_mode: {type: "choice", choice: "instant", confidence: .9}}}
        : {mode: "instant", confidence: .9});
    }
  };
  runInNewContext(source, context);
  return { route: context.routeDraft, requests };
}
test("configured personal access works without a consent flag or despite the old false flag", async () => {
  for (const flag of [undefined, false]) {
    const api = background({connectionMode: "personal", typeSafeKey: "synthetic-key", routingConsent: flag});
    assert.equal((await api.route("Synthetic task")).mode, "instant");
    assert.equal(api.requests.length, 1);
  }
});
test("hosted is the default and the shipped URL overrides stale stored endpoints", async () => {
  const api = background({routingConsent: true, activationCode: "synthetic-token", workerUrl: "https://old.example"},
    {serviceUrl: "https://router.example"});
  assert.equal((await api.route("Synthetic task")).mode, "instant");
  assert.equal(api.requests[0].url, "https://router.example/api/route");
});
test("personal key remains direct and does not require hosted membership", async () => {
  const api = background({routingConsent: true, connectionMode: "personal", typeSafeKey: "synthetic-key"});
  await api.route("Synthetic task");
  assert.equal(api.requests[0].url, "https://api.typesafe.ai/v1/systemone");
});

test("missing key, unconfigured hosted service and missing membership are distinct local failures", async () => {
  for (const [settings, config, code] of [
    [{routingConsent: true, connectionMode: "personal"}, {}, "routing_key_missing"],
    [{routingConsent: true}, {}, "routing_service_unconfigured"],
    [{routingConsent: true}, {serviceUrl: "https://router.example"}, "routing_membership_missing"]
  ]) {
    const api = background(settings, config);
    await assert.rejects(api.route("Synthetic task"), error => error.code === code);
    assert.equal(api.requests.length, 0);
  }
});

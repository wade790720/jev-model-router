import "./service-config.js";
import { buildJevRequest, normalizeJevResponse } from "./route.js";
import { createDiagnostics } from "./diagnostics.js";

const diagnostics = createDiagnostics({ storage: chrome.storage.local, metadata: () => ({
  extensionId: chrome.runtime.id, extensionVersion: chrome.runtime.getManifest().version,
  browserVersion: navigator.userAgent.match(/Edg\/[\d.]+|Chrome\/[\d.]+/)?.[0] ?? "unknown"
}) });
chrome.alarms.create("smart-chatgpt-diagnostics", { periodInMinutes: 1 }).catch(() => {});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "smart-chatgpt-diagnostics") diagnostics.flush().catch(() => {});
});
diagnostics.flush().catch(() => {});

const TYPE_SAFE_URL = "https://api.typesafe.ai/v1/systemone";

async function jsonResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error ?? body?.detail ?? `HTTP ${response.status}`;
    const code = [401, 403].includes(response.status) ? "routing_auth" : response.status === 429 ? "routing_rate_limit" : "routing_error";
    throw Object.assign(new Error(typeof message === "string" ? message : JSON.stringify(message)), { code });
  }
  return body;
}

async function routeDraft(text, surface = "chat") {
  if (typeof text !== "string" || !text.trim()) throw new Error("請先輸入文字");
  if (text.length > 20000) throw new Error("文字太長，請縮短後重試");
  if (!["chat", "work"].includes(surface)) throw new Error("未知的 ChatGPT 模式");
  const settings = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl"]);
  const connectionMode = settings.connectionMode === "personal" ? "personal" : "subscription";
  const workerUrl = globalThis.SmartChatGPTConfig.serviceUrl || settings.workerUrl;
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    if (connectionMode === "personal") {
      if (!settings.typeSafeKey) throw Object.assign(new Error("請先在設定填入 TypeSafe API key"), { code: "routing_key_missing" });
      response = await fetch(TYPE_SAFE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.typeSafeKey}` },
        body: JSON.stringify(buildJevRequest(text, surface)),
        signal: controller.signal
      });
    } else if (connectionMode === "subscription") {
      if (!workerUrl) throw Object.assign(new Error("託管服务尚未設定"), { code: "routing_service_unconfigured" });
      if (!settings.activationCode) throw Object.assign(new Error("請先設定會員憑證"), { code: "routing_membership_missing" });
      response = await fetch(`${workerUrl.replace(/\/$/, "")}/api/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.activationCode}` },
        body: JSON.stringify({ text, surface }),
        signal: controller.signal
      });
    }
    const body = await jsonResponse(response);
    return connectionMode === "personal" ? normalizeJevResponse(body, surface) : body;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JEV_DIAGNOSTIC_STATUS") {
    (async () => {
      const values = await chrome.storage.local.get(["diagnosticPending", "diagnosticLastDelivery"]);
      let connected = false;
      try {
        const response = await fetch("http://127.0.0.1:43127/api/health", { signal: AbortSignal.timeout(1500) });
        connected = response.ok && (await response.json()).service === "smart-chatgpt-diagnostics";
      } catch { /* Stored diagnostics can be delivered later. */ }
      return { connected, pending: values.diagnosticPending?.length ?? 0, lastDelivery: values.diagnosticLastDelivery ?? null };
    })().then(sendResponse).catch(() => sendResponse({ connected: false, pending: 0 }));
    return true;
  }
  if (message?.type === "JEV_DIAGNOSTIC") {
    diagnostics.record(message.event).then(() => {
      sendResponse({ ok: true }); diagnostics.flush().catch(() => {});
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "JEV_ROUTE") {
    routeDraft(message.text, message.surface)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.name === "AbortError" ? "JEV 回應逾時" : error.message,
        code: error.code ?? (error.name === "AbortError" ? "routing_timeout" : error.name === "TypeError" ? "routing_network" : /Jev returned/.test(error.message) ? "routing_invalid" : "routing_error") }));
    return true;
  }
  if (message?.type === "JEV_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

// Service worker: routes drafts for the content script and delivers local diagnostics.
import { createDiagnostics } from "@/lib/diagnostics";
import { routeDraft, type CodedError } from "@/lib/route-draft";

const diagnostics = createDiagnostics({ storage: chrome.storage.local, metadata: () => ({
  extensionId: chrome.runtime.id, extensionVersion: chrome.runtime.getManifest().version,
  browserVersion: navigator.userAgent.match(/Edg\/[\d.]+|Chrome\/[\d.]+/)?.[0] ?? "unknown"
}) });
chrome.alarms.create("smart-chatgpt-diagnostics", { periodInMinutes: 1 }).catch(() => {});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "smart-chatgpt-diagnostics") diagnostics.flush().catch(() => {});
});
diagnostics.flush().catch(() => {});

function errorCode(error: CodedError) {
  if (error.code) return error.code;
  if (error.name === "AbortError") return "routing_timeout";
  if (error.name === "TypeError") return "routing_network";
  return /Jev returned/.test(error.message) ? "routing_invalid" : "routing_error";
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
      return { connected, pending: (values.diagnosticPending as unknown[] | undefined)?.length ?? 0, lastDelivery: values.diagnosticLastDelivery ?? null };
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
      .catch((error: CodedError) => sendResponse({ ok: false,
        error: error.name === "AbortError" ? "JEV 回應逾時" : error.message, code: errorCode(error) }));
    return true;
  }
  if (message?.type === "JEV_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

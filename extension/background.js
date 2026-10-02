import { buildJevRequest, normalizeJevResponse } from "./route.js";

const TYPE_SAFE_URL = "https://api.typesafe.ai/v1/systemone";

async function jsonResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error ?? body?.detail ?? `HTTP ${response.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return body;
}

async function routeDraft(text, surface = "chat") {
  if (typeof text !== "string" || !text.trim()) throw new Error("請先輸入文字");
  if (text.length > 20000) throw new Error("文字太長，請縮短後重試");
  if (!["chat", "work"].includes(surface)) throw new Error("未知的 ChatGPT 模式");
  const settings = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl"]);
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    if (settings.connectionMode === "personal") {
      if (!settings.typeSafeKey) throw new Error("請先在擴充功能設定頁填入 TypeSafe API key");
      response = await fetch(TYPE_SAFE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.typeSafeKey}` },
        body: JSON.stringify(buildJevRequest(text, surface)),
        signal: controller.signal
      });
    } else if (settings.connectionMode === "subscription") {
      if (!settings.workerUrl || !settings.activationCode) throw new Error("請先設定服務網址與訂閱啟用碼");
      response = await fetch(`${settings.workerUrl.replace(/\/$/, "")}/api/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.activationCode}` },
        body: JSON.stringify({ text, surface }),
        signal: controller.signal
      });
    } else {
      throw new Error("請先選擇 JEV 接入方式");
    }
    const body = await jsonResponse(response);
    return settings.connectionMode === "personal" ? normalizeJevResponse(body, surface) : body;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JEV_ROUTE") {
    routeDraft(message.text, message.surface)
      .then(result => sendResponse({ ok: true, result }))
      .catch(error => sendResponse({ ok: false, error: error.name === "AbortError" ? "JEV 回應逾時" : error.message }));
    return true;
  }
  if (message?.type === "JEV_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

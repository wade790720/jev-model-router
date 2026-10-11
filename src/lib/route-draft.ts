// Runs in the service worker: calls TypeSafe Jev with the member's own API key.
import { buildJevRequest, normalizeJevResponse, type Recommendation, type Surface } from "./route";

export const TYPE_SAFE_URL = "https://api.typesafe.ai/v1/systemone";
export type CodedError = Error & { code?: string };
const coded = (message: string, code: string): CodedError => Object.assign(new Error(message), { code });

async function jsonResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error ?? body?.detail ?? `HTTP ${response.status}`;
    const code = [401, 403].includes(response.status) ? "routing_auth" : response.status === 429 ? "routing_rate_limit" : "routing_error";
    throw coded(typeof message === "string" ? message : JSON.stringify(message), code);
  }
  return body;
}

export async function routeDraft(text: unknown, surface: unknown = "chat"): Promise<Recommendation> {
  if (typeof text !== "string" || !text.trim()) throw new Error("請先輸入文字");
  if (text.length > 20000) throw new Error("文字太長，請縮短後重試");
  if (surface !== "chat" && surface !== "work") throw new Error("未知的 ChatGPT 模式");
  const { typeSafeKey } = await chrome.storage.local.get(["typeSafeKey"]);
  if (!typeSafeKey) throw coded("請先在設定填入 TypeSafe API key", "routing_key_missing");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(TYPE_SAFE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${typeSafeKey}` },
      body: JSON.stringify(buildJevRequest(text, surface as Surface)),
      signal: controller.signal
    });
    return normalizeJevResponse(await jsonResponse(response), surface);
  } finally {
    clearTimeout(timeout);
  }
}

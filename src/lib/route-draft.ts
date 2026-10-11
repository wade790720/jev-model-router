// Runs in the service worker. The hosted service is the default; a TypeSafe key the member saved in
// advanced settings takes over and goes straight to TypeSafe.
import { buildJevRequest, normalizeJevResponse, type Recommendation, type Surface } from "./route";

export const TYPE_SAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const HOSTED_URL = "https://router.tekuei.com/api/route";
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
  const { typeSafeKey, activationCode } = await chrome.storage.local.get(["typeSafeKey", "activationCode"]);
  // ponytail: activationCode is the hosted session token; nothing hands it to members yet (see docs/CLOUDFLARE-SKOOL.md).
  if (!typeSafeKey && !activationCode) throw coded("託管服務需要會員憑證", "routing_membership_missing");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = typeSafeKey
      ? await fetch(TYPE_SAFE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${typeSafeKey}` },
        body: JSON.stringify(buildJevRequest(text, surface as Surface)),
        signal: controller.signal
      })
      : await fetch(HOSTED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${activationCode}` },
        body: JSON.stringify({ text, surface }),
        signal: controller.signal
      });
    const body = await jsonResponse(response);
    return typeSafeKey ? normalizeJevResponse(body, surface) : body;
  } finally {
    clearTimeout(timeout);
  }
}

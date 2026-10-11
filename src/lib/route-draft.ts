// Runs in the service worker: picks hosted or personal-key access and calls the router.
import { SERVICE_CONFIG, type ServiceConfig } from "./config";
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

export async function routeDraft(text: unknown, surface: unknown = "chat", config: ServiceConfig = SERVICE_CONFIG): Promise<Recommendation> {
  if (typeof text !== "string" || !text.trim()) throw new Error("請先輸入文字");
  if (text.length > 20000) throw new Error("文字太長，請縮短後重試");
  if (surface !== "chat" && surface !== "work") throw new Error("未知的 ChatGPT 模式");
  const settings = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl"]);
  const personal = settings.connectionMode === "personal";
  const workerUrl = config.serviceUrl || (settings.workerUrl as string | undefined);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let response: Response;
    if (personal) {
      if (!settings.typeSafeKey) throw coded("請先在設定填入 TypeSafe API key", "routing_key_missing");
      response = await fetch(TYPE_SAFE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.typeSafeKey}` },
        body: JSON.stringify(buildJevRequest(text, surface as Surface)),
        signal: controller.signal
      });
    } else {
      if (!workerUrl) throw coded("託管服务尚未設定", "routing_service_unconfigured");
      if (!settings.activationCode) throw coded("請先設定會員憑證", "routing_membership_missing");
      response = await fetch(`${workerUrl.replace(/\/$/, "")}/api/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.activationCode}` },
        body: JSON.stringify({ text, surface }),
        signal: controller.signal
      });
    }
    const body = await jsonResponse(response);
    return personal ? normalizeJevResponse(body, surface) : body;
  } finally {
    clearTimeout(timeout);
  }
}

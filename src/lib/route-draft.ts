// Runs in the service worker. The hosted service is the default; a TypeSafe key the member saved in
// advanced settings takes over and goes straight to TypeSafe.
import { buildJevRequest, normalizeJevResponse, type Recommendation, type Surface } from "./route";

export const TYPE_SAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const HOSTED_URL = "https://router.tekuei.com/api/route";
export const SESSION_URL = "https://router.tekuei.com/api/session";
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

// Hosted session: a 24-hour token the server issues after asking Skool, with the member's own
// skool.com cookies, whether this account is in the community. The cookies go to the server for
// that check only; the server neither stores nor logs them (worker/src/session.ts).
async function hostedToken(force: boolean): Promise<string> {
  const { activationCode, sessionExpiresAt } = await chrome.storage.local.get(["activationCode", "sessionExpiresAt"]);
  if (!force && activationCode && Number(sessionExpiresAt) > Date.now() / 1000 + 60) return String(activationCode);
  const cookies = await chrome.cookies.getAll({ domain: "skool.com" });
  if (!cookies.length) throw coded("請先登入 Skool", "routing_membership_missing");
  const response = await fetch(SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookie: cookies.map(c => `${c.name}=${c.value}`).join("; ") })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    throw coded(body?.error ?? "無法確認 Skool 會員身分", response.status === 403 || response.status === 400 ? "routing_membership_missing" : "routing_auth");
  }
  await chrome.storage.local.set({ activationCode: body.token, sessionExpiresAt: body.expiresAt });
  return body.token;
}

export async function routeDraft(text: unknown, surface: unknown = "chat"): Promise<Recommendation> {
  if (typeof text !== "string" || !text.trim()) throw new Error("請先輸入文字");
  if (text.length > 20000) throw new Error("文字太長，請縮短後重試");
  if (surface !== "chat" && surface !== "work") throw new Error("未知的 ChatGPT 模式");
  const { typeSafeKey } = await chrome.storage.local.get(["typeSafeKey"]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    if (typeSafeKey) {
      const response = await fetch(TYPE_SAFE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${typeSafeKey}` },
        body: JSON.stringify(buildJevRequest(text, surface as Surface)),
        signal: controller.signal
      });
      return normalizeJevResponse(await jsonResponse(response), surface);
    }
    const hosted = async (token: string) => fetch(HOSTED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, surface }),
      signal: controller.signal
    });
    let response = await hosted(await hostedToken(false));
    // Expired or revoked token: sign in again once, then give up.
    if (response.status === 401 || response.status === 403) response = await hosted(await hostedToken(true));
    return await jsonResponse(response);
  } finally {
    clearTimeout(timeout);
  }
}

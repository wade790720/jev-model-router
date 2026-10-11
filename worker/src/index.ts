import { buildJevRequest, normalizeJevResponse, type Surface } from "../../src/lib/route";

export interface Env {
  DB?: D1Database;
  TYPESAFE_API_KEY?: string;
  ADMIN_SYNC_SECRET?: string;
  ERRORS_ADMIN_SECRET?: string;
  MEMBER_HASH_SECRET?: string;
  MAX_PROMPT_CHARS?: string;
  MAX_REQUESTS_PER_MINUTE?: string;
  MAX_REQUESTS_PER_DAY?: string;
  MAX_INPUT_TOKENS_PER_DAY?: string;
  GLOBAL_INPUT_TOKENS_PER_DAY?: string;
}
type LimitKey = Extract<keyof Env, `MAX_${string}` | `GLOBAL_${string}`>;

const encoder = new TextEncoder();
const limits = (env: Env, key: LimitKey, fallback: number) => Number.parseInt(env[key] ?? String(fallback), 10) || fallback;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}


export function utcWindows() {
  const now = new Date();
  return {
    minute: `minute:${now.toISOString().slice(0, 16)}`,
    day: `day:${now.toISOString().slice(0, 10)}`
  };
}

export async function reserveRequest(db: D1Database, subject: string, windowKey: string, maxRequests: number) {
  const result = await db.prepare(
    "INSERT INTO usage_windows (subject, window_key, requests) VALUES (?, ?, 1) " +
    "ON CONFLICT(subject, window_key) DO UPDATE SET requests = requests + 1 WHERE requests < ?"
  ).bind(subject, windowKey, maxRequests).run();
  return (result.meta?.changes ?? 0) > 0;
}

async function tokenBudgetExceeded(db: D1Database, subject: string, dayKey: string, maximum: number) {
  const row = await db.prepare("SELECT input_tokens FROM usage_windows WHERE subject = ? AND window_key = ?")
    .bind(subject, dayKey).first<{ input_tokens: number }>();
  return (row?.input_tokens ?? 0) >= maximum;
}

async function addTokenUsage(db: D1Database, subject: string, dayKey: string, tokens: number) {
  await db.prepare(
    "INSERT INTO usage_windows (subject, window_key, input_tokens) VALUES (?, ?, ?) " +
    "ON CONFLICT(subject, window_key) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens"
  ).bind(subject, dayKey, tokens).run();
}

async function jevDecision(env: Env, text: string, surface: Surface) {
  if (!env.TYPESAFE_API_KEY) throw new Error("TypeSafe API key is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TYPESAFE_API_KEY}` },
      body: JSON.stringify(buildJevRequest(text, surface)),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    return normalizeJevResponse(body, surface);
  } finally {
    clearTimeout(timeout);
  }
}

export async function route(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Database is not configured" }, 503);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token?.startsWith("jmr_") || token.length !== 68) return json({ error: "需要有效的訂閱啟用碼" }, 401);
  const tokenHash = await sha256(token);
  const member = await env.DB.prepare("SELECT m.status FROM member_sessions s JOIN members m ON m.member_hash = s.member_hash WHERE s.token_hash = ? AND s.expires_at > unixepoch() AND m.valid_until > unixepoch()").bind(tokenHash).first<{ status: string }>();
  if (member?.status !== "active") return json({ error: "訂閱未啟用或已到期" }, 403);
  const body = await request.json().catch(() => null) as { text?: unknown; surface?: unknown } | null;
  const text = body?.text;
  const surface = body?.surface ?? "chat";
  if (typeof text !== "string" || !text.trim()) return json({ error: "文字內容不可為空" }, 400);
  if (surface !== "chat" && surface !== "work") return json({ error: "未知的 ChatGPT 模式" }, 400);
  if (text.length > limits(env, "MAX_PROMPT_CHARS", 20000)) return json({ error: "文字太長，請縮短後重試" }, 413);

  const windows = utcWindows();
  if (await tokenBudgetExceeded(env.DB, tokenHash, windows.day, limits(env, "MAX_INPUT_TOKENS_PER_DAY", 2000000))) {
    return json({ error: "此帳號今日使用量異常，請稍後再試" }, 429);
  }
  if (await tokenBudgetExceeded(env.DB, "__global__", windows.day, limits(env, "GLOBAL_INPUT_TOKENS_PER_DAY", 100000000))) {
    return json({ error: "服務暫時達到安全用量限制" }, 503);
  }
  if (!await reserveRequest(env.DB, tokenHash, windows.minute, limits(env, "MAX_REQUESTS_PER_MINUTE", 20))) {
    return json({ error: "操作太頻繁，請稍後再試" }, 429);
  }
  if (!await reserveRequest(env.DB, tokenHash, windows.day, limits(env, "MAX_REQUESTS_PER_DAY", 3000))) {
    return json({ error: "此帳號今日使用量異常，請稍後再試" }, 429);
  }

  try {
    const result = await jevDecision(env, text, surface);
    const used = Number(result.usage?.input_tokens) || 0;
    if (used > 0) {
      await addTokenUsage(env.DB, tokenHash, windows.day, used);
      await addTokenUsage(env.DB, "__global__", windows.day, used);
    }
    return json({ mode: result.mode, suggestedMode: result.suggestedMode, confidence: result.confidence, lowConfidence: result.lowConfidence, topChoices: result.topChoices });
  } catch (error) {
    return json({ error: (error as Error).name === "AbortError" ? "JEV 回應逾時" : "JEV 暫時無法提供判斷" }, 502);
  }
}

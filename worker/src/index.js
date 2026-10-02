import { buildJevRequest, normalizeJevResponse } from "../../extension/route.js";
import { stripeRequest, verifyStripeSignature } from "./stripe.js";

const encoder = new TextEncoder();
const limits = (env, key, fallback) => Number.parseInt(env[key] ?? fallback, 10) || fallback;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `jmr_${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function utcWindows() {
  const now = new Date();
  const tenMinute = new Date(Math.floor(now.getTime() / 600000) * 600000);
  return {
    minute: `minute:${now.toISOString().slice(0, 16)}`,
    tenMinute: `ten-minute:${tenMinute.toISOString().slice(0, 16)}`,
    day: `day:${now.toISOString().slice(0, 10)}`
  };
}

async function reserveRequest(db, subject, windowKey, maxRequests) {
  const result = await db.prepare(
    "INSERT INTO usage_windows (subject, window_key, requests) VALUES (?, ?, 1) " +
    "ON CONFLICT(subject, window_key) DO UPDATE SET requests = requests + 1 WHERE requests < ?"
  ).bind(subject, windowKey, maxRequests).run();
  return (result.meta?.changes ?? 0) > 0;
}

async function tokenBudgetExceeded(db, subject, dayKey, maximum) {
  const row = await db.prepare("SELECT input_tokens FROM usage_windows WHERE subject = ? AND window_key = ?")
    .bind(subject, dayKey).first();
  return (row?.input_tokens ?? 0) >= maximum;
}

async function addTokenUsage(db, subject, dayKey, tokens) {
  await db.prepare(
    "INSERT INTO usage_windows (subject, window_key, input_tokens) VALUES (?, ?, ?) " +
    "ON CONFLICT(subject, window_key) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens"
  ).bind(subject, dayKey, tokens).run();
}

async function jevDecision(env, text, surface) {
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

async function route(request, env) {
  if (!env.DB) return json({ error: "Database is not configured" }, 503);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token?.startsWith("jmr_") || token.length !== 68) return json({ error: "需要有效的訂閱啟用碼" }, 401);
  const tokenHash = await sha256(token);
  const license = await env.DB.prepare("SELECT status FROM licenses WHERE token_hash = ?").bind(tokenHash).first();
  if (license?.status !== "active") return json({ error: "訂閱未啟用或已到期" }, 403);
  const body = await request.json().catch(() => null);
  const text = body?.text;
  const surface = body?.surface ?? "chat";
  if (typeof text !== "string" || !text.trim()) return json({ error: "文字內容不可為空" }, 400);
  if (!["chat", "work"].includes(surface)) return json({ error: "未知的 ChatGPT 模式" }, 400);
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
    return json({ error: error.name === "AbortError" ? "JEV 回應逾時" : "JEV 暫時無法提供判斷" }, 502);
  }
}

async function checkout(request, env) {
  if (!env.DB) return json({ error: "Database is not configured" }, 503);
  if (!env.STRIPE_PRICE_ID || env.STRIPE_PRICE_ID.startsWith("REPLACE_")) return json({ error: "訂閱方案尚未設定" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const subject = `checkout:${await sha256(`${env.STRIPE_SECRET_KEY ?? ""}:${ip}`)}`;
  if (!await reserveRequest(env.DB, subject, utcWindows().tenMinute, limits(env, "MAX_CHECKOUTS_PER_IP_10_MIN", 5))) {
    return json({ error: "結帳請求太頻繁，請稍後再試" }, 429);
  }
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/activate?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cancel`
  });
  try {
    const session = await stripeRequest(env, "checkout/sessions", { method: "POST", body: params });
    return json({ url: session.url });
  } catch (error) {
    return json({ error: "無法建立結帳頁面" }, 502);
  }
}

async function portal(request, env) {
  if (!env.DB) return json({ error: "Database is not configured" }, 503);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token?.startsWith("jmr_") || token.length !== 68) return json({ error: "需要有效的訂閱啟用碼" }, 401);
  const tokenHash = await sha256(token);
  const license = await env.DB.prepare("SELECT subscription_id FROM licenses WHERE token_hash = ?").bind(tokenHash).first();
  if (!license) return json({ error: "找不到此訂閱" }, 403);
  try {
    const subscription = await stripeRequest(env, `subscriptions/${encodeURIComponent(license.subscription_id)}`);
    const origin = new URL(request.url).origin;
    const params = new URLSearchParams({ customer: subscription.customer, return_url: `${origin}/portal-return` });
    const session = await stripeRequest(env, "billing_portal/sessions", { method: "POST", body: params });
    return json({ url: session.url });
  } catch {
    return json({ error: "暫時無法開啟訂閱管理頁" }, 502);
  }
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

async function activate(request, env) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId?.startsWith("cs_")) return html("Invalid session", 400);
  if (!env.DB) return html("Database unavailable", 503);
  try {
    const session = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.mode !== "subscription" || session.payment_status !== "paid" || !session.subscription) {
      return html("Payment not complete", 403);
    }
    const subscription = await stripeRequest(env, `subscriptions/${encodeURIComponent(session.subscription)}`);
    if (subscription.status !== "active") return html("Subscription not active", 403);
    const token = newCode();
    const tokenHash = await sha256(token);
    await env.DB.prepare(
      "INSERT INTO licenses (subscription_id, token_hash, status, updated_at) VALUES (?, ?, 'active', ?) " +
      "ON CONFLICT(subscription_id) DO UPDATE SET token_hash = excluded.token_hash, status = 'active', updated_at = excluded.updated_at"
    ).bind(subscription.id, tokenHash, Math.floor(Date.now() / 1000)).run();
    return html(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>ChatGPT 智慧選模型｜訂閱啟用</title><style>body{font:16px system-ui;max-width:680px;margin:48px auto;padding:16px}code{display:block;overflow-wrap:anywhere;padding:16px;background:#eee}</style><h1>訂閱已啟用</h1><p>把下方啟用碼貼進「ChatGPT 智慧選模型」設定頁。重新開啟此頁會產生新碼，舊碼將失效。</p><code>${token}</code></html>`);
  } catch (error) {
    return html("Activation failed. Please contact support.", 502);
  }
}

async function stripeWebhook(request, env) {
  const payload = await request.text();
  if (!await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: "Invalid Stripe signature" }, 400);
  }
  const event = JSON.parse(payload);
  if (event.type?.startsWith("customer.subscription.")) {
    const subscription = event.data?.object;
    if (subscription?.id) {
      let status = "inactive";
      if (event.type !== "customer.subscription.deleted") {
        try {
          const current = await stripeRequest(env, `subscriptions/${encodeURIComponent(subscription.id)}`);
          status = current.status === "active" ? "active" : "inactive";
        } catch {
          status = "inactive";
        }
      }
      await env.DB.prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE subscription_id = ?")
        .bind(status, Math.floor(Date.now() / 1000), subscription.id).run();
    }
  }
  return json({ received: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/health" && request.method === "GET") return json({ ok: true });
      if (pathname === "/api/route" && request.method === "POST") return route(request, env);
      if (pathname === "/api/checkout" && request.method === "POST") return checkout(request, env);
      if (pathname === "/api/portal" && request.method === "POST") return portal(request, env);
      if (pathname === "/api/stripe-webhook" && request.method === "POST") return stripeWebhook(request, env);
      if (pathname === "/activate" && request.method === "GET") return activate(request, env);
      if (pathname === "/cancel" && request.method === "GET") return html("<p>付款已取消。您可以關閉這個分頁。</p>");
      if (pathname === "/portal-return" && request.method === "GET") return html("<p>您可以關閉這個分頁。</p>");
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: "服務暫時無法處理請求" }, 500);
    }
  },
  async scheduled(_event, env) {
    if (env.DB) await env.DB.prepare("DELETE FROM usage_windows WHERE created_at < unixepoch() - 604800").run();
  }
};

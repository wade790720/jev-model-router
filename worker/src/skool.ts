import { route, type Env } from "./index";
import { ackErrors, intakeErrors, listErrors, pruneErrors } from "./errors";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const encode = (value: string) => new TextEncoder().encode(value);
const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value)));
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

async function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [left, right] = await Promise.all([digest(supplied), digest(secret)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

// Internal administration only, not Skool OAuth or public email sign-in.
// The operator must verify paid status before provisioning. Stale data expires.
async function updateMember(request: Request, env: Env) {
  if (!await authorized(request, env.ADMIN_SYNC_SECRET)) return json({ error: "Unauthorized" }, 401);
  if (!env.DB || !env.MEMBER_HASH_SECRET || env.MEMBER_HASH_SECRET.length < 32) return json({ error: "Membership configuration incomplete" }, 503);
  if (Number(request.headers.get("content-length")) > 4096) return json({ error: "Request too large" }, 413);
  const raw = await request.text();
  if (raw.length > 4096) return json({ error: "Request too large" }, 413);
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const now = Math.floor(Date.now() / 1000);
  const validUntil = body?.validUntil;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["active", "inactive"].includes(body?.status) || !Number.isInteger(validUntil) ||
      validUntil < now || validUntil > now + 35 * 86400 ||
      (body.issueToken !== undefined && typeof body.issueToken !== "boolean") ||
      (body.issueToken && body.status !== "active")) return json({ error: "Invalid membership update" }, 400);
  const key = await crypto.subtle.importKey("raw", encode(env.MEMBER_HASH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const memberHash = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encode(email))));
  const statements = [env.DB.prepare(
    "INSERT INTO members (member_hash, status, valid_until, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(member_hash) DO UPDATE SET status = excluded.status, valid_until = excluded.valid_until, updated_at = excluded.updated_at"
  ).bind(memberHash, body.status, validUntil, now)];
  let token: string | undefined;
  if (body.issueToken) {
    token = "jmr_" + hex(crypto.getRandomValues(new Uint8Array(32)));
    statements.push(env.DB.prepare("INSERT INTO member_sessions (token_hash, member_hash, expires_at) VALUES (?, ?, ?)")
      .bind(hex(await digest(token)), memberHash, validUntil));
  }
  await env.DB.batch(statements);
  return json({ ok: true, ...(token ? { token } : {}) });
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/health" && request.method === "GET") return json({ ok: true, service: "smart-chatgpt", membership: "skool", signInReady: false });
      if (path === "/api/route" && request.method === "POST") return await route(request, env);
      if (path === "/api/admin/members" && request.method === "POST") return await updateMember(request, env);
      if (path === "/api/errors" && request.method === "POST") return await intakeErrors(request, env);
      if (path.startsWith("/api/admin/errors")) {
        // Own secret, not ADMIN_SYNC_SECRET: the daily AI routine holds it, and it can only read errors.
        if (!await authorized(request, env.ERRORS_ADMIN_SECRET)) return json({ error: "Unauthorized" }, 401);
        if (path === "/api/admin/errors" && request.method === "GET") return await listErrors(env, new URL(request.url).searchParams.get("status"));
        if (path === "/api/admin/errors/ack" && request.method === "POST") return await ackErrors(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch {
      // Never log request bodies, email addresses, tokens or provider keys.
      return json({ error: "Service temporarily unavailable" }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    if (!env.DB) return;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM usage_windows WHERE created_at < unixepoch() - 604800"),
      env.DB.prepare("DELETE FROM member_sessions WHERE expires_at <= unixepoch()"),
      pruneErrors(env)
    ]);
  }
};

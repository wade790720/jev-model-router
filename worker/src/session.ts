import { reserveRequest, sha256, utcWindows, type Env } from "./index";

// Hosted-service sign-in. The extension sends the member's own skool.com cookies; we ask Skool, with
// those cookies, whether this account is in the community, and if so issue a 24-hour session token.
// The cookies are used for that one request only: never stored, never logged.
// Same membership rule as src/lib/membership.ts (group id + role whitelist), repeated here because
// the server cannot trust the extension's own answer.
// The community moves from /forge-1085 to /wonderpocket. Try the new address first and keep the old one,
// so sign-in works before, during and after the rename, whether or not Skool redirects.
// ponytail: drop the old address once the rename has been live for a while.
const COMMUNITY_PAGES = ["https://www.skool.com/wonderpocket/about", "https://www.skool.com/forge-1085/about"];
const GROUP_ID = "998361e5ef944ec4a6937379dd581002";
const ROLES = ["member", "group-admin"];
const SESSION_SECONDS = 86400;
const MAX_COOKIE = 8192;
const PER_IP_PER_MINUTE = 10;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Skool user id when the page says this account is a member, null when it is not. Throws on a page we do not understand. */
export function memberId(html: string): string | null {
  const data = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const page = data && JSON.parse(data).props?.pageProps;
  if (!page) throw new Error("Skool page format changed");
  const self = page.self, member = self?.member;
  return self?.id && member?.groupId === GROUP_ID && ROLES.includes(member.role) ? String(self.id) : null;
}

export async function createSession(request: Request, env: Env) {
  if (!env.DB || !env.MEMBER_HASH_SECRET || env.MEMBER_HASH_SECRET.length < 32) return json({ error: "Membership configuration incomplete" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!await reserveRequest(env.DB, `session:${await sha256(ip)}`, utcWindows().minute, PER_IP_PER_MINUTE)) {
    return json({ error: "操作太頻繁，請稍後再試" }, 429);
  }
  const raw = await request.text();
  if (raw.length > MAX_COOKIE) return json({ error: "Request too large" }, 413);
  const cookie = (() => { try { return JSON.parse(raw)?.cookie; } catch { return null; } })();
  if (typeof cookie !== "string" || !cookie.trim() || /[\r\n]/.test(cookie)) return json({ error: "請先登入 Skool" }, 400);

  // A member on either page is a member. "Not a member" only when a page answered and none said member.
  let id: string | null = null, answered = false, lastError = "暫時無法確認 Skool 會員身分";
  for (const url of COMMUNITY_PAGES) {
    try {
      const page = await fetch(url, { headers: { cookie, "user-agent": "Mozilla/5.0 (compatible; SmartChatGPT/1.0)" } });
      if (!page.ok) { lastError = `Skool ${page.status}`; continue; }
      id = memberId(await page.text());
      answered = true;
      if (id) break;
    } catch { /* try the next address */ }
  }
  if (!id && !answered) return json({ error: lastError }, 502);
  if (!id) return json({ error: "不是百寶袋俱樂部會員，或尚未登入 Skool" }, 403);

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MEMBER_HASH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const memberHash = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`skool:${id}`))));
  const now = Math.floor(Date.now() / 1000), expiresAt = now + SESSION_SECONDS;
  const token = "jmr_" + hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO members (member_hash, status, valid_until, updated_at) VALUES (?, 'active', ?, ?) " +
      "ON CONFLICT(member_hash) DO UPDATE SET status = 'active', valid_until = excluded.valid_until, updated_at = excluded.updated_at"
    ).bind(memberHash, expiresAt, now),
    env.DB.prepare("INSERT INTO member_sessions (token_hash, member_hash, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), memberHash, expiresAt)
  ]);
  return json({ token, expiresAt });
}

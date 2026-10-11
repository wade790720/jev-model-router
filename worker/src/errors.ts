import type { Env } from "./index";

// Error inbox: the three extensions send errors here once the member agrees (error-log.ts),
// and a daily AI routine reads the new ones through the admin routes in skool.ts.
// Intake is public and arrives as a CORS "simple request" (text/plain), so it must defend itself:
// fixed tool list, size limits, and a daily cap on new kinds of errors.
const TOOLS = ["ig-sorter", "brand-digest", "jev-model-router"];
const LOCATIONS = ["page", "promise", "console"];
const MAX_BODY = 8192;
const MAX_ENTRIES = 10;
const NEW_KINDS_PER_DAY = 200; // ponytail: global cap, per-IP limits if someone floods it
const KEEP_SECONDS = 90 * 86400;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
// Same rules as error-log.ts on the client; repeated here because the client cannot be trusted.
const clean = (value: string) =>
  value.replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g, "$1").replace(/[A-Za-z0-9_-]{24,}/g, "[…]").slice(0, 200);

async function signature(tool: string, location: string, message: string) {
  // Numbers vary between occurrences of the same bug (ids, sizes, line offsets): ignore them.
  const key = `${tool}|${location}|${message.replace(/\d+/g, "#")}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function intakeErrors(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Unavailable" }, 503);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "Too large" }, 413);
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const tool = text(body?.tool, 40), version = text(body?.version, 20) || "unknown", browser = text(body?.browser, 40) || "unknown";
  const entries = Array.isArray(body?.entries) ? body.entries.slice(0, MAX_ENTRIES) : [];
  if (!TOOLS.includes(tool) || !entries.length) return json({ error: "Invalid report" }, 400);
  const now = Math.floor(Date.now() / 1000);
  const fresh = await env.DB.prepare("SELECT count(*) AS n FROM error_reports WHERE first_seen > ?").bind(now - 86400).first<{ n: number }>();
  const capped = (fresh?.n ?? 0) >= NEW_KINDS_PER_DAY;
  const statements = [];
  for (const entry of entries) {
    const location = LOCATIONS.includes(entry?.where) ? entry.where : "page";
    const message = clean(text(entry?.message, 400));
    if (!message) continue;
    const sig = await signature(tool, location, message);
    // A kind marked seen comes back as new when it shows up in another version: the fix did not hold.
    statements.push(capped
      ? env.DB.prepare("UPDATE error_reports SET count = count + 1, last_seen = ? WHERE signature = ?").bind(now, sig)
      : env.DB.prepare(
        "INSERT INTO error_reports (signature, tool, version, location, message, browser, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(signature) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen, browser = excluded.browser, " +
        "status = CASE WHEN error_reports.version <> excluded.version THEN 'new' ELSE error_reports.status END, version = excluded.version"
      ).bind(sig, tool, version, location, message, browser, now, now));
  }
  if (statements.length) await env.DB.batch(statements);
  return new Response(null, { status: 204 });
}

export async function listErrors(env: Env, status: string | null) {
  if (!env.DB) return json({ error: "Unavailable" }, 503);
  const rows = await env.DB.prepare(
    "SELECT signature, tool, version, location, message, browser, count, first_seen, last_seen, status FROM error_reports " +
    "WHERE status = ? ORDER BY last_seen DESC LIMIT 100"
  ).bind(status === "seen" ? "seen" : "new").all();
  return json({ errors: rows.results });
}

export async function ackErrors(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Unavailable" }, 503);
  const body = await request.json().catch(() => null) as { signatures?: unknown } | null;
  const signatures = Array.isArray(body?.signatures) ? body.signatures.filter((s): s is string => typeof s === "string" && /^[0-9a-f]{64}$/.test(s)).slice(0, 100) : [];
  if (!signatures.length) return json({ error: "Invalid request" }, 400);
  await env.DB.batch(signatures.map(sig => env.DB!.prepare("UPDATE error_reports SET status = 'seen' WHERE signature = ?").bind(sig)));
  return json({ ok: true, updated: signatures.length });
}

export const pruneErrors = (env: Env) =>
  env.DB!.prepare("DELETE FROM error_reports WHERE last_seen < unixepoch() - ?").bind(KEEP_SECONDS);

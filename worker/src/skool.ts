// Worker entry (router.tekuei.com). Since extension 0.5 there is no hosted service: the Worker is only
// the error inbox the three extensions report to (errors.ts). The old member, session and usage tables
// stay in D1 untouched until someone decides to drop them.
import { ackErrors, intakeErrors, listErrors, pruneErrors } from "./errors";

export interface Env {
  DB?: D1Database;
  ERRORS_ADMIN_SECRET?: string;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const encode = (value: string) => new TextEncoder().encode(value);
const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value)));

async function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [left, right] = await Promise.all([digest(supplied), digest(secret)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/health" && request.method === "GET") {
        // Intake needs the database; the daily AI routine also needs the admin secret to read.
        return json({ ok: true, service: "error-inbox", intakeReady: !!env.DB, adminReady: !!env.DB && (env.ERRORS_ADMIN_SECRET?.length ?? 0) >= 32 });
      }
      if (path === "/api/errors" && request.method === "POST") return await intakeErrors(request, env);
      if (path.startsWith("/api/admin/errors")) {
        // The daily AI routine holds this secret; it can only read and acknowledge errors.
        if (!await authorized(request, env.ERRORS_ADMIN_SECRET)) return json({ error: "Unauthorized" }, 401);
        if (path === "/api/admin/errors" && request.method === "GET") return await listErrors(env, new URL(request.url).searchParams.get("status"));
        if (path === "/api/admin/errors/ack" && request.method === "POST") return await ackErrors(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch {
      // Never log request bodies or secrets.
      return json({ error: "Service temporarily unavailable" }, 500);
    }
  },
  // Daily cron: drops error kinds not seen for 90 days.
  async scheduled(_event: ScheduledController, env: Env) {
    if (env.DB) await pruneErrors(env).run();
  }
};

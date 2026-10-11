import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, test, vi } from "vitest";
import worker from "./skool";
import type { Env } from "./index";

// Real SQLite running the shipped schema and migration, behind D1's prepare/bind/first/run/batch shape.
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0001_skool.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0002_errors.sql", import.meta.url), "utf8"));
  const prepare = (query: string) => {
    const bind = (...args: SQLInputValue[]) => ({
      first: async () => sql.prepare(query).get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } })
    });
    return { bind, run: () => bind().run() };
  };
  return { sql, prepare, batch: async (statements: { run(): Promise<unknown> }[]) => {
    sql.exec("BEGIN");
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
}
type Db = ReturnType<typeof database>;
const secret = "test-admin-secret-" + "a".repeat(32);
const setup = (db: Db, extra: Partial<Env> = {}): Env => ({ DB: db as unknown as D1Database, TYPESAFE_API_KEY: "synthetic-key",
  ADMIN_SYNC_SECRET: secret, MEMBER_HASH_SECRET: "different-" + "b".repeat(32), ...extra });
const update = (env: Env, body: object, authorization = secret) => worker.fetch(new Request("https://router.example/api/admin/members", {
  method: "POST", headers: { Authorization: "Bearer " + authorization }, body: JSON.stringify(body)
}), env);
const member = () => ({ email: "member@example.com", status: "active", validUntil: Math.floor(Date.now() / 1000) + 3600, issueToken: true });
const recommend = (env: Env, token: string) => worker.fetch(new Request("https://router.example/api/route", {
  method: "POST", headers: { Authorization: "Bearer " + token }, body: JSON.stringify({ text: "Synthetic task", surface: "work" })
}), env);
const count = (db: Db, table: string) => (db.sql.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
afterEach(() => vi.restoreAllMocks());

test("Skool entry disables legacy payments and does not pretend sign-in is available", async () => {
  const health = await worker.fetch(new Request("https://router.example/api/health"), {});
  expect((await health.json() as { signInReady: boolean }).signInReady).toBe(false);
  const ready = await worker.fetch(new Request("https://router.example/api/health"), setup(database()));
  expect((await ready.json() as { signInReady: boolean }).signInReady).toBe(true);
  for (const path of ["/api/checkout", "/api/portal", "/api/stripe-webhook", "/login"]) {
    expect((await worker.fetch(new Request("https://router.example" + path, { method: "POST" }), {})).status).toBe(404);
  }
});

test("membership provisioning requires a strong admin secret and finite validity", async () => {
  const db = database(), env = setup(db);
  try {
    expect((await update(env, member(), "wrong")).status).toBe(401);
    expect((await update({ ...env, ADMIN_SYNC_SECRET: "" }, member())).status).toBe(401);
    expect((await update(env, { ...member(), validUntil: Math.floor(Date.now() / 1000) + 40 * 86400 })).status).toBe(400);
    expect(count(db, "members")).toBe(0);
  } finally { db.sql.close(); }
});

test("active Skool sessions route; inactive, expired and unknown sessions never call TypeSafe", async () => {
  const db = database(), env = setup(db);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({
    answers: { response_mode: { type: "choice", choice: "astra_medium", confidence: .9 } }, usage: { input_tokens: 12 }
  }));
  try {
    const issued = await update(env, member());
    expect(issued.status).toBe(200);
    const { token } = await issued.json() as { token: string };
    expect(token).toMatch(/^jmr_[a-f0-9]{64}$/);
    const row = db.sql.prepare("SELECT * FROM members").get() as { member_hash: string };
    expect(row.member_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toMatch(/member@example.com/);
    expect((await recommend(env, token)).status).toBe(200);
    await update(env, { ...member(), status: "inactive", issueToken: false });
    expect((await recommend(env, token)).status).toBe(403);
    await update(env, { ...member(), issueToken: false });
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() - 1");
    expect((await recommend(env, token)).status).toBe(403);
    expect((await recommend(env, "jmr_" + "c".repeat(64))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() + 3600; UPDATE members SET valid_until = unixepoch() - 1;");
    expect((await recommend(env, token)).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally { db.sql.close(); }
});

test("Skool rate limits and scheduled cleanup use real SQLite statements", async () => {
  const db = database(), env = setup(db, { MAX_REQUESTS_PER_MINUTE: "1" });
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({
    answers: { response_mode: { type: "choice", choice: "luna", confidence: .9 } }
  }));
  try {
    const { token } = await (await update(env, member())).json() as { token: string };
    expect((await recommend(env, token)).status).toBe(200);
    expect((await recommend(env, token)).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() - 1");
    await worker.scheduled({} as ScheduledController, env);
    expect(count(db, "member_sessions")).toBe(0);
  } finally { db.sql.close(); }
});

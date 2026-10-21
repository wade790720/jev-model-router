import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, test } from "vitest";
import worker, { type Env } from "./skool";

// Real SQLite running the shipped migration, behind D1's prepare/bind/first/all/run/batch shape.
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../migrations/0002_errors.sql", import.meta.url), "utf8"));
  const prepare = (query: string) => {
    const bind = (...args: SQLInputValue[]) => ({
      first: async () => sql.prepare(query).get(...args) ?? null,
      all: async () => ({ results: sql.prepare(query).all(...args) }),
      run: async () => sql.prepare(query).run(...args)
    });
    return { bind };
  };
  return { sql, prepare, batch: async (statements: { run(): Promise<unknown> }[]) => { for (const s of statements) await s.run(); } };
}
const secret = "test-admin-secret-" + "a".repeat(32);
const setup = () => { const db = database(); return { db, env: { DB: db as unknown as D1Database, ERRORS_ADMIN_SECRET: secret } as Env }; };
const report = (env: Env, body: unknown) => worker.fetch(new Request("https://router.example/api/errors", {
  method: "POST", headers: { "content-type": "text/plain" }, body: typeof body === "string" ? body : JSON.stringify(body)
}), env);
const error = (message: string, version = "0.2.0") => ({ tool: "ig-sorter", version, browser: "Chrome/150", entries: [{ message, where: "page" }] });
const list = async (env: Env, auth = secret) => worker.fetch(new Request("https://router.example/api/admin/errors", { headers: { Authorization: "Bearer " + auth } }), env);
type Row = { signature: string; message: string; count: number; status: string };
const rows = async (env: Env) => ((await (await list(env)).json()) as { errors: Row[] }).errors;

test("the same error is one row with a count, and keys never reach the inbox", async () => {
  const { env } = setup();
  expect((await report(env, error("TypeError: item 41 failed https://x.dev/a?key=AIzaSyFAKEfakeFAKEfakeFAKE123"))).status).toBe(204);
  await report(env, error("TypeError: item 42 failed https://x.dev/a?key=AIzaSyFAKEfakeFAKEfakeFAKE123"));
  const [row] = await rows(env);
  expect(row.count).toBe(2);
  expect(row.message).toBe("TypeError: item 41 failed https://x.dev/a");
});

test("only our tools, and only small reports, get in", async () => {
  const { env } = setup();
  expect((await report(env, { ...error("x"), tool: "someone-else" })).status).toBe(400);
  expect((await report(env, "not json")).status).toBe(400);
  expect((await report(env, "x".repeat(9000))).status).toBe(413);
  expect(await rows(env)).toEqual([]);
});

test("reading and acknowledging need the admin secret", async () => {
  const { env } = setup();
  await report(env, error("TypeError: boom"));
  expect((await list(env, "wrong-" + "c".repeat(40))).status).toBe(401);
  const [row] = await rows(env);
  const ack = await worker.fetch(new Request("https://router.example/api/admin/errors/ack", {
    method: "POST", headers: { Authorization: "Bearer " + secret }, body: JSON.stringify({ signatures: [row.signature] })
  }), env);
  expect(ack.status).toBe(200);
  expect(await rows(env)).toEqual([]);
});

test("a handled error comes back as new only when it reappears in another version", async () => {
  const { db, env } = setup();
  await report(env, error("TypeError: boom", "0.2.0"));
  db.sql.exec("UPDATE error_reports SET status = 'seen'");
  await report(env, error("TypeError: boom", "0.2.0"));
  expect(await rows(env)).toEqual([]);
  await report(env, error("TypeError: boom", "0.2.1"));
  expect((await rows(env))[0].status).toBe("new");
});

test("the Worker is only the error inbox: health reports its setup, the hosted routes are gone", async () => {
  const { env } = setup();
  const health = await (await worker.fetch(new Request("https://router.example/api/health"), env)).json();
  expect(health).toEqual({ ok: true, service: "error-inbox", intakeReady: true, adminReady: true });
  expect(await (await worker.fetch(new Request("https://router.example/api/health"), {} as Env)).json())
    .toMatchObject({ intakeReady: false, adminReady: false });
  for (const path of ["/api/route", "/api/session", "/api/admin/members", "/api/checkout"]) {
    expect((await worker.fetch(new Request("https://router.example" + path, { method: "POST" }), env)).status, path).toBe(404);
  }
});

test("the daily cron drops error kinds not seen for 90 days and keeps the rest", async () => {
  const { db, env } = setup();
  const insert = db.sql.prepare("INSERT INTO error_reports (signature, tool, version, location, message, browser, first_seen, last_seen) VALUES (?, 'ig-sorter', '0', 'page', ?, 'x', ?, ?)");
  const now = Math.floor(Date.now() / 1000);
  insert.run("old", "old", now - 91 * 86400, now - 91 * 86400);
  insert.run("recent", "recent", now - 86400, now - 86400);
  await worker.scheduled({} as ScheduledController, env);
  expect(db.sql.prepare("SELECT message FROM error_reports").all()).toEqual([{ message: "recent" }]);
});

test("a flood of new kinds stops at the daily cap but known errors still count", async () => {
  const { db, env } = setup();
  await report(env, error("TypeError: known"));
  const insert = db.sql.prepare("INSERT INTO error_reports (signature, tool, version, location, message, browser, first_seen, last_seen) VALUES (?, 'ig-sorter', '0', 'page', 'flood', 'x', unixepoch(), unixepoch())");
  for (let i = 0; i < 200; i++) insert.run("f" + i);
  await report(env, error("TypeError: brand new"));
  await report(env, error("TypeError: known"));
  const all = db.sql.prepare("SELECT message, count FROM error_reports WHERE message LIKE 'TypeError%'").all() as Row[];
  expect(all).toEqual([{ message: "TypeError: known", count: 2 }]);
});

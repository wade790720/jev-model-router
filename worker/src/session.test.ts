import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, test, vi } from "vitest";
import worker from "./skool";
import type { Env } from "./index";

// Real SQLite running the shipped schema and migrations, behind D1's prepare/bind/first/run/batch shape.
function database() {
  const sql = new DatabaseSync(":memory:");
  for (const file of ["../schema.sql", "../migrations/0001_skool.sql", "../migrations/0002_errors.sql"]) {
    sql.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  const prepare = (query: string) => {
    const bind = (...args: SQLInputValue[]) => ({
      first: async () => sql.prepare(query).get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } })
    });
    return { bind, run: () => bind().run() };
  };
  return { sql, prepare, batch: async (statements: { run(): Promise<unknown> }[]) => { for (const s of statements) await s.run(); } };
}
const GROUP = "998361e5ef944ec4a6937379dd581002";
const page = (pageProps: unknown) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script>`;
const member = (role = "member", groupId = GROUP) => page({ self: { id: "user-1", member: { role, groupId } } });

function setup(skoolPage: string, status = 200) {
  const db = database();
  const env = { DB: db as unknown as D1Database, TYPESAFE_API_KEY: "synthetic-key", MEMBER_HASH_SECRET: "member-hash-" + "b".repeat(32) } as Env;
  const calls: { url: string; cookie?: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, cookie: (init?.headers as Record<string, string> | undefined)?.cookie });
    if (url.startsWith("https://www.skool.com/")) return new Response(skoolPage, { status });
    return Response.json({ answers: { response_mode: { type: "choice", choice: "luna", confidence: .9 } } });
  });
  const session = (body: unknown) => worker.fetch(new Request("https://router.example/api/session", {
    method: "POST", headers: { "CF-Connecting-IP": "203.0.113.7" }, body: typeof body === "string" ? body : JSON.stringify(body)
  }), env);
  return { db, env, calls, session };
}
afterEach(() => vi.restoreAllMocks());

test("a Skool member gets a 24-hour token that the hosted route accepts", async () => {
  const { db, env, calls, session } = setup(member());
  const response = await session({ cookie: "session=fake" });
  expect(response.status).toBe(200);
  const { token, expiresAt } = await response.json() as { token: string; expiresAt: number };
  expect(token).toMatch(/^jmr_[0-9a-f]{64}$/);
  expect(expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(86000);
  expect(calls[0]).toEqual({ url: "https://www.skool.com/forge-1085/about", cookie: "session=fake" });
  // The cookie is never kept.
  expect(JSON.stringify(db.sql.prepare("SELECT * FROM members").all())).not.toContain("fake");
  const routed = await worker.fetch(new Request("https://router.example/api/route", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "Synthetic task", surface: "work" })
  }), env);
  expect(routed.status).toBe(200);
});

test("admins pass too; other groups, other roles and signed-out visitors do not", async () => {
  expect((await setup(member("group-admin")).session({ cookie: "s=1" })).status).toBe(200);
  for (const html of [member("member", "another-group"), member("banned"), page({ self: null })]) {
    const { db, session } = setup(html);
    expect((await session({ cookie: "s=1" })).status).toBe(403);
    expect((db.sql.prepare("SELECT count(*) AS n FROM member_sessions").get() as { n: number }).n).toBe(0);
  }
});

test("bad requests and an unreadable Skool page never issue a token", async () => {
  const { session, calls } = setup(member());
  expect((await session({})).status).toBe(400);
  expect((await session({ cookie: "a=1\r\nHost: evil" })).status).toBe(400);
  expect((await session("x".repeat(9000))).status).toBe(413);
  expect(calls).toHaveLength(0);
  expect((await setup("<html>maintenance</html>").session({ cookie: "s=1" })).status).toBe(502);
  expect((await setup(member(), 503).session({ cookie: "s=1" })).status).toBe(502);
});

test("one address cannot hammer Skool through us", async () => {
  const { session } = setup(member());
  for (let i = 0; i < 10; i++) expect((await session({ cookie: "s=1" })).status).toBe(200);
  expect((await session({ cookie: "s=1" })).status).toBe(429);
});

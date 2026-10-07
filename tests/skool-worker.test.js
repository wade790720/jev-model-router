import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/src/skool.js";

function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../worker/migrations/0001_skool.sql", import.meta.url), "utf8"));
  const prepare = query => {
    const bind = (...args) => ({
      first: async () => sql.prepare(query).get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } })
    });
    return { bind, run: () => bind().run() };
  };
  return { sql, prepare, batch: async statements => {
    sql.exec("BEGIN");
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
}
const secret = "test-admin-secret-" + "a".repeat(32);
const setup = db => ({ DB: db, TYPESAFE_API_KEY: "synthetic-key", ADMIN_SYNC_SECRET: secret, MEMBER_HASH_SECRET: "different-" + "b".repeat(32) });
const update = (env, body, authorization = secret) => worker.fetch(new Request("https://router.example/api/admin/members", {
  method: "POST", headers: { Authorization: "Bearer " + authorization }, body: JSON.stringify(body)
}), env);
const member = () => ({ email: "member@example.com", status: "active", validUntil: Math.floor(Date.now() / 1000) + 3600, issueToken: true });
const recommend = (env, token) => worker.fetch(new Request("https://router.example/api/route", {
  method: "POST", headers: { Authorization: "Bearer " + token }, body: JSON.stringify({ text: "Synthetic task", surface: "work" })
}), env);

test("Skool entry disables legacy payments and does not pretend sign-in is available", async () => {
  const health = await worker.fetch(new Request("https://router.example/api/health"), {});
  assert.equal((await health.json()).signInReady, false);
  for (const path of ["/api/checkout", "/api/portal", "/api/stripe-webhook", "/login"]) {
    assert.equal((await worker.fetch(new Request("https://router.example" + path, { method: "POST" }), {})).status, 404);
  }
});
test("membership provisioning requires a strong admin secret and finite validity", async () => {
  const db = database(), env = setup(db);
  try {
    assert.equal((await update(env, member(), "wrong")).status, 401);
    assert.equal((await update({ ...env, ADMIN_SYNC_SECRET: "" }, member())).status, 401);
    assert.equal((await update(env, { ...member(), validUntil: Math.floor(Date.now()/1000) + 40*86400 })).status, 400);
    assert.equal(db.sql.prepare("SELECT count(*) n FROM members").get().n, 0);
  } finally { db.sql.close(); }
});
test("active Skool sessions route; inactive, expired and unknown sessions never call TypeSafe", async () => {
  const db = database(), env = setup(db);
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({
    answers: { response_mode: { type: "choice", choice: "astra_medium", confidence: .9 } }, usage: { input_tokens: 12 }
  }));
  try {
    const issued = await update(env, member());
    assert.equal(issued.status, 200);
    const { token } = await issued.json();
    assert.match(token, /^jmr_[a-f0-9]{64}$/);
    const row = db.sql.prepare("SELECT * FROM members").get();
    assert.match(row.member_hash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(row), /member@example.com/);
    assert.equal((await recommend(env, token)).status, 200);
    await update(env, { ...member(), status: "inactive", issueToken: false });
    assert.equal((await recommend(env, token)).status, 403);
    await update(env, { ...member(), issueToken: false });
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() - 1");
    assert.equal((await recommend(env, token)).status, 403);
    assert.equal((await recommend(env, "jmr_" + "c".repeat(64))).status, 403);
    assert.equal(fetchMock.mock.callCount(), 1);
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() + 3600; UPDATE members SET valid_until = unixepoch() - 1;");
    assert.equal((await recommend(env, token)).status, 403);
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally { fetchMock.mock.restore(); db.sql.close(); }
});
test("Skool rate limits and scheduled cleanup use real SQLite statements", async () => {
  const db = database(), env = { ...setup(db), MAX_REQUESTS_PER_MINUTE: "1" };
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({
    answers: { response_mode: { type: "choice", choice: "luna", confidence: .9 } }
  }));
  try {
    const { token } = await (await update(env, member())).json();
    assert.equal((await recommend(env, token)).status, 200);
    assert.equal((await recommend(env, token)).status, 429);
    assert.equal(fetchMock.mock.callCount(), 1);
    db.sql.exec("UPDATE member_sessions SET expires_at = unixepoch() - 1");
    await worker.scheduled({}, env);
    assert.equal(db.sql.prepare("SELECT count(*) n FROM member_sessions").get().n, 0);
  } finally { fetchMock.mock.restore(); db.sql.close(); }
});

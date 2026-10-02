import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import worker from "../worker/src/index.js";

const token = `jmr_${"a".repeat(64)}`;
const tokenHash = createHash("sha256").update(token).digest("hex");

class FakeDB {
  constructor() {
    this.licenses = new Map([[tokenHash, { status: "active", subscription_id: "sub_123" }]]);
    this.windows = new Map();
  }
  prepare(sql) {
    return {
      bind: (...args) => ({
        first: async () => {
          if (sql.includes("FROM licenses")) return this.licenses.get(args[0]) ?? null;
          if (sql.includes("input_tokens FROM usage_windows")) return this.windows.get(`${args[0]}:${args[1]}`) ?? null;
          throw new Error(`Unexpected SELECT: ${sql}`);
        },
        run: async () => {
          if (sql.startsWith("INSERT INTO usage_windows")) {
            const key = `${args[0]}:${args[1]}`;
            const row = this.windows.get(key) ?? { requests: 0, input_tokens: 0 };
            if (sql.includes("requests = requests + 1")) {
              if (row.requests >= args[2]) return { meta: { changes: 0 } };
              row.requests++;
            } else {
              row.input_tokens += args[2];
            }
            this.windows.set(key, row);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE licenses")) {
            for (const license of this.licenses.values()) if (license.subscription_id === args[2]) license.status = args[0];
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected UPDATE: ${sql}`);
        }
      })
    };
  }
}

test("a paid route checks the license, calls Jev, and counts usage", async () => {
  const db = new FakeDB();
  const env = { DB: db, TYPESAFE_API_KEY: "test_key" };
  const fetchMock = mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.headers.Authorization, "Bearer test_key");
    assert.equal(JSON.parse(init.body).state.prompt, "Explain this code");
    return Response.json({ answers: { response_mode: { type: "choice", choice: "high", confidence: 0.8 } }, usage: { input_tokens: 250 } });
  });
  try {
    const response = await worker.fetch(new Request("https://router.example/api/route", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Explain this code" })
    }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, "high");
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal([...db.windows.values()].filter(row => row.input_tokens === 250).length, 2);
  } finally { fetchMock.mock.restore(); }
});

test("paid Work routing forwards the surface and top probabilities", async () => {
  const db = new FakeDB();
  const env = { DB: db, TYPESAFE_API_KEY: "test_key" };
  const fetchMock = mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.ok(request.questions.response_mode.criteria.astra_medium);
    assert.equal(request.questions.response_mode.criteria.instant, undefined);
    return Response.json({ answers: { response_mode: {
      type: "choice", choice: "astra_medium", confidence: 0.9,
      probabilities: { astra_medium: 0.8, sol_medium: 0.15, luna: 0.05 }
    } }, usage: { input_tokens: 100 } });
  });
  try {
    const response = await worker.fetch(new Request("https://router.example/api/route", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: "Review this architecture", surface: "work" })
    }), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "astra_medium");
    assert.deepEqual(result.topChoices, [
      { mode: "astra_medium", probability: 0.8 },
      { mode: "sol_medium", probability: 0.15 },
      { mode: "luna", probability: 0.05 }
    ]);
  } finally { fetchMock.mock.restore(); }
});

test("inactive license and oversize prompt never call Jev", async () => {
  const db = new FakeDB();
  const env = { DB: db, TYPESAFE_API_KEY: "test_key", MAX_PROMPT_CHARS: "5" };
  const fetchMock = mock.method(globalThis, "fetch", async () => { throw new Error("must not call Jev"); });
  try {
    const makeRequest = () => new Request("https://router.example/api/route", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "too long" })
    });
    assert.equal((await worker.fetch(makeRequest(), env)).status, 413);
    db.licenses.get(tokenHash).status = "inactive";
    assert.equal((await worker.fetch(makeRequest(), env)).status, 403);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally { fetchMock.mock.restore(); }
});

test("checkout is limited before requesting Stripe", async () => {
  const db = new FakeDB();
  const env = { DB: db, STRIPE_PRICE_ID: "price_test", STRIPE_SECRET_KEY: "sk_test", MAX_CHECKOUTS_PER_IP_10_MIN: "1" };
  const fetchMock = mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    return Response.json({ url: "https://checkout.stripe.com/test" });
  });
  try {
    const request = () => new Request("https://router.example/api/checkout", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.1" } });
    assert.equal((await worker.fetch(request(), env)).status, 200);
    assert.equal((await worker.fetch(request(), env)).status, 429);
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally { fetchMock.mock.restore(); }
});

test("webhook reads live Stripe state rather than stale event state", async () => {
  const db = new FakeDB();
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_123", status: "active" } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const fetchMock = mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://api.stripe.com/v1/subscriptions/sub_123");
    return Response.json({ id: "sub_123", status: "canceled" });
  });
  try {
    const response = await worker.fetch(new Request("https://router.example/api/stripe-webhook", {
      method: "POST", headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` }, body: payload
    }), { DB: db, STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: "sk_test" });
    assert.equal(response.status, 200);
    assert.equal(db.licenses.get(tokenHash).status, "inactive");
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally { fetchMock.mock.restore(); }
});

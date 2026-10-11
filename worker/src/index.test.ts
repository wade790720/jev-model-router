import { createHash, createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import worker, { type Env } from "./index";

const token = `jmr_${"a".repeat(64)}`;
const tokenHash = createHash("sha256").update(token).digest("hex");
afterEach(() => vi.restoreAllMocks());

// Minimal D1 stand-in for the legacy license table and usage windows.
class FakeDB {
  licenses = new Map([[tokenHash, { status: "active", subscription_id: "sub_123" }]]);
  windows = new Map<string, { requests: number; input_tokens: number }>();
  prepare(sql: string) {
    return {
      bind: (...args: any[]) => ({
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
const env = (db: FakeDB, extra: Partial<Env> = {}) => ({ DB: db as unknown as D1Database, ...extra });
const mockFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch);

test("a paid route checks the license, calls Jev, and counts usage", async () => {
  const db = new FakeDB();
  const fetchMock = mockFetch(async (url, init) => {
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test_key");
    expect(JSON.parse(init.body as string).state.prompt).toBe("Explain this code");
    return Response.json({ answers: { response_mode: { type: "choice", choice: "high", confidence: 0.8 } }, usage: { input_tokens: 250 } });
  });
  const response = await worker.fetch(new Request("https://router.example/api/route", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Explain this code" })
  }), env(db, { TYPESAFE_API_KEY: "test_key" }));
  expect(response.status).toBe(200);
  expect((await response.json() as { mode: string }).mode).toBe("high");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect([...db.windows.values()].filter(row => row.input_tokens === 250)).toHaveLength(2);
});

test("paid Work routing forwards the surface and top probabilities", async () => {
  mockFetch(async (_url, init) => {
    const request = JSON.parse(init.body as string);
    expect(request.questions.response_mode.criteria.astra_medium).toBeTruthy();
    expect(request.questions.response_mode.criteria.instant).toBeUndefined();
    return Response.json({ answers: { response_mode: {
      type: "choice", choice: "astra_medium", confidence: 0.9,
      probabilities: { astra_medium: 0.8, sol_medium: 0.15, luna: 0.05 }
    } }, usage: { input_tokens: 100 } });
  });
  const response = await worker.fetch(new Request("https://router.example/api/route", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: "Review this architecture", surface: "work" })
  }), env(new FakeDB(), { TYPESAFE_API_KEY: "test_key" }));
  expect(response.status).toBe(200);
  const result = await response.json() as { mode: string; topChoices: unknown };
  expect(result.mode).toBe("astra_medium");
  expect(result.topChoices).toEqual([
    { mode: "astra_medium", probability: 0.8 },
    { mode: "sol_medium", probability: 0.15 },
    { mode: "luna", probability: 0.05 }
  ]);
});

test("inactive license and oversize prompt never call Jev", async () => {
  const db = new FakeDB();
  const fetchMock = mockFetch(async () => { throw new Error("must not call Jev"); });
  const makeRequest = () => new Request("https://router.example/api/route", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "too long" })
  });
  const config = env(db, { TYPESAFE_API_KEY: "test_key", MAX_PROMPT_CHARS: "5" });
  expect((await worker.fetch(makeRequest(), config)).status).toBe(413);
  db.licenses.get(tokenHash)!.status = "inactive";
  expect((await worker.fetch(makeRequest(), config)).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("checkout is limited before requesting Stripe", async () => {
  const fetchMock = mockFetch(async url => {
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    return Response.json({ url: "https://checkout.stripe.com/test" });
  });
  const config = env(new FakeDB(), { STRIPE_PRICE_ID: "price_test", STRIPE_SECRET_KEY: "sk_test", MAX_CHECKOUTS_PER_IP_10_MIN: "1" });
  const request = () => new Request("https://router.example/api/checkout", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.1" } });
  expect((await worker.fetch(request(), config)).status).toBe(200);
  expect((await worker.fetch(request(), config)).status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("webhook reads live Stripe state rather than stale event state", async () => {
  const db = new FakeDB();
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_123", status: "active" } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const fetchMock = mockFetch(async url => {
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_123");
    return Response.json({ id: "sub_123", status: "canceled" });
  });
  const response = await worker.fetch(new Request("https://router.example/api/stripe-webhook", {
    method: "POST", headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` }, body: payload
  }), env(db, { STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: "sk_test" }));
  expect(response.status).toBe(200);
  expect(db.licenses.get(tokenHash)!.status).toBe("inactive");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

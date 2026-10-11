import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import worker from "./skool";
import type { Env } from "./index";

const token = `jmr_${"a".repeat(64)}`;
const tokenHash = createHash("sha256").update(token).digest("hex");
afterEach(() => vi.restoreAllMocks());

// Minimal D1 stand-in for member sessions and usage windows.
class FakeDB {
  sessions = new Map([[tokenHash, { status: "active" }]]);
  windows = new Map<string, { requests: number; input_tokens: number }>();
  prepare(sql: string) {
    return {
      bind: (...args: any[]) => ({
        first: async () => {
          if (sql.includes("FROM member_sessions")) return this.sessions.get(args[0]) ?? null;
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
          throw new Error(`Unexpected UPDATE: ${sql}`);
        }
      })
    };
  }
}
const env = (db: FakeDB, extra: Partial<Env> = {}) => ({ DB: db as unknown as D1Database, ...extra });
const mockFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch);

test("a member route checks the session, calls Jev, and counts usage", async () => {
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

test("member Work routing forwards the surface and top probabilities", async () => {
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

test("inactive membership and oversize prompt never call Jev", async () => {
  const db = new FakeDB();
  const fetchMock = mockFetch(async () => { throw new Error("must not call Jev"); });
  const makeRequest = () => new Request("https://router.example/api/route", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "too long" })
  });
  const config = env(db, { TYPESAFE_API_KEY: "test_key", MAX_PROMPT_CHARS: "5" });
  expect((await worker.fetch(makeRequest(), config)).status).toBe(413);
  db.sessions.get(tokenHash)!.status = "inactive";
  expect((await worker.fetch(makeRequest(), config)).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

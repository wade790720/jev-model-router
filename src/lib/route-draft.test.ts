import { afterEach, expect, test, vi } from "vitest";
import { routeDraft, TYPE_SAFE_URL, type CodedError } from "./route-draft";

afterEach(() => vi.unstubAllGlobals());

function background(stored: Record<string, unknown>, status = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("chrome", { storage: { local: { get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, stored[k]])) } } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json(status === 200 ? { answers: { response_mode: { type: "choice", choice: "instant", confidence: .9 } } } : { detail: "nope" }, { status });
  });
  return { route: (text: string) => routeDraft(text, "chat"), requests };
}

test("drafts go straight to TypeSafe with the user's own key", async () => {
  const api = background({ typeSafeKey: "synthetic-key" });
  expect((await api.route("Synthetic task")).mode).toBe("instant");
  expect(api.requests.map(r => r.url)).toEqual([TYPE_SAFE_URL]);
  expect((api.requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer synthetic-key");
});

test("without a key nothing is sent and the badge asks for one", async () => {
  const api = background({});
  await expect(api.route("Synthetic task")).rejects.toSatisfy((e: CodedError) => e.code === "routing_key_missing");
  expect(api.requests).toHaveLength(0);
});

test("a rejected key is an auth failure", async () => {
  const api = background({ typeSafeKey: "synthetic-key" }, 401);
  await expect(api.route("Synthetic task")).rejects.toSatisfy((e: CodedError) => e.code === "routing_auth");
});

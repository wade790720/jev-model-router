import { afterEach, expect, test, vi } from "vitest";
import { HOSTED_URL, routeDraft, TYPE_SAFE_URL, type CodedError } from "./route-draft";

afterEach(() => vi.unstubAllGlobals());

function background(settings: Record<string, unknown>) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("chrome", { storage: { local: { get: async () => settings } } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json(url === TYPE_SAFE_URL
      ? { answers: { response_mode: { type: "choice", choice: "instant", confidence: .9 } } }
      : { mode: "instant", confidence: .9 });
  });
  return { route: (text: string) => routeDraft(text, "chat"), requests };
}
const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

test("the hosted service is the default", async () => {
  const api = background({ activationCode: "synthetic-token" });
  expect((await api.route("Synthetic task")).mode).toBe("instant");
  expect(api.requests[0].url).toBe(HOSTED_URL);
  expect(auth(api.requests[0].init)).toBe("Bearer synthetic-token");
});

test("a key the member saved takes over and goes straight to TypeSafe", async () => {
  for (const flag of [undefined, false]) {
    const api = background({ typeSafeKey: "synthetic-key", activationCode: "synthetic-token", routingConsent: flag });
    expect((await api.route("Synthetic task")).mode).toBe("instant");
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].url).toBe(TYPE_SAFE_URL);
    expect(auth(api.requests[0].init)).toBe("Bearer synthetic-key");
  }
});

test("with neither a key nor a hosted session nothing is sent", async () => {
  const api = background({});
  await expect(api.route("Synthetic task")).rejects.toSatisfy((error: CodedError) => error.code === "routing_membership_missing");
  expect(api.requests).toHaveLength(0);
});

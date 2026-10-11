import { afterEach, expect, test, vi } from "vitest";
import { routeDraft, TYPE_SAFE_URL, type CodedError } from "./route-draft";

afterEach(() => vi.unstubAllGlobals());

function background(settings: Record<string, unknown>) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("chrome", { storage: { local: { get: async () => settings } } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ answers: { response_mode: { type: "choice", choice: "instant", confidence: .9 } } });
  });
  return { route: (text: string) => routeDraft(text, "chat"), requests };
}

test("the member's own key goes straight to TypeSafe, with or without the old consent flag", async () => {
  for (const flag of [undefined, false]) {
    const api = background({ typeSafeKey: "synthetic-key", routingConsent: flag });
    expect((await api.route("Synthetic task")).mode).toBe("instant");
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].url).toBe(TYPE_SAFE_URL);
    expect((api.requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer synthetic-key");
  }
});

test("without a key nothing is sent, including for installs left on the removed hosted mode", async () => {
  for (const settings of [{}, { connectionMode: "subscription", activationCode: "old-token", workerUrl: "https://router.example" }]) {
    const api = background(settings);
    await expect(api.route("Synthetic task")).rejects.toSatisfy((error: CodedError) => error.code === "routing_key_missing");
    expect(api.requests).toHaveLength(0);
  }
});

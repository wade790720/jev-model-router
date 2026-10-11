import { afterEach, expect, test, vi } from "vitest";
import { SERVICE_CONFIG, type ServiceConfig } from "./config";
import { routeDraft, type CodedError } from "./route-draft";

afterEach(() => vi.unstubAllGlobals());

function background(settings: Record<string, unknown>) {
  const requests: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("chrome", { storage: { local: { get: async () => settings } } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json(settings.connectionMode === "personal"
      ? { answers: { response_mode: { type: "choice", choice: "instant", confidence: .9 } } }
      : { mode: "instant", confidence: .9 });
  });
  return { route: (text: string, config: ServiceConfig = {}) => routeDraft(text, "chat", config), requests };
}

test("shipped hosted configuration points to the verified domain and Skool community", () => {
  expect(SERVICE_CONFIG.serviceUrl).toBe("https://router.tekuei.com");
  expect(SERVICE_CONFIG.skoolUrl).toBe("https://www.skool.com/forge-1085/about");
});

test("configured personal access works without a consent flag or despite the old false flag", async () => {
  for (const flag of [undefined, false]) {
    const api = background({ connectionMode: "personal", typeSafeKey: "synthetic-key", routingConsent: flag });
    expect((await api.route("Synthetic task")).mode).toBe("instant");
    expect(api.requests).toHaveLength(1);
  }
});

test("hosted is the default and the shipped URL overrides stale stored endpoints", async () => {
  const api = background({ routingConsent: true, activationCode: "synthetic-token", workerUrl: "https://old.example" });
  expect((await api.route("Synthetic task", { serviceUrl: "https://router.example" })).mode).toBe("instant");
  expect(api.requests[0].url).toBe("https://router.example/api/route");
});

test("personal key remains direct and does not require hosted membership", async () => {
  const api = background({ routingConsent: true, connectionMode: "personal", typeSafeKey: "synthetic-key" });
  await api.route("Synthetic task");
  expect(api.requests[0].url).toBe("https://api.typesafe.ai/v1/systemone");
});

test("missing key, unconfigured hosted service and missing membership are distinct local failures", async () => {
  for (const [settings, config, code] of [
    [{ routingConsent: true, connectionMode: "personal" }, {}, "routing_key_missing"],
    [{ routingConsent: true }, {}, "routing_service_unconfigured"],
    [{ routingConsent: true }, { serviceUrl: "https://router.example" }, "routing_membership_missing"]
  ] as const) {
    const api = background(settings);
    await expect(api.route("Synthetic task", config)).rejects.toSatisfy((error: CodedError) => error.code === code);
    expect(api.requests).toHaveLength(0);
  }
});

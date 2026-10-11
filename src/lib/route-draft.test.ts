import { afterEach, expect, test, vi } from "vitest";
import { HOSTED_URL, routeDraft, SESSION_URL, TYPE_SAFE_URL, type CodedError } from "./route-draft";

afterEach(() => vi.unstubAllGlobals());
const now = () => Math.floor(Date.now() / 1000);

function background(stored: Record<string, unknown>, opts: { cookies?: { name: string; value: string }[]; session?: number; route?: number[] } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const routeStatus = [...(opts.route ?? [])];
  vi.stubGlobal("chrome", {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, stored[k]])),
      set: async (values: Record<string, unknown>) => { Object.assign(stored, values); }
    } },
    cookies: { getAll: async () => opts.cookies ?? [{ name: "auth", value: "fake" }] }
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url === SESSION_URL) {
      const status = opts.session ?? 200;
      return Response.json(status === 200 ? { token: `jmr_new${requests.length}`, expiresAt: now() + 86400 } : { error: "not a member" }, { status });
    }
    if (url === TYPE_SAFE_URL) return Response.json({ answers: { response_mode: { type: "choice", choice: "instant", confidence: .9 } } });
    return Response.json({ mode: "instant", confidence: .9 }, { status: routeStatus.shift() ?? 200 });
  });
  return { route: (text: string) => routeDraft(text, "chat"), requests, stored };
}
const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

test("the hosted service is the default: Skool cookies buy a session token, which is kept", async () => {
  const api = background({});
  expect((await api.route("Synthetic task")).mode).toBe("instant");
  expect(api.requests.map(r => r.url)).toEqual([SESSION_URL, HOSTED_URL]);
  expect(JSON.parse(api.requests[0].init.body as string)).toEqual({ cookie: "auth=fake" });
  expect(auth(api.requests[1].init)).toBe("Bearer jmr_new1");
  expect(api.stored.activationCode).toBe("jmr_new1");
});

test("a valid session is reused; an expired or rejected one is renewed once", async () => {
  const fresh = background({ activationCode: "jmr_cached", sessionExpiresAt: now() + 3600 });
  await fresh.route("Synthetic task");
  expect(fresh.requests.map(r => r.url)).toEqual([HOSTED_URL]);

  const expired = background({ activationCode: "jmr_cached", sessionExpiresAt: now() - 1 });
  await expired.route("Synthetic task");
  expect(expired.requests.map(r => r.url)).toEqual([SESSION_URL, HOSTED_URL]);

  const revoked = background({ activationCode: "jmr_cached", sessionExpiresAt: now() + 3600 }, { route: [401] });
  expect((await revoked.route("Synthetic task")).mode).toBe("instant");
  expect(revoked.requests.map(r => r.url)).toEqual([HOSTED_URL, SESSION_URL, HOSTED_URL]);
});

test("a key the member saved takes over and never touches Skool cookies", async () => {
  const api = background({ typeSafeKey: "synthetic-key" });
  expect((await api.route("Synthetic task")).mode).toBe("instant");
  expect(api.requests.map(r => r.url)).toEqual([TYPE_SAFE_URL]);
  expect(auth(api.requests[0].init)).toBe("Bearer synthetic-key");
});

test("signed out of Skool, or not a member: a clear membership error", async () => {
  const signedOut = background({}, { cookies: [] });
  await expect(signedOut.route("Synthetic task")).rejects.toSatisfy((e: CodedError) => e.code === "routing_membership_missing");
  expect(signedOut.requests).toHaveLength(0);

  const notMember = background({}, { session: 403 });
  await expect(notMember.route("Synthetic task")).rejects.toSatisfy((e: CodedError) => e.code === "routing_membership_missing");
  expect(notMember.requests.map(r => r.url)).toEqual([SESSION_URL]);
});

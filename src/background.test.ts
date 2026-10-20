import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The service worker registers its listeners on import: capture them with a fake chrome.*.
const routeDraft = vi.fn();
vi.mock("@/lib/route-draft", async importOriginal => ({ ...(await importOriginal<object>()), routeDraft }));

let stored: Record<string, unknown>;
let installed: (details: { reason: string }) => void;
let onMessage: (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean;
const openOptionsPage = vi.fn();

beforeEach(async () => {
  stored = {};
  vi.resetModules();
  vi.stubGlobal("chrome", {
    runtime: {
      OnInstalledReason: { INSTALL: "install", UPDATE: "update" },
      onInstalled: { addListener: (fn: typeof installed) => { installed = fn; } },
      onMessage: { addListener: (fn: typeof onMessage) => { onMessage = fn; } },
      openOptionsPage
    },
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, stored[k]])),
      set: async (values: Record<string, unknown>) => { Object.assign(stored, values); }
    } }
  });
  await import("./background");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test("a fresh install opens settings, where the onboarding starts; an update does not", () => {
  installed({ reason: "update" });
  expect(openOptionsPage).not.toHaveBeenCalled();
  installed({ reason: "install" });
  expect(openOptionsPage).toHaveBeenCalledOnce();
});

test("the first successful suggestion is remembered once, completing onboarding step 3", async () => {
  routeDraft.mockResolvedValue({ mode: "instant" });
  const send = (response: (value: unknown) => void) => onMessage({ type: "JEV_ROUTE", text: "x", surface: "chat" }, {}, response);
  await new Promise(resolve => send(resolve));
  await vi.waitFor(() => expect(stored.firstSuggestionAt).toBeTypeOf("number"));
  const first = stored.firstSuggestionAt;
  await new Promise(resolve => send(resolve));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(stored.firstSuggestionAt).toBe(first);
});

test("a failed suggestion does not complete step 3", async () => {
  routeDraft.mockRejectedValue(Object.assign(new Error("no key"), { code: "routing_key_missing" }));
  const reply = await new Promise(resolve => onMessage({ type: "JEV_ROUTE", text: "x", surface: "chat" }, {}, resolve));
  expect(reply).toMatchObject({ ok: false, code: "routing_key_missing" });
  expect(stored.firstSuggestionAt).toBeUndefined();
});

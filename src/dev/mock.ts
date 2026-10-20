// `npm run dev` only: an in-memory chrome.* with just what the settings page calls. Fake data, no real keys.
// ?state=key (key saved) or ?state=done (key saved and first suggestion seen) previews later onboarding steps.
const state = new URLSearchParams(location.search).get("state");
const store: Record<string, unknown> = state === "key" || state === "done" ? { typeSafeKey: "dev-key" } : {};
if (state === "done") store.firstSuggestionAt = Date.now();

Object.assign(globalThis, {
  chrome: {
    // ?lang=en-US (or ja, ko, zh-CN…) previews another language without changing the browser.
    i18n: { getUILanguage: () => new URLSearchParams(location.search).get("lang") ?? navigator.language },
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(key => [key, store[key]])),
      set: async (values: Record<string, unknown>) => { Object.assign(store, values); }
    }, onChanged: { addListener() {}, removeListener() {} } },
    permissions: { request: async () => true },
    tabs: { create: async ({ url }: { url: string }) => { window.open(url, "_blank", "noopener"); } },
    runtime: { sendMessage: (_message: unknown, callback?: (value: unknown) => void) => callback?.({ connected: false, pending: 0 }) }
  }
});

export {};

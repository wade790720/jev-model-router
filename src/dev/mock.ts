// `npm run dev` only: an in-memory chrome.* with just what the settings page calls. Fake data, no real keys.
const store: Record<string, unknown> = { diagnosticsEnabled: true };

Object.assign(globalThis, {
  chrome: {
    i18n: { getUILanguage: () => navigator.language },
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(key => [key, store[key]])),
      set: async (values: Record<string, unknown>) => { Object.assign(store, values); }
    } },
    permissions: { request: async () => true },
    tabs: { create: async ({ url }: { url: string }) => { window.open(url, "_blank", "noopener"); } },
    runtime: { sendMessage: (_message: unknown, callback?: (value: unknown) => void) => callback?.({ connected: false, pending: 0 }) }
  }
});

export {};

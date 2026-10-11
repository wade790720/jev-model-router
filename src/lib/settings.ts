// Settings page actions. Kept out of React so they can be tested without a DOM.

export interface SettingsForm { typeSafeKey: string }
export type Status = { message: string; kind: "success" | "error" } | null;

export async function loadSettings(): Promise<SettingsForm> {
  const values = await chrome.storage.local.get(["typeSafeKey"]);
  return { typeSafeKey: String(values.typeSafeKey ?? "") };
}

// The hosted service is the default; a saved key switches routing to TypeSafe directly (route-draft.ts).
// An empty key is valid and means "use the hosted service".
export async function saveSettings(form: SettingsForm) {
  await chrome.storage.local.set({ typeSafeKey: form.typeSafeKey.trim() });
}

// Disables only the pending action, blocks repeat clicks on it and re-enables after success or failure.
export function createActionRunner(setBusy: (ids: ReadonlySet<string>) => void, setStatus: (status: Status) => void) {
  const pending = new Set<string>();
  return async (id: string, action: () => Promise<unknown>) => {
    if (pending.has(id)) return;
    pending.add(id); setBusy(new Set(pending));
    setStatus(null);
    try { await action(); }
    catch (error) { setStatus({ message: (error as Error).message, kind: "error" }); }
    finally { pending.delete(id); setBusy(new Set(pending)); }
  };
}

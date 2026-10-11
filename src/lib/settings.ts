// Settings page actions. Kept out of React so they can be tested without a DOM.
import { t } from "./i18n";

export interface SettingsForm { typeSafeKey: string }
export type Status = { message: string; kind: "success" | "error" } | null;

export async function loadSettings(): Promise<SettingsForm> {
  const values = await chrome.storage.local.get(["typeSafeKey"]);
  return { typeSafeKey: String(values.typeSafeKey ?? "") };
}

// The member's own TypeSafe key is the only mode: the hosted service is gone.
// connectionMode stays in storage so the content script and old installs read one value.
export async function saveSettings(form: SettingsForm) {
  if (!form.typeSafeKey.trim()) throw new Error(t("needTypeSafeKey"));
  await chrome.storage.local.set({ connectionMode: "personal", typeSafeKey: form.typeSafeKey.trim() });
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

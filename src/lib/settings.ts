// Settings page actions. Kept out of React so they can be tested without a DOM.
import { t } from "./i18n";
import { FIRST_SUGGESTION_KEY } from "./route-draft";

// TypeSafe docs, Quick start: "Get an API key from the TypeSafe console" links to this page.
export const KEYS_URL = "https://console.typesafe.ai/keys";
// GET /v1/models lists the models the key may use: it proves the key works without running a model.
export const MODELS_URL = "https://api.typesafe.ai/v1/models";
export const CLUB_URL = "https://www.skool.com/wonderpocket/about";
// TypeSafe has no pricing page (typesafe.ai/pricing is a 404); its price table ("Jev.Cost": input per
// million tokens, output free) is on the home page. Each account gets US$5 of free usage a month
// (confirmed by the maintainer; the public site does not state it).
export const PRICING_URL = "https://typesafe.ai/";

export interface Settings { typeSafeKey: string; tried: boolean }
export type Status = { message: string; kind: "success" | "error" } | null;

export async function loadSettings(): Promise<Settings> {
  const values = await chrome.storage.local.get(["typeSafeKey", FIRST_SUGGESTION_KEY]);
  return { typeSafeKey: String(values.typeSafeKey ?? ""), tried: Boolean(values[FIRST_SUGGESTION_KEY]) };
}

/** Calls `listener` when stored settings change, e.g. the first suggestion while the page is open. */
export function onSettingsChange(listener: () => void) {
  const handler = (_changes: unknown, area: string) => { if (area === "local") listener(); };
  chrome.storage.onChanged?.addListener(handler);
  return () => chrome.storage.onChanged?.removeListener(handler);
}

/** Plain-language problem with the key, or null when TypeSafe accepts it. */
export async function checkKey(key: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  } catch {
    return t("keyNetwork");
  }
  if (response.ok) return null;
  if (response.status === 401 || response.status === 403) return t("keyInvalid");
  if (response.status === 429) return t("keyRateLimit");
  if (response.status >= 500) return t("keyBusy");
  return t("keyFailed", { status: response.status });
}

export async function verifyAndSaveKey(raw: string) {
  const key = raw.trim();
  if (!key) throw new Error(t("keyEmpty"));
  const problem = await checkKey(key);
  if (problem) throw new Error(problem);
  await chrome.storage.local.set({ typeSafeKey: key });
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

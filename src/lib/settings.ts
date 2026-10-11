// Settings page actions. Kept out of React so they can be tested without a DOM.
import { SERVICE_CONFIG, type ServiceConfig } from "./config";
import { t } from "./i18n";

export interface SettingsForm { usePersonalKey: boolean; typeSafeKey: string; activationCode: string; workerUrl: string }
export type Status = { message: string; kind: "success" | "error" } | null;

export async function loadSettings() {
  const values = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl", "diagnosticsEnabled"]);
  return {
    usePersonalKey: values.connectionMode === "personal",
    typeSafeKey: String(values.typeSafeKey ?? ""),
    activationCode: String(values.activationCode ?? ""),
    workerUrl: String(values.workerUrl ?? ""),
    diagnosticsEnabled: values.diagnosticsEnabled !== false
  };
}

export function serviceOrigin(value: string): string {
  const base = value.trim().replace(/\/$/, "");
  if (!base) throw new Error(t("needServiceUrl"));
  let url: URL;
  try { url = new URL(base); }
  catch { throw new Error(t("rootUrlOnly")); }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(t("rootUrlOnly"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error(t("httpsOnly"));
  }
  return url.origin;
}

export async function saveSettings(form: SettingsForm, config: ServiceConfig = SERVICE_CONFIG) {
  const connectionMode = form.usePersonalKey ? "personal" : "subscription";
  const workerUrl = connectionMode === "subscription"
    ? serviceOrigin(config.serviceUrl || form.workerUrl)
    : form.workerUrl.trim().replace(/\/$/, "");
  if (connectionMode === "personal" && !form.typeSafeKey.trim()) throw new Error(t("needTypeSafeKey"));
  if (connectionMode === "subscription" && !form.activationCode.trim()) throw new Error(t("needActivationCode"));
  if (connectionMode === "subscription" && !await chrome.permissions.request({ origins: [`${workerUrl}/*`] })) {
    throw new Error(t("needServiceAccess"));
  }
  await chrome.storage.local.set({
    connectionMode,
    typeSafeKey: form.typeSafeKey.trim(),
    activationCode: form.activationCode.trim(),
    workerUrl
  });
}

export async function openSkool(config: ServiceConfig = SERVICE_CONFIG) {
  if (!config.skoolUrl) throw new Error(t("serviceNotReady"));
  const url = new URL(config.skoolUrl);
  if (url.protocol !== "https:" || !["skool.com", "www.skool.com"].includes(url.hostname)) throw new Error(t("serviceNotReady"));
  await chrome.tabs.create({ url: url.href });
}

// Remains unavailable until email ownership and membership verification exist.
export async function login(): Promise<never> {
  throw new Error(t("loginNotReady"));
}

export function diagnosticsStatus(): Promise<{ text: string; connected: boolean }> {
  const offline = { text: t("diagnosticsOffline", { count: "?" }), connected: false };
  return new Promise(resolve => {
    if (!chrome.runtime?.sendMessage) return resolve(offline);
    chrome.runtime.sendMessage({ type: "JEV_DIAGNOSTIC_STATUS" }, (result?: { connected: boolean; pending: number }) => {
      if (chrome.runtime.lastError || !result) return resolve(offline);
      resolve({ text: t(result.connected ? "diagnosticsOnline" : "diagnosticsOffline", { count: result.pending }), connected: result.connected });
    });
  });
}

export async function setDiagnosticsEnabled(enabled: boolean) {
  await chrome.storage.local.set({ diagnosticsEnabled: enabled });
}

export async function exportDiagnostics() {
  const values = await chrome.storage.local.get(["diagnosticEvents", "diagnosticStats"]);
  const url = URL.createObjectURL(new Blob([JSON.stringify({ events: values.diagnosticEvents ?? [], stats: values.diagnosticStats ?? {} }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "smart-chatgpt-diagnostics.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

const $ = id => document.getElementById(id);
const { locale, t } = globalThis.JevI18n;

document.documentElement.lang = locale;
document.title = t("optionsTitle");
for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);

const config = globalThis.SmartChatGPTConfig ?? {};
function selectedMode() { return $("usePersonalKey").checked ? "personal" : "subscription"; }
function renderMode() {
  const personal = selectedMode() === "personal";
  $("personalFields").hidden = !personal;
  $("subscriptionFields").hidden = personal;
}

function setStatus(message, kind = "success") {
  const status = $("status");
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
}

// Prevent duplicate actions while async storage or network work is pending.
async function runAction(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setStatus("");
  try { await action(); }
  catch (error) { setStatus(error.message, "error"); }
  finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function serviceOrigin() {
  const base = (config.serviceUrl || $("workerUrl").value).trim().replace(/\/$/, "");
  if (!base) throw new Error(t("needServiceUrl"));
  let url;
  try { url = new URL(base); }
  catch { throw new Error(t("rootUrlOnly")); }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(t("rootUrlOnly"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error(t("httpsOnly"));
  }
  return url.origin;
}

async function grantServiceAccess(origin) {
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) throw new Error(t("needServiceAccess"));
}

async function load() {
  const values = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl", "diagnosticsEnabled"]);
  $("usePersonalKey").checked = values.connectionMode === "personal";
  $("advanced").open = $("usePersonalKey").checked;
  for (const key of ["typeSafeKey", "activationCode", "workerUrl"]) $(key).value = values[key] ?? "";
  renderMode();
  $("diagnosticsEnabled").checked = values.diagnosticsEnabled !== false;
  refreshDiagnostics();
}

function refreshDiagnostics() {
  if (!chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: "JEV_DIAGNOSTIC_STATUS" }, result => {
    $("diagnosticsStatus").dataset.connected = String(!chrome.runtime.lastError && Boolean(result?.connected));
    if (chrome.runtime.lastError || !result) { $("diagnosticsStatus").textContent = t("diagnosticsOffline", { count: "?" }); return; }
    $("diagnosticsStatus").textContent = t(result.connected ? "diagnosticsOnline" : "diagnosticsOffline", { count: result.pending });
  });
}

async function exportDiagnostics() {
  const values = await chrome.storage.local.get(["diagnosticEvents", "diagnosticStats"]);
  const url = URL.createObjectURL(new Blob([JSON.stringify({ events: values.diagnosticEvents ?? [], stats: values.diagnosticStats ?? {} }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "smart-chatgpt-diagnostics.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function save() {
  const connectionMode = selectedMode();
  const workerUrl = connectionMode === "subscription" ? serviceOrigin() : $("workerUrl").value.trim().replace(/\/$/, "");
  if (connectionMode === "personal" && !$("typeSafeKey").value.trim()) throw new Error(t("needTypeSafeKey"));
  if (connectionMode === "subscription" && !$("activationCode").value.trim()) throw new Error(t("needActivationCode"));
  if (connectionMode === "subscription") {
    await grantServiceAccess(workerUrl);
  }
  await chrome.storage.local.set({
    connectionMode,
    typeSafeKey: $("typeSafeKey").value.trim(),
    activationCode: $("activationCode").value.trim(),
    workerUrl
  });
  setStatus(t("saved"));
}

async function subscribe() {
  if (!config.skoolUrl) throw new Error(t("serviceNotReady"));
  const url = new URL(config.skoolUrl);
  if (url.protocol !== "https:" || !["skool.com", "www.skool.com"].includes(url.hostname)) throw new Error(t("serviceNotReady"));
  await chrome.tabs.create({ url: url.href });
}
async function login() {
  // Remains unavailable until email ownership and membership verification exist.
  throw new Error(t("loginNotReady"));
}
$("usePersonalKey").addEventListener("change", () => { renderMode(); setStatus(""); });
$("login").addEventListener("click", () => runAction($("login"), login));
$("save").addEventListener("click", () => runAction($("save"), save));
$("subscribe").addEventListener("click", () => runAction($("subscribe"), subscribe));
$("diagnosticsEnabled").addEventListener("change", () => {
  chrome.storage.local.set({ diagnosticsEnabled: $("diagnosticsEnabled").checked })
    .then(refreshDiagnostics).catch(error => setStatus(error.message, "error"));
});
$("exportDiagnostics").addEventListener("click", () => runAction($("exportDiagnostics"), exportDiagnostics));
load().catch(error => setStatus(error.message, "error"));

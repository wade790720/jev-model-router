const $ = id => document.getElementById(id);
const { locale, t } = globalThis.JevI18n;

document.documentElement.lang = locale;
document.title = t("optionsTitle");
for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);

function selectedMode() {
  return document.querySelector('input[name="connectionMode"]:checked')?.value ?? "";
}

function renderMode() {
  const mode = selectedMode();
  $("personalFields").hidden = mode !== "personal";
  $("subscriptionFields").hidden = mode !== "subscription";
}

function setStatus(message, kind = "success") {
  const status = $("status");
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
}

function serviceOrigin() {
  const base = $("workerUrl").value.trim().replace(/\/$/, "");
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
  const values = await chrome.storage.local.get(["connectionMode", "typeSafeKey", "activationCode", "workerUrl"]);
  for (const input of document.querySelectorAll('input[name="connectionMode"]')) {
    input.checked = input.value === values.connectionMode;
  }
  for (const key of ["typeSafeKey", "activationCode", "workerUrl"]) $(key).value = values[key] ?? "";
  renderMode();
}

async function save() {
  const connectionMode = selectedMode();
  if (!connectionMode) throw new Error(t("needMode"));
  const workerUrl = connectionMode === "subscription" ? serviceOrigin() : $("workerUrl").value.trim().replace(/\/$/, "");
  if (connectionMode === "personal" && !$("typeSafeKey").value.trim()) throw new Error(t("needTypeSafeKey"));
  if (connectionMode === "subscription" && (!workerUrl || !$("activationCode").value.trim())) throw new Error(t("needSubscriptionDetails"));
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
  const origin = serviceOrigin();
  await grantServiceAccess(origin);
  const response = await fetch(`${origin}/api/checkout`, { method: "POST" });
  const body = await response.json();
  if (!response.ok || !body.url) throw new Error(t("checkoutFailed"));
  await chrome.tabs.create({ url: body.url });
}

async function manage() {
  const origin = serviceOrigin();
  const code = $("activationCode").value.trim();
  if (!code) throw new Error(t("needActivationCode"));
  await grantServiceAccess(origin);
  const response = await fetch(`${origin}/api/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${code}` }
  });
  const body = await response.json();
  if (!response.ok || !body.url) throw new Error(t("manageFailed"));
  await chrome.tabs.create({ url: body.url });
}

for (const input of document.querySelectorAll('input[name="connectionMode"]')) {
  input.addEventListener("change", () => { renderMode(); setStatus(""); });
}
$("save").addEventListener("click", () => save().catch(error => setStatus(error.message, "error")));
$("subscribe").addEventListener("click", () => subscribe().catch(error => setStatus(error.message, "error")));
$("manage").addEventListener("click", () => manage().catch(error => setStatus(error.message, "error")));
load().catch(error => setStatus(error.message, "error"));

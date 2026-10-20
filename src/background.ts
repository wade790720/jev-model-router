// Service worker: routes drafts for the content script, and opens settings on install.
import { FIRST_SUGGESTION_KEY, routeDraft, type CodedError } from "@/lib/route-draft";

function errorCode(error: CodedError) {
  if (error.code) return error.code;
  if (error.name === "AbortError") return "routing_timeout";
  if (error.name === "TypeError") return "routing_network";
  return /Jev returned/.test(error.message) ? "routing_invalid" : "routing_error";
}

// A fresh install starts on the settings page, where the onboarding asks for a TypeSafe key.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage();
});

async function markFirstSuggestion() {
  if (!(await chrome.storage.local.get([FIRST_SUGGESTION_KEY]))[FIRST_SUGGESTION_KEY]) {
    await chrome.storage.local.set({ [FIRST_SUGGESTION_KEY]: Date.now() });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JEV_ROUTE") {
    routeDraft(message.text, message.surface)
      .then(result => { sendResponse({ ok: true, result }); return markFirstSuggestion(); })
      .catch((error: CodedError) => sendResponse({ ok: false,
        error: error.name === "AbortError" ? "JEV 回應逾時" : error.message, code: errorCode(error) }));
    return true;
  }
  return false;
});

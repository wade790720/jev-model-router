// Service worker: routes drafts for the content script and opens settings.
import { routeDraft, type CodedError } from "@/lib/route-draft";

function errorCode(error: CodedError) {
  if (error.code) return error.code;
  if (error.name === "AbortError") return "routing_timeout";
  if (error.name === "TypeError") return "routing_network";
  return /Jev returned/.test(error.message) ? "routing_invalid" : "routing_error";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JEV_ROUTE") {
    routeDraft(message.text, message.surface)
      .then(result => sendResponse({ ok: true, result }))
      .catch((error: CodedError) => sendResponse({ ok: false,
        error: error.name === "AbortError" ? "JEV 回應逾時" : error.message, code: errorCode(error) }));
    return true;
  }
  if (message?.type === "JEV_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

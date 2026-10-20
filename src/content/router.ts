// Recommendation-only: reads the ChatGPT draft and shows Jev's suggestion. Never clicks,
// focuses, synthesizes keys or sends. A factory (not top-level code) so tests get fresh state.
import { locale, t, type MessageKey } from "@/lib/i18n";
import { MODE_TITLES, type ChatMode, type Recommendation, type Surface, type TopChoice } from "@/lib/route";

const DEBOUNCE_MS = 950;
const IME_COMMIT_GUARD_MS = 300;
const BADGE_ID = "jev-model-router-badge";
export const WORK_TARGETS: Readonly<Record<string, { models: string[]; effort: "low" | "medium" | "xhigh" }>> = {
  luna: { models: ["GPT-6 Luna"], effort: "low" },
  sol_low: { models: ["GPT-6.1 Sol", "GPT-6 Sol"], effort: "low" },
  sol_medium: { models: ["GPT-6.1 Sol", "GPT-6 Sol"], effort: "medium" },
  astra_low: { models: ["GPT-6 Astra"], effort: "low" },
  astra_medium: { models: ["GPT-6 Astra"], effort: "medium" },
  astra_xhigh: { models: ["GPT-6 Astra"], effort: "xhigh" }
};
const EFFORT_KEYS = { low: "effortLow", medium: "effortMedium", xhigh: "effortXhigh" } as const;

type Kind = "loading" | "success" | "warning" | "error";
type CodedError = Error & { code?: string };
type RuntimeResponse = { ok?: boolean; result?: Recommendation; error?: string; code?: string };

const workModeTitle = (mode: string) => {
  const target = WORK_TARGETS[mode];
  return target ? `${target.models[0]} · ${t(EFFORT_KEYS[target.effort])}` : mode;
};
const chatTitle = (mode: string) => MODE_TITLES[mode as ChatMode];
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value: unknown) => clean(value).toLocaleLowerCase();
const elementLabel = (element: Element | null | undefined) =>
  clean(`${element?.getAttribute?.("aria-label") ?? ""} ${(element as HTMLElement | null)?.innerText ?? element?.textContent ?? ""}`);
const isVisible = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
};
const isUsable = (element: Element) => isVisible(element) && element.getAttribute("aria-hidden") !== "true" && !element.closest("[inert], [aria-hidden='true']");
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const within = (composer: HTMLElement, target: EventTarget | null) => target === composer || composer.contains(target as Node);

export function createRouter() {
  const state = {
    composer: null as HTMLElement | null,
    text: "",
    surface: "chat" as Surface,
    choices: [] as TopChoice[],
    version: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    active: null as { text: string; surface: Surface; version: number; promise: Promise<boolean> } | null,
    appliedText: "",
    failedText: "",
    composing: false,
    compositionEndAt: 0,
    badge: null as HTMLDivElement | null,
    disconnected: false,
    pollTimer: undefined as ReturnType<typeof setInterval> | undefined
  };

  function findComposer(): HTMLElement | null {
    const known = all('#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown][contenteditable="true"]').find(isVisible);
    if (known) return known;
    return all('[contenteditable="true"][role="textbox"], textarea').find(element => {
      if (!isVisible(element) || element.closest(`#${BADGE_ID}`)) return false;
      let scope = element.parentElement;
      for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
        if (scope.querySelector('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[type="submit"]')) return true;
      }
      return false;
    }) ?? null;
  }

  function readText(composer = state.composer) {
    if (!composer) return "";
    return String(composer instanceof HTMLTextAreaElement ? composer.value : composer.innerText ?? "").trim();
  }

  function inWorkMode() {
    // Existing conversations can omit the Chat/Work toggle entirely. The
    // composer model is stronger evidence than unrelated two-button groups.
    const triggers = [...all('[data-composer-navigation-target="reasoning"]'),
      ...all('button[data-testid*="model-switcher"], button[data-testid*="model-picker"]')];
    let trigger: HTMLElement | null | undefined = triggers.find(isVisible);
    if (!trigger && state.composer) {
      try { trigger = findModelButton(); } catch { /* Composer can disappear during navigation. */ }
    }
    if (selectedWorkModel(trigger)) return true;
    if (all('[data-reasoning-slider="true"]').some(element => isUsable(element) && selectedWorkModel(element))) return true;
    for (const group of all('[role="group"]')) {
      const buttons = [...group.querySelectorAll<HTMLElement>(":scope > button[aria-pressed]")];
      const labels = buttons.map(button => lower(button.innerText ?? button.textContent ?? button.getAttribute("aria-label")));
      if (buttons.length === 2 && labels.some(label => /^(?:chat|對話|对话|チャット|채팅|대화)$/.test(label)) &&
          labels.some(label => /^(?:work|工作|作業|仕事|작업)$/.test(label))) {
        return buttons.some((button, index) => /^(?:work|工作|作業|仕事|작업)$/.test(labels[index]) && button.getAttribute("aria-pressed") === "true");
      }
    }
    return all('button[aria-pressed="true"]').some(button => ["work", "工作"].includes(lower(button.innerText ?? button.textContent)));
  }

  function badge(): HTMLDivElement {
    if (state.badge?.isConnected) return state.badge;
    const node = document.createElement("div");
    node.id = BADGE_ID;
    node.lang = locale();
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    document.body.appendChild(node);
    state.badge = node;
    positionBadge();
    return node;
  }

  // The orb icon names the badge's source; its alt keeps the product name for screen readers.
  // After an extension reload chrome.runtime.getURL is gone, so fall back to the name as text.
  function brandMark(): Node {
    let src: string | undefined;
    try { src = globalThis.chrome?.runtime?.getURL?.("icons/icon-32.png"); } catch { /* orphaned script */ }
    if (!src) return document.createTextNode(`${t("productName")} · `);
    const icon = document.createElement("img");
    icon.className = "jev-alert-icon";
    icon.src = src;
    icon.alt = t("productName");
    return icon;
  }

  function positionBadge() {
    if (!state.composer || !state.badge?.isConnected) return;
    const rect = (state.composer.closest("form") ?? state.composer).getBoundingClientRect();
    const top = Math.max(8, rect.top - state.badge.offsetHeight - 8);
    state.badge.style.top = `${top}px`;
    state.badge.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  }

  function show(message: string, kind: Kind = "loading", choices: TopChoice[] = state.choices) {
    const node = badge();
    node.replaceChildren();
    node.dataset.kind = kind;
    node.hidden = !state.composer || !state.text;
    node.title = message;
    const title = document.createElement("div");
    title.className = "jev-alert-title";
    const light = document.createElement("span");
    light.className = "jev-status-light";
    light.setAttribute("aria-hidden", "true");
    const titleText = document.createElement("span");
    titleText.className = "jev-alert-status";
    titleText.append(brandMark(), message);
    // No settings button: settings open from the toolbar popup.
    title.append(light, titleText);
    node.append(title);
    if (choices?.length) {
      const list = document.createElement("div");
      list.className = "jev-probabilities";
      list.setAttribute("aria-label", t("probabilities"));
      for (const { mode, probability } of choices.slice(0, 3)) {
        const row = document.createElement("div");
        row.className = "jev-probability";
        const name = document.createElement("span");
        name.textContent = state.surface === "work" ? workModeTitle(mode) : chatTitle(mode) ?? mode;
        name.title = name.textContent;
        const percent = document.createElement("strong");
        percent.textContent = `${Math.round(probability * 100)}%`;
        row.append(name, percent);
        list.append(row);
      }
      node.append(list);
    }
    positionBadge();
  }

  function resetDraft() {
    clearTimeout(state.timer);
    state.version++;
    state.text = "";
    state.choices = [];
    state.appliedText = "";
    state.failedText = "";
    if (state.badge) state.badge.hidden = true;
  }

  function onDraftChange(force = false) {
    if (state.disconnected || state.composing) return;
    const next = readText();
    const surface: Surface = inWorkMode() ? "work" : "chat";
    if (!force && next === state.text && surface === state.surface) return;
    if (!next) { resetDraft(); return; }
    state.text = next;
    state.surface = surface;
    state.choices = [];
    state.version++;
    state.appliedText = "";
    state.failedText = "";
    clearTimeout(state.timer);
    show(t("analyzing"), "loading");
    const version = state.version;
    state.timer = setTimeout(() => routeDraft(next, version), DEBOUNCE_MS);
  }

  function disconnectRuntime() {
    if (state.disconnected) return;
    state.disconnected = true;
    state.version++;
    clearTimeout(state.timer);
    globalThis.clearInterval?.(state.pollTimer);
    state.choices = [];
    if (state.composer && state.text) show(t("extensionReloaded"), "warning", []);
  }

  function sendRuntime(message: object): Promise<RuntimeResponse | undefined> {
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        if (!globalThis.chrome?.runtime?.sendMessage || /extension context invalidated/i.test(error.message)) disconnectRuntime();
        reject(error);
      };
      try {
        const runtime = globalThis.chrome?.runtime;
        if (typeof runtime?.sendMessage !== "function") {
          fail(new Error("Extension context invalidated"));
          return;
        }
        runtime.sendMessage(message, (response?: RuntimeResponse) => {
          try {
            if (!globalThis.chrome?.runtime?.sendMessage) {
              fail(new Error("Extension context invalidated"));
            } else if (runtime.lastError) {
              fail(new Error(runtime.lastError.message));
            } else resolve(response);
          } catch (error) { fail(error as Error); }
        });
      } catch (error) { fail(error as Error); }
    });
  }

  async function callBackground(text: string, surface: Surface): Promise<Recommendation> {
    const response = await sendRuntime({ type: "JEV_ROUTE", text, surface });
    if (!response?.ok || !response.result) throw Object.assign(new Error(response?.error ?? "JEV 回應失敗"), { code: response?.code });
    return response.result;
  }

  function routingFailure(code: string): { message: string; kind: Kind } {
    const messages: Record<string, MessageKey> = {
      routing_key_missing: "routeKeyMissing",
      routing_auth: "routeAuth",
      routing_rate_limit: "routeRateLimit",
      routing_timeout: "routeTimeout",
      routing_network: "routeNetwork",
      routing_invalid: "routeInvalid"
    };
    // Setup problems (no key yet) are amber: the user can fix them, nothing failed.
    const setup = code === "routing_key_missing";
    return { message: t(messages[code] ?? "routeFailed"), kind: setup ? "warning" : "error" };
  }

  function inDraft(text: string, version: number, surface = state.surface) {
    return !state.disconnected && !state.composing && text === state.text && version === state.version && surface === state.surface;
  }

  async function routeDraft(text: string, version = state.version): Promise<boolean> {
    if (state.disconnected || state.composing || !text) return false;
    if (state.appliedText === text) return true;
    const surface = state.surface;
    if (state.active?.text === text && state.active.surface === surface && state.active.version === version) return state.active.promise;
    const promise = (async () => {
      try {
        show(t("analyzing"), "loading");
        const result = await callBackground(text, surface);
        if (!inDraft(text, version, surface)) return false;
        if ((inWorkMode() ? "work" : "chat") !== surface) {
          onDraftChange(true); return false;
        }
        const mode = result.mode;
        if (surface === "work" ? !WORK_TARGETS[mode] : !chatTitle(mode)) throw new Error(t("unknownMode"));
        state.choices = Array.isArray(result.topChoices) ? result.topChoices : [];
        const title = surface === "work" ? workModeTitle(mode) : chatTitle(mode);
        state.appliedText = text;
        state.failedText = "";
        show(t(result.lowConfidence ? "lowConfidenceRecommendation" : "recommendation", { model: title }),
          result.lowConfidence ? "warning" : "success");
        return true;
      } catch (error) {
        if (inDraft(text, version, surface)) {
          const code = (error as CodedError).code ?? "routing_error";
          state.failedText = text;
          const failure = routingFailure(code);
          show(failure.message, failure.kind, []);
          // Only fixed, localized text and a code: never display provider payloads.
          badge().title = failure.message + " [" + code + "]";
        }
        return false;
      }
    })();
    state.active = { text, surface, version, promise };
    try { return await promise; }
    finally { if (state.active?.promise === promise) state.active = null; }
  }

  function nearbyButtons() {
    if (!state.composer) return [];
    const rect = state.composer.getBoundingClientRect();
    return all("button, [role='button']")
      .filter(element => !element.closest(`#${BADGE_ID}`) && isVisible(element))
      .map(element => {
        const box = element.getBoundingClientRect();
        const distance = Math.abs(box.left - rect.left) + Math.abs(box.top - rect.top);
        return { element, distance, label: lower(elementLabel(element)) };
      })
      .filter(item => item.distance < 550)
      .sort((a, b) => a.distance - b.distance);
  }

  function findModelButton(): HTMLElement | null {
    const composerTrigger = all('[data-composer-navigation-target="reasoning"]').find(isVisible);
    if (composerTrigger) return composerTrigger;
    const tested = all('button[data-testid*="model-switcher"], button[data-testid*="model-picker"], [role="button"][data-testid*="model-switcher"]')
      .find(isVisible);
    if (tested) return tested;
    const relevant = /model|模式|模型|power|instant|medium|high|thinking|pro standard|pro extended|GPT-\d+(?:\.\d+)?\s+(?:Astra|Sol|Luna)/i;
    const nearby = nearbyButtons().find(item => relevant.test(item.label));
    if (nearby) return nearby.element;
    return all("button, [role='button']")
      .filter(element => isVisible(element) && relevant.test(lower(elementLabel(element))) && !element.closest("[role='menu'], [role='dialog'], article"))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] ?? null;
  }

  function selectedWorkModel(button: Element | null | undefined) {
    return elementLabel(button).match(/GPT-\d+(?:\.\d+)?\s+(?:Astra|Sol|Luna)/i)?.[0] ?? null;
  }

  document.addEventListener("input", event => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (composer && within(composer, event.target)) {
      state.composer = composer;
      if ((event as InputEvent).isComposing) {
        if (!state.composing) state.version++;
        state.composing = true;
        clearTimeout(state.timer);
        return;
      }
      onDraftChange();
    }
  }, true);

  document.addEventListener("compositionstart", event => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (!composer || !within(composer, event.target)) return;
    state.composer = composer;
    state.composing = true;
    state.version++;
    clearTimeout(state.timer);
  }, true);

  document.addEventListener("compositionend", event => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (!composer || !within(composer, event.target)) return;
    state.composer = composer;
    state.composing = false;
    state.compositionEndAt = Date.now();
    onDraftChange(true);
  }, true);

  document.addEventListener("focusout", event => {
    if (state.composer && within(state.composer, event.target)) state.composing = false;
  }, true);

  document.addEventListener("keydown", event => {
    if (state.disconnected) return;
    if (event.key !== "Enter" || event.shiftKey || !event.isTrusted) return;
    const composer = findComposer();
    if (composer && within(composer, event.target)) {
      state.composer = composer;
      if (state.composing || event.isComposing || event.keyCode === 229 ||
          (state.compositionEndAt && Date.now() - state.compositionEndAt < IME_COMMIT_GUARD_MS)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Deliberate sends are entirely owned by ChatGPT; never wait for routing.
    }
  }, true);

  state.pollTimer = setInterval(() => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (composer !== state.composer) {
      state.composer = composer;
      if (composer) onDraftChange();
    } else if (composer) {
      onDraftChange();
    }
    if (state.badge) {
      state.badge.hidden = !composer || !state.text;
      positionBadge();
    }
  }, 750);

  return { state, routeDraft, routingFailure, onDraftChange, readText, show, inWorkMode, sendRuntime };
}

(() => {
  "use strict";

  const DEBOUNCE_MS = 950;
  const IME_COMMIT_GUARD_MS = 300;
  const { locale, t } = globalThis.JevI18n;
  const TITLES = { instant: "Instant", medium: "Medium", high: "High", pro: "Pro Standard" };
  const WORK_TARGETS = {
    luna: { models: ["GPT-6 Luna"], effort: "low" },
    sol_low: { models: ["GPT-6.1 Sol", "GPT-6 Sol"], effort: "low" },
    sol_medium: { models: ["GPT-6.1 Sol", "GPT-6 Sol"], effort: "medium" },
    astra_low: { models: ["GPT-6 Astra"], effort: "low" },
    astra_medium: { models: ["GPT-6 Astra"], effort: "medium" },
    astra_xhigh: { models: ["GPT-6 Astra"], effort: "xhigh" }
  };
  const workModeTitle = mode => {
    const target = WORK_TARGETS[mode];
    if (!target) return mode;
    const effort = { low: "effortLow", medium: "effortMedium", xhigh: "effortXhigh" }[target.effort];
    return effort ? `${target.models[0]} · ${t(effort)}` : target.models[0];
  };
  const state = {
    composer: null,
    text: "",
    surface: "chat",
    choices: [],
    version: 0,
    timer: null,
    active: null,
    appliedText: "",
    failedText: "",
    composing: false,
    compositionEndAt: 0,
    badge: null,
    disconnected: false,
    pollTimer: null
  };

  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const lower = value => clean(value).toLocaleLowerCase();
  const elementLabel = element => clean(`${element?.getAttribute?.("aria-label") ?? ""} ${element?.innerText ?? element?.textContent ?? ""}`);
  const isVisible = element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  };
  const isUsable = element => isVisible(element) && element.getAttribute("aria-hidden") !== "true" && !element.closest("[inert], [aria-hidden='true']");

  function findComposer() {
    const known = [...document.querySelectorAll('#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown][contenteditable="true"]')]
      .find(isVisible);
    if (known) return known;
    return [...document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')]
      .find(element => {
        if (!isVisible(element) || element.closest("#jev-model-router-badge")) return false;
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
    const triggers = [...document.querySelectorAll('[data-composer-navigation-target="reasoning"]'),
      ...document.querySelectorAll('button[data-testid*="model-switcher"], button[data-testid*="model-picker"]')];
    let trigger = triggers.find(isVisible);
    if (!trigger && state.composer) {
      try { trigger = findModelButton(); } catch { /* Composer can disappear during navigation. */ }
    }
    if (selectedWorkModel(trigger)) return true;
    if ([...document.querySelectorAll('[data-reasoning-slider="true"]')].some(element => isUsable(element) && selectedWorkModel(element))) return true;
    for (const group of document.querySelectorAll('[role="group"]')) {
      const buttons = [...group.querySelectorAll(':scope > button[aria-pressed]')];
      const labels = buttons.map(button => lower(button.innerText ?? button.textContent ?? button.getAttribute("aria-label")));
      if (buttons.length === 2 && labels.some(label => /^(?:chat|對話|对话|チャット|채팅|대화)$/.test(label)) &&
          labels.some(label => /^(?:work|工作|作業|仕事|작업)$/.test(label))) {
        return buttons.some((button, index) => /^(?:work|工作|作業|仕事|작업)$/.test(labels[index]) && button.getAttribute("aria-pressed") === "true");
      }
    }
    return [...document.querySelectorAll('button[aria-pressed="true"]')]
      .some(button => ["work", "工作"].includes(lower(button.innerText ?? button.textContent)));
  }

  function badge() {
    if (state.badge?.isConnected) return state.badge;
    const node = document.createElement("div");
    node.id = "jev-model-router-badge";
    node.lang = locale;
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    document.body.appendChild(node);
    state.badge = node;
    positionBadge();
    return node;
  }

  function positionBadge() {
    if (!state.composer || !state.badge?.isConnected) return;
    const rect = (state.composer.closest("form") ?? state.composer).getBoundingClientRect();
    const top = Math.max(8, rect.top - state.badge.offsetHeight - 8);
    state.badge.style.top = `${top}px`;
    state.badge.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  }

  function show(message, kind = "loading", choices = state.choices) {
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
    titleText.textContent = `JEV · ${message}`;
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "jev-alert-action";
    settings.textContent = t("settings");
    settings.setAttribute("aria-label", t("settingsAria"));
    settings.disabled = state.disconnected;
    settings.addEventListener("click", () => {
      sendRuntime({ type: "JEV_OPEN_OPTIONS" }).catch(() => {
        if (!state.disconnected) show(t("settingsUnavailable"), "warning");
      });
    });
    title.append(light, titleText, settings);
    node.append(title);
    if (choices?.length) {
      const list = document.createElement("div");
      list.className = "jev-probabilities";
      list.setAttribute("aria-label", t("probabilities"));
      for (const { mode, probability } of choices.slice(0, 3)) {
        const row = document.createElement("div");
        row.className = "jev-probability";
        const name = document.createElement("span");
        name.textContent = state.surface === "work" ? workModeTitle(mode) : TITLES[mode] ?? mode;
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
    const surface = inWorkMode() ? "work" : "chat";
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

  function sendRuntime(message) {
    return new Promise((resolve, reject) => {
      const fail = error => {
        if (!globalThis.chrome?.runtime?.sendMessage || /extension context invalidated/i.test(error.message)) disconnectRuntime();
        reject(error);
      };
      try {
        const runtime = globalThis.chrome?.runtime;
        if (typeof runtime?.sendMessage !== "function") {
          fail(new Error("Extension context invalidated"));
          return;
        }
        runtime.sendMessage(message, response => {
          try {
            if (!globalThis.chrome?.runtime?.sendMessage) {
              fail(new Error("Extension context invalidated"));
            } else if (runtime.lastError) {
              fail(new Error(runtime.lastError.message));
            } else resolve(response);
          } catch (error) { fail(error); }
        });
      } catch (error) { fail(error); }
    });
  }

  async function callBackground(text, surface) {
    const response = await sendRuntime({ type: "JEV_ROUTE", text, surface });
    if (!response?.ok) throw Object.assign(new Error(response?.error ?? "JEV 回應失敗"), { code: response?.code });
    return response.result;
  }

  function routingFailure(code) {
    const messages = {
      routing_consent: "routeConsent",
      routing_key_missing: "routeKeyMissing",
      routing_service_unconfigured: "routeServiceNotReady",
      routing_membership_missing: "routeMembershipMissing",
      routing_auth: "routeAuth",
      routing_rate_limit: "routeRateLimit",
      routing_timeout: "routeTimeout",
      routing_network: "routeNetwork",
      routing_invalid: "routeInvalid"
    };
    const setup = ["routing_consent", "routing_key_missing", "routing_service_unconfigured", "routing_membership_missing"].includes(code);
    return { message: t(messages[code] ?? "routeFailed"), kind: setup ? "warning" : "error" };
  }

  function diagnosticSnapshot() {
    const button = findModelButton();
    const text = clean(button?.innerText ?? button?.textContent);
    const items = visibleMenuItems();
    return {
      after: selectedWorkModel(button) ?? text.match(/^(?:Extra High|Pro Standard|Pro Extended|Instant|Medium|High|Thinking|Pro)\b/i)?.[0] ?? "unknown",
      effort: lower(button?.getAttribute?.("data-selected-reasoning-effort")),
      triggerFound: Boolean(button), menuOpen: button?.getAttribute?.("aria-expanded") === "true",
      sliderFound: [...document.querySelectorAll('[data-reasoning-slider="true"]')].some(isUsable),
      menuItemCount: items.length,
      availableModels: items.map(item => selectedWorkModel(item) ?? clean(item.innerText ?? item.textContent).match(/^(?:Extra High|Pro Standard|Pro Extended|Instant|Medium|High|Thinking|Pro)\b/i)?.[0]).filter(Boolean)
    };
  }

  function recordDiagnostic(event) {
    if (state.disconnected) return;
    sendRuntime({ type: "JEV_DIAGNOSTIC", event: { ...event, locale } })
      .catch(() => { /* Diagnostics must never interrupt drafting or sending. */ });
  }

  function inDraft(text, version, surface = state.surface) {
    return !state.disconnected && !state.composing && text === state.text && version === state.version && surface === state.surface;
  }

  async function routeDraft(text, version = state.version) {
    if (state.disconnected || state.composing || !text) return false;
    if (state.appliedText === text) return true;
    const surface = state.surface;
    if (state.active?.text === text && state.active.surface === surface && state.active.version === version) return state.active.promise;
    const promise = (async () => {
      const started = Date.now();
      let outcome = "cancelled", code = "none", target = "unknown";
      try {
        show(t("analyzing"), "loading");
        const result = await callBackground(text, surface);
        if (!inDraft(text, version, surface)) return false;
        if ((inWorkMode() ? "work" : "chat") !== surface) {
          code = "surface_changed"; onDraftChange(true); return false;
        }
        const mode = result.mode;
        target = mode;
        if (surface === "work" ? !WORK_TARGETS[mode] : !TITLES[mode]) throw new Error(t("unknownMode"));
        state.choices = Array.isArray(result.topChoices) ? result.topChoices : [];
        const title = surface === "work" ? workModeTitle(mode) : TITLES[mode];
        state.appliedText = text;
        state.failedText = "";
        outcome = "suggested";
        show(t(result.lowConfidence ? "lowConfidenceRecommendation" : "recommendation", { model: title }),
          result.lowConfidence ? "warning" : "success");
        return true;
      } catch (error) {
        if (inDraft(text, version, surface)) {
          outcome = "failure";
          code = error.code ?? "routing_error";
          state.failedText = text;
          const failure = routingFailure(code);
          show(failure.message, failure.kind, []);
          // Only fixed, localized text and a code: never display provider payloads.
          state.badge.title = failure.message + " [" + code + "]";
        }
        return false;
      } finally {
        try { recordDiagnostic({ surface, outcome, code, stage: outcome === "suggested" ? "complete" : "routing",
          target, elapsedMs: Date.now() - started, ...diagnosticSnapshot() }); }
        catch { /* Diagnostics must never interrupt the draft. */ }
      }
    })();
    state.active = { text, surface, version, promise };
    try { return await promise; }
    finally { if (state.active?.promise === promise) state.active = null; }
  }

  function nearbyButtons() {
    if (!state.composer) return [];
    const rect = state.composer.getBoundingClientRect();
    return [...document.querySelectorAll("button, [role='button']")]
      .filter(element => !element.closest("#jev-model-router-badge") && isVisible(element))
      .map(element => {
        const box = element.getBoundingClientRect();
        const distance = Math.abs(box.left - rect.left) + Math.abs(box.top - rect.top);
        return { element, distance, label: lower(elementLabel(element)) };
      })
      .filter(item => item.distance < 550)
      .sort((a, b) => a.distance - b.distance);
  }

  function findModelButton() {
    const composerTrigger = [...document.querySelectorAll('[data-composer-navigation-target="reasoning"]')].find(isVisible);
    if (composerTrigger) return composerTrigger;
    const tested = [...document.querySelectorAll('button[data-testid*="model-switcher"], button[data-testid*="model-picker"], [role="button"][data-testid*="model-switcher"]')]
      .find(isVisible);
    if (tested) return tested;
    const options = nearbyButtons();
    const relevant = /model|模式|模型|power|instant|medium|high|thinking|pro standard|pro extended|GPT-\d+(?:\.\d+)?\s+(?:Astra|Sol|Luna)/i;
    const nearby = options.find(item => relevant.test(item.label));
    if (nearby) return nearby.element;
    return [...document.querySelectorAll("button, [role='button']")]
      .filter(element => isVisible(element) && relevant.test(lower(elementLabel(element))) && !element.closest("[role='menu'], [role='dialog'], article"))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] ?? null;
  }

  function visibleMenuItems() {
    return [...document.querySelectorAll("[role='menuitem'], [role='option'], [role='menuitemradio'], [role='radio'], [data-radix-collection-item]")]
      .filter(isUsable);
  }

  function selectedWorkModel(button) {
    return elementLabel(button).match(/GPT-\d+(?:\.\d+)?\s+(?:Astra|Sol|Luna)/i)?.[0] ?? null;
  }

  document.addEventListener("input", event => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (composer && (event.target === composer || composer.contains(event.target))) {
      state.composer = composer;
      if (event.isComposing) {
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
    if (!composer || (event.target !== composer && !composer.contains(event.target))) return;
    state.composer = composer;
    state.composing = true;
    state.version++;
    clearTimeout(state.timer);
  }, true);

  document.addEventListener("compositionend", event => {
    if (state.disconnected) return;
    const composer = findComposer();
    if (!composer || (event.target !== composer && !composer.contains(event.target))) return;
    state.composer = composer;
    state.composing = false;
    state.compositionEndAt = Date.now();
    onDraftChange(true);
  }, true);

  document.addEventListener("focusout", event => {
    if (state.composer && (event.target === state.composer || state.composer.contains(event.target))) {
      state.composing = false;
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (state.disconnected) return;
    if (event.key !== "Enter" || event.shiftKey || !event.isTrusted) return;
    const composer = findComposer();
    if (composer && (event.target === composer || composer.contains(event.target))) {
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
})();

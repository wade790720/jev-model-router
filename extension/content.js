(() => {
  "use strict";

  const DEBOUNCE_MS = 950;
  const IME_COMMIT_GUARD_MS = 300;
  const { locale, t } = globalThis.JevI18n;
  const KNOWN_LABELS = ["Instant", "Medium", "High", "Extra High", "Thinking", "Pro", "Pro Standard", "Pro Extended"];
  const TARGET_LABELS = {
    instant: ["Instant"],
    medium: ["Medium", "Thinking Standard", "Thinking"],
    high: ["High", "Thinking Extended", "Extra High"],
    pro: ["Pro Standard", "Pro Extended", "Pro", "Extra High", "High"]
  };
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
    partialText: "",
    manualOverride: false,
    switching: false,
    focusIntentVersion: 0,
    composing: false,
    compositionEndAt: 0,
    sendQueued: false,
    bypassNextSend: false,
    badge: null
  };

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    for (const group of document.querySelectorAll('[role="group"]')) {
      const buttons = [...group.querySelectorAll(':scope > button[aria-pressed]')];
      if (buttons.length === 2) return buttons[1].getAttribute("aria-pressed") === "true";
    }
    return [...document.querySelectorAll('button[aria-pressed="true"]')]
      .some(button => ["work", "工作"].includes(lower(button.innerText ?? button.textContent)));
  }

  function badge() {
    if (state.badge?.isConnected) return state.badge;
    const node = document.createElement("div");
    node.id = "jev-model-router-badge";
    node.lang = locale;
    node.setAttribute("role", "alert");
    node.setAttribute("aria-live", "polite");
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
    settings.addEventListener("click", () => chrome.runtime.sendMessage({ type: "JEV_OPEN_OPTIONS" }));
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
    state.partialText = "";
    state.manualOverride = false;
    state.bypassNextSend = false;
    state.sendQueued = false;
    if (state.badge) state.badge.hidden = true;
  }

  function onDraftChange(force = false) {
    if (state.composing) return;
    const next = readText();
    const surface = inWorkMode() ? "work" : "chat";
    if (!force && next === state.text && surface === state.surface) return;
    if (!next) { resetDraft(); return; }
    if (surface !== state.surface) state.manualOverride = false;
    state.text = next;
    state.surface = surface;
    state.choices = [];
    state.version++;
    state.appliedText = "";
    state.failedText = "";
    state.partialText = "";
    state.bypassNextSend = false;
    clearTimeout(state.timer);
    if (state.manualOverride) { show(t("manual"), "manual"); return; }
    show(t("analyzing"), "loading");
    const version = state.version;
    state.timer = setTimeout(() => routeDraft(next, version), DEBOUNCE_MS);
  }

  function callBackground(text, surface) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "JEV_ROUTE", text, surface }, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!response?.ok) reject(new Error(response?.error ?? "JEV 回應失敗"));
        else resolve(response.result);
      });
    });
  }

  function inDraft(text, version, surface = state.surface) {
    return !state.manualOverride && text === state.text && version === state.version && surface === state.surface;
  }

  function captureComposerFocus(text, version) {
    const composer = state.composer;
    if (!composer || (document.activeElement !== composer && !composer.contains?.(document.activeElement))) return null;
    const snapshot = { composer, text, version, focusIntentVersion: state.focusIntentVersion };
    if (composer instanceof HTMLTextAreaElement) {
      snapshot.selectionStart = composer.selectionStart;
      snapshot.selectionEnd = composer.selectionEnd;
      snapshot.selectionDirection = composer.selectionDirection;
    } else {
      const selection = document.getSelection?.();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        if (composer.contains?.(range.startContainer) && composer.contains?.(range.endContainer)) {
          snapshot.range = range.cloneRange();
        }
      }
    }
    return snapshot;
  }

  function restoreComposerFocus(snapshot) {
    if (!snapshot || state.sendQueued || state.composing || state.manualOverride ||
        state.focusIntentVersion !== snapshot.focusIntentVersion ||
        state.composer !== snapshot.composer || !snapshot.composer.isConnected ||
        state.version !== snapshot.version || state.text !== snapshot.text ||
        readText(snapshot.composer) !== snapshot.text ||
        document.activeElement === snapshot.composer || snapshot.composer.contains?.(document.activeElement)) return;
    snapshot.composer.focus({ preventScroll: true });
    if (snapshot.selectionStart !== undefined) {
      snapshot.composer.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection);
    } else if (snapshot.range?.startContainer.isConnected && snapshot.range.endContainer.isConnected &&
               snapshot.composer.contains?.(snapshot.range.startContainer) &&
               snapshot.composer.contains?.(snapshot.range.endContainer)) {
      const selection = document.getSelection?.();
      selection?.removeAllRanges();
      selection?.addRange(snapshot.range);
    }
  }

  async function routeDraft(text, version = state.version) {
    if (state.manualOverride || !text) return false;
    if (state.appliedText === text) return true;
    const surface = state.surface;
    if (state.active?.text === text && state.active.surface === surface) return state.active.promise;
    const promise = (async () => {
      try {
        show(t("analyzing"), "loading");
        const result = await callBackground(text, surface);
        if (!inDraft(text, version, surface)) return false;
        const mode = result.mode;
        if (surface === "work" ? !WORK_TARGETS[mode] : !TARGET_LABELS[mode]) throw new Error(t("unknownMode"));
        state.choices = Array.isArray(result.topChoices) ? result.topChoices : [];
        const title = surface === "work" ? workModeTitle(mode) : TITLES[mode];
        if (result.lowConfidence) {
          state.appliedText = text;
          state.failedText = "";
          state.partialText = "";
          show(t("lowConfidenceRecommendation", { model: title }), "warning");
          return true;
        }
        show(t("switching", { model: title }), "loading");
        const selectedLabel = surface === "work" ? await selectWorkModel(mode, text, version) : await selectModel(mode, text, version);
        if (!inDraft(text, version, surface)) return false;
        if (!selectedLabel) {
          state.failedText = text;
          if (surface === "work" && workModelMatches(findModelButton(), WORK_TARGETS[mode])) {
            state.partialText = text;
            show(t("effortSwitchFailed"), "warning");
          } else {
            show(t("switchFailed", { model: title }), "error");
          }
          return false;
        }
        state.appliedText = text;
        state.failedText = "";
        state.partialText = "";
        const fallback = lower(selectedLabel) !== lower(title);
        if (fallback) show(t("switchedFallback", { model: title, actual: selectedLabel }), "warning");
        else if (!state.choices.length) show(t("switchedNoProbabilities", { model: selectedLabel }), "warning");
        else show(t("switched", { model: selectedLabel }), "success");
        return true;
      } catch (error) {
        if (inDraft(text, version)) {
          state.failedText = text;
          show(t("routeFailed"), "error");
          state.badge.title = error.message;
        }
        return false;
      }
    })();
    state.active = { text, surface, promise };
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
    const relevant = /model|模式|模型|power|instant|medium|high|thinking|pro standard|pro extended/;
    const nearby = options.find(item => relevant.test(item.label));
    if (nearby) return nearby.element;
    return [...document.querySelectorAll("button, [role='button']")]
      .filter(element => isVisible(element) && relevant.test(lower(elementLabel(element))) && !element.closest("[role='menu'], [role='dialog'], article"))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] ?? null;
  }

  function selectedLabelMatches(button, labels) {
    const effort = lower(button.getAttribute("data-selected-reasoning-effort"));
    const text = lower(button.innerText ?? button.textContent);
    const aria = lower(button.getAttribute("aria-label"));
    return labels.some(label => {
      const target = lower(label);
      const effortMatch = target === "instant" ? ["instant", "none"].includes(effort) : target === "pro standard" ? effort === "pro-standard" : target === "extra high" ? effort === "extra-high" : effort === target;
      return effortMatch || text === target || text.startsWith(`${target} `) || aria === target || aria.endsWith(`: ${target}`) || aria.endsWith(` ${target}`);
    });
  }

  async function waitForSelectedLabel(label, attempts = 8) {
    for (let i = 0; i < attempts; i++) {
      const button = findModelButton();
      if (button && selectedLabelMatches(button, [label])) return true;
      await pause(125);
    }
    return false;
  }

  function visibleMenuItems() {
    return [...document.querySelectorAll("[role='menuitem'], [role='option'], [role='menuitemradio'], [role='radio'], [data-radix-collection-item]")]
      .filter(isUsable);
  }

  function findModeItem(labels) {
    for (const label of labels) {
      const item = visibleMenuItems().find(element => {
        const text = lower(elementLabel(element));
        return text === lower(label) || text.startsWith(`${lower(label)} `);
      });
      if (item) return { item, label };
    }
    return null;
  }

  function openModelMenu() {
    const trigger = findModelButton();
    if (trigger?.getAttribute("aria-expanded") === "true") return true;
    trigger?.click();
    return Boolean(trigger);
  }

  async function selectReasoningSlider(mode) {
    const selected = mode === "pro" ? "High" : TITLES[mode];
    let control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
    if (!control) {
      const toggle = [...document.querySelectorAll('[data-model-picker-view-toggle="true"]')].find(isUsable);
      if (toggle) toggle.click();
      else {
        const button = findModelButton();
        if (button?.getAttribute("aria-expanded") === "true") button.click();
        await pause(100);
        openModelMenu();
      }
      await pause(150);
      control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
    }
    const slider = control?.querySelector('[role="slider"]');
    if (!slider) return null;
    const minimum = Number.parseInt(slider.getAttribute("aria-valuemin") ?? "", 10);
    const maximum = Number.parseInt(slider.getAttribute("aria-valuemax") ?? "", 10);
    let current = Number.parseInt(slider.getAttribute("aria-valuenow") ?? "", 10);
    if (![minimum, maximum, current].every(Number.isInteger) || minimum !== 0 || maximum < 2) return null;
    const target = mode === "instant" ? 0 : mode === "medium" ? 1 : 2;
    if (target > maximum) return null;
    for (let attempts = 0; current !== target && attempts < maximum + 2; attempts++) {
      const key = current < target ? "ArrowRight" : "ArrowLeft";
      control.focus();
      control.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
      await pause(150);
      const buttonAfterKey = findModelButton();
      if (buttonAfterKey && selectedLabelMatches(buttonAfterKey, [selected])) {
        if (buttonAfterKey.getAttribute("aria-expanded") === "true") buttonAfterKey.click();
        return await waitForSelectedLabel(selected) ? selected : null;
      }
      control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
      if (!control) {
        if (await waitForSelectedLabel(selected, 3)) return selected;
        openModelMenu();
        await pause(150);
        control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
      }
      const updated = Number.parseInt(control?.querySelector('[role="slider"]')?.getAttribute("aria-valuenow") ?? "", 10);
      if (!control || !Number.isInteger(updated)) return null;
      if (updated === current) return null;
      current = updated;
    }
    const button = findModelButton();
    if (button?.getAttribute("aria-expanded") === "true") button.click();
    return await waitForSelectedLabel(selected) ? selected : null;
  }

  async function selectModel(mode, text, version) {
    for (let i = 0; state.switching && i < 40; i++) await pause(100);
    if (state.switching || !inDraft(text, version)) return null;
    const button = findModelButton();
    if (!button) return null;
    const labels = TARGET_LABELS[mode];
    if (selectedLabelMatches(button, [labels[0]])) return labels[0];
    const focusSnapshot = captureComposerFocus(text, version);
    state.switching = true;
    try {
      openModelMenu();
      let found = null;
      for (let i = 0; i < 8; i++) {
        await pause(125);
        found = findModeItem(mode === "pro" ? ["Pro Standard", "Pro Extended", "Pro"] : [labels[0]]);
        if (found || (mode !== "pro" && [...document.querySelectorAll('[data-reasoning-slider="true"]')].some(isUsable))) break;
      }
      if (!found && mode === "pro") {
        const toggle = [...document.querySelectorAll('[data-model-picker-view-toggle="true"]')].find(isUsable);
        toggle?.click();
        await pause(150);
        found = findModeItem(["Pro Standard", "Pro Extended", "Pro"]);
      }
      if (!found) {
        const selected = await selectReasoningSlider(mode);
        if (!selected && button.getAttribute("aria-expanded") === "true") button.click();
        return selected;
      }
      found.item.click();
      for (let i = 0; i < 10; i++) {
        await pause(125);
        const current = findModelButton();
        if (current && selectedLabelMatches(current, [found.label])) return found.label;
      }
      return null;
    } finally {
      state.switching = false;
      restoreComposerFocus(focusSnapshot);
    }
  }

  function selectedWorkModel(button) {
    return clean(button?.innerText ?? "").match(/GPT-\d+(?:\.\d+)?\s+(?:Astra|Sol|Luna)/i)?.[0] ?? null;
  }

  function workModelMatches(button, target) {
    const model = selectedWorkModel(button);
    return Boolean(model && target.models.some(name => lower(name) === lower(model)));
  }

  function workSelectionMatches(button, target) {
    const effort = lower(button?.getAttribute?.("data-selected-reasoning-effort"));
    return workModelMatches(button, target) && (!target.effort || effort === target.effort);
  }

  function workSelectionLabel(button, target) {
    const model = selectedWorkModel(button);
    const effort = { low: "effortLow", medium: "effortMedium", xhigh: "effortXhigh" }[target.effort];
    return model ? (effort ? `${model} · ${t(effort)}` : model) : null;
  }

  function findWorkModelItem(target) {
    return [...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')]
      .filter(item => isUsable(item) && item.getAttribute("aria-disabled") !== "true")
      .find(item => target.models.some(name => lower(item.innerText?.split("\n")[0]) === lower(name))) ?? null;
  }

  async function ensureWorkModelList() {
    if ([...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')].some(isUsable)) return true;
    let toggled = false;
    for (let i = 0; i < 8; i++) {
      await pause(125);
      const toggle = [...document.querySelectorAll('[data-model-picker-view-toggle="true"]')].find(isUsable);
      if (toggle && !toggled) { toggle.click(); toggled = true; }
      if ([...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')].some(isUsable)) return true;
    }
    return false;
  }

  async function ensureWorkSlider() {
    let control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
    if (control) return control;
    const trigger = findModelButton();
    if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
    let toggled = false;
    for (let i = 0; i < 8; i++) {
      await pause(125);
      const toggle = [...document.querySelectorAll('[data-model-picker-view-toggle="true"]')].find(isUsable);
      if (toggle && !toggled) { toggle.click(); toggled = true; }
      control = [...document.querySelectorAll('[data-reasoning-slider="true"]')].find(isUsable);
      if (control) return control;
    }
    return null;
  }

  async function selectWorkModel(mode, text, version) {
    const target = WORK_TARGETS[mode];
    if (!target || !inDraft(text, version, "work")) return null;
    for (let i = 0; state.switching && i < 40; i++) await pause(100);
    if (state.switching || !inDraft(text, version, "work")) return null;
    let trigger = findModelButton();
    if (!trigger) return null;
    if (workSelectionMatches(trigger, target)) return workSelectionLabel(trigger, target);
    const focusSnapshot = captureComposerFocus(text, version);
    state.switching = true;
    try {
      if (!openModelMenu() || !await ensureWorkModelList()) return null;
      const item = findWorkModelItem(target);
      if (!item) return null;
      item.click();
      for (let i = 0; i < 24; i++) {
        await pause(125);
        if (!inDraft(text, version, "work")) return null;
        trigger = findModelButton();
        if (workSelectionMatches(trigger, target)) {
          if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
          return workSelectionLabel(trigger, target);
        }
        if (trigger && target.models.some(name => lower(trigger.innerText).includes(lower(name)))) break;
      }
      let control = await ensureWorkSlider();
      if (!control) return null;
      const slider = control.querySelector('[role="slider"]');
      const minimum = Number(slider?.getAttribute("aria-valuemin"));
      const maximum = Number(slider?.getAttribute("aria-valuemax"));
      let current = Number(slider?.getAttribute("aria-valuenow"));
      if (![minimum, maximum, current].every(Number.isInteger) || maximum <= minimum) return null;
      // Work's slider positions are account-dependent. Step through actual UI and verify
      // the model AND reasoning effort instead of assuming a fixed index-to-model map.
      const directions = ["ArrowRight", "ArrowLeft"];
      for (const direction of directions) {
        for (let i = 0; i < maximum - minimum; i++) {
          trigger = findModelButton();
          if (workSelectionMatches(trigger, target)) {
            if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
            return workSelectionLabel(trigger, target);
          }
          if (direction === "ArrowRight" ? current >= maximum : current <= minimum) break;
          const key = direction;
          const keyCode = key === "ArrowRight" ? 39 : 37;
          const eventOptions = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
          control.focus();
          control.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
          control.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
          await pause(150);
          if (!inDraft(text, version, "work")) return null;
          control = await ensureWorkSlider();
          if (!control) return null;
          let updated = Number(control.querySelector('[role="slider"]')?.getAttribute("aria-valuenow"));
          if (updated === current) {
            const thumb = control.querySelector('[role="slider"]');
            thumb?.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
            thumb?.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
            await pause(150);
            control = await ensureWorkSlider();
            if (!control) return null;
            updated = Number(control.querySelector('[role="slider"]')?.getAttribute("aria-valuenow"));
          }
          if (!Number.isInteger(updated) || updated === current) break;
          current = updated;
        }
      }
      trigger = findModelButton();
      if (!workSelectionMatches(trigger, target)) return null;
      if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
      return workSelectionLabel(trigger, target);
    } finally {
      const current = findModelButton();
      if (current?.getAttribute("aria-expanded") === "true") current.click();
      state.switching = false;
      restoreComposerFocus(focusSnapshot);
    }
  }

  function isManualModelChoice(target) {
    const trigger = findModelButton();
    const menu = target.closest?.('[role="menu"]');
    if (trigger && menu?.getAttribute("aria-labelledby") === trigger.id) {
      if (target.closest?.('[data-reasoning-slider="true"], [data-model-picker-power-slider], [role="menuitemradio"]')) return true;
    }
    const item = target.closest?.("[role='menuitem'], [role='option'], [role='menuitemradio'], [role='radio'], [data-radix-collection-item], [role='menu'] button, [role='dialog'] button");
    if (!item) return false;
    if (item === findModelButton() || item.getAttribute("aria-haspopup")) return false;
    const label = lower(elementLabel(item));
    return KNOWN_LABELS.some(known => label === lower(known) || label.startsWith(`${lower(known)} `));
  }

  function findSendButton() {
    const composer = state.composer;
    if (!composer) return null;
    const scope = composer.closest("form") ?? composer.parentElement?.parentElement?.parentElement;
    if (!scope) return null;
    return scope.querySelector('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[type="submit"]')
      ?? [...scope.querySelectorAll("button")].find(button => /^(send|傳送|送出|發送)/i.test(clean(button.getAttribute("aria-label"))));
  }

  function isSendClick(target) {
    const button = target.closest?.("button");
    return Boolean(button && button === findSendButton());
  }

  async function guardSend(event) {
    if (state.composing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    onDraftChange();
    const text = readText();
    if (!text || state.manualOverride || state.appliedText === text) return;
    if (state.bypassNextSend) { state.bypassNextSend = false; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.sendQueued) return;
    state.sendQueued = true;
    if (state.failedText === text) {
      state.bypassNextSend = true;
      if (state.partialText === text) show(t("effortSwitchFailed"), "warning");
      else show(t("sendFailed"), "error");
      state.sendQueued = false;
      return;
    }
    clearTimeout(state.timer);
    const version = state.version;
    try {
      const switched = await routeDraft(text, version);
      if (!switched || !inDraft(text, version)) {
        state.bypassNextSend = true;
        return;
      }
      const sendButton = findSendButton();
      if (sendButton && !sendButton.disabled) sendButton.click();
      else show(t("sendAgain"), "warning");
    } finally {
      state.sendQueued = false;
    }
  }

  document.addEventListener("input", event => {
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
    const composer = findComposer();
    if (!composer || (event.target !== composer && !composer.contains(event.target))) return;
    state.composer = composer;
    state.composing = true;
    state.version++;
    clearTimeout(state.timer);
  }, true);

  document.addEventListener("compositionend", event => {
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

  document.addEventListener("click", event => {
    if (!event.isTrusted) return;
    if (state.text && isManualModelChoice(event.target)) {
      state.manualOverride = true;
      clearTimeout(state.timer);
      show(t("manual"), "manual");
      return;
    }
    if (isSendClick(event.target)) guardSend(event);
  }, true);

  document.addEventListener("pointerdown", event => {
    if (!event.isTrusted) return;
    if (state.composer && event.target !== state.composer && !state.composer.contains?.(event.target)) {
      state.focusIntentVersion++;
    }
    if (!state.text) return;
    if (isManualModelChoice(event.target)) {
      state.manualOverride = true;
      clearTimeout(state.timer);
      show(t("manual"), "manual");
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.isTrusted && event.key === "Tab") state.focusIntentVersion++;
    if (event.isTrusted && ["ArrowLeft", "ArrowRight"].includes(event.key) && state.text && isManualModelChoice(event.target)) {
      state.manualOverride = true;
      clearTimeout(state.timer);
      show(t("manual"), "manual");
      return;
    }
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
      guardSend(event);
    }
  }, true);

  setInterval(() => {
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

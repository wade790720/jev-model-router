// Strict allowlist: never store draft text, DOM, URLs, free-form errors or keys.
export const COLLECTOR_URL = "http://127.0.0.1:43127";
const MODES = new Set(["instant", "medium", "high", "pro", "luna", "sol_low", "sol_medium", "astra_low", "astra_medium", "astra_xhigh"]);
const CODES = new Set(["none", "trigger_missing", "menu_missing", "target_missing", "slider_missing", "slider_invalid", "verification_failed", "effort_failed", "surface_changed", "routing_timeout", "routing_network", "routing_auth", "routing_rate_limit", "routing_invalid", "routing_error", "routing_consent", "routing_key_missing", "routing_service_unconfigured", "routing_membership_missing", "unexpected_error"]);
const STAGES = new Set(["routing", "trigger", "menu", "target", "slider", "verification", "complete"]);
const integer = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
export function safeModel(value) {
  const text = String(value ?? "").trim();
  return /^(?:Instant|Medium|High|Extra High|Thinking(?: Standard| Extended)?|Pro(?: Standard| Extended)?|GPT-\d{1,2}(?:\.\d{1,2})? (?:Luna|Sol|Astra))$/i.test(text) ? text : "unknown";
}
export function sanitizeDiagnostic(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid diagnostic");
  return {
    schemaVersion: 1,
    surface: ["chat", "work"].includes(input.surface) ? input.surface : "unknown",
    outcome: ["success", "failure", "partial", "suggested", "cancelled"].includes(input.outcome) ? input.outcome : "failure",
    code: CODES.has(input.code) ? input.code : "unexpected_error",
    stage: STAGES.has(input.stage) ? input.stage : "routing",
    target: MODES.has(input.target) ? input.target : "unknown",
    before: safeModel(input.before), after: safeModel(input.after),
    effort: ["none", "low", "medium", "high", "xhigh"].includes(input.effort) ? input.effort : "unknown",
    elapsedMs: integer(input.elapsedMs, 60000),
    triggerFound: input.triggerFound === true, menuOpen: input.menuOpen === true,
    sliderFound: input.sliderFound === true, menuItemCount: integer(input.menuItemCount, 100),
    availableModels: Array.isArray(input.availableModels) ? [...new Set(input.availableModels.map(safeModel).filter(model => model !== "unknown"))].slice(0, 12) : [],
    extensionVersion: /^\d+(?:\.\d+){1,3}$/.test(input.extensionVersion ?? "") ? input.extensionVersion : "unknown",
    browserVersion: /^(?:Chrome|Edg)\/\d{1,3}(?:\.\d+){0,3}$/.test(input.browserVersion ?? "") ? input.browserVersion : "unknown",
    locale: /^(?:en|zh-Hant|zh-Hans|ja|ko)$/.test(input.locale ?? "") ? input.locale : "unknown"
  };
}

export function createDiagnostics({ storage, fetchImpl = fetch, metadata = () => ({}), now = Date.now }) {
  let writes = Promise.resolve();
  let flushing = null;
  function record(input) {
    const operation = writes.catch(() => {}).then(async () => {
      const values = await storage.get(["diagnosticsEnabled", "diagnosticEvents", "diagnosticPending", "diagnosticStats"]);
      if (values.diagnosticsEnabled === false) return;
      const event = { ...sanitizeDiagnostic({ ...input, ...metadata() }), id: crypto.randomUUID(), timestamp: new Date(now()).toISOString() };
      const stats = values.diagnosticStats ?? {};
      const day = event.timestamp.slice(0, 10);
      stats[day] ??= {};
      stats[day][event.outcome] = (stats[day][event.outcome] ?? 0) + 1;
      const recentStats = Object.fromEntries(Object.entries(stats).sort().slice(-14));
      await storage.set({ diagnosticEvents: [...(values.diagnosticEvents ?? []), event].slice(-300),
        diagnosticPending: [...(values.diagnosticPending ?? []), event].slice(-300), diagnosticStats: recentStats });
    });
    writes = operation;
    return operation;
  }
  async function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      await writes.catch(() => {});
      const values = await storage.get(["diagnosticsEnabled", "diagnosticPending"]);
      if (values.diagnosticsEnabled === false || !values.diagnosticPending?.length) return;
      const events = values.diagnosticPending.slice(0, 40);
      const response = await fetchImpl(`${COLLECTOR_URL}/api/diagnostics`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Smart-ChatGPT-Extension": metadata().extensionId ?? "" },
        body: JSON.stringify({ events }), signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) throw new Error("Collector unavailable");
      const body = await response.json();
      if (!Array.isArray(body.acceptedIds)) throw new Error("Invalid collector acknowledgement");
      const sent = new Set(events.map(event => event.id));
      const accepted = new Set(body.acceptedIds.filter(id => sent.has(id)));
      const operation = writes.catch(() => {}).then(async () => {
        const current = await storage.get(["diagnosticPending"]);
        await storage.set({ diagnosticPending: (current.diagnosticPending ?? []).filter(event => !accepted.has(event.id)),
          diagnosticLastDelivery: new Date(now()).toISOString() });
      });
      writes = operation;
      await operation;
    })();
    try { return await flushing; } finally { flushing = null; }
  }
  return { record, flush };
}

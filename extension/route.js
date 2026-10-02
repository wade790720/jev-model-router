export const MODES = Object.freeze(["instant", "medium", "high", "pro"]);
export const WORK_MODES = Object.freeze(["luna", "sol_low", "sol_medium", "astra_low", "astra_medium", "astra_xhigh"]);

export const DEFAULT_LABELS = Object.freeze({
  instant: ["Instant"],
  medium: ["Medium", "Thinking Standard", "Thinking"],
  high: ["High", "Thinking Extended"],
  pro: ["Pro Standard", "Pro", "Extra High"]
});

export const MODE_TITLES = Object.freeze({
  instant: "Instant",
  medium: "Medium",
  high: "High",
  pro: "Pro Standard"
});

export const WORK_TITLES = Object.freeze({
  luna: "GPT-6 Luna",
  sol_low: "GPT-6.1 Sol · 輕度",
  sol_medium: "GPT-6.1 Sol · 中度",
  astra_low: "GPT-6 Astra · 輕度",
  astra_medium: "GPT-6 Astra · 中度",
  astra_xhigh: "GPT-6 Astra · 極高"
});

export function buildJevRequest(text, surface = "chat") {
  if (typeof text !== "string" || !text.trim()) throw new Error("Prompt text is required");
  if (!["chat", "work"].includes(surface)) throw new Error("Unsupported ChatGPT surface");
  const work = surface === "work";
  return {
    model: "jev-latest",
    state: { prompt: text.trim() },
    questions: {
      response_mode: {
        type: "choice",
        instructions: work
          ? "Choose the lightest current ChatGPT Work model and reasoning-effort preset likely to complete the user's actual task well. Prefer Luna for simple tasks, Sol for ordinary work, and Astra only when stronger reasoning is needed. Do not classify by prompt length alone."
          : "Choose the least costly ChatGPT response mode likely to complete this user's request well. Classify the actual work requested, not just prompt length. Use pro only for unusually demanding, high-stakes multi-step work.",
        criteria: work ? {
          luna: "GPT-6 Luna with low reasoning effort. Simple factual questions, short rewrites, translations, extraction, or routine requests where speed matters most.",
          sol_low: "Ordinary writing, explanation, straightforward coding, and familiar tasks needing light reasoning.",
          sol_medium: "Multi-step coding, analysis, planning, or synthesis needing a balanced reasoning budget.",
          astra_low: "Difficult or ambiguous problems needing the strongest model, but only light deliberation.",
          astra_medium: "Complex research, coding, or decisions needing both the strongest model and substantial reasoning.",
          astra_xhigh: "Exceptional difficulty, high stakes, extensive verification, or deep multi-step reasoning where maximum deliberation is justified."
        } : {
          instant: "Simple factual question, short rewrite, translation, extraction, or routine request with clear constraints.",
          medium: "Ordinary writing, explanation, coding, research planning, or analysis needing some reasoning and judgment.",
          high: "Difficult multi-step reasoning, complex coding, broad synthesis, nuanced decisions, or extensive verification.",
          pro: "Exceptional difficulty or high stakes where the strongest available reasoning is justified despite slower answers and higher plan usage."
        }
      }
    }
  };
}

export function normalizeJevResponse(body, surface = "chat") {
  const answer = body?.answers?.response_mode;
  const modes = surface === "work" ? WORK_MODES : surface === "chat" ? MODES : [];
  if (answer?.type !== "choice" || !modes.includes(answer.choice)) {
    throw new Error("Jev returned an unsupported choice");
  }
  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Jev returned an invalid confidence value");
  }
  const probabilities = answer.probabilities;
  const topChoices = probabilities && typeof probabilities === "object" && !Array.isArray(probabilities)
    ? Object.entries(probabilities)
      .filter(([mode, probability]) => modes.includes(mode) && Number.isFinite(probability) && probability >= 0 && probability <= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mode, probability]) => ({ mode, probability }))
    : [];
  return {
    mode: confidence < 0.45 ? (surface === "work" ? "sol_low" : "medium") : answer.choice,
    suggestedMode: answer.choice,
    confidence,
    lowConfidence: confidence < 0.45,
    topChoices,
    usage: body.usage ?? null
  };
}

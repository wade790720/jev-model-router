import { expect, test } from "vitest";
import { buildJevRequest, normalizeJevResponse } from "./route";

test("builds a documented TypeSafe choice request", () => {
  const request = buildJevRequest("  請幫我分析這段程式碼  ");
  expect(request.model).toBe("jev-latest");
  expect(request.state).toEqual({ prompt: "請幫我分析這段程式碼" });
  expect(request.questions.response_mode.type).toBe("choice");
  expect(Object.keys(request.questions.response_mode.criteria)).toEqual(["instant", "medium", "high", "pro"]);
  expect(request.questions.response_mode.instructions).toMatch(/correct, complete answer/);
  expect(request.questions.response_mode.instructions).toMatch(/perform similarly/);
  expect(request.questions.response_mode.instructions).toMatch(/not routing instructions/);
  expect(request.questions.response_mode.criteria.high).toMatch(/trade-offs and verification/);
});

test("normalizes high confidence choices and usage", () => {
  const result = normalizeJevResponse({
    answers: { response_mode: { type: "choice", choice: "high", confidence: 0.92,
      probabilities: { instant: 0.02, medium: 0.09, high: 0.78, pro: 0.11 } } },
    usage: { input_tokens: 320, output_tokens: 10 }
  });
  expect(result.mode).toBe("high");
  expect(result.confidence).toBe(0.92);
  expect(result.usage?.input_tokens).toBe(320);
  expect(result.topChoices).toEqual([
    { mode: "high", probability: 0.78 },
    { mode: "pro", probability: 0.11 },
    { mode: "medium", probability: 0.09 }
  ]);
});

test("Work routes current models and shows only the returned two probabilities", () => {
  const request = buildJevRequest("請修好這段程式", "work");
  expect(request.questions.response_mode.type).toBe("choice");
  expect(Object.keys(request.questions.response_mode.criteria))
    .toEqual(["luna", "sol_low", "sol_medium", "astra_low", "astra_medium", "astra_xhigh"]);
  expect(request.questions.response_mode.criteria.sol_medium).toMatch(/interacting constraints/);
  expect(request.questions.response_mode.criteria.astra_low).toMatch(/narrow task/);
  const result = normalizeJevResponse({ answers: { response_mode: {
    type: "choice", choice: "sol_medium", confidence: 0.8,
    probabilities: { sol_medium: 0.7, astra_low: 0.3 }
  } } }, "work");
  expect(result.mode).toBe("sol_medium");
  expect(result.topChoices).toEqual([
    { mode: "sol_medium", probability: 0.7 },
    { mode: "astra_low", probability: 0.3 }
  ]);
});

test("Work low confidence preserves the recommendation without downgrading", () => {
  const result = normalizeJevResponse({ answers: { response_mode: {
    type: "choice", choice: "astra_xhigh", confidence: 0.4,
    probabilities: { astra_xhigh: 0.4, sol_medium: 0.35, sol_low: 0.25 }
  } } }, "work");
  expect(result.mode).toBe("astra_xhigh");
  expect(result.lowConfidence).toBe(true);
});

test("Chat low confidence preserves the recommendation without downgrading", () => {
  const result = normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "pro", confidence: 0.4 } } });
  expect(result.mode).toBe("pro");
  expect(result.suggestedMode).toBe("pro");
  expect(result.lowConfidence).toBe(true);
});

test("rejects malformed responses", () => {
  expect(() => buildJevRequest(" ")).toThrow();
  expect(() => normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "unknown", confidence: 0.8 } } })).toThrow();
  expect(() => normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "high", confidence: 1.2 } } })).toThrow();
});

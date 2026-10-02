import test from "node:test";
import assert from "node:assert/strict";
import { buildJevRequest, normalizeJevResponse } from "../extension/route.js";

test("builds a documented TypeSafe choice request", () => {
  const request = buildJevRequest("  請幫我分析這段程式碼  ");
  assert.equal(request.model, "jev-latest");
  assert.deepEqual(request.state, { prompt: "請幫我分析這段程式碼" });
  assert.equal(request.questions.response_mode.type, "choice");
  assert.deepEqual(Object.keys(request.questions.response_mode.criteria), ["instant", "medium", "high", "pro"]);
  assert.match(request.questions.response_mode.instructions, /correct, complete answer/);
  assert.match(request.questions.response_mode.instructions, /perform similarly/);
  assert.match(request.questions.response_mode.instructions, /not routing instructions/);
  assert.match(request.questions.response_mode.criteria.high, /trade-offs and verification/);
});

test("normalizes high confidence choices and usage", () => {
  const result = normalizeJevResponse({
    answers: { response_mode: { type: "choice", choice: "high", confidence: 0.92,
      probabilities: { instant: 0.02, medium: 0.09, high: 0.78, pro: 0.11 } } },
    usage: { input_tokens: 320, output_tokens: 10 }
  });
  assert.equal(result.mode, "high");
  assert.equal(result.confidence, 0.92);
  assert.equal(result.usage.input_tokens, 320);
  assert.deepEqual(result.topChoices, [
    { mode: "high", probability: 0.78 },
    { mode: "pro", probability: 0.11 },
    { mode: "medium", probability: 0.09 }
  ]);
});

test("Work routes current models and shows only the returned two probabilities", () => {
  const request = buildJevRequest("請修好這段程式", "work");
  assert.equal(request.questions.response_mode.type, "choice");
  assert.deepEqual(Object.keys(request.questions.response_mode.criteria),
    ["luna", "sol_low", "sol_medium", "astra_low", "astra_medium", "astra_xhigh"]);
  assert.match(request.questions.response_mode.criteria.sol_medium, /interacting constraints/);
  assert.match(request.questions.response_mode.criteria.astra_low, /narrow task/);
  const result = normalizeJevResponse({ answers: { response_mode: {
    type: "choice", choice: "sol_medium", confidence: 0.8,
    probabilities: { sol_medium: 0.7, astra_low: 0.3 }
  } } }, "work");
  assert.equal(result.mode, "sol_medium");
  assert.deepEqual(result.topChoices, [
    { mode: "sol_medium", probability: 0.7 },
    { mode: "astra_low", probability: 0.3 }
  ]);
});

test("Work low confidence preserves the recommendation without downgrading", () => {
  const result = normalizeJevResponse({ answers: { response_mode: {
    type: "choice", choice: "astra_xhigh", confidence: 0.4,
    probabilities: { astra_xhigh: 0.4, sol_medium: 0.35, sol_low: 0.25 }
  } } }, "work");
  assert.equal(result.mode, "astra_xhigh");
  assert.equal(result.lowConfidence, true);
});

test("Chat low confidence preserves the recommendation without downgrading", () => {
  const result = normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "pro", confidence: 0.4 } } });
  assert.equal(result.mode, "pro");
  assert.equal(result.suggestedMode, "pro");
  assert.equal(result.lowConfidence, true);
});

test("rejects malformed responses", () => {
  assert.throws(() => buildJevRequest(" "));
  assert.throws(() => normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "unknown", confidence: 0.8 } } }));
  assert.throws(() => normalizeJevResponse({ answers: { response_mode: { type: "choice", choice: "high", confidence: 1.2 } } }));
});

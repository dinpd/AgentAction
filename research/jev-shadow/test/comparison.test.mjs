import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cases, questions } from "../src/cases.mjs";
import { askLlm, llmModel, llmRequest, normalizeLlm, groqModel } from "../src/llm.mjs";
import { askLive } from "../src/provider.mjs";
import { config } from "../src/run.mjs";
import { compare } from "../src/compare.mjs";
import { verify } from "../src/verify.mjs";

const responseBody = () => ({ model: llmModel, choices: [{ finish_reason: "stop", message: { content: '{"intent_match":0.99,"needs_review":0.01}' } }], usage: { prompt_tokens: 1000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 500 } } });

test("LLM receives matching criteria, bounded strict output, no labels", () => {
  const request = llmRequest(cases[0].state);
  assert(request.messages[0].content.includes(JSON.stringify(questions)));
  assert.deepEqual(JSON.parse(request.messages[1].content), cases[0].state);
  assert.equal(request.model, "gpt-4.1-mini");
  assert.equal(request.temperature, 0);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.store, false);
});

test("LLM normalization accounts for cached input and rejects truncation/refusal/out-of-range", () => {
  const result = normalizeLlm(responseBody());
  assert.equal(result.usage.cached_input_tokens, 500);
  assert.equal(result.estimated_cost_usd, (500 * .4 + 500 * .1 + 20 * 1.6) / 1e6);
  for (const mutate of [body => body.choices[0].finish_reason = "length", body => body.choices[0].message.refusal = "no", body => body.choices[0].message.content = '{"intent_match":2,"needs_review":0}', body => body.model = "other", body => body.usage.prompt_tokens_details.cached_tokens = 1001]) {
    const b = responseBody(); mutate(b); assert.throws(() => normalizeLlm(b));
  }
});

test("LLM faults preserve deadline and sanitize response/errors", async () => {
  const valid = await askLlm({}, { key: "test-only", fetchImpl: async () => Response.json({ ...responseBody(), secret: "discard-me" }) });
  assert.equal(valid.status, "ok");
  assert(!JSON.stringify(valid).includes("discard-me"));
  const timed = await askLlm({}, { key: "test-only", timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  assert.equal(timed.status, "timeout");
  const throttled = await askLlm({}, { key: "test-only", fetchImpl: async () => new Response("secret", { status: 429 }) });
  assert.equal(throttled.status, "http_429");
});

test("paired experiment uses equal workload and preserves both lanes' gateway evidence", async t => {
  const dir = mkdtempSync(join(tmpdir(), "jev-compare-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = await compare(config(["--mode", "all", "--provider", "fixture", "--rates", "1", "--seconds", "1", "--timeout-ms", "10000", "--out", dir]));
  assert.equal(data.stages.length, 4);
  assert(data.stages.every(stage => stage.summary.quality.shadow_mutations === 0));
  assert.deepEqual(verify(dir), { rows: 26, stages: 4, gateway_bases: 26, live: false });
});

test("independent Jev service keeps reported cost and never leaks account balance", async () => {
  const result = await askLive({}, { key: "test-only", service: "playground", fetchImpl: async (url) => {
    assert.equal(url, "https://jevtypesafeai.com/api/v1/decide");
    return Response.json({ model: "jev-1.13.0", answers: { intent_match: { type: "noul", noul: .95 }, needs_review: { type: "noul", noul: .02 } }, usage: { input_tokens: 471, cost_usd: .000198, credits_remaining_usd: 9.99 } });
  } });
  assert.equal(result.status, "ok");
  assert.equal(result.usage.output_tokens, null);
  assert.equal(result.reported_cost_usd, .000198);
  assert(!JSON.stringify(result).includes("credits_remaining"));
  await assert.rejects(askLive({}, { key: "test-only", service: "unknown" }), /unsupported/);
});

test("Groq comparator uses strict JSON, bounded low reasoning and documented prices", () => {
  const request = llmRequest(cases[0].state, "groq");
  assert.equal(request.model, groqModel);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.reasoning_effort, "low");
  assert.equal(request.include_reasoning, false);
  assert.equal(request.max_completion_tokens, 1024);
  assert(!Object.hasOwn(request, "store"));
  const response = responseBody(); response.model = groqModel;
  const normalized = normalizeLlm(response, "groq");
  assert.equal(normalized.model, groqModel);
  assert.equal(normalized.estimated_cost_usd, (500 * .075 + 500 * .037 + 20 * .30) / 1e6);
});

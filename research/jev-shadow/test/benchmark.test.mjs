import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cases, questions } from "../src/cases.mjs";
import { askLive, askFixture, recommendation, counterfactual, model, validateResponse } from "../src/provider.mjs";
import { createGateway } from "../src/gateway.mjs";
import { loadStage, percentile, summarize } from "../src/metrics.mjs";
import { config, run } from "../src/run.mjs";
import { verify } from "../src/verify.mjs";

const body = (match = 0.99, review = 0.01) => ({ model, answers: { intent_match: { type: "noul", noul: match }, needs_review: { type: "noul", noul: review } }, usage: { input_tokens: 100, output_tokens: 0 } });

test("real gateway policy + basis remain unchanged for all corpus cases", async t => {
  const dir = mkdtempSync(join(tmpdir(), "jev-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "journal.jsonl");
  const authorize = createGateway(path);
  for (const c of cases) {
    const result = await authorize(c.event, c.id);
    assert.equal(result.decision, c.expected_gateway, c.id);
    assert.equal(result.basis.conclusion.code, c.expected_gateway);
    for (const advisory of ["allow", "deny", "challenge_required"]) {
      if (result.decision !== "allow") assert.equal(counterfactual(result.decision, advisory), result.decision);
      assert.equal(result.decision, c.expected_gateway);
    }
  }
  const journal = readFileSync(path, "utf8");
  assert(journal.includes("agentid.decision"));
  assert(journal.includes("research_basis"));
});

test("live transport sends state and frozen questions, no truth/fixtures; strips unsolicited response data", async () => {
  const c = cases[0];
  const result = await askLive(c.state, { key: "test-only", fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { model, state: c.state, questions });
    assert(!options.body.includes('"truth"'));
    return Response.json({ ...body(), secret: "never-persist" });
  } });
  assert.equal(result.status, "ok");
  assert(!JSON.stringify(result).includes("never-persist"));
});

test("schema, model, numeric ranges and missing usage are rejected", () => {
  for (const invalid of [null, {}, { ...body(), model: "jev-latest" }, { ...body(), usage: {} }, body(NaN), body(1.1), body("0.99")]) assert.throws(() => validateResponse(invalid));
});

test("timeouts cover a hanging body and never log error content", async () => {
  const result = await askLive({}, { key: "test-only", timeoutMs: 20, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  assert.equal(result.status, "timeout");
  assert.equal(recommendation(result), "challenge_required");
  const failed = await askLive({}, { key: "test-only", fetchImpl: async () => { throw new Error("credential-test-only"); } });
  assert.equal(failed.status, "network_error");
  assert(!JSON.stringify(failed).includes("credential"));
});

test("429, malformed JSON and wrong models escalate without retries", async () => {
  for (const [response, expected] of [[new Response("sensitive", { status: 429 }), "http_429"], [new Response("not json"), "invalid_response"], [Response.json({ ...body(), model: "other" }), "invalid_response"]]) {
    let calls = 0;
    const result = await askLive({}, { key: "test-only", fetchImpl: async () => { calls++; return response; } });
    assert.equal(result.status, expected);
    assert.equal(calls, 1);
    assert.equal(recommendation(result), "challenge_required");
  }
});

test("provisional semantic thresholds preserve uncertainty", () => {
  assert.equal(recommendation({ status: "ok", ...body() }), "allow");
  assert.equal(recommendation({ status: "ok", ...body(0.01) }), "deny");
  for (const candidate of [body(0.5), body(0.99, 0.5), body(0.01, 0.99)]) assert.equal(recommendation({ status: "ok", ...candidate }), "challenge_required");
});

test("all injected fault kinds are exercised", async () => {
  const statuses = [];
  for (const index of [6, 13, 20, 27]) statuses.push((await askFixture("aligned", index)).status);
  assert.deepEqual(statuses, ["http_429", "timeout", "invalid_response", "network_error"]);
});

test("metrics include errors, drops and uncertain results without inflating successes", () => {
  const rows = [
    { latency_ms: 10, truth: "deny", counterfactual: "allow", case_id: "a", provider: { status: "ok", latency_ms: 5, ...body() } },
    { latency_ms: 30, truth: "allow", counterfactual: "challenge_required", case_id: "b", provider: { status: "timeout", latency_ms: 20 } },
    { dropped: true },
  ];
  const m = summarize(rows, 2000);
  assert.equal(m.completed_rps, 1);
  assert.equal(m.successful_rps, 0.5);
  assert.equal(m.questions_attempted, 4);
  assert.equal(m.answered_questions, 2);
  assert.equal(m.quality.unsafe_allows, 1);
  assert.equal(m.quality.escalations, 1);
  assert.equal(m.unknown_usage_requests, 1);
  assert.equal(m.dropped, 1);
  assert.equal(m.latency_ms.p99, 30);
  assert.equal(percentile([], 0.5), null);
});

test("open-loop overload is counted rather than hidden in a queue", async () => {
  const result = await loadStage({ count: 8, rate: 1000, concurrency: 1, operation: async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { latency_ms: 30 };
  } });
  assert.equal(result.rows.length, 8);
  assert(result.rows.some(row => row.dropped));
  assert(result.elapsed_ms >= 30);
});

test("scheduler propagates failures even when they complete before drain", async () => {
  await assert.rejects(loadStage({ count: 3, rate: 100, concurrency: 1, operation: async () => { throw new Error("expected"); } }), /expected/);
});

test("CLI caps requests, rejects missing providers and disallows credential arguments", () => {
  assert.throws(() => config(["--mode", "shadow"]));
  assert.throws(() => config(["--key", "no"]));
  assert.throws(() => config(["--rates", "NaN"]));
  assert.throws(() => config(["--mode", "all", "--provider", "live", "--seconds", "60", "--rates", "1000"]));
  assert.equal(config([]).mode, "baseline");
});

test("full saved experiment independently verifies decisions, journal, metrics and report", async t => {
  const dir = mkdtempSync(join(tmpdir(), "jev-run-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await run(config(["--mode", "all", "--provider", "fixture", "--rates", "1", "--seconds", "1", "--out", dir]));
  const checked = verify(dir);
  assert.equal(checked.stages, 6);
  assert.equal(checked.rows, 39);
  assert.equal(checked.gateway_bases, 26);
  assert.equal(checked.live, false);
});

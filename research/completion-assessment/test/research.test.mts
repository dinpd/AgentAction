import assert from "node:assert/strict";
import test from "node:test";
import { makeCase, SCENARIOS } from "../src/cases.mts";
import { DOMAINS, oracle } from "../src/world.mts";
import { assess, createVerifier, inputFor, METHODS } from "../src/methods.mts";
import { summarize, type Row } from "../src/metrics.mts";

test("ground truth is computed from complete provider state and independent of evidence", () => {
  const positive = new Set(["clean", "idempotent_replay", "missing_success", "legitimate_state_evolution"]);
  for (const domain of DOMAINS) for (const scenario of SCENARIOS) {
    const c = makeCase(domain, scenario, 3);
    assert.equal(c.truth, positive.has(scenario), `${domain}/${scenario}`);
    const original = oracle(c.world, c.spec);
    c.evidence = {};
    assert.equal(oracle(c.world, c.spec), original);
    assert.ok(!("truth" in inputFor(c)) && !("world" in inputFor(c)));
  }
});

test("opposite worlds can expose byte-identical assessment inputs", () => {
  for (const domain of DOMAINS) {
    const good = makeCase(domain, "missing_success", 1);
    const bad = makeCase(domain, "missing_failure", 1);
    assert.equal(good.truth, true);
    assert.equal(bad.truth, false);
    assert.deepEqual(inputFor(good), inputFor(bad));
  }
});

test("parameterizations share a frozen profile while binding distinct contracts", () => {
  for (const domain of DOMAINS) {
    const a = makeCase(domain, "clean", 1).contract;
    const b = makeCase(domain, "clean", 2).contract;
    assert.equal(a.profile_digest, b.profile_digest);
    assert.notEqual(a.intent_digest, b.intent_digest);
    assert.notEqual(a.profile_digest, makeCase(domain, "clean", 1, "all").contract.profile_digest);
  }
});

test("cryptographic ingestion, semantic counterexamples, and policy tradeoffs", async () => {
  const v = createVerifier();
  try {
    for (const domain of DOMAINS) {
      for (const method of METHODS) {
        const clean = makeCase(domain, "clean", 1, method === "ingress_all" ? "all" : "any");
        assert.equal((await assess(method, inputFor(clean), v)).label, "S", method);
        const failed = makeCase(domain, "explicit_failure", 1, method === "ingress_all" ? "all" : "any");
        assert.equal((await assess(method, inputFor(failed), v)).label, "F", method);
      }
      const fake = inputFor(makeCase(domain, "forged_provenance", 1));
      assert.equal((await assess("local_any", fake, v)).label, "S");
      const verifiedFake = await assess("ingress_any", fake, v);
      assert.equal(verifiedFake.label, "U");
      assert.deepEqual(verifiedFake.rejected, ["observation_jws_signature_invalid"]);
      for (const scenario of ["untrusted_issuer", "payload_tamper", "binding_mismatch", "expired"] as const) {
        const r = await assess("ingress_any", inputFor(makeCase(domain, scenario, 1)), v);
        assert.equal(r.label, "U", scenario);
        assert.equal(r.rejected.length, 1, scenario);
      }
      for (const scenario of ["within_ttl_regression", "hidden_duplicate", "empty_receipt_stream", "trusted_signer_falsehood"] as const) {
        const c = makeCase(domain, scenario, 1);
        assert.equal(c.truth, false);
        const r = await assess("ingress_any", inputFor(c), v);
        assert.equal(r.label, "S", `retain counterexample: ${scenario}`);
        assert.equal(r.confidence, 1, `confidence is coverage, not correctness: ${scenario}`);
      }
      for (const scenario of ["conflict", "legitimate_state_evolution"] as const) {
        assert.equal((await assess("ingress_any", inputFor(makeCase(domain, scenario, 1)), v)).label, "S");
        assert.equal((await assess("ingress_all", inputFor(makeCase(domain, scenario, 1, "all")), v)).label, "F");
        assert.equal((await assess("ingress_latest", inputFor(makeCase(domain, scenario, 1)), v)).label,
          scenario === "conflict" ? "F" : "S");
      }
      const missing = inputFor(makeCase(domain, "missing_success", 1));
      assert.equal((await assess("ingress_any", missing, v)).label, "U");
      const duplicate = inputFor(makeCase(domain, "duplicate_visible", 1));
      assert.equal((await assess("ingress_any", duplicate, v)).label, "F");
      delete duplicate.evidence.execution_receipts;
      assert.equal((await assess("ingress_any", duplicate, v)).label, "U");
      duplicate.evidence.execution_receipts = [];
      assert.equal((await assess("ingress_any", duplicate, v)).label, "S");
    }
  } finally { v.close(); }
});

test("changing the oracle-only world cannot change assessment inputs or results", async () => {
  const c = makeCase("refund", "clean", 1);
  const input = inputFor(c);
  c.world.refunds.push({ ...c.world.refunds[0] });
  assert.equal(oracle(c.world, c.spec), false);
  assert.deepEqual(inputFor(c), input);
  const v = createVerifier();
  try { assert.equal((await assess("ingress_any", input, v)).label, "S"); }
  finally { v.close(); }
});

test("latest observation abstains on conflicting values at a tied timestamp", async () => {
  const c = makeCase("refund", "conflict", 1);
  const observations = c.evidence.observations as Record<string, any>[];
  // Use the producer's canonical digest after a legitimate re-issuance.
  const { digestIntentObservation } = await import("../../../packages/guard/src/intent.ts");
  observations[0].observed_at = observations[1].observed_at;
  observations[0].payload_digest = digestIntentObservation(observations[0]);
  const v = createVerifier();
  try { assert.equal((await assess("ingress_latest", inputFor(c), v)).label, "U"); }
  finally { v.close(); }
});

test("metrics retain abstention and explicit class denominators", () => {
  const row = (truth: boolean, label: "S" | "F" | "U") => ({ truth, label } as Row);
  const m = summarize([row(true, "S"), row(true, "F"), row(true, "U"), row(false, "S"), row(false, "F"), row(false, "U")]);
  assert.equal(m.positive, 3);
  assert.equal(m.negative, 3);
  assert.equal(m.false_success_rate, 1 / 3);
  assert.equal(m.false_failure_rate, 1 / 3);
  assert.equal(m.coverage, 2 / 3);
  assert.equal(m.selective_error, 1 / 2);
  assert.equal(summarize([row(true, "U")]).selective_error, null);
  assert.equal(summarize([]).false_success_rate, null);
});

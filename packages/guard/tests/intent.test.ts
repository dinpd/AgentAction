import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindIntentContract,
  bindIntentProfile,
  createToolGate,
  digestIntentContract,
  digestIntentObservation,
  digestIntentProfile,
  evaluateIntent,
  issueIntentContract,
  type IntentContract,
  type IntentEvidence,
  type IntentProfile,
} from "../src/index.ts";

const EVALUATED_AT = new Date("2026-07-20T18:00:00.000Z");

test("intent contracts are canonically hashed and reject post-issue mutation", () => {
  const contract = refundContract();

  assert.match(contract.intent_digest || "", /^[a-f0-9]{64}$/);
  assert.equal(contract.intent_digest, digestIntentContract(contract));
  assert.throws(
    () => evaluateIntent({ ...contract, objective: "Refund a different payment" }, {}, evaluatorOptions()),
    /digest does not match/,
  );
});

test("versioned profiles issue deterministic typed contracts without weakening controls", () => {
  const profile = bindIntentProfile(refundProfile());
  const input = {
    intent_id: "refund-case-1042",
    job_id: "case-1042",
    variables: { refund_amount: 49, payment_id: "pi_123" },
    issued_at: "2026-07-20T17:59:00Z",
    expires_at: "2026-07-20T18:30:00Z",
  };
  const first = issueIntentContract(profile, input);
  const reordered = issueIntentContract(profile, {
    ...input,
    variables: { payment_id: "pi_123", refund_amount: 49 },
    issued_at: "2026-07-20T17:59:00.000+00:00",
  });

  assert.equal(profile.profile_digest, digestIntentProfile(profile));
  assert.equal(first.profile, "support_refund.v1");
  assert.equal(first.profile_version, "v1");
  assert.equal(first.profile_digest, profile.profile_digest);
  assert.equal(first.objective, "Refund the duplicate charge for payment pi_123");
  assert.equal(first.required_outcomes[2]?.assertion.value, 49);
  assert.deepEqual(first.hard_constraints, profile.hard_constraints);
  assert.deepEqual(first.evidence_requirements, profile.evidence_requirements);
  assert.deepEqual(first.trusted_observation_requirements, profile.trusted_observation_requirements);
  assert.equal(first.issued_at, "2026-07-20T17:59:00.000Z");
  assert.equal(first.intent_digest, reordered.intent_digest);
  assert.deepEqual(first, reordered);
});

test("profile issuance rejects invalid variables and a mutated frozen profile", () => {
  const profile = bindIntentProfile(refundProfile());
  const base = {
    intent_id: "refund-case-1042",
    job_id: "case-1042",
    variables: { payment_id: "pi_123", refund_amount: 49 },
    issued_at: "2026-07-20T17:59:00.000Z",
  };

  assert.throws(
    () => issueIntentContract(profile, { ...base, variables: { payment_id: "pi_123" } }),
    /variable is required: refund_amount/,
  );
  assert.throws(
    () => issueIntentContract(profile, { ...base, variables: { ...base.variables, refund_amount: 101 } }),
    /exceeds maximum 100/,
  );
  assert.throws(
    () => issueIntentContract(profile, { ...base, variables: { ...base.variables, hard_constraints: [] } }),
    /unknown intent profile issuance variable/,
  );
  assert.throws(
    () => issueIntentContract({ ...profile, hard_constraints: [] }, base),
    /profile digest does not match/,
  );
});

test("profile-required trusted observations affect confidence and qualified success", () => {
  const contract = issueIntentContract(bindIntentProfile(refundProfile()), {
    intent_id: "refund-case-1042",
    job_id: "case-1042",
    variables: { payment_id: "pi_123", refund_amount: 49 },
    issued_at: "2026-07-20T17:59:00.000Z",
  });
  const evidence = completedEvidence(contract);
  const observation = { ...evidence.observations?.[0] as Record<string, unknown>, issuer: "unapproved-adapter" };
  const provenance = { ...observation.provenance as Record<string, unknown>, verified_issuer: "unapproved-adapter" };
  observation.provenance = provenance;
  observation.payload_digest = digestIntentObservation(observation);
  evidence.observations = [observation];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.profile_version, "v1");
  assert.equal(receipt.profile_digest, contract.profile_digest);
  assert.equal(receipt.verdict, "partial");
  assert.equal(receipt.qualified_success, false);
  assert.ok(receipt.evidence_confidence < 1);
  assert.ok(receipt.evidence_findings.includes("ignored observations[0] outside profile trusted observation requirements"));
  assert.ok(receipt.evidence_findings.includes("required trusted observation is missing: refund.status"));
});

test("completed refund evidence produces a qualified success receipt", () => {
  const contract = refundContract();
  const receipt = evaluateIntent(contract, completedEvidence(contract), evaluatorOptions());

  assert.equal(receipt.schema_version, "agentpass.intent-evaluation.v1");
  assert.equal(receipt.intent_digest, contract.intent_digest);
  assert.equal(receipt.verdict, "completed");
  assert.equal(receipt.constraint_compliance, "pass");
  assert.equal(receipt.qualified_success, true);
  assert.equal(receipt.goal_attainment, 1);
  assert.equal(receipt.evidence_confidence, 1);
  assert.deepEqual(
    receipt.outcomes.map((outcome) => outcome.status),
    ["pass", "pass", "pass"],
  );
  assert.deepEqual(
    receipt.constraints.map((constraint) => constraint.status),
    ["pass", "pass"],
  );
  assert.deepEqual(receipt.execution_discipline, {
    tool_calls: 1,
    execution_receipts: 1,
    executions: 1,
    replays: 0,
    retries: 0,
    denied_decisions: 0,
    challenge_decisions: 0,
    estimated_cost_usd: 0.01,
    runtime_ms: 1000,
    preferences_met: true,
    preference_findings: [],
  });
});

test("execution discipline treats prior attempt count as retry evidence", () => {
  const contract = refundContract();
  const evidence = completedEvidence(contract);
  evidence.decision_events = [
    {
      ...evidence.decision_events?.[0] as Record<string, unknown>,
      retryCount: undefined,
      prior_attempt_count: 2,
    },
  ];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.execution_discipline.retries, 2);
  assert.equal(receipt.execution_discipline.preferences_met, false);
  assert.ok(receipt.execution_discipline.preference_findings.includes("retries 2 exceeds preference 1"));
});

test("mixed refund outcomes produce a partial verdict", () => {
  const contract = refundContract();
  const evidence = completedEvidence(contract);
  const observation = { ...evidence.observations?.[0] as Record<string, unknown>, value: "pending" };
  observation.payload_digest = digestIntentObservation(observation);
  evidence.observations = [observation];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.verdict, "partial");
  assert.equal(receipt.constraint_compliance, "pass");
  assert.equal(receipt.qualified_success, false);
  assert.equal(receipt.goal_attainment, 0.666667);
  assert.equal(receipt.evidence_confidence, 1);
});

test("unverified observations are ignored with an explicit provenance finding", () => {
  const contract = refundContract();
  const evidence = completedEvidence(contract);
  const observation = { ...evidence.observations?.[0] as Record<string, unknown> };
  delete observation.provenance;
  evidence.observations = [observation];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.verdict, "partial");
  assert.equal(receipt.qualified_success, false);
  assert.ok(receipt.evidence_findings.includes("ignored observations[0] without verified provenance"));
  assert.equal(receipt.outcomes[1]?.status, "indeterminate");
});

test("verified goal completion remains noncompliant when a hard constraint fails", () => {
  const contract = refundContract();
  const evidence = completedEvidence(contract);
  evidence.decision_events = [
    ...(evidence.decision_events || []),
    boundDecision(contract, {
      decisionId: "dec-denied",
      decision: "deny",
      tool: "shell.exec",
      action: "admin",
      estimatedCostUsd: 0,
    }),
  ];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.verdict, "completed");
  assert.equal(receipt.constraint_compliance, "fail");
  assert.equal(receipt.qualified_success, false);
  assert.equal(receipt.constraints[0]?.status, "fail");
});

test("missing evidence produces an indeterminate result rather than a false failure", () => {
  const contract = refundContract();
  const receipt = evaluateIntent(contract, {}, evaluatorOptions());

  assert.equal(receipt.verdict, "indeterminate");
  assert.equal(receipt.constraint_compliance, "indeterminate");
  assert.equal(receipt.qualified_success, false);
  assert.equal(receipt.goal_attainment, 0);
  assert.equal(receipt.evidence_confidence, 0);
  assert.equal(receipt.evidence_findings.length, 4);
  assert.equal(receipt.execution_discipline.preferences_met, null);
});

test("guard decisions, approvals, and execution receipts preserve intent binding", async () => {
  const contract = refundContract();
  const gate = createToolGate({
    policy: {
      tools: {
        "stripe.refund": {
          action: "pay",
          requiresApproval: true,
          requireIdempotencyKey: true,
          singleUse: true,
          maxAmountUsd: 100,
        },
      },
    },
    now: () => EVALUATED_AT,
    idGenerator: () => "dec-intent-1",
  });

  const execution = await gate.run(
    {
      agentId: "support-agent",
      intentId: contract.intent_id,
      intentDigest: contract.intent_digest,
      jobId: contract.job_id,
      tool: "stripe.refund",
      action: "pay",
      resource: "payment/pi_123",
      amountUsd: 49,
      idempotencyKey: "refund-case-1042-pi_123",
      approvalId: "approval-1042",
    },
    async () => ({ refund_id: "re_123", status: "succeeded" }),
  );

  assert.equal(execution.executed, true);
  assert.equal(execution.decision.event.intentId, contract.intent_id);
  assert.equal(execution.decision.event.intentDigest, contract.intent_digest);
  assert.equal(execution.decision.event.approvalEvidence.intent_id, contract.intent_id);
  assert.equal(execution.decision.event.approvalEvidence.intent_digest, contract.intent_digest);
  assert.equal(execution.receipt.intent_id, contract.intent_id);
  assert.equal(execution.receipt.intent_digest, contract.intent_digest);
  assert.equal(execution.receipt.job_id, contract.job_id);
  assert.match(execution.receipt.result_digest || "", /^[a-f0-9]{64}$/);
  assert.equal(execution.receipt.latency_ms, 0);
});

function refundContract(): IntentContract {
  return bindIntentContract({
    schema_version: "agentpass.intent-contract.v1",
    intent_id: "refund-case-1042",
    profile: "support_refund.v1",
    issuer: "support-application",
    job_id: "case-1042",
    objective: "Refund the duplicate charge for payment pi_123",
    required_outcomes: [
      {
        id: "refund-executed-once",
        source: "execution_receipts",
        where: [
          { path: "tool", operator: "equals", value: "stripe.refund" },
          { path: "status", operator: "equals", value: "executed" },
        ],
        assertion: { operator: "count_equals", value: 1 },
      },
      {
        id: "refund-provider-succeeded",
        source: "observations",
        where: [{ path: "predicate", operator: "equals", value: "refund.status" }],
        assertion: { path: "value", operator: "equals", value: "succeeded" },
      },
      {
        id: "refund-amount-correct",
        source: "execution_receipts",
        where: [{ path: "tool", operator: "equals", value: "stripe.refund" }],
        assertion: { path: "amount", operator: "equals", value: 49, quantifier: "all" },
      },
    ],
    hard_constraints: [
      {
        id: "no-denied-actions",
        source: "decision_events",
        where: [{ path: "decision", operator: "equals", value: "deny" }],
        assertion: { operator: "count_equals", value: 0 },
      },
      {
        id: "no-external-email",
        source: "decision_events",
        where: [{ path: "tool", operator: "equals", value: "gmail.send" }],
        assertion: { operator: "count_equals", value: 0 },
      },
    ],
    preferences: {
      max_tool_calls: 3,
      max_execution_receipts: 1,
      max_retries: 1,
      max_replays: 0,
      max_denied_decisions: 0,
      max_runtime_ms: 30_000,
      max_estimated_cost_usd: 0.05,
    },
    evidence_requirements: ["decision_events", "execution_receipts", "observations", "job"],
    issued_at: "2026-07-20T17:59:00.000Z",
    expires_at: "2026-07-20T18:30:00.000Z",
  });
}

function completedEvidence(contract: IntentContract): IntentEvidence {
  const digest = contract.intent_digest || digestIntentContract(contract);
  return {
    decision_events: [
      boundDecision(contract, {
        decisionId: "dec-refund",
        decision: "allow",
        tool: "stripe.refund",
        action: "pay",
        retryCount: 0,
        estimatedCostUsd: 0.01,
      }),
    ],
    execution_receipts: [
      {
        schema_version: "agentpass.provider-execution-receipt.v1",
        decision_id: "dec-refund",
        intent_id: contract.intent_id,
        intent_digest: digest,
        job_id: contract.job_id,
        tool: "stripe.refund",
        action: "pay",
        resource: "payment/pi_123",
        amount: 49,
        currency: "USD",
        request_digest: "request-digest",
        status: "executed",
        executed_at: "2026-07-20T18:00:00.000Z",
      },
    ],
    observations: [verifiedObservation(contract)],
    job: {
      intent_id: contract.intent_id,
      intent_digest: digest,
      job_id: contract.job_id,
      started_at: "2026-07-20T17:59:59.500Z",
      completed_at: "2026-07-20T18:00:00.500Z",
    },
  };
}

function verifiedObservation(contract: IntentContract): Record<string, unknown> {
  const observation: Record<string, unknown> = {
    schema_version: "agentpass.intent-observation.v1",
    observation_id: "obs-refund-1042",
    tenant_id: "tenant-support",
    intent_id: contract.intent_id,
    intent_digest: contract.intent_digest || digestIntentContract(contract),
    predicate: "refund.status",
    value: "succeeded",
    resource: "refund/re_123",
    observed_at: "2026-07-20T18:00:00.500Z",
    issued_at: "2026-07-20T18:00:00.500Z",
    expires_at: "2026-07-20T18:05:00.500Z",
    issuer: "stripe-adapter",
    provenance: {
      verification_method: "jws",
      verified_issuer: "stripe-adapter",
      verified_at: "2026-07-20T18:00:00.500Z",
      verified_subject: "stripe-service",
      signature_kid: "stripe-2026-07",
    },
  };
  observation.payload_digest = digestIntentObservation(observation);
  return observation;
}

function boundDecision(contract: IntentContract, event: Record<string, unknown>): Record<string, unknown> {
  return {
    ...event,
    intentId: contract.intent_id,
    intentDigest: contract.intent_digest,
    jobId: contract.job_id,
  };
}

function evaluatorOptions() {
  return {
    now: () => EVALUATED_AT,
    idGenerator: () => "eval-refund-1042",
  };
}

function refundProfile(): IntentProfile {
  return JSON.parse(
    readFileSync(new URL("../examples/support-refund-profile.json", import.meta.url), "utf8"),
  ) as IntentProfile;
}

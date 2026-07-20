import assert from "node:assert/strict";
import test from "node:test";

import {
  bindIntentContract,
  createToolGate,
  digestIntentContract,
  evaluateIntent,
  type IntentContract,
  type IntentEvidence,
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

test("mixed refund outcomes produce a partial verdict", () => {
  const contract = refundContract();
  const evidence = completedEvidence(contract);
  evidence.observations = [
    {
      ...evidence.observations?.[0] as object,
      value: "pending",
    },
  ];

  const receipt = evaluateIntent(contract, evidence, evaluatorOptions());

  assert.equal(receipt.verdict, "partial");
  assert.equal(receipt.constraint_compliance, "pass");
  assert.equal(receipt.qualified_success, false);
  assert.equal(receipt.goal_attainment, 0.666667);
  assert.equal(receipt.evidence_confidence, 1);
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
    observations: [
      {
        schema_version: "agentpass.intent-observation.v1",
        intent_id: contract.intent_id,
        intent_digest: digest,
        job_id: contract.job_id,
        predicate: "refund.status",
        value: "succeeded",
        resource: "refund/re_123",
        observed_at: "2026-07-20T18:00:00.500Z",
        issuer: "stripe-adapter",
      },
    ],
    job: {
      intent_id: contract.intent_id,
      intent_digest: digest,
      job_id: contract.job_id,
      started_at: "2026-07-20T17:59:59.500Z",
      completed_at: "2026-07-20T18:00:00.500Z",
    },
  };
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

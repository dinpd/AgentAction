import assert from "node:assert/strict";
import test from "node:test";

import { createGuard, type GuardPolicy } from "../src/index.ts";

test("unknown tools are denied by default", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    tool: "shell.exec",
    action: "admin",
  });

  assert.equal(decision.type, "deny");
  assert.deepEqual(decision.reasons, ["tool is not declared: shell.exec"]);
});

test("payment tools require approval before execution", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-1042-pi_123",
  });

  assert.equal(decision.type, "challenge_required");
  assert.equal(decision.challengeRequired, true);
  assert.deepEqual(decision.challenge?.requiredApprovalFor, ["tool"]);
});

test("single-use idempotency blocks duplicate refunds", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });
  const request = {
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-1042-pi_123",
    approvalId: "approval-1",
  };

  const first = guard.check(request);
  const second = guard.check(request);

  assert.equal(first.type, "allow");
  assert.equal(second.type, "deny");
  assert.ok(second.reasons.includes("idempotencyKey was already used"));
});

test("payments above cap are denied even with approval", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 250,
    idempotencyKey: "refund-case-1042-pi_123",
    approvalId: "approval-1",
  });

  assert.equal(decision.type, "deny");
  assert.ok(decision.reasons.includes("amount exceeds maxAmountUsd 100"));
});

test("PII email to unapproved domains is denied", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "gmail.send",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "external_email",
    destinationType: "external_email",
    externalDomain: "attacker.example",
    dataClassification: ["customer_data", "pii"],
    fieldSet: ["customer_id", "email"],
    recordCount: 1,
    approvalId: "approval-1",
  });

  assert.equal(decision.type, "deny");
  assert.ok(decision.reasons.includes("externalDomain is not allowed: attacker.example"));
  assert.ok(decision.reasons.includes("externalDomain is not allowed for flow: attacker.example"));
});

test("PII email to approved domains requires approval", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "gmail.send",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "external_email",
    destinationType: "external_email",
    externalDomain: "alice.customer.example",
    dataClassification: ["customer_data", "pii"],
    fieldSet: ["customer_id", "case_id"],
    recordCount: 1,
  });

  assert.equal(decision.type, "challenge_required");
  assert.deepEqual(decision.challenge?.requiredApprovalFor, ["pii", "flow"]);
});

test("blocked PII fields are denied", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "gmail.send",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "external_email",
    destinationType: "external_email",
    externalDomain: "customer.example",
    dataClassification: ["pii"],
    fieldSet: ["customer_id", "ssn"],
    approvalId: "approval-1",
  });

  assert.equal(decision.type, "deny");
  assert.ok(decision.reasons.includes("field is blocked: ssn"));
  assert.ok(decision.reasons.includes("field is blocked by flow: ssn"));
});

test("sensitive data to model provider is denied without explicit allowed flow", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "gmail.send",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "model_provider",
    destinationType: "model_provider",
    dataClassification: ["pii"],
    fieldSet: ["customer_id"],
  });

  assert.equal(decision.type, "deny");
  assert.ok(decision.reasons.includes("sensitive data movement has no allowed flow: provider_crm -> model_provider"));
});

test("job budgets deny runaway tool loops", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  for (let index = 0; index < 5; index += 1) {
    const decision = guard.check({
      agentId: "support-agent",
      jobId: "case-loop",
      tool: "crm.read_customer",
      action: "read",
      resource: `customer/cus_${index}`,
      estimatedTokens: 100,
      estimatedCostUsd: 0.01,
    });
    assert.equal(decision.type, "allow");
  }

  const denied = guard.check({
    agentId: "support-agent",
    jobId: "case-loop",
    tool: "crm.read_customer",
    action: "read",
    resource: "customer/cus_6",
    estimatedTokens: 100,
    estimatedCostUsd: 0.01,
  });

  assert.equal(denied.type, "deny");
  assert.ok(denied.reasons.includes("job exceeds maxToolCallsPerJob 5"));
});

test("decision events include audit context", () => {
  const guard = createGuard({
    policy: policy(),
    idGenerator: ids(),
    now: () => new Date("2026-06-11T12:00:00Z"),
  });

  const decision = guard.check({
    agentId: "support-agent",
    userId: "user-1",
    jobId: "case-1042",
    tool: "crm.read_customer",
    action: "read",
    resource: "customer/cus_123",
    dataFrom: "provider_crm",
    dataTo: "agent_context",
    dataClassification: ["customer_data"],
    fieldSet: ["customer_id"],
    recordCount: 1,
  });

  assert.equal(decision.type, "allow");
  assert.deepEqual(decision.event, {
    decisionId: "dec-1",
    decision: "allow",
    allowed: true,
    reasons: [],
    agentId: "support-agent",
    tool: "crm.read_customer",
    action: "read",
    jobId: "case-1042",
    userId: "user-1",
    resource: "customer/cus_123",
    amountUsd: undefined,
    idempotencyKey: undefined,
    approvalId: undefined,
    dataFrom: "provider_crm",
    dataTo: "agent_context",
    destinationType: undefined,
    externalDomain: undefined,
    dataClassification: ["customer_data"],
    fieldSet: ["customer_id"],
    recordCount: 1,
    estimatedTokens: undefined,
    estimatedCostUsd: undefined,
    issuedAt: "2026-06-11T12:00:00.000Z",
  });
});

function policy(): GuardPolicy {
  return {
    tools: {
      "stripe.refund": {
        action: "pay",
        requiresApproval: true,
        maxAmountUsd: 100,
        requireIdempotencyKey: true,
        singleUse: true,
      },
      "gmail.send": {
        action: "send",
        requiresApprovalIfPii: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method"],
      },
      "crm.update_customer": {
        action: "write",
        requiresApproval: true,
        allowedFields: ["case_id", "plan", "renewal_date", "support_note"],
      },
      "crm.read_customer": {
        action: "read",
      },
    },
    flows: [
      {
        from: "provider_crm",
        to: "agent_context",
        dataClassification: ["customer_data", "pii"],
        allowedFields: ["customer_id", "case_id", "plan", "renewal_date"],
        maxRecords: 10,
      },
      {
        from: "provider_crm",
        to: "external_email",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method"],
      },
      {
        from: "secrets_manager",
        to: "model_provider",
        decision: "deny",
      },
    ],
    budgets: {
      maxToolCallsPerJob: 5,
      maxRetriesPerTool: 1,
      maxTokensPerJob: 10000,
      maxEstimatedCostUsdPerJob: 1,
    },
  };
}

function ids(): () => string {
  let next = 1;
  return () => `dec-${next++}`;
}

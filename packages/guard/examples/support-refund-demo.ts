import policy from "./support-refund-policy.json" with { type: "json" };

import { createGuard, type GuardCheck } from "../src/index.ts";

const guard = createGuard({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
});

const steps: Array<{ label: string; request: GuardCheck }> = [
  {
    label: "1. Read customer context",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-1042",
      tool: "crm.read_customer",
      action: "read",
      resource: "customer/cus_123",
      dataFrom: "provider_crm",
      dataTo: "agent_context",
      dataClassification: ["customer_data"],
      fieldSet: ["customer_id", "case_id", "plan"],
      recordCount: 1,
      estimatedTokens: 500,
      estimatedCostUsd: 0.02,
    },
  },
  {
    label: "2. Agent proposes refund without approval",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-1042",
      tool: "stripe.refund",
      action: "pay",
      resource: "payment/pi_123",
      amountUsd: 49,
      idempotencyKey: "refund-case-1042-pi_123",
      estimatedTokens: 700,
      estimatedCostUsd: 0.03,
    },
  },
  {
    label: "3. Refund executes after approval",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-1042",
      tool: "stripe.refund",
      action: "pay",
      resource: "payment/pi_123",
      amountUsd: 49,
      idempotencyKey: "refund-case-1042-pi_123",
      approvalId: "approval-refund-1",
      estimatedTokens: 700,
      estimatedCostUsd: 0.03,
    },
  },
  {
    label: "4. Agent retries same refund after timeout",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-1042",
      tool: "stripe.refund",
      action: "pay",
      resource: "payment/pi_123",
      amountUsd: 49,
      idempotencyKey: "refund-case-1042-pi_123",
      approvalId: "approval-refund-1",
      estimatedTokens: 700,
      estimatedCostUsd: 0.03,
    },
  },
  {
    label: "5. Agent tries to email PII externally",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-1042",
      tool: "gmail.send",
      action: "send",
      dataFrom: "provider_crm",
      dataTo: "external_email",
      destinationType: "external_email",
      externalDomain: "attacker.example",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "email", "payment_method"],
      recordCount: 1,
      approvalId: "approval-email-1",
      estimatedTokens: 900,
      estimatedCostUsd: 0.04,
    },
  },
];

for (const step of steps) {
  const decision = guard.check(step.request);
  console.log(
    JSON.stringify(
      {
        step: step.label,
        decision: decision.type,
        reasons: decision.reasons,
        challenge: decision.challenge,
        event: decision.event,
      },
      null,
      2,
    ),
  );
}

function demoIds(): () => string {
  let next = 1;
  return () => `demo-dec-${next++}`;
}

import policy from "./support-refund-policy.json" with { type: "json" };

import { createToolGate, type GuardCheck } from "../src/index.ts";

const gate = createToolGate({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
});

const readCustomer: GuardCheck = {
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
};

const proposedRefund: GuardCheck = {
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
};

const approvedRefund: GuardCheck = {
  ...proposedRefund,
  approvalId: "approval-refund-1",
};

const piiEmail: GuardCheck = {
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
};

let providerRefundCalls = 0;

printDecision("1. Read customer context", gate.check(readCustomer));
printDecision("2. Agent proposes refund without approval", gate.check(proposedRefund));

const firstRefund = await gate.run(approvedRefund, async ({ decision }) => {
  providerRefundCalls += 1;
  return {
    refund_id: "re_123",
    payment_intent: "pi_123",
    amount_usd: 49,
    provider_refund_calls: providerRefundCalls,
    authorized_by_decision: decision.event.decisionId,
  };
});
printExecution("3. Approved refund executes", firstRefund);

// Simulate the agent timing out after the provider already completed the refund.
// The retry must return the original result without mutating the provider again.
const replayedRefund = await gate.run({ ...approvedRefund }, async () => {
  providerRefundCalls += 1;
  return {
    refund_id: "should-not-run",
    provider_refund_calls: providerRefundCalls,
  };
});
printExecution("4. Identical retry replays cached result", replayedRefund);

const changedRefund = await gate.run({ ...approvedRefund, amountUsd: 50 }, async () => {
  providerRefundCalls += 1;
  return {
    refund_id: "should-not-run",
    provider_refund_calls: providerRefundCalls,
  };
});
printExecution("5. Changed retry under same idempotency key is denied", changedRefund);

printDecision("6. Agent tries to email PII externally", gate.check(piiEmail));

function printDecision(label: string, decision: ReturnType<typeof gate.check>): void {
  console.log(
    JSON.stringify(
      {
        step: label,
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

function printExecution<TResult>(
  label: string,
  execution: Awaited<ReturnType<typeof gate.run<TResult>>>,
): void {
  console.log(
    JSON.stringify(
      {
        step: label,
        executed: execution.executed,
        replayed: execution.executed ? execution.replayed : false,
        decision: execution.decision.type,
        reasons: execution.decision.reasons,
        result: execution.executed ? execution.result : undefined,
        receipt: execution.executed ? execution.receipt : undefined,
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

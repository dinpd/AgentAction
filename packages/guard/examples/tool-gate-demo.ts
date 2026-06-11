import policy from "./support-refund-policy.json" with { type: "json" };

import { createToolGate, type GuardCheck } from "../src/index.ts";

const gate = createToolGate({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
});

const tools = {
  "crm.read_customer": async (input: { customerId: string }) => ({
    customerId: input.customerId,
    caseId: "case-1042",
    plan: "pro",
  }),
  "stripe.refund": async (input: { paymentId: string; amountUsd: number }) => ({
    refundId: "re_123",
    paymentId: input.paymentId,
    amountUsd: input.amountUsd,
  }),
};

await runTool(
  "Allowed CRM read",
  {
    agentId: "support-agent",
    userId: "user-17",
    jobId: "case-gate",
    tool: "crm.read_customer",
    action: "read",
    resource: "customer/cus_123",
    dataFrom: "provider_crm",
    dataTo: "agent_context",
    dataClassification: ["customer_data"],
    fieldSet: ["customer_id", "case_id", "plan"],
    recordCount: 1,
  },
  () => tools["crm.read_customer"]({ customerId: "cus_123" }),
);

await runTool(
  "Refund pauses for approval",
  {
    agentId: "support-agent",
    userId: "user-17",
    jobId: "case-gate",
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-gate-pi_123",
  },
  () => tools["stripe.refund"]({ paymentId: "pi_123", amountUsd: 49 }),
);

await runTool(
  "Unknown tool is blocked",
  {
    agentId: "support-agent",
    userId: "user-17",
    jobId: "case-gate",
    tool: "shell.exec",
    action: "admin",
    resource: "prod-host",
  },
  async () => ({ output: "this callback is never invoked" }),
);

async function runTool<TResult>(
  label: string,
  check: GuardCheck,
  execute: () => Promise<TResult>,
): Promise<void> {
  const execution = await gate.run(check, execute);
  console.log(
    JSON.stringify(
      {
        label,
        executed: execution.executed,
        decision: execution.decision.type,
        reasons: execution.decision.reasons,
        challenge: execution.decision.challenge,
        result: execution.executed ? execution.result : undefined,
      },
      null,
      2,
    ),
  );
}

function demoIds(): () => string {
  let next = 1;
  return () => `gate-demo-dec-${next++}`;
}

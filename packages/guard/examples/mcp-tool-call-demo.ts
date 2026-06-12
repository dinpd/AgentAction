import { createMcpToolGate, type GuardPolicy } from "../src/index.ts";

const policy: GuardPolicy = {
  tools: {
    "provider.crm.search_customer": {
      action: "read",
    },
    "provider.billing.issue_credit": {
      action: "pay",
      requiresApproval: true,
      maxAmountUsd: 100,
      requireIdempotencyKey: true,
      singleUse: true,
    },
    "provider.email.send_external": {
      action: "send",
      requiresApprovalIfPii: true,
      allowedDomains: ["customer.example"],
      blockedFields: ["ssn", "access_token", "payment_method"],
    },
  },
  flows: [
    {
      from: "provider_crm",
      to: "agent_context",
      dataClassification: ["customer_data", "pii"],
      allowedFields: ["customer_id", "case_id", "plan"],
      maxRecords: 10,
    },
    {
      from: "provider_crm",
      to: "external_email",
      destinationType: "external_email",
      dataClassification: ["customer_data", "pii"],
      requiresApproval: true,
      allowedDomains: ["customer.example"],
      blockedFields: ["ssn", "access_token", "payment_method"],
    },
  ],
};

const gate = createMcpToolGate({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
  mappings: {
    "provider.crm.search_customer": {
      resource: (args) => `provider/customer/${String(args.customerId)}`,
      dataFrom: "provider_crm",
      dataTo: "agent_context",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "case_id", "plan"],
      recordCount: 1,
    },
    "provider.billing.issue_credit": {
      resource: (args) => `provider/customer/${String(args.customerId)}`,
      amountUsd: (args) => Number(args.amountUsd),
      idempotencyKey: (args) => String(args.idempotencyKey),
    },
    "provider.email.send_external": {
      dataFrom: "provider_crm",
      dataTo: "external_email",
      destinationType: "external_email",
      externalDomain: (args) => String(args.domain),
      dataClassification: ["customer_data", "pii"],
      fieldSet: (args) => (Array.isArray(args.fields) ? args.fields.map(String) : []),
      recordCount: 1,
    },
  },
});

await run("1. MCP CRM read executes", {
  params: {
    name: "provider.crm.search_customer",
    arguments: {
      customerId: "cus_123",
    },
  },
});

await run("2. MCP credit requires approval", {
  params: {
    name: "provider.billing.issue_credit",
    arguments: {
      customerId: "cus_123",
      amountUsd: 49,
      idempotencyKey: "credit-case-1042-cus_123",
    },
  },
});

await run(
  "3. Approved MCP credit executes",
  {
    params: {
      name: "provider.billing.issue_credit",
      arguments: {
        customerId: "cus_123",
        amountUsd: 49,
        idempotencyKey: "credit-case-1042-cus_123",
      },
    },
  },
  "approval-credit-1",
);

await run("4. PII email requires approval", {
  params: {
    name: "provider.email.send_external",
    arguments: {
      domain: "alice.customer.example",
      fields: ["customer_id", "case_id"],
    },
  },
});

async function run(
  label: string,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
  approvalId?: string,
): Promise<void> {
  const execution = await gate.run(
    request,
    {
      agentId: "support-agent",
      jobId: "case-1042",
      userId: "user-17",
      approvalId,
    },
    async ({ call, decision }) => ({
      tool: call.name,
      decisionId: decision.event.decisionId,
    }),
  );

  console.log(
    JSON.stringify(
      {
        label,
        executed: execution.executed,
        decision: execution.decision.type,
        reasons: execution.decision.reasons,
        challenge: execution.decision.challenge?.requiredApprovalFor,
        result: execution.executed ? execution.result : undefined,
      },
      null,
      2,
    ),
  );
}

function demoIds(): () => string {
  let next = 1;
  return () => `mcp-demo-dec-${next++}`;
}

import { createToolGate, type GuardCheck, type GuardPolicy } from "../src/index.ts";

const policy: GuardPolicy = {
  tools: {
    "web.search": {
      action: "read",
    },
    "gmail.send": {
      action: "send",
      requiresApprovalIfPii: true,
      allowedDomains: ["customer.example"],
      blockedFields: ["ssn", "access_token", "payment_method"],
    },
  },
  flows: [
    {
      from: "crm",
      to: "external_email",
      destinationType: "external_email",
      dataClassification: ["pii"],
      requiresApproval: true,
      allowedDomains: ["customer.example"],
      blockedFields: ["ssn", "access_token", "payment_method"],
    },
  ],
  budgets: {
    challengeAfterEstimatedCostUsdPerJob: 0.05,
    maxEstimatedCostUsdPerJob: 0.1,
    maxIdenticalToolCallsPerJob: 2,
    maxToolCallsPerJob: 8,
  },
  defaultSensitiveDestinationDecision: "deny",
};

const gate = createToolGate({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
});

await run("1. normal search executes", {
  agentId: "research-agent",
  jobId: "quickstart-job",
  tool: "web.search",
  action: "read",
  resource: "query:agent tool guardrails",
  callFingerprint: "web.search:agent-tool-guardrails",
  estimatedCostUsd: 0.02,
});

await run("2. duplicate search executes once more", {
  agentId: "research-agent",
  jobId: "quickstart-job",
  tool: "web.search",
  action: "read",
  resource: "query:agent tool guardrails",
  callFingerprint: "web.search:agent-tool-guardrails",
  estimatedCostUsd: 0.02,
});

await run("3. third identical search is denied", {
  agentId: "research-agent",
  jobId: "quickstart-job",
  tool: "web.search",
  action: "read",
  resource: "query:agent tool guardrails",
  callFingerprint: "web.search:agent-tool-guardrails",
  estimatedCostUsd: 0.02,
});

await run("4. PII email pauses for approval", {
  agentId: "support-agent",
  jobId: "quickstart-pii",
  tool: "gmail.send",
  action: "send",
  dataFrom: "crm",
  dataTo: "external_email",
  destinationType: "external_email",
  externalDomain: "alice.customer.example",
  dataClassification: ["pii"],
  fieldSet: ["customer_id", "case_id"],
});

async function run(label: string, check: GuardCheck): Promise<void> {
  const execution = await gate.run(check, async () => ({
    ok: true,
    tool: check.tool,
  }));

  console.log(
    JSON.stringify(
      {
        label,
        executed: execution.executed,
        decision: execution.decision.type,
        reasons: execution.decision.reasons,
        challenge: execution.decision.challenge?.requiredApprovalFor,
      },
      null,
      2,
    ),
  );
}

function demoIds(): () => string {
  let next = 1;
  return () => `quickstart-dec-${next++}`;
}

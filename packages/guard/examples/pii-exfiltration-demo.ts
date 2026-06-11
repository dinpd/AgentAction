import policy from "./support-refund-policy.json" with { type: "json" };

import { createGuard, type GuardCheck } from "../src/index.ts";

const guard = createGuard({
  policy,
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds(),
});

const scenarios: Array<{ label: string; request: GuardCheck }> = [
  {
    label: "1. CRM PII read into agent context",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "crm.read_customer",
      action: "read",
      dataFrom: "provider_crm",
      dataTo: "agent_context",
      destinationType: "agent_context",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "case_id", "plan"],
      recordCount: 1,
    },
  },
  {
    label: "2. Customer email needs approval",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "gmail.send",
      action: "send",
      dataFrom: "provider_crm",
      dataTo: "external_email",
      destinationType: "external_email",
      externalDomain: "alice.customer.example",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "case_id"],
      recordCount: 1,
    },
  },
  {
    label: "3. Unknown webhook destination is denied",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "webhook.post",
      action: "send",
      dataFrom: "provider_crm",
      dataTo: "partner_webhook",
      destinationType: "webhook",
      externalDomain: "unknown.example",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "case_id"],
      recordCount: 1,
      approvalId: "approval-webhook-1",
    },
  },
  {
    label: "4. Raw PII prompt to model provider is denied",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "llm.prompt",
      action: "send",
      dataFrom: "provider_crm",
      dataTo: "model_provider",
      destinationType: "model_provider",
      dataClassification: ["pii"],
      fieldSet: ["customer_id", "full_date_of_birth"],
      recordCount: 1,
      approvalId: "approval-prompt-1",
    },
  },
  {
    label: "5. Bulk PII export exceeds record cap",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "file.export",
      action: "export",
      dataFrom: "provider_crm",
      dataTo: "file_export",
      destinationType: "file_export",
      dataClassification: ["customer_data", "pii"],
      fieldSet: ["customer_id", "case_id"],
      recordCount: 51,
      approvalId: "approval-export-1",
    },
  },
  {
    label: "6. Health record field is blocked for browser automation",
    request: {
      agentId: "support-agent",
      userId: "user-17",
      jobId: "case-pii",
      tool: "browser.fill_form",
      action: "send",
      dataFrom: "provider_crm",
      dataTo: "browser_form",
      destinationType: "browser_form",
      externalDomain: "forms.customer.example",
      dataClassification: ["pii"],
      fieldSet: ["customer_id", "health_record_id"],
      recordCount: 1,
      approvalId: "approval-browser-1",
    },
  },
];

for (const scenario of scenarios) {
  const decision = guard.check(scenario.request);
  console.log(
    JSON.stringify(
      {
        scenario: scenario.label,
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
  return () => `pii-demo-dec-${next++}`;
}

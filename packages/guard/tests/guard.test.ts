import assert from "node:assert/strict";
import test from "node:test";

import { createGuard, createMcpToolGate, createToolGate, mcpToolCallToGuardCheck, type GuardPolicy } from "../src/index.ts";

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

test("sensitive data to model provider is denied by destination flow", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const decision = guard.check({
    agentId: "support-agent",
    jobId: "case-1042",
    tool: "llm.prompt",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "model_provider",
    destinationType: "model_provider",
    dataClassification: ["pii"],
    fieldSet: ["customer_id"],
  });

  assert.equal(decision.type, "deny");
  assert.ok(decision.reasons.includes("flow is denied: provider_crm -> model_provider"));
});

test("PII exfiltration matrix enforces destination-specific decisions", () => {
  const guard = createGuard({ policy: policy(), idGenerator: ids() });

  const internalRead = guard.check({
    agentId: "support-agent",
    jobId: "case-pii",
    tool: "crm.read_customer",
    action: "read",
    dataFrom: "provider_crm",
    dataTo: "agent_context",
    destinationType: "agent_context",
    dataClassification: ["customer_data", "pii"],
    fieldSet: ["customer_id", "case_id", "plan"],
    recordCount: 1,
  });
  assert.equal(internalRead.type, "allow");

  const approvedCustomerEmailMissingApproval = guard.check({
    agentId: "support-agent",
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
  });
  assert.equal(approvedCustomerEmailMissingApproval.type, "challenge_required");

  const unapprovedWebhook = guard.check({
    agentId: "support-agent",
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
    approvalId: "approval-1",
  });
  assert.equal(unapprovedWebhook.type, "deny");
  assert.ok(unapprovedWebhook.reasons.includes("externalDomain is not allowed: unknown.example"));

  const rawPiiPrompt = guard.check({
    agentId: "support-agent",
    jobId: "case-pii",
    tool: "llm.prompt",
    action: "send",
    dataFrom: "provider_crm",
    dataTo: "model_provider",
    destinationType: "model_provider",
    dataClassification: ["pii"],
    fieldSet: ["customer_id", "full_date_of_birth"],
    recordCount: 1,
    approvalId: "approval-1",
  });
  assert.equal(rawPiiPrompt.type, "deny");
  assert.ok(rawPiiPrompt.reasons.includes("flow is denied: provider_crm -> model_provider"));

  const fileExportTooLarge = guard.check({
    agentId: "support-agent",
    jobId: "case-pii",
    tool: "file.export",
    action: "export",
    dataFrom: "provider_crm",
    dataTo: "file_export",
    destinationType: "file_export",
    dataClassification: ["customer_data", "pii"],
    fieldSet: ["customer_id", "case_id"],
    recordCount: 51,
    approvalId: "approval-1",
  });
  assert.equal(fileExportTooLarge.type, "deny");
  assert.ok(fileExportTooLarge.reasons.includes("recordCount exceeds maxRecords 50"));

  const browserFormWithHealthRecord = guard.check({
    agentId: "support-agent",
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
    approvalId: "approval-1",
  });
  assert.equal(browserFormWithHealthRecord.type, "deny");
  assert.ok(browserFormWithHealthRecord.reasons.includes("field is blocked: health_record_id"));
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

test("job budgets can require approval before hard caps", () => {
  const guard = createGuard({
    policy: circuitBreakerPolicy({
      challengeAfterToolCallsPerJob: 1,
      maxToolCallsPerJob: 3,
    }),
    idGenerator: ids(),
  });

  const first = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:refund policy",
  });

  const challenged = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:refund policy details",
  });

  const approved = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:refund policy details",
    approvalId: "approval-budget-1",
  });

  assert.equal(first.type, "allow");
  assert.equal(challenged.type, "challenge_required");
  assert.deepEqual(challenged.challenge?.requiredApprovalFor, ["budget"]);
  assert.equal(approved.type, "allow");
});

test("same-tool circuit breaker denies thrashing", () => {
  const guard = createGuard({
    policy: circuitBreakerPolicy({
      maxSameToolCallsPerJob: 2,
    }),
    idGenerator: ids(),
  });

  for (const resource of ["query:one", "query:two"]) {
    const decision = guard.check({
      agentId: "research-agent",
      jobId: "research-loop",
      tool: "web.search",
      action: "read",
      resource,
    });
    assert.equal(decision.type, "allow");
  }

  const denied = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:three",
  });

  assert.equal(denied.type, "deny");
  assert.ok(denied.reasons.includes("job exceeds maxSameToolCallsPerJob 2"));
});

test("identical-call circuit breaker denies repeated calls", () => {
  const guard = createGuard({
    policy: circuitBreakerPolicy({
      maxIdenticalToolCallsPerJob: 2,
    }),
    idGenerator: ids(),
  });

  for (const resource of ["query:same?page=1", "query:same?page=2"]) {
    const decision = guard.check({
      agentId: "research-agent",
      jobId: "research-loop",
      tool: "web.search",
      action: "read",
      resource,
      callFingerprint: "web.search:same",
    });
    assert.equal(decision.type, "allow");
  }

  const denied = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:same?page=3",
    callFingerprint: "web.search:same",
  });

  assert.equal(denied.type, "deny");
  assert.ok(denied.reasons.includes("job exceeds maxIdenticalToolCallsPerJob 2"));
});

test("runtime circuit breaker denies long-running jobs", () => {
  let current = new Date("2026-06-11T12:00:00Z");
  const guard = createGuard({
    policy: circuitBreakerPolicy({
      maxRuntimeMsPerJob: 1000,
    }),
    idGenerator: ids(),
    now: () => current,
  });

  const first = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:first",
  });
  assert.equal(first.type, "allow");

  current = new Date("2026-06-11T12:00:02Z");
  const denied = guard.check({
    agentId: "research-agent",
    jobId: "research-loop",
    tool: "web.search",
    action: "read",
    resource: "query:late",
  });

  assert.equal(denied.type, "deny");
  assert.ok(denied.reasons.includes("job exceeds maxRuntimeMsPerJob 1000"));
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
    callFingerprint: undefined,
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

test("tool gate executes allowed tool calls", async () => {
  const gate = createToolGate({ policy: policy(), idGenerator: ids() });
  let calls = 0;

  const execution = await gate.run(
    {
      agentId: "support-agent",
      jobId: "case-gate",
      tool: "crm.read_customer",
      action: "read",
      resource: "customer/cus_123",
      dataFrom: "provider_crm",
      dataTo: "agent_context",
      dataClassification: ["customer_data"],
      fieldSet: ["customer_id"],
      recordCount: 1,
    },
    async ({ check, decision }) => {
      calls += 1;
      return {
        customerId: check.resource,
        decisionId: decision.event.decisionId,
      };
    },
  );

  assert.equal(execution.executed, true);
  assert.equal(calls, 1);
  assert.equal(execution.decision.type, "allow");
  assert.deepEqual(execution.result, {
    customerId: "customer/cus_123",
    decisionId: "dec-1",
  });
});

test("tool gate does not execute denied tool calls", async () => {
  const gate = createToolGate({ policy: policy(), idGenerator: ids() });
  let calls = 0;

  const execution = await gate.run(
    {
      agentId: "support-agent",
      jobId: "case-gate",
      tool: "shell.exec",
      action: "admin",
    },
    async () => {
      calls += 1;
      return "should not run";
    },
  );

  assert.equal(execution.executed, false);
  assert.equal(calls, 0);
  assert.equal(execution.decision.type, "deny");
  assert.ok(execution.decision.reasons.includes("tool is not declared: shell.exec"));
});

test("tool gate does not execute challenge-required tool calls", async () => {
  const gate = createToolGate({ policy: policy(), idGenerator: ids() });
  let calls = 0;

  const execution = await gate.run(
    {
      agentId: "support-agent",
      jobId: "case-gate",
      tool: "stripe.refund",
      action: "pay",
      resource: "payment/pi_123",
      amountUsd: 49,
      idempotencyKey: "refund-case-gate-pi_123",
    },
    async () => {
      calls += 1;
      return "should not run";
    },
  );

  assert.equal(execution.executed, false);
  assert.equal(calls, 0);
  assert.equal(execution.decision.type, "challenge_required");
  assert.deepEqual(execution.decision.challenge?.requiredApprovalFor, ["tool"]);
});

test("MCP tool gate maps tools/call requests into guard checks", () => {
  const check = mcpToolCallToGuardCheck(
    {
      params: {
        name: "provider.billing.issue_credit",
        arguments: {
          customerId: "cus_123",
          amountUsd: 49,
          idempotencyKey: "credit-case-1-cus_123",
        },
      },
    },
    {
      agentId: "support-agent",
      jobId: "case-mcp",
      userId: "user-1",
    },
    {
      mappings: {
        "provider.billing.issue_credit": {
          resource: (args) => `provider/customer/${String(args.customerId)}`,
          amountUsd: (args) => Number(args.amountUsd),
          idempotencyKey: (args) => String(args.idempotencyKey),
        },
      },
    },
  );

  assert.deepEqual(check, {
    agentId: "support-agent",
    jobId: "case-mcp",
    userId: "user-1",
    approvalId: undefined,
    retryCount: undefined,
    tool: "provider.billing.issue_credit",
    action: "pay",
    resource: "provider/customer/cus_123",
    callFingerprint:
      'provider.billing.issue_credit:{"amountUsd":49,"customerId":"cus_123","idempotencyKey":"credit-case-1-cus_123"}',
    amountUsd: 49,
    idempotencyKey: "credit-case-1-cus_123",
    dataFrom: undefined,
    dataTo: undefined,
    destinationType: undefined,
    externalDomain: undefined,
    dataClassification: undefined,
    fieldSet: undefined,
    recordCount: undefined,
    estimatedTokens: undefined,
    estimatedCostUsd: undefined,
  });
});

test("MCP tool gate prevents challenged provider tools from executing", async () => {
  const gate = createMcpToolGate({
    policy: mcpPolicy(),
    idGenerator: ids(),
    mappings: mcpMappings(),
  });
  let calls = 0;

  const execution = await gate.run(
    {
      params: {
        name: "provider.billing.issue_credit",
        arguments: {
          customerId: "cus_123",
          amountUsd: 49,
          idempotencyKey: "credit-case-1-cus_123",
        },
      },
    },
    {
      agentId: "support-agent",
      jobId: "case-mcp",
    },
    async () => {
      calls += 1;
      return "should not execute";
    },
  );

  assert.equal(execution.executed, false);
  assert.equal(calls, 0);
  assert.equal(execution.decision.type, "challenge_required");
  assert.deepEqual(execution.decision.challenge?.requiredApprovalFor, ["tool"]);
});

test("MCP tool gate executes approved provider tools", async () => {
  const gate = createMcpToolGate({
    policy: mcpPolicy(),
    idGenerator: ids(),
    mappings: mcpMappings(),
  });

  const execution = await gate.run(
    {
      name: "provider.billing.issue_credit",
      arguments: {
        customerId: "cus_123",
        amountUsd: 49,
        idempotencyKey: "credit-case-1-cus_123",
      },
    },
    {
      agentId: "support-agent",
      jobId: "case-mcp",
      approvalId: "approval-credit-1",
    },
    async ({ check, decision, call }) => ({
      tool: call.name,
      resource: check.resource,
      decisionId: decision.event.decisionId,
    }),
  );

  assert.equal(execution.executed, true);
  assert.equal(execution.decision.type, "allow");
  assert.deepEqual(execution.result, {
    tool: "provider.billing.issue_credit",
    resource: "provider/customer/cus_123",
    decisionId: "dec-1",
  });
});

test("MCP tool gate carries PII flow metadata into guard decisions", () => {
  const gate = createMcpToolGate({
    policy: mcpPolicy(),
    idGenerator: ids(),
    mappings: mcpMappings(),
  });

  const decision = gate.check(
    {
      name: "provider.email.send_external",
      arguments: {
        domain: "alice.customer.example",
        fields: ["customer_id", "case_id"],
      },
    },
    {
      agentId: "support-agent",
      jobId: "case-mcp",
    },
  );

  assert.equal(decision.type, "challenge_required");
  assert.deepEqual(decision.challenge?.requiredApprovalFor, ["pii", "flow"]);
  assert.equal(decision.event.dataFrom, "provider_crm");
  assert.equal(decision.event.dataTo, "external_email");
  assert.deepEqual(decision.event.fieldSet, ["customer_id", "case_id"]);
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
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      "webhook.post": {
        action: "send",
        requiresApprovalIfPii: true,
        allowedDomains: ["approved.partner.example"],
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      "llm.prompt": {
        action: "send",
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      "file.export": {
        action: "export",
        requiresApprovalIfPii: true,
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      "browser.fill_form": {
        action: "send",
        requiresApprovalIfPii: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
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
        destinationType: "external_email",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "partner_webhook",
        destinationType: "webhook",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        allowedDomains: ["approved.partner.example"],
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "browser_form",
        destinationType: "browser_form",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "file_export",
        destinationType: "file_export",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        maxRecords: 50,
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "model_provider",
        destinationType: "model_provider",
        dataClassification: ["pii"],
        decision: "deny",
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
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

function circuitBreakerPolicy(budgets: GuardPolicy["budgets"]): GuardPolicy {
  return {
    tools: {
      "web.search": {
        action: "read",
      },
    },
    budgets,
  };
}

function mcpPolicy(): GuardPolicy {
  return {
    tools: {
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
        to: "external_email",
        destinationType: "external_email",
        dataClassification: ["customer_data", "pii"],
        requiresApproval: true,
        allowedDomains: ["customer.example"],
        blockedFields: ["ssn", "access_token", "payment_method"],
      },
    ],
  };
}

function mcpMappings(): Parameters<typeof createMcpToolGate>[0]["mappings"] {
  return {
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
    },
  };
}

function ids(): () => string {
  let next = 1;
  return () => `dec-${next++}`;
}

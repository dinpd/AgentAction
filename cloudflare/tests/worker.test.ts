import assert from "node:assert/strict";
import test from "node:test";

import gateway, { AgentIdJitGrants } from "../src/worker.ts";

type Stored = Map<string, unknown>;

class MemoryNamespace {
  stores = new Map<string, Stored>();
  objects = new Map<string, AgentIdJitGrants>();

  idFromName(name: string): string {
    return name;
  }

  get(id: string): AgentIdJitGrants {
    let object = this.objects.get(id);
    if (!object) {
      const values = new Map<string, unknown>();
      this.stores.set(id, values);
      object = new AgentIdJitGrants({
        storage: {
          async get<T>(key: string): Promise<T | undefined> {
            return values.get(key) as T | undefined;
          },
          async put<T>(key: string, value: T): Promise<void> {
            values.set(key, value);
          },
        },
      });
      this.objects.set(id, object);
    }
    return object;
  }
}

class TestContext {
  promises: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  async flush(): Promise<void> {
    await Promise.all(this.promises.splice(0));
  }
}

test("hosted approval runs once and records a correlated audit timeline", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const payload = {
    approval_id: "approval-refund-1",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_1/customer/cus_1",
    requested_by: "support-1",
    user_id: "support-1",
    reason: "duplicate charge verified",
    job_id: "case-1",
    amount: 49,
    currency: "USD",
    idempotency_key: "refund-case-1",
  };

  const created = await call(env, ctx, "POST", "/approval-requests", payload);
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "pending");
  assert.match(String(created.body.evidence.request_digest), /^sha256:[a-f0-9]{64}$/);
  assert.equal(created.body.evidence.schema_version, "agentpass.approval-evidence.v1");
  await ctx.flush();

  const queue = await call(env, ctx, "GET", "/approval-requests?status=pending");
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.approvals.map((approval: Record<string, unknown>) => approval.approval_id), ["approval-refund-1"]);

  const missingReviewer = await call(env, ctx, "POST", "/approval-requests/approval-refund-1/approve", {});
  assert.equal(missingReviewer.status, 400);
  assert.equal(missingReviewer.body.error, "decided_by is required");

  const approved = await call(env, ctx, "POST", "/approval-requests/approval-refund-1/approve", {
    decided_by: "manager-1",
    decision_reason: "refund evidence verified",
    findings: ["amount and customer verified"],
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.decision_reason, "refund evidence verified");
  await ctx.flush();

  const grantRequest = {
    tool: payload.tool,
    action: payload.action,
    resource: payload.resource,
    approval_id: payload.approval_id,
    user_id: payload.user_id,
    job_id: payload.job_id,
    amount: payload.amount,
    currency: payload.currency,
    idempotency_key: payload.idempotency_key,
  };
  const grant = await call(env, ctx, "POST", "/jit-grants", grantRequest);
  assert.equal(grant.status, 201);
  assert.equal(grant.body.evidence.request_digest, created.body.evidence.request_digest);
  await ctx.flush();

  const action = {
    agent_id: "customer-support-refund-agent",
    ...grantRequest,
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  };
  const first = await call(env, ctx, "POST", "/authorize", action);
  assert.equal(first.status, 200);
  assert.equal(first.body.allow, true);
  await ctx.flush();

  const replay = await call(env, ctx, "POST", "/authorize", action);
  assert.equal(replay.status, 403);
  assert.ok(replay.body.findings.includes("JIT grant was already used"));
  await ctx.flush();

  const audit = await call(env, ctx, "GET", "/audit/events?approval_id=approval-refund-1&limit=20");
  const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.deepEqual(types, [
    "agentid.decision",
    "agentid.decision",
    "agentid.jit.issued",
    "agentid.approval.decided",
    "agentid.approval.created",
  ]);
  assert.match(String(audit.body.events[0].payload.decision_summary), /^Denied write refund\/re_1/);
  assert.equal(audit.body.events[1].payload.decision_summary, "Allowed write refund/re_1/customer/cus_1 with scoped authority.");
});

test("scope drift and expired approvals fail closed", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const base = {
    approval_id: "approval-expiring",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_2/customer/cus_2",
    requested_by: "support-2",
    user_id: "support-2",
    reason: "duplicate charge verified",
    amount: 25,
  };

  await call(env, ctx, "POST", "/approval-requests", base);
  await call(env, ctx, "POST", "/approval-requests/approval-expiring/approve", {
    decided_by: "manager-1",
    decision_reason: "reviewed",
  });
  const drifted = await call(env, ctx, "POST", "/jit-grants", {
    ...base,
    approval_id: base.approval_id,
    resource: "refund/re_CHANGED/customer/cus_2",
  });
  assert.equal(drifted.status, 400);
  assert.equal(drifted.body.error, "approval request resource mismatch");

  for (const changedScope of [
    { amount: 26 },
    { external_domain: "changed.example" },
    { field_set: ["customer_id", "ssn"] },
  ]) {
    const digestMismatch = await call(env, ctx, "POST", "/jit-grants", {
      tool: base.tool,
      action: base.action,
      resource: base.resource,
      approval_id: base.approval_id,
      user_id: base.user_id,
      amount: base.amount,
      ...changedScope,
    });
    assert.equal(digestMismatch.status, 400);
    assert.equal(digestMismatch.body.error, "approval request request_digest mismatch");
  }

  const stored = namespace.stores.get("customer-support-refund-agent");
  const approval = stored?.get("approval:approval-expiring") as Record<string, unknown>;
  approval.status = "approved";
  approval.expires_at = "2000-01-01T00:00:00.000Z";
  stored?.set("approval:approval-expiring", approval);

  const expired = await call(env, ctx, "POST", "/jit-grants", {
    tool: base.tool,
    action: base.action,
    resource: base.resource,
    approval_id: base.approval_id,
    user_id: base.user_id,
    amount: base.amount,
  });
  assert.equal(expired.status, 400);
  assert.equal(expired.body.error, "approval request is expired: approval-expiring");
});

test("hosted idempotency replays completed refund result and denies changed retry", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const approval = {
    approval_id: "approval-refund-replay",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_replay/customer/cus_1",
    requested_by: "support-1",
    user_id: "support-1",
    reason: "duplicate charge verified",
    job_id: "case-replay",
    amount: 49,
    currency: "USD",
    idempotency_key: "refund-case-replay",
  };

  const created = await call(env, ctx, "POST", "/approval-requests", approval);
  await call(env, ctx, "POST", "/approval-requests/approval-refund-replay/approve", {
    decided_by: "manager-1",
    decision_reason: "refund evidence verified",
  });
  const grantRequest = {
    tool: approval.tool,
    action: approval.action,
    resource: approval.resource,
    approval_id: approval.approval_id,
    user_id: approval.user_id,
    job_id: approval.job_id,
    amount: approval.amount,
    currency: approval.currency,
    idempotency_key: approval.idempotency_key,
  };
  const grant = await call(env, ctx, "POST", "/jit-grants", grantRequest);
  const action = {
    agent_id: "customer-support-refund-agent",
    ...grantRequest,
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  };
  const prematureRecord = await call(env, ctx, "POST", "/execution-results", {
    ...action,
    result: { refund_id: "should-not-record" },
  });
  assert.equal(prematureRecord.status, 409);
  assert.equal(prematureRecord.body.error, "JIT grant has not been consumed by authorize");

  const first = await call(env, ctx, "POST", "/authorize", action);
  assert.equal(first.status, 200);
  assert.equal(first.body.allow, true);
  await ctx.flush();

  const providerResult = {
    refund_id: "re_replay",
    amount: 49,
    provider_refund_calls: 1,
  };
  const recorded = await call(env, ctx, "POST", "/execution-results", {
    ...action,
    result: providerResult,
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.request_digest, created.body.evidence.request_digest);
  assert.equal(recorded.body.receipt.status, "executed");
  await ctx.flush();

  const retry = await call(env, ctx, "POST", "/authorize", action);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.allow, true);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.result, providerResult);
  assert.equal(retry.body.receipt.status, "replayed");
  assert.equal(retry.body.receipt.replayed_from_decision_id, recorded.body.receipt.decision_id);
  await ctx.flush();

  const changed = await call(env, ctx, "POST", "/authorize", { ...action, amount: 50 });
  assert.equal(changed.status, 403);
  assert.equal(changed.body.allow, false);
  assert.deepEqual(changed.body.findings, ["idempotencyKey was already used with different request digest"]);
  await ctx.flush();

  const audit = await call(env, ctx, "GET", "/audit/events?approval_id=approval-refund-replay&limit=20");
  const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.ok(types.includes("agentid.provider.executed"));
  assert.ok(types.includes("agentid.provider.replayed"));
  assert.ok(types.includes("agentid.decision"));
});

test("hosted PII egress enforces fields domains approval and exact scope", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace, AGENTID_MANIFEST_JSON: JSON.stringify(piiManifest()) };
  const ctx = new TestContext();

  const internalRead = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "crm.read_customer",
    action: "read",
    data_from: "provider_crm",
    data_to: "agent_context",
    destination_type: "agent_context",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
  });
  assert.equal(internalRead.status, 200);
  assert.equal(internalRead.body.allow, true);

  const blockedEmailField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "email.send_external",
    action: "send",
    data_from: "provider_crm",
    data_to: "external_email",
    destination_type: "external_email",
    external_domain: "alice.customer.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "ssn"],
    record_count: 1,
  });
  assert.equal(blockedEmailField.status, 403);
  assert.ok(blockedEmailField.body.findings.includes("event[0]: field is blocked by flow: ssn"));

  const blockedWebhookField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "webhook.post",
    action: "send",
    data_from: "provider_crm",
    data_to: "partner_webhook",
    destination_type: "webhook",
    external_domain: "approved.partner.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "access_token"],
    record_count: 1,
  });
  assert.equal(blockedWebhookField.status, 403);
  assert.ok(blockedWebhookField.body.findings.includes("event[0]: field is blocked by flow: access_token"));

  const challenge = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "email.send_external",
    action: "send",
    resource: "email/customer/cus_123",
    data_from: "provider_crm",
    data_to: "external_email",
    destination_type: "external_email",
    external_domain: "alice.customer.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
  });
  assert.equal(challenge.status, 403);
  assert.equal(challenge.body.decision, "challenge_required");
  assert.ok(challenge.body.findings.includes("event[0]: provider_crm -> external_email requires approval"));

  const approvalPayload = {
    approval_id: "approval-pii-email",
    tool: "email.send_external",
    action: "send",
    resource: "email/customer/cus_123",
    requested_by: "support-1",
    user_id: "support-1",
    reason: "send account summary to verified customer domain",
    data_from: "provider_crm",
    data_to: "external_email",
    destination_type: "external_email",
    external_domain: "alice.customer.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
    redaction_state: "minimum_fields",
    retention: "transient",
  };
  const approval = await call(env, ctx, "POST", "/approval-requests", approvalPayload);
  assert.equal(approval.status, 201);
  assert.deepEqual(approval.body.evidence.data_classification, ["customer_data", "pii"]);
  assert.equal(approval.body.evidence.external_domain, "alice.customer.example");
  assert.deepEqual(approval.body.evidence.field_set, ["case_id", "customer_id"]);
  await call(env, ctx, "POST", "/approval-requests/approval-pii-email/approve", {
    decided_by: "manager-1",
    decision_reason: "verified recipient and minimum fields",
  });

  const approvedExact = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    ...approvalPayload,
    approved: true,
  });
  assert.equal(approvedExact.status, 200);
  assert.equal(approvedExact.body.allow, true);
  assert.equal(approvedExact.body.event.approval_evidence.request_digest, approval.body.evidence.request_digest);

  const changedDomain = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    ...approvalPayload,
    approved: true,
    external_domain: "attacker.example",
  });
  assert.equal(changedDomain.status, 403);
  assert.ok(changedDomain.body.findings.includes("approval request request_digest mismatch"));
  assert.ok(changedDomain.body.findings.includes("event[0]: external_domain is not allowed for flow: attacker.example"));

  const changedField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    ...approvalPayload,
    approved: true,
    field_set: ["customer_id", "case_id", "ssn"],
  });
  assert.equal(changedField.status, 403);
  assert.ok(changedField.body.findings.includes("approval request request_digest mismatch"));
  assert.ok(changedField.body.findings.includes("event[0]: field is blocked by flow: ssn"));
});

async function call(
  env: Record<string, unknown>,
  ctx: TestContext,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const response = await gateway.fetch(
    new Request(`https://gateway.example.com${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as never,
    ctx as never,
  );
  return { status: response.status, body: await response.json() };
}

function piiManifest(): Record<string, unknown> {
  return {
    agent: {
      id: "support-agent",
      name: "Support Agent",
      owner: "support",
      environment: "test",
      purpose: "PII egress tests",
    },
    tools: [
      { name: "crm.read_customer", access: "read", auth_mode: "delegated", approval: "none" },
      { name: "email.send_external", access: "send", auth_mode: "delegated", approval: "human_confirm" },
      { name: "webhook.post", access: "send", auth_mode: "delegated", approval: "human_confirm" },
    ],
    data_flows: [
      {
        from: "provider_crm",
        to: "agent_context",
        destination_type: "agent_context",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        allowed_fields: ["customer_id", "case_id", "plan"],
        max_records: 10,
      },
      {
        from: "provider_crm",
        to: "external_email",
        destination_type: "external_email",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        requires_approval: true,
        allowed_domains: ["customer.example"],
        blocked_fields: ["ssn", "access_token", "payment_method"],
      },
      {
        from: "provider_crm",
        to: "partner_webhook",
        destination_type: "webhook",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        requires_approval: true,
        allowed_domains: ["approved.partner.example"],
        blocked_fields: ["ssn", "access_token", "payment_method"],
      },
    ],
    runtime: { enforce_manifest: true },
  };
}

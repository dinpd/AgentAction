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

test("hosted authorization issues provider JWS receipt and JWKS", async () => {
  const namespace = new MemoryNamespace();
  const receiptKeys = await receiptKeyEnv();
  const env = { JIT_GRANTS: namespace, ...receiptKeys.env };
  const ctx = new TestContext();

  const jwks = await call(env, ctx, "GET", "/.well-known/jwks.json");
  assert.equal(jwks.status, 200);
  assert.deepEqual(
    jwks.body.keys.map((key: Record<string, unknown>) => key.kid),
    ["agentpass-2026-05", "agentpass-2026-06"],
  );
  assert.equal(jwks.body.keys[0].d, undefined);

  const approval = {
    approval_id: "approval-receipt-1",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_receipt/customer/cus_1",
    requested_by: "support-1",
    user_id: "support-1",
    reason: "duplicate charge verified",
    job_id: "case-receipt",
    amount: 49,
    currency: "USD",
    idempotency_key: "refund-case-receipt",
  };

  const created = await call(env, ctx, "POST", "/approval-requests", approval);
  await call(env, ctx, "POST", "/approval-requests/approval-receipt-1/approve", {
    decided_by: "manager-1",
    decision_reason: "receipt evidence verified",
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

  const decision = await call(env, ctx, "POST", "/authorize", {
    agent_id: "customer-support-refund-agent",
    ...grantRequest,
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  });
  assert.equal(decision.status, 200);
  assert.equal(typeof decision.body.authorization_receipt.jws, "string");

  const verified = await verifyReceiptJws(decision.body.authorization_receipt.jws, jwks.body);
  assert.equal(verified.header.kid, "agentpass-2026-06");
  assert.equal(verified.claims.iss, "https://agentpass.example");
  assert.equal(verified.claims.aud, "provider-mcp");
  assert.equal(verified.claims.jti, verified.claims.receipt.decision_id);
  assert.equal(verified.claims.receipt.schema_version, "agentpass.provider-authorization-receipt.v1");
  assert.equal(verified.claims.receipt.agent_id, "customer-support-refund-agent");
  assert.equal(verified.claims.receipt.tool, "stripe.create_refund");
  assert.equal(verified.claims.receipt.approval_id, "approval-receipt-1");
  assert.equal(verified.claims.receipt.jit_grant_id, grant.body.jit_grant_id);
  assert.equal(verified.claims.receipt.request_digest, created.body.evidence.request_digest);
  assert.equal(verified.claims.exp, Math.floor(Date.parse(grant.body.expires_at) / 1000));
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
    intent_id: "intent-refund-replay",
    intent_digest: "cca53a992d75306cf35671fcbffeeabe17fac90e0754e36109d24ac5b4d5e33e",
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
  assert.equal(created.body.evidence.intent_id, approval.intent_id);
  assert.equal(created.body.evidence.intent_digest, approval.intent_digest);
  await call(env, ctx, "POST", "/approval-requests/approval-refund-replay/approve", {
    decided_by: "manager-1",
    decision_reason: "refund evidence verified",
  });
  const grantRequest = {
    tool: approval.tool,
    action: approval.action,
    intent_id: approval.intent_id,
    intent_digest: approval.intent_digest,
    resource: approval.resource,
    approval_id: approval.approval_id,
    user_id: approval.user_id,
    job_id: approval.job_id,
    amount: approval.amount,
    currency: approval.currency,
    idempotency_key: approval.idempotency_key,
  };
  const grant = await call(env, ctx, "POST", "/jit-grants", grantRequest);
  assert.equal(grant.body.intent_id, approval.intent_id);
  assert.equal(grant.body.intent_digest, approval.intent_digest);
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
  assert.equal(recorded.body.receipt.intent_id, approval.intent_id);
  assert.equal(recorded.body.receipt.intent_digest, approval.intent_digest);
  assert.equal(recorded.body.receipt.job_id, approval.job_id);
  assert.match(String(recorded.body.receipt.result_digest), /^[a-f0-9]{64}$/);
  await ctx.flush();

  const retry = await call(env, ctx, "POST", "/authorize", action);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.allow, true);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.result, providerResult);
  assert.equal(retry.body.receipt.status, "replayed");
  assert.equal(retry.body.receipt.intent_id, approval.intent_id);
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

test("hosted production deploy gate dispatches GitHub workflow and binds rollback scope", async () => {
  const namespace = new MemoryNamespace();
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_GITHUB_API_BASE: "https://github-api.example",
    AGENTID_GITHUB_TOKEN: "github-token",
    AGENTID_MANIFEST_JSON: JSON.stringify(deployManifest()),
  };
  const ctx = new TestContext();
  const githubCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    githubCalls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  };

  try {
    const inspect = await call(env, ctx, "POST", "/authorize", {
      agent_id: "platform-release-agent",
      tool: "devops.inspect.production",
      action: "read",
      resource: "service/checkout-api/environment/production",
      user_id: "release-1",
      job_id: "production_deploy",
      environment: "production",
      service_id: "checkout-api",
      repo: "github.com/example/checkout",
      branch: "main",
    });
    assert.equal(inspect.status, 200);
    assert.equal(inspect.body.allow, true);

    const missingChangeRequest = await call(env, ctx, "POST", "/authorize", {
      agent_id: "platform-release-agent",
      tool: "devops.deploy.production",
      action: "deploy",
      resource: "service/checkout-api/environment/production",
      user_id: "release-1",
      job_id: "production_deploy",
      environment: "production",
      service_id: "checkout-api",
      repo: "github.com/example/checkout",
      branch: "main",
      commit_sha: "abc123def456",
      workflow_id: "deploy-production.yml",
      idempotency_key: "deploy-checkout-abc123def456",
    });
    assert.equal(missingChangeRequest.status, 403);
    assert.ok(
      missingChangeRequest.body.findings.includes("event[0]: required context field is missing: change_request_id"),
    );
    assert.ok(
      missingChangeRequest.body.findings.includes(
        "event[0]: devops.deploy.production requires JIT authorization but no jit_grant_id is present",
      ),
    );

    const stagingDeploy = await call(env, ctx, "POST", "/authorize", {
      agent_id: "platform-release-agent",
      tool: "devops.deploy.production",
      action: "deploy",
      resource: "service/checkout-api/environment/staging",
      user_id: "release-1",
      job_id: "production_deploy",
      environment: "staging",
      service_id: "checkout-api",
      repo: "github.com/example/checkout",
      branch: "main",
      commit_sha: "abc123def456",
      change_request_id: "CHG-1042",
      workflow_id: "deploy-production.yml",
      approved: true,
    });
    assert.equal(stagingDeploy.status, 403);
    assert.ok(stagingDeploy.body.findings.includes("event[0]: environment is not allowed: staging"));

    const approvalPayload = {
      approval_id: "approval-prod-deploy-test",
      tool: "devops.deploy.production",
      action: "deploy",
      resource: "service/checkout-api/environment/production",
      requested_by: "release-1",
      user_id: "release-1",
      reason: "Deploy checkout-api after approved change request",
      job_id: "production_deploy",
      environment: "production",
      service_id: "checkout-api",
      repo: "github.com/example/checkout",
      branch: "main",
      commit_sha: "abc123def456",
      change_request_id: "CHG-1042",
      workflow_id: "deploy-production.yml",
      idempotency_key: "deploy-checkout-abc123def456",
    };
    const created = await call(env, ctx, "POST", "/approval-requests", approvalPayload);
    assert.equal(created.status, 201);
    assert.equal(created.body.evidence.context.environment, "production");
    assert.equal(created.body.evidence.context.commit_sha, "abc123def456");
    assert.equal(created.body.evidence.context.change_request_id, "CHG-1042");
    assert.equal(created.body.evidence.context.workflow_id, "deploy-production.yml");
    await call(env, ctx, "POST", "/approval-requests/approval-prod-deploy-test/approve", {
      decided_by: "release-manager-1",
      decision_reason: "Change request and commit verified",
    });

    const grantRequest = {
      tool: approvalPayload.tool,
      action: approvalPayload.action,
      resource: approvalPayload.resource,
      approval_id: approvalPayload.approval_id,
      user_id: approvalPayload.user_id,
      job_id: approvalPayload.job_id,
      environment: approvalPayload.environment,
      service_id: approvalPayload.service_id,
      repo: approvalPayload.repo,
      branch: approvalPayload.branch,
      commit_sha: approvalPayload.commit_sha,
      change_request_id: approvalPayload.change_request_id,
      workflow_id: approvalPayload.workflow_id,
      idempotency_key: approvalPayload.idempotency_key,
    };

    const changedCommitGrant = await call(env, ctx, "POST", "/jit-grants", {
      ...grantRequest,
      commit_sha: "def456abc123",
    });
    assert.equal(changedCommitGrant.status, 400);
    assert.equal(changedCommitGrant.body.error, "approval request commit_sha mismatch");

    const grant = await call(env, ctx, "POST", "/jit-grants", grantRequest);
    assert.equal(grant.status, 201);
    assert.equal(grant.body.evidence.request_digest, created.body.evidence.request_digest);

    const action = {
      agent_id: "platform-release-agent",
      ...grantRequest,
      approved: true,
      jit_grant_id: grant.body.jit_grant_id,
    };
    const dispatched = await call(env, ctx, "POST", "/github-actions/dispatch", action);
    assert.equal(dispatched.status, 201);
    assert.equal(dispatched.body.request_digest, created.body.evidence.request_digest);
    assert.equal(dispatched.body.result.status, "dispatched");
    assert.equal(dispatched.body.result.workflow_id, "deploy-production.yml");
    assert.equal(dispatched.body.result.repository, "example/checkout");
    assert.equal(githubCalls.length, 1);
    assert.equal(
      githubCalls[0].url,
      "https://github-api.example/repos/example/checkout/actions/workflows/deploy-production.yml/dispatches",
    );
    assert.deepEqual(JSON.parse(String(githubCalls[0].init?.body)), {
      ref: "main",
      inputs: {
        environment: "production",
        service_id: "checkout-api",
        repo: "github.com/example/checkout",
        branch: "main",
        commit_sha: "abc123def456",
        change_request_id: "CHG-1042",
        resource: "service/checkout-api/environment/production",
        job_id: "production_deploy",
      },
    });
    await ctx.flush();

    const retry = await call(env, ctx, "POST", "/github-actions/dispatch", action);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.deepEqual(retry.body.result, dispatched.body.result);
    assert.equal(githubCalls.length, 1);

    const changedCommit = await call(env, ctx, "POST", "/github-actions/dispatch", {
      ...action,
      commit_sha: "def456abc123",
    });
    assert.equal(changedCommit.status, 403);
    assert.deepEqual(changedCommit.body.findings, ["idempotencyKey was already used with different request digest"]);
    assert.equal(githubCalls.length, 1);
    await ctx.flush();

    const rollbackApproval = {
      approval_id: "approval-prod-rollback-test",
      tool: "devops.rollback.production",
      action: "rollback",
      resource: "service/checkout-api/environment/production/deployment/dep-842",
      requested_by: "sre-1",
      user_id: "sre-1",
      reason: "Rollback checkout-api for active incident",
      job_id: "production_rollback",
      environment: "production",
      service_id: "checkout-api",
      repo: "github.com/example/checkout",
      branch: "main",
      commit_sha: "rollback123",
      incident_id: "INC-2048",
      rollback_plan_id: "RB-2048",
      workflow_id: "rollback-production.yml",
      idempotency_key: "rollback-checkout-INC-2048-RB-2048",
    };
    const rollbackCreated = await call(env, ctx, "POST", "/approval-requests", rollbackApproval);
    assert.equal(rollbackCreated.status, 201);
    assert.equal(rollbackCreated.body.evidence.context.incident_id, "INC-2048");
    assert.equal(rollbackCreated.body.evidence.context.rollback_plan_id, "RB-2048");
    await call(env, ctx, "POST", "/approval-requests/approval-prod-rollback-test/approve", {
      decided_by: "incident-commander-1",
      decision_reason: "Rollback plan reviewed for active incident",
    });

    const rollbackGrantRequest = {
      tool: rollbackApproval.tool,
      action: rollbackApproval.action,
      resource: rollbackApproval.resource,
      approval_id: rollbackApproval.approval_id,
      user_id: rollbackApproval.user_id,
      job_id: rollbackApproval.job_id,
      environment: rollbackApproval.environment,
      service_id: rollbackApproval.service_id,
      repo: rollbackApproval.repo,
      branch: rollbackApproval.branch,
      commit_sha: rollbackApproval.commit_sha,
      incident_id: rollbackApproval.incident_id,
      rollback_plan_id: rollbackApproval.rollback_plan_id,
      workflow_id: rollbackApproval.workflow_id,
      idempotency_key: rollbackApproval.idempotency_key,
    };
    const changedRollbackPlan = await call(env, ctx, "POST", "/jit-grants", {
      ...rollbackGrantRequest,
      rollback_plan_id: "RB-CHANGED",
    });
    assert.equal(changedRollbackPlan.status, 400);
    assert.equal(changedRollbackPlan.body.error, "approval request rollback_plan_id mismatch");

    const rollbackGrant = await call(env, ctx, "POST", "/jit-grants", rollbackGrantRequest);
    const rollbackDispatch = await call(env, ctx, "POST", "/github-actions/dispatch", {
      agent_id: "platform-release-agent",
      ...rollbackGrantRequest,
      approved: true,
      jit_grant_id: rollbackGrant.body.jit_grant_id,
    });
    assert.equal(rollbackDispatch.status, 201);
    assert.equal(rollbackDispatch.body.result.workflow_id, "rollback-production.yml");
    assert.equal(githubCalls.length, 2);
    assert.equal(
      githubCalls[1].url,
      "https://github-api.example/repos/example/checkout/actions/workflows/rollback-production.yml/dispatches",
    );
    assert.deepEqual(JSON.parse(String(githubCalls[1].init?.body)).inputs.incident_id, "INC-2048");
    assert.deepEqual(JSON.parse(String(githubCalls[1].init?.body)).inputs.rollback_plan_id, "RB-2048");
    await ctx.flush();

    const audit = await call(env, ctx, "GET", "/audit/events?approval_id=approval-prod-deploy-test&limit=20");
    const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
    assert.ok(types.includes("agentid.provider.executed"));
    assert.ok(types.includes("agentid.provider.replayed"));
    assert.ok(types.includes("agentid.jit.issued"));
    assert.ok(types.includes("agentid.approval.decided"));
    assert.ok(types.includes("agentid.approval.created"));
  } finally {
    globalThis.fetch = originalFetch;
  }
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

  const browserChallenge = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "browser.fill_form",
    action: "send",
    data_from: "provider_crm",
    data_to: "browser_form",
    destination_type: "browser_form",
    external_domain: "portal.customer.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
  });
  assert.equal(browserChallenge.status, 403);
  assert.equal(browserChallenge.body.decision, "challenge_required");
  assert.ok(browserChallenge.body.findings.includes("event[0]: provider_crm -> browser_form requires approval"));

  const browserBlockedField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "browser.fill_form",
    action: "send",
    data_from: "provider_crm",
    data_to: "browser_form",
    destination_type: "browser_form",
    external_domain: "portal.customer.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "payment_method"],
    record_count: 1,
    approved: true,
  });
  assert.equal(browserBlockedField.status, 403);
  assert.ok(browserBlockedField.body.findings.includes("event[0]: field is blocked by flow: payment_method"));

  const browserDomainDrift = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "browser.fill_form",
    action: "send",
    data_from: "provider_crm",
    data_to: "browser_form",
    destination_type: "browser_form",
    external_domain: "lookalike.example",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
    approved: true,
  });
  assert.equal(browserDomainDrift.status, 403);
  assert.ok(
    browserDomainDrift.body.findings.includes("event[0]: external_domain is not allowed for flow: lookalike.example"),
  );

  const rawPrompt = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "llm.prompt",
    action: "send",
    data_from: "provider_crm",
    data_to: "model_provider",
    destination_type: "model_provider",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 1,
    redaction_state: "raw",
  });
  assert.equal(rawPrompt.status, 403);
  assert.ok(rawPrompt.body.findings.includes("event[0]: redaction_state is not allowed for flow: raw"));

  const tokenizedPrompt = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "llm.prompt",
    action: "send",
    data_from: "provider_crm",
    data_to: "model_provider",
    destination_type: "model_provider",
    data_classification: ["customer_data", "pii"],
    field_set: ["case_id"],
    record_count: 1,
    redaction_state: "tokenized",
  });
  assert.equal(tokenizedPrompt.status, 200);
  assert.equal(tokenizedPrompt.body.allow, true);

  const modelBlockedField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "llm.prompt",
    action: "send",
    data_from: "provider_crm",
    data_to: "model_provider",
    destination_type: "model_provider",
    data_classification: ["customer_data", "pii"],
    field_set: ["case_id", "full_date_of_birth"],
    record_count: 1,
    redaction_state: "tokenized",
  });
  assert.equal(modelBlockedField.status, 403);
  assert.ok(modelBlockedField.body.findings.includes("event[0]: field is blocked by flow: full_date_of_birth"));

  const fileExportChallenge = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "file.export",
    action: "export",
    data_from: "provider_crm",
    data_to: "file_export",
    destination_type: "file_export",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 10,
  });
  assert.equal(fileExportChallenge.status, 403);
  assert.equal(fileExportChallenge.body.decision, "challenge_required");
  assert.ok(fileExportChallenge.body.findings.includes("event[0]: provider_crm -> file_export requires approval"));

  const fileExportTooMany = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "file.export",
    action: "export",
    data_from: "provider_crm",
    data_to: "file_export",
    destination_type: "file_export",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "case_id"],
    record_count: 100,
    approved: true,
  });
  assert.equal(fileExportTooMany.status, 403);
  assert.ok(fileExportTooMany.body.findings.includes("event[0]: record_count exceeds max_records 50"));

  const fileExportBlockedField = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "file.export",
    action: "export",
    data_from: "provider_crm",
    data_to: "file_export",
    destination_type: "file_export",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "access_token"],
    record_count: 10,
    approved: true,
  });
  assert.equal(fileExportBlockedField.status, 403);
  assert.ok(fileExportBlockedField.body.findings.includes("event[0]: field is blocked by flow: access_token"));

  const fileExportHealthRecord = await call(env, ctx, "POST", "/authorize", {
    agent_id: "support-agent",
    tool: "file.export",
    action: "export",
    data_from: "provider_crm",
    data_to: "file_export",
    destination_type: "file_export",
    data_classification: ["customer_data", "pii"],
    field_set: ["customer_id", "health_record_id"],
    record_count: 10,
    approved: true,
  });
  assert.equal(fileExportHealthRecord.status, 403);
  assert.ok(fileExportHealthRecord.body.findings.includes("event[0]: field is blocked by flow: health_record_id"));

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

async function receiptKeyEnv(): Promise<{ env: Record<string, string> }> {
  const oldKey = await receiptKeyPair("agentpass-2026-05");
  const activeKey = await receiptKeyPair("agentpass-2026-06");
  return {
    env: {
      AGENTID_RECEIPT_PRIVATE_JWK: JSON.stringify(activeKey.privateJwk),
      AGENTID_RECEIPT_PUBLIC_JWKS: JSON.stringify({ keys: [oldKey.publicJwk, activeKey.publicJwk] }),
      AGENTID_RECEIPT_KEY_ID: "agentpass-2026-06",
      AGENTID_RECEIPT_ISSUER: "https://agentpass.example",
      AGENTID_RECEIPT_AUDIENCE: "provider-mcp",
    },
  };
}

async function receiptKeyPair(kid: string): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  privateJwk.kid = kid;
  privateJwk.alg = "RS256";
  privateJwk.use = "sig";
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  return { privateJwk, publicJwk };
}

async function verifyReceiptJws(
  jws: string,
  jwks: { keys: JsonWebKey[] },
): Promise<{ header: Record<string, any>; claims: Record<string, any> }> {
  const [encodedHeader, encodedClaims, encodedSignature] = jws.split(".");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  assert.ok(jwk);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(encodedSignature, "base64url"),
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  );
  assert.equal(valid, true);
  return { header, claims };
}

function deployManifest(): Record<string, unknown> {
  const deployRequiredContext = ["environment", "service_id", "repo", "branch", "commit_sha", "change_request_id", "workflow_id"];
  const rollbackRequiredContext = ["environment", "service_id", "repo", "branch", "commit_sha", "incident_id", "rollback_plan_id", "workflow_id"];
  return {
    agent: {
      id: "platform-release-agent",
      name: "Platform Release Agent",
      owner: "platform",
      environment: "production",
      purpose: "Production deployment tests",
    },
    jit_authorization: {
      enabled: true,
      default_ttl_seconds: 300,
      approval_ttl_seconds: 900,
      bind_token_to: ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
      revoke_after_use: true,
    },
    tools: [
      {
        name: "devops.inspect.production",
        access: "read",
        auth_mode: "delegated",
        approval: "none",
        constraints: {
          required_context: ["environment", "service_id", "repo", "branch"],
          allowed_values: {
            environment: ["production"],
            service_id: ["checkout-api"],
            branch: ["main"],
          },
        },
      },
      {
        name: "devops.deploy.production",
        access: "deploy",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: {
          token_ttl_seconds: 300,
          approval_ttl_seconds: 900,
          required_context: deployRequiredContext,
          allowed_values: {
            environment: ["production"],
            service_id: ["checkout-api"],
            repo: ["github.com/example/checkout"],
            branch: ["main"],
          },
        },
      },
      {
        name: "devops.rollback.production",
        access: "rollback",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: {
          token_ttl_seconds: 300,
          approval_ttl_seconds: 900,
          required_context: rollbackRequiredContext,
          allowed_values: {
            environment: ["production"],
            service_id: ["checkout-api"],
            repo: ["github.com/example/checkout"],
            branch: ["main"],
          },
        },
      },
    ],
    job_boundary: {
      required: true,
      allowed_jobs: ["production_deploy", "production_rollback"],
      bind_authorization_to: ["job_id", "resource"],
    },
    runtime: { enforce_manifest: true },
  };
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
      { name: "browser.fill_form", access: "send", auth_mode: "delegated", approval: "human_confirm" },
      { name: "llm.prompt", access: "send", auth_mode: "delegated", approval: "none" },
      { name: "file.export", access: "export", auth_mode: "delegated", approval: "human_confirm" },
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
      {
        from: "provider_crm",
        to: "browser_form",
        destination_type: "browser_form",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        requires_approval: true,
        allowed_domains: ["customer.example"],
        blocked_fields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "model_provider",
        destination_type: "model_provider",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        allowed_redaction_states: ["redacted", "tokenized"],
        blocked_fields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
      {
        from: "provider_crm",
        to: "file_export",
        destination_type: "file_export",
        allowed: true,
        data_classification: ["customer_data", "pii"],
        requires_approval: true,
        max_records: 50,
        blocked_fields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "health_record_id"],
      },
    ],
    runtime: { enforce_manifest: true },
  };
}

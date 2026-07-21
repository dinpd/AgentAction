import assert from "node:assert/strict";
import test from "node:test";

import gateway, { AgentIdJitGrants } from "../src/worker.ts";
import { digestIntentObservation } from "../../packages/guard/src/intent.ts";

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
  const env = trustedUnsignedObservationEnv(namespace);
  const ctx = new TestContext();
  const tenant = "/tenants/acme";
  const intentContract = hostedRefundIntentContract("intent-refund-replay", "case-replay");
  const registered = await call(env, ctx, "POST", `${tenant}/intent-contracts`, intentContract);
  assert.equal(registered.status, 201);
  assert.equal(registered.body.status, "active");
  assert.match(String(registered.body.intent_digest), /^[a-f0-9]{64}$/);
  const fetchedContract = await call(env, ctx, "GET", `${tenant}/intent-contracts/intent-refund-replay`);
  assert.equal(fetchedContract.body.intent_digest, registered.body.intent_digest);
  const frozen = await call(env, ctx, "POST", `${tenant}/intent-contracts`, {
    ...intentContract,
    objective: "Change the refund target after registration",
  });
  assert.equal(frozen.status, 409);
  assert.equal(frozen.body.error, "intent contract is frozen: intent-refund-replay");
  await ctx.flush();

  const approval = {
    approval_id: "approval-refund-replay",
    intent_id: "intent-refund-replay",
    intent_digest: registered.body.intent_digest,
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

  const wrongJob = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...approval,
    job_id: "case-other",
  });
  assert.equal(wrongJob.status, 403);
  assert.deepEqual(wrongJob.body.findings, ["registered intent contract job_id mismatch"]);

  const created = await call(env, ctx, "POST", `${tenant}/approval-requests`, approval);
  assert.equal(created.body.evidence.intent_id, approval.intent_id);
  assert.equal(created.body.evidence.intent_digest, approval.intent_digest);
  await call(env, ctx, "POST", `${tenant}/approval-requests/approval-refund-replay/approve`, {
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
  const grant = await call(env, ctx, "POST", `${tenant}/jit-grants`, grantRequest);
  assert.equal(grant.body.intent_id, approval.intent_id);
  assert.equal(grant.body.intent_digest, approval.intent_digest);
  const action = {
    agent_id: "customer-support-refund-agent",
    ...grantRequest,
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  };
  const prematureRecord = await call(env, ctx, "POST", `${tenant}/execution-results`, {
    ...action,
    result: { refund_id: "should-not-record" },
  });
  assert.equal(prematureRecord.status, 409);
  assert.equal(prematureRecord.body.error, "JIT grant has not been consumed by authorize");

  const first = await call(env, ctx, "POST", `${tenant}/authorize`, action);
  assert.equal(first.status, 200);
  assert.equal(first.body.allow, true);
  await ctx.flush();

  const providerResult = {
    refund_id: "re_replay",
    amount: 49,
    provider_refund_calls: 1,
  };
  const recorded = await call(env, ctx, "POST", `${tenant}/execution-results`, {
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

  const observation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/intent-refund-replay/observations`,
    {
      schema_version: "agentpass.intent-observation.v1",
      observation_id: "obs-refund-replay",
      tenant_id: "acme",
      intent_id: approval.intent_id,
      intent_digest: approval.intent_digest,
      predicate: "refund.status",
      value: "succeeded",
      observed_at: new Date().toISOString(),
      issued_at: new Date().toISOString(),
      issuer: "stripe-adapter",
      resource: approval.resource,
    },
  );
  assert.equal(observation.status, 201);
  assert.equal(observation.body.replayed, false);
  assert.equal(observation.body.observation.provenance.verification_method, "unsigned_dev");
  assert.match(String(observation.body.observation.payload_digest), /^[a-f0-9]{64}$/);
  const evaluation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/intent-refund-replay/evaluate`,
    {
      job: {
        intent_id: approval.intent_id,
        intent_digest: approval.intent_digest,
        job_id: approval.job_id,
        started_at: "2026-07-20T18:00:00.000Z",
        completed_at: "2026-07-20T18:00:01.000Z",
      },
    },
  );
  assert.equal(evaluation.status, 200);
  assert.equal(evaluation.body.verdict, "completed");
  assert.equal(evaluation.body.constraint_compliance, "pass");
  assert.equal(evaluation.body.qualified_success, true);
  assert.equal(evaluation.body.goal_attainment, 1);
  assert.equal(evaluation.body.evidence_confidence, 1);
  assert.equal(evaluation.body.execution_discipline.tool_calls, 1);
  assert.equal(evaluation.body.execution_discipline.execution_receipts, 1);
  await ctx.flush();

  const retry = await call(env, ctx, "POST", `${tenant}/authorize`, action);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.allow, true);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.result, providerResult);
  assert.equal(retry.body.receipt.status, "replayed");
  assert.equal(retry.body.receipt.intent_id, approval.intent_id);
  assert.equal(retry.body.receipt.replayed_from_decision_id, recorded.body.receipt.decision_id);
  await ctx.flush();

  const changed = await call(env, ctx, "POST", `${tenant}/authorize`, { ...action, amount: 50 });
  assert.equal(changed.status, 403);
  assert.equal(changed.body.allow, false);
  assert.deepEqual(changed.body.findings, ["idempotencyKey was already used with different request digest"]);
  await ctx.flush();

  const audit = await call(env, ctx, "GET", "/audit/events?approval_id=approval-refund-replay&limit=20");
  const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.ok(types.includes("agentid.provider.executed"));
  assert.ok(types.includes("agentid.provider.replayed"));
  assert.ok(types.includes("agentid.decision"));
  const intentAudit = await call(env, ctx, "GET", "/audit/events?intent_id=intent-refund-replay&limit=30");
  const intentTypes = intentAudit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.ok(intentTypes.includes("agentpass.intent.registered"));
  assert.ok(intentTypes.includes("agentpass.intent.observation.accepted"));
  assert.ok(intentTypes.includes("agentpass.intent.evaluated"));
});

test("hosted intent runtime rejects incomplete unknown altered and expired bindings", async () => {
  const namespace = new MemoryNamespace();
  const env = trustedUnsignedObservationEnv(namespace);
  const ctx = new TestContext();
  const tenant = "/tenants/trust-gate";
  const event = {
    agent_id: "customer-support-refund-agent",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_trust/customer/cus_1",
    job_id: "case-trust",
  };

  const incomplete = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...event,
    intent_id: "intent-trust",
  });
  assert.equal(incomplete.status, 403);
  assert.deepEqual(incomplete.body.findings, ["intent_id and intent_digest are required together"]);

  const unknown = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...event,
    intent_id: "intent-missing",
    intent_digest: "a".repeat(64),
  });
  assert.equal(unknown.status, 403);
  assert.deepEqual(unknown.body.findings, ["intent contract not found: intent-missing"]);

  const registered = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts`,
    hostedRefundIntentContract("intent-trust", "case-trust"),
  );
  const altered = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...event,
    intent_id: "intent-trust",
    intent_digest: "0".repeat(64),
  });
  assert.equal(altered.status, 403);
  assert.deepEqual(altered.body.findings, ["registered intent contract digest mismatch"]);

  const expiredContract = {
    ...hostedRefundIntentContract("intent-expired", "case-expired"),
    issued_at: "2020-01-01T00:00:00.000Z",
    expires_at: "2021-01-01T00:00:00.000Z",
  };
  const expiredRegistered = await call(env, ctx, "POST", `${tenant}/intent-contracts`, expiredContract);
  assert.equal(expiredRegistered.body.status, "expired");
  const expired = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...event,
    intent_id: "intent-expired",
    intent_digest: expiredRegistered.body.intent_digest,
    job_id: "case-expired",
  });
  assert.equal(expired.status, 403);
  assert.deepEqual(expired.body.findings, ["intent contract is expired: intent-expired"]);

  const lateObservation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/intent-expired/observations`,
    {
      observation_id: "obs-late-expired-contract",
      tenant_id: "trust-gate",
      intent_id: "intent-expired",
      intent_digest: expiredRegistered.body.intent_digest,
      predicate: "refund.status",
      value: "succeeded",
      observed_at: new Date().toISOString(),
      issued_at: new Date().toISOString(),
      issuer: "stripe-adapter",
    },
  );
  assert.equal(lateObservation.status, 201);
  const postExpiryEvaluation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/intent-expired/evaluate`,
    { job: { started_at: "2020-12-31T23:59:59.000Z", completed_at: "2021-01-01T00:00:01.000Z" } },
  );
  assert.equal(postExpiryEvaluation.status, 200);
});

test("trusted OIDC observations fail closed and replay without duplicating evidence", async () => {
  const namespace = new MemoryNamespace();
  const secret = "trusted-observation-test-secret";
  const issuer = "https://identity.example.com";
  const manifest = trustedObservationManifest({
    verification_methods: ["oidc"],
    oidc_subjects: ["stripe-observer"],
    oidc_issuers: [issuer],
  }, {
    agent: {
      id: "customer-support-refund-agent",
      name: "Customer Support Refund Agent",
      owner: "support-platform-team",
      environment: "production",
      purpose: "Trusted intent observation tests",
    },
    oidc: {
      enabled: true,
      issuer,
      audiences: ["agentpass-gateway"],
      token_validation: "demo_hs256",
      claim_mapping: { tenant_id: "tenant_id", agent_id: "agent_id" },
    },
  });
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_DEMO_OIDC_SECRET: secret,
    AGENTID_MANIFEST_JSON: JSON.stringify(manifest),
  };
  const ctx = new TestContext();
  const token = await signHs256Jwt({
    iss: issuer,
    aud: "agentpass-gateway",
    sub: "stripe-observer",
    tenant_id: "acme",
    agent_id: "customer-support-refund-agent",
    exp: Math.floor(Date.now() / 1_000) + 600,
  }, secret);
  const headers = { authorization: `Bearer ${token}` };
  const registered = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/intent-contracts",
    hostedRefundIntentContract("intent-oidc-observation", "job-oidc-observation"),
    headers,
  );
  assert.equal(registered.status, 201);
  const now = new Date();
  const valid = {
    schema_version: "agentpass.intent-observation.v1",
    observation_id: "obs-oidc-1",
    tenant_id: "acme",
    intent_id: "intent-oidc-observation",
    intent_digest: registered.body.intent_digest,
    predicate: "refund.status",
    value: "succeeded",
    observed_at: now.toISOString(),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 300_000).toISOString(),
    issuer: "stripe-adapter",
    resource: "refund/re_oidc",
  };
  const endpoint = "/tenants/acme/intent-contracts/intent-oidc-observation/observations";
  const accepted = await call(env, ctx, "POST", endpoint, valid, headers);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.replayed, false);
  assert.equal(accepted.body.observation.provenance.verification_method, "oidc");
  assert.equal(accepted.body.observation.provenance.verified_subject, "stripe-observer");

  const replayed = await call(env, ctx, "POST", endpoint, valid, headers);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.replayed, true);
  const storedIndex = namespace.stores.get("acme")?.get(
    "intent:intent-oidc-observation:evidence:observations:index",
  ) as string[];
  assert.deepEqual(storedIndex, ["obs-oidc-1"]);

  const conflict = await call(env, ctx, "POST", endpoint, { ...valid, value: "failed" }, headers);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error_code, "observation_id_conflict");

  const cases: Array<[Record<string, unknown>, number, string]> = [
    [{ ...valid, observation_id: "obs-untrusted", issuer: "unknown-adapter" }, 403, "observation_untrusted_issuer"],
    [{
      ...valid,
      observation_id: "obs-future",
      issued_at: new Date(now.getTime() + 120_000).toISOString(),
      observed_at: new Date(now.getTime() + 120_000).toISOString(),
      expires_at: new Date(now.getTime() + 300_000).toISOString(),
    }, 400, "observation_future_dated"],
    [{
      ...valid,
      observation_id: "obs-expired",
      issued_at: new Date(now.getTime() - 120_000).toISOString(),
      observed_at: new Date(now.getTime() - 120_000).toISOString(),
      expires_at: new Date(now.getTime() - 1_000).toISOString(),
    }, 410, "observation_expired"],
    [{ ...valid, observation_id: "obs-tenant", tenant_id: "other" }, 409, "observation_tenant_mismatch"],
    [{ ...valid, observation_id: "obs-intent", intent_id: "intent-other" }, 409, "observation_intent_mismatch"],
    [{ ...valid, observation_id: "obs-digest", intent_digest: "0".repeat(64) }, 409, "observation_intent_digest_mismatch"],
    [{ ...valid, observation_id: "obs-predicate", predicate: "refund.internal_note" }, 403, "observation_untrusted_issuer"],
    [{ ...valid, observation_id: "obs-altered", payload_digest: "f".repeat(64) }, 409, "observation_payload_digest_mismatch"],
  ];
  for (const [input, status, errorCode] of cases) {
    const response = await call(env, ctx, "POST", endpoint, input, headers);
    assert.equal(response.status, status, errorCode);
    assert.equal(response.body.error_code, errorCode);
  }
  const unknownIntent = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/intent-contracts/intent-not-registered/observations",
    { ...valid, observation_id: "obs-unknown-intent", intent_id: "intent-not-registered" },
    headers,
  );
  assert.equal(unknownIntent.status, 404);
  assert.equal(unknownIntent.body.error_code, "observation_intent_not_registered");

  await ctx.flush();
  const audit = await call(env, ctx, "GET", "/audit/events?intent_id=intent-oidc-observation&limit=50", undefined, headers);
  const observationEvents = audit.body.events.filter((event: Record<string, unknown>) =>
    String(event.type).startsWith("agentpass.intent.observation."));
  const eventTypes = observationEvents.map((event: Record<string, unknown>) => event.type);
  assert.ok(eventTypes.includes("agentpass.intent.observation.accepted"));
  assert.ok(eventTypes.includes("agentpass.intent.observation.replayed"));
  assert.ok(eventTypes.includes("agentpass.intent.observation.rejected"));
  assert.equal(JSON.stringify(observationEvents).includes('"value"'), false);
  assert.equal(JSON.stringify(observationEvents).includes("succeeded"), false);
});

test("signed JWS observations verify against issuer JWKS and reject tampering", async () => {
  const namespace = new MemoryNamespace();
  const signingKey = await receiptKeyPair("stripe-observation-2026-07");
  const jwksUri = "https://stripe.example.com/.well-known/jwks.json";
  const manifest = trustedObservationManifest({
    verification_methods: ["jws"],
    jws_subjects: ["stripe-observer"],
    jwks_uri: jwksUri,
    audiences: ["agentpass-observations"],
  }, {
    agent: {
      id: "customer-support-refund-agent",
      name: "Customer Support Refund Agent",
      owner: "support-platform-team",
      environment: "production",
      purpose: "Trusted signed observation tests",
    },
  });
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "gateway-key",
    AGENTID_MANIFEST_JSON: JSON.stringify(manifest),
  };
  const ctx = new TestContext();
  const registered = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/intent-contracts",
    hostedRefundIntentContract("intent-jws-observation", "job-jws-observation"),
    { authorization: "Bearer gateway-key" },
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 300_000);
  const observation: Record<string, unknown> = {
    schema_version: "agentpass.intent-observation.v1",
    observation_id: "obs-jws-1",
    tenant_id: "acme",
    intent_id: "intent-jws-observation",
    intent_digest: registered.body.intent_digest,
    predicate: "refund.status",
    value: "succeeded",
    observed_at: now.toISOString(),
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    issuer: "stripe-adapter",
    resource: "refund/re_jws",
  };
  observation.payload_digest = digestIntentObservation(observation as never);
  const claims = {
    iss: "stripe-adapter",
    aud: "agentpass-observations",
    sub: "stripe-observer",
    jti: observation.observation_id,
    iat: Math.floor(now.getTime() / 1_000),
    exp: Math.floor(expiresAt.getTime() / 1_000),
    observation,
  };
  const jws = await signRs256Jws(claims, signingKey.privateJwk);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    assert.equal(String(input), jwksUri);
    return new Response(JSON.stringify({ keys: [signingKey.publicJwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const endpoint = "/tenants/acme/intent-contracts/intent-jws-observation/observations";
    const accepted = await call(env, ctx, "POST", endpoint, { jws });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.observation.provenance.verification_method, "jws");
    assert.equal(accepted.body.observation.provenance.signature_kid, "stripe-observation-2026-07");

    const parts = jws.split(".");
    parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;
    const tampered = await call(env, ctx, "POST", endpoint, { jws: parts.join(".") });
    assert.equal(tampered.status, 401);
    assert.equal(tampered.body.error_code, "observation_jws_signature_invalid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unsigned observations require both development environment and explicit opt-in", async () => {
  const namespace = new MemoryNamespace();
  const manifest = trustedObservationManifest({ verification_methods: ["unsigned_dev"] });
  const env = { JIT_GRANTS: namespace, AGENTID_MANIFEST_JSON: JSON.stringify(manifest) };
  const ctx = new TestContext();
  const registered = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/intent-contracts",
    hostedRefundIntentContract("intent-unsigned-disabled", "job-unsigned-disabled"),
  );
  const now = new Date().toISOString();
  const response = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/intent-contracts/intent-unsigned-disabled/observations",
    {
      observation_id: "obs-unsigned-disabled",
      tenant_id: "acme",
      intent_id: "intent-unsigned-disabled",
      intent_digest: registered.body.intent_digest,
      predicate: "refund.status",
      value: "succeeded",
      observed_at: now,
      issued_at: now,
      issuer: "stripe-adapter",
    },
  );
  assert.equal(response.status, 403);
  assert.equal(response.body.error_code, "observation_verification_required");

  const productionManifest = trustedObservationManifest({ verification_methods: ["unsigned_dev"] }, {
    agent: {
      id: "customer-support-refund-agent",
      name: "Customer Support Refund Agent",
      owner: "support-platform-team",
      environment: "production",
      purpose: "Unsigned production rejection test",
    },
  });
  const productionResponse = await call(
    {
      JIT_GRANTS: namespace,
      AGENTID_MANIFEST_JSON: JSON.stringify(productionManifest),
      AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED: "true",
    },
    ctx,
    "POST",
    "/tenants/acme/intent-contracts/intent-unsigned-disabled/observations",
    {
      observation_id: "obs-unsigned-production",
      tenant_id: "acme",
      intent_id: "intent-unsigned-disabled",
      intent_digest: registered.body.intent_digest,
      predicate: "refund.status",
      value: "succeeded",
      observed_at: now,
      issued_at: now,
      issuer: "stripe-adapter",
    },
  );
  assert.equal(productionResponse.status, 403);
  assert.equal(productionResponse.body.error_code, "observation_verification_required");
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
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const response = await gateway.fetch(
    new Request(`https://gateway.example.com${path}`, {
      method,
      headers: body ? { "content-type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as never,
    ctx as never,
  );
  return { status: response.status, body: await response.json() };
}

async function signHs256Jwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  return `${encodedHeader}.${encodedPayload}.${Buffer.from(signature).toString("base64url")}`;
}

async function signRs256Jws(claims: Record<string, unknown>, privateJwk: JsonWebKey): Promise<string> {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: privateJwk.kid })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  return `${encodedHeader}.${encodedPayload}.${Buffer.from(signature).toString("base64url")}`;
}

function hostedRefundIntentContract(intentId: string, jobId: string): Record<string, unknown> {
  return {
    schema_version: "agentpass.intent-contract.v1",
    intent_id: intentId,
    profile: "support_refund.v1",
    issuer: "support-application",
    job_id: jobId,
    objective: "Refund the verified duplicate charge exactly once",
    required_outcomes: [
      {
        id: "refund-executed-once",
        source: "execution_receipts",
        where: [
          { path: "tool", operator: "equals", value: "stripe.create_refund" },
          { path: "status", operator: "equals", value: "executed" },
        ],
        assertion: { operator: "count_equals", value: 1 },
      },
      {
        id: "refund-provider-succeeded",
        source: "observations",
        where: [{ path: "predicate", operator: "equals", value: "refund.status" }],
        assertion: { path: "value", operator: "equals", value: "succeeded" },
      },
      {
        id: "refund-amount-correct",
        source: "execution_receipts",
        where: [{ path: "tool", operator: "equals", value: "stripe.create_refund" }],
        assertion: { path: "amount", operator: "equals", value: 49, quantifier: "all" },
      },
    ],
    hard_constraints: [
      {
        id: "no-denied-actions",
        source: "decision_events",
        where: [{ path: "decision", operator: "equals", value: "deny" }],
        assertion: { operator: "count_equals", value: 0 },
      },
    ],
    preferences: {
      max_tool_calls: 2,
      max_execution_receipts: 1,
      max_retries: 1,
      max_replays: 0,
      max_denied_decisions: 0,
      max_runtime_ms: 30_000,
      max_estimated_cost_usd: 0.05,
    },
    evidence_requirements: ["decision_events", "execution_receipts", "observations", "job"],
    issued_at: "2026-07-20T17:59:00.000Z",
    expires_at: "2099-07-20T18:30:00.000Z",
  };
}

function trustedUnsignedObservationEnv(namespace: MemoryNamespace): Record<string, unknown> {
  return {
    JIT_GRANTS: namespace,
    AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED: "true",
    AGENTID_MANIFEST_JSON: JSON.stringify(trustedObservationManifest({ verification_methods: ["unsigned_dev"] })),
  };
}

function trustedObservationManifest(
  issuerPolicy: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agent: {
      id: "customer-support-refund-agent",
      name: "Customer Support Refund Agent",
      owner: "support-platform-team",
      environment: "test",
      purpose: "Trusted intent observation tests",
    },
    jit_authorization: {
      enabled: true,
      default_ttl_seconds: 300,
      bind_token_to: ["agent_id", "user_id", "tool", "action", "resource", "approval_id"],
      revoke_after_use: true,
    },
    tools: [
      { name: "zendesk.search_tickets", access: "read", auth_mode: "delegated", approval: "none" },
      {
        name: "stripe.create_refund",
        access: "write",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: { max_amount_usd: 100, token_ttl_seconds: 300 },
      },
      {
        name: "email.send_external",
        access: "write",
        auth_mode: "just_in_time",
        approval: "human_confirm",
        constraints: { token_ttl_seconds: 120 },
      },
    ],
    data_flows: [
      { from: "zendesk", to: "stripe", allowed: true },
      { from: "customer_records", to: "external_email", allowed: false },
    ],
    intent_assurance: {
      observations: {
        max_age_seconds: 600,
        max_future_skew_seconds: 30,
        trusted_issuers: [{
          issuer: "stripe-adapter",
          profiles: ["support_refund.v1"],
          predicates: ["refund.status"],
          ...issuerPolicy,
        }],
      },
    },
    runtime: { enforce_manifest: true },
    ...overrides,
  };
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

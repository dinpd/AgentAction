import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { validateDecisionBasis } from "../src/decision-basis.ts";
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
      function memoryGet<T>(key: string): Promise<T | undefined>;
      function memoryGet<T>(keys: string[]): Promise<Map<string, T>>;
      async function memoryGet<T>(key: string | string[]): Promise<T | undefined | Map<string, T>> {
        if (Array.isArray(key)) {
          return new Map(key.flatMap((entry) => values.has(entry) ? [[entry, values.get(entry) as T]] : []));
        }
        return values.get(key) as T | undefined;
      }
      object = new AgentIdJitGrants({
        storage: {
          get: memoryGet,
          async list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
            return new Map(
              [...values.entries()]
                .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
                .map(([key, value]) => [key, value as T] as const),
            );
          },
          async put<T>(keyOrEntries: string | Record<string, unknown>, value?: T): Promise<void> {
            if (typeof keyOrEntries === "string") {
              values.set(keyOrEntries, value);
              return;
            }
            for (const [key, entry] of Object.entries(keyOrEntries)) values.set(key, entry);
          },
          async delete(key: string): Promise<boolean> {
            return values.delete(key);
          },
        },
      });
      this.objects.set(id, object);
    }
    return object;
  }
}

class MemoryManifests {
  values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
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

test("accepts a separate internal service token without weakening the public API key", async () => {
  const namespace = new MemoryNamespace();
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "public-api-key",
    AGENTID_INTERNAL_SERVICE_TOKEN: "internal-service-token",
  };
  const ctx = new TestContext();

  const internal = await call(
    env,
    ctx,
    "GET",
    "/tenants/synthetic/health",
    undefined,
    { authorization: "Bearer internal-service-token" },
  );
  const publicApi = await call(
    env,
    ctx,
    "GET",
    "/tenants/synthetic/health",
    undefined,
    { authorization: "Bearer public-api-key" },
  );
  const rejected = await call(
    env,
    ctx,
    "GET",
    "/tenants/synthetic/health",
    undefined,
    { authorization: "Bearer different-token" },
  );

  assert.equal(internal.status, 200);
  assert.equal(internal.body.auth.method, "internal_service");
  assert.equal(publicApi.status, 200);
  assert.equal(publicApi.body.auth.method, "api_key");
  assert.equal(rejected.status, 401);
});

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
  assert.ok(intentTypes.includes("agentpass.intent.evaluation.previewed"));
});

test("intent finalization freezes one canonical evidence snapshot and is idempotent", async () => {
  const namespace = new MemoryNamespace();
  const env = trustedUnsignedObservationEnv(namespace);
  const ctx = new TestContext();
  const tenant = "/tenants/acme";
  const intentId = "intent-finalization";
  const jobId = "job-finalization";
  const registered = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts`,
    hostedLifecycleIntentContract(intentId, jobId),
  );
  assert.equal(registered.status, 201);

  const job = {
    tenant_id: "acme",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    job_id: jobId,
    started_at: "2026-07-21T14:00:00.000Z",
    completed_at: "2026-07-21T14:00:02.000Z",
  };
  const preview = await call(env, ctx, "POST", `${tenant}/intent-contracts/${intentId}/evaluate`, {
    job: { ...job, completed_at: undefined },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.evaluation_mode, "preview");
  assert.equal(preview.body.snapshot_id, undefined);

  const decision = await call(env, ctx, "POST", `${tenant}/authorize`, {
    agent_id: "customer-support-refund-agent",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    job_id: jobId,
    tool: "zendesk.search_tickets",
    action: "read",
    data_from: "zendesk",
    data_to: "stripe",
  });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.allow, true);

  const approvalPayload = {
    approval_id: "approval-finalization",
    agent_id: "customer-support-refund-agent",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    job_id: jobId,
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/re_finalization/customer/cus_1",
    requested_by: "support-1",
    user_id: "support-1",
    reason: "duplicate charge verified",
    amount: 49,
    currency: "USD",
    idempotency_key: "refund-finalization",
  };
  const approval = await call(env, ctx, "POST", `${tenant}/approval-requests`, approvalPayload);
  assert.equal(approval.status, 201);
  await call(env, ctx, "POST", `${tenant}/approval-requests/approval-finalization/approve`, {
    decided_by: "manager-1",
    decision_reason: "refund evidence verified",
  });
  const grant = await call(env, ctx, "POST", `${tenant}/jit-grants`, approvalPayload);
  assert.equal(grant.status, 201);
  const executionAction = {
    ...approvalPayload,
    approved: true,
    jit_grant_id: grant.body.jit_grant_id,
  };
  const executionDecision = await call(env, ctx, "POST", `${tenant}/authorize`, executionAction);
  assert.equal(executionDecision.status, 200);
  const execution = await call(env, ctx, "POST", `${tenant}/execution-results`, {
    ...executionAction,
    result: { refund_id: "re_finalization", status: "succeeded" },
  });
  assert.equal(execution.status, 201);

  const observationInput = {
    schema_version: "agentpass.intent-observation.v1",
    observation_id: "obs-finalization",
    tenant_id: "acme",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    predicate: "refund.status",
    value: "succeeded",
    observed_at: new Date().toISOString(),
    issued_at: new Date().toISOString(),
    issuer: "stripe-adapter",
    resource: "refund/re_finalization",
  };
  const observation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/${intentId}/observations`,
    observationInput,
  );
  assert.equal(observation.status, 201);

  const finalizationResults = await Promise.all([
    call(env, ctx, "POST", `${tenant}/intent-contracts/${intentId}/finalize`, { job }),
    call(env, ctx, "POST", `${tenant}/intent-contracts/${intentId}/finalize`, { job }),
  ]);
  const finalized = finalizationResults.find((result) => result.status === 201);
  const concurrentReplay = finalizationResults.find((result) => result.status === 200);
  assert.ok(finalized);
  assert.ok(concurrentReplay);
  assert.equal(finalized.status, 201);
  assert.equal(finalized.body.replayed, false);
  assert.equal(finalized.body.evaluation.evaluation_mode, "final");
  assert.equal(finalized.body.evaluation.snapshot_id, finalized.body.snapshot.snapshot_id);
  assert.equal(finalized.body.evaluation.evidence_digest, finalized.body.snapshot.evidence_digest);
  assert.equal(finalized.body.snapshot.schema_version, "agentpass.intent-evidence-snapshot.v2");
  assert.match(String(finalized.body.snapshot.snapshot_id), /^snapshot_[a-f0-9]{24}$/);
  assert.match(String(finalized.body.snapshot.evidence_digest), /^[a-f0-9]{64}$/);
  assert.ok(finalized.body.snapshot.sources.decision_events.evidence_ids.includes(decision.body.event.decision_id));
  assert.ok(finalized.body.snapshot.sources.decision_events.evidence_ids.includes(executionDecision.body.event.decision_id));
  assert.ok(finalized.body.snapshot.sources.decision_bases.evidence_ids.includes(decision.body.event.decision_basis_id));
  assert.ok(finalized.body.snapshot.sources.decision_bases.evidence_ids.includes(executionDecision.body.event.decision_basis_id));
  assert.deepEqual(finalized.body.snapshot.sources.execution_receipts.evidence_ids, [execution.body.receipt.decision_id]);
  assert.deepEqual(finalized.body.snapshot.sources.observations.evidence_ids, ["obs-finalization"]);
  assert.deepEqual(finalized.body.snapshot.sources.job.evidence_ids, [jobId]);
  assert.equal(finalized.body.snapshot.sources.decision_events.count, 2);
  assert.equal(finalized.body.snapshot.sources.decision_bases.count, 2);
  assert.equal(finalized.body.snapshot.sources.execution_receipts.count, 1);
  assert.equal(finalized.body.snapshot.sources.observations.count, 1);
  assert.equal(finalized.body.snapshot.sources.job.count, 1);
  assert.deepEqual(
    finalized.body.snapshot.evidence.decision_events.map((event: Record<string, unknown>) => event.decision_basis_id).sort(),
    finalized.body.snapshot.evidence.decision_bases.map((basis: Record<string, unknown>) => basis.basis_id).sort(),
  );
  for (const basis of finalized.body.snapshot.evidence.decision_bases) {
    assert.deepEqual(validateDecisionBasis(basis), []);
    assert.equal(basis.capture_mode, "rule_evaluation");
    assert.equal(basis.producer.role, "boundary");
    assert.match(String(basis.input_digest.value), /^[a-f0-9]{64}$/);
  }
  assert.equal(concurrentReplay.body.replayed, true);
  assert.deepEqual(concurrentReplay.body.evaluation, finalized.body.evaluation);
  assert.deepEqual(concurrentReplay.body.snapshot, finalized.body.snapshot);

  const repeated = await call(env, ctx, "POST", `${tenant}/intent-contracts/${intentId}/finalize`, { job });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.replayed, true);
  assert.deepEqual(repeated.body.evaluation, finalized.body.evaluation);
  assert.deepEqual(repeated.body.snapshot, finalized.body.snapshot);

  const history = await call(env, ctx, "GET", `${tenant}/intent-contracts/${intentId}/evaluations`);
  assert.equal(history.status, 200);
  assert.equal(history.body.finalization_status, "finalized");
  assert.equal(history.body.total_count, 2);
  assert.equal(history.body.latest_preview.evaluation_id, preview.body.evaluation_id);
  assert.equal(history.body.final.evaluation_id, finalized.body.evaluation.evaluation_id);
  assert.equal(history.body.snapshot.evidence_digest, finalized.body.snapshot.evidence_digest);

  const lateObservation = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/${intentId}/observations`,
    { ...observationInput, observation_id: "obs-finalization-late" },
  );
  assert.equal(lateObservation.status, 409);
  assert.equal(lateObservation.body.error_code, "intent_evidence_finalized");

  const lateDecision = await call(env, ctx, "POST", `${tenant}/authorize`, {
    agent_id: "customer-support-refund-agent",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    job_id: jobId,
    tool: "zendesk.search_tickets",
    action: "read",
  });
  assert.equal(lateDecision.status, 403);
  assert.equal(lateDecision.body.error_code, "intent_evidence_finalized");

  const lateExecution = await call(env, ctx, "POST", `${tenant}/execution-results`, {
    ...executionAction,
    result: { refund_id: "re_finalization", status: "changed" },
  });
  assert.equal(lateExecution.status, 409);
  assert.equal(lateExecution.body.error_code, "intent_evidence_finalized");

  const changedJob = await call(env, ctx, "POST", `${tenant}/intent-contracts/${intentId}/finalize`, {
    job: { ...job, completed_at: "2026-07-21T14:00:03.000Z" },
  });
  assert.equal(changedJob.status, 409);
  assert.equal(changedJob.body.error_code, "intent_evidence_finalized");

  const otherTenant = await call(env, ctx, "GET", `/tenants/other/intent-contracts/${intentId}/evaluations`);
  assert.equal(otherTenant.status, 404);
  const store = namespace.stores.get("acme");
  assert.equal((store?.get(`intent:${intentId}:evidence:decision_events:index`) as string[]).length, 2);
  assert.equal((store?.get(`intent:${intentId}:evidence:decision_bases:index`) as string[]).length, 2);
  assert.equal((store?.get(`intent:${intentId}:evidence:execution_receipts:index`) as string[]).length, 1);
  assert.deepEqual(store?.get(`intent:${intentId}:evidence:observations:index`), ["obs-finalization"]);
  assert.deepEqual(
    store?.get(`intent-quality:index:${String(finalized.body.evaluation.evaluated_at).slice(0, 10)}`),
    [intentId],
  );
  assert.deepEqual(store?.get(`intent-quality:job:${jobId}`), [intentId]);

  await ctx.flush();
  const audit = await call(env, ctx, "GET", `/audit/events?intent_id=${intentId}&limit=50`);
  const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.ok(types.includes("agentpass.intent.evaluation.previewed"));
  assert.ok(types.includes("agentpass.intent.finalized"));
  assert.ok(types.includes("agentpass.intent.finalization.replayed"));
  assert.ok(types.includes("agentpass.intent.evidence.rejected"));
});

test("hosted decisions emit privacy-safe normalized decision bases", async () => {
  const namespace = new MemoryNamespace();
  const env = trustedUnsignedObservationEnv(namespace);
  const ctx = new TestContext();
  const tenant = "/tenants/acme";
  const intentId = "intent-decision-basis";
  const jobId = "job-decision-basis";
  const registered = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts`,
    hostedLifecycleIntentContract(intentId, jobId),
  );
  assert.equal(registered.status, 201);

  const common = {
    agent_id: "customer-support-refund-agent",
    intent_id: intentId,
    intent_digest: registered.body.intent_digest,
    job_id: jobId,
    action: "read",
    resource: "customer/secret-customer-reference",
    raw_prompt: "secret raw prompt",
    chain_of_thought: "secret private reasoning",
    provider_response: { access_token: "secret-provider-token" },
  };
  const allowed = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...common,
    tool: "zendesk.search_tickets",
  });
  assert.equal(allowed.status, 200);
  const denied = await call(env, ctx, "POST", `${tenant}/authorize`, {
    ...common,
    tool: "undeclared.tool",
  });
  assert.equal(denied.status, 403);

  const store = namespace.stores.get("acme");
  const basisIds = store?.get(`intent:${intentId}:evidence:decision_bases:index`) as string[];
  assert.equal(basisIds.length, 2);
  const bases = basisIds.map((basisId) => store?.get(`intent:${intentId}:evidence:decision_bases:${basisId}`) as any);
  const allowedBasis = bases.find((basis) => basis.subject.id === allowed.body.event.decision_id);
  const deniedBasis = bases.find((basis) => basis.subject.id === denied.body.event.decision_id);
  assert.equal(allowed.body.event.decision_basis_id, allowedBasis.basis_id);
  assert.equal(allowedBasis.conclusion.code, "allow");
  assert.deepEqual(allowedBasis.factors.map((factor: any) => factor.code), ["policy.requirements_satisfied"]);
  assert.equal(denied.body.event.decision_basis_id, deniedBasis.basis_id);
  assert.equal(deniedBasis.conclusion.code, "deny");
  assert.deepEqual(deniedBasis.factors.map((factor: any) => factor.code), ["capability.undeclared"]);
  const serialized = JSON.stringify(bases);
  for (const forbidden of [
    "secret-customer-reference",
    "secret raw prompt",
    "secret private reasoning",
    "secret-provider-token",
    "raw_prompt",
    "chain_of_thought",
    "provider_response",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);

  const invalidDependency = structuredClone(allowedBasis);
  invalidDependency.factors[0].depends_on = ["factor_missing"];
  assert.ok(validateDecisionBasis(invalidDependency).includes("factor dependency is missing: factor_missing"));
  const selfDependency = structuredClone(allowedBasis);
  selfDependency.factors[0].depends_on = [selfDependency.factors[0].factor_id];
  assert.ok(validateDecisionBasis(selfDependency).includes(`factor depends on itself: ${selfDependency.factors[0].factor_id}`));
  const duplicateFactor = structuredClone(allowedBasis);
  duplicateFactor.factors.push(structuredClone(duplicateFactor.factors[0]));
  assert.ok(validateDecisionBasis(duplicateFactor).includes(`factor_id is duplicated: ${duplicateFactor.factors[0].factor_id}`));
  const invalidReasoningField = structuredClone(allowedBasis);
  invalidReasoningField.raw_prompt = "private";
  assert.ok(validateDecisionBasis(invalidReasoningField).includes("unsupported field: raw_prompt"));

  await ctx.flush();
  const audit = await call(env, ctx, "GET", `/audit/events?intent_id=${intentId}&limit=20`);
  const decisionAudit = audit.body.events.filter((event: any) => event.type === "agentid.decision");
  assert.equal(decisionAudit.length, 2);
  assert.equal(decisionAudit.every((event: any) => typeof event.payload.event.decision_basis_id === "string"), true);
  assert.deepEqual(
    decisionAudit.map((event: any) => event.payload.event.reason_codes).sort(),
    [["capability.undeclared"], ["policy.requirements_satisfied"]],
  );
});

test("versioned intent profiles freeze definitions and issue deterministic comparable contracts", async () => {
  const namespace = new MemoryNamespace();
  const manifest = trustedObservationManifest({
    verification_methods: ["oidc", "jws"],
    profiles: ["support_refund.v1", "support_refund.v2"],
  });
  const assurance = manifest.intent_assurance as Record<string, unknown>;
  assurance.contract_issuance = { mode: "registered_profile_required" };
  const env = { JIT_GRANTS: namespace, AGENTID_MANIFEST_JSON: JSON.stringify(manifest) };
  const ctx = new TestContext();
  const tenant = "/tenants/acme";
  const profile = hostedRefundIntentProfile();

  const registered = await call(env, ctx, "POST", `${tenant}/intent-profiles`, profile);
  assert.equal(registered.status, 201);
  assert.equal(registered.body.profile_key, "support_refund.v1");
  assert.equal(registered.body.status, "active");
  assert.match(String(registered.body.profile_digest), /^[a-f0-9]{64}$/);
  assert.equal(registered.body.definition.profile_digest, registered.body.profile_digest);

  const replayedRegistration = await call(env, ctx, "POST", `${tenant}/intent-profiles`, profile);
  assert.equal(replayedRegistration.status, 200);
  assert.equal(replayedRegistration.body.profile_digest, registered.body.profile_digest);
  const badDigest = await call(env, ctx, "POST", `${tenant}/intent-profiles`, {
    ...profile,
    profile_digest: "0".repeat(64),
  });
  assert.equal(badDigest.status, 400);
  assert.equal(badDigest.body.error_code, "intent_profile_digest_mismatch");
  const changedProfile = await call(env, ctx, "POST", `${tenant}/intent-profiles`, {
    ...profile,
    preferences: { ...profile.preferences as Record<string, unknown>, max_tool_calls: 99 },
  });
  assert.equal(changedProfile.status, 409);
  assert.equal(changedProfile.body.error_code, "intent_profile_frozen");
  const versionTwo = await call(env, ctx, "POST", `${tenant}/intent-profiles`, {
    ...profile,
    version: "v2",
    objective_template: "Refund verified duplicate payment {{payment_id}} for {{refund_amount}} {{currency}}",
  });
  assert.equal(versionTwo.status, 201);
  assert.equal(versionTwo.body.profile_key, "support_refund.v2");
  assert.notEqual(versionTwo.body.profile_digest, registered.body.profile_digest);

  const listed = await call(env, ctx, "GET", `${tenant}/intent-profiles`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.count, 2);
  assert.deepEqual(
    listed.body.intent_profiles.map((item: Record<string, unknown>) => item.profile_key),
    ["support_refund.v2", "support_refund.v1"],
  );
  const fetched = await call(env, ctx, "GET", `${tenant}/intent-profiles/support_refund.v1`);
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.definition, registered.body.definition);

  const raw = await call(env, ctx, "POST", `${tenant}/intent-contracts`, hostedRefundIntentContract("raw-intent", "raw-job"));
  assert.equal(raw.status, 409);
  assert.equal(raw.body.error_code, "registered_profile_required");

  const issuance = {
    intent_id: "intent-profile-refund",
    job_id: "job-profile-refund",
    variables: { refund_amount: 49, payment_id: "pi_123" },
    issued_at: "2026-07-20T17:59:00Z",
    expires_at: "2099-07-20T18:30:00Z",
  };
  const issued = await call(env, ctx, "POST", `${tenant}/intent-profiles/support_refund.v1/issue`, issuance);
  assert.equal(issued.status, 201);
  assert.equal(issued.body.profile_key, "support_refund.v1");
  assert.equal(issued.body.profile_version, "v1");
  assert.equal(issued.body.profile_digest, registered.body.profile_digest);
  assert.equal(issued.body.contract.profile_version, "v1");
  assert.equal(issued.body.contract.profile_digest, registered.body.profile_digest);
  assert.deepEqual(issued.body.contract.profile_variables, {
    currency: "USD",
    payment_id: "pi_123",
    refund_amount: 49,
  });
  assert.equal(issued.body.contract.objective, "Refund duplicate payment pi_123 for 49 USD");
  assert.equal(issued.body.contract.required_outcomes[2].assertion.value, 49);
  assert.deepEqual(issued.body.contract.hard_constraints, profile.hard_constraints);
  assert.deepEqual(issued.body.contract.evidence_requirements, profile.evidence_requirements);
  assert.deepEqual(
    issued.body.contract.trusted_observation_requirements,
    profile.trusted_observation_requirements,
  );
  assert.equal(issued.body.contract.issued_at, "2026-07-20T17:59:00.000Z");
  assert.equal(issued.body.contract.expires_at, "2099-07-20T18:30:00.000Z");

  const replayedIssuance = await call(env, ctx, "POST", `${tenant}/intent-profiles/support_refund.v1/issue`, {
    ...issuance,
    variables: { payment_id: "pi_123", refund_amount: 49 },
    issued_at: "2026-07-20T17:59:00.000+00:00",
    expires_at: "2099-07-20T18:30:00.000+00:00",
  });
  assert.equal(replayedIssuance.status, 200);
  assert.equal(replayedIssuance.body.intent_digest, issued.body.intent_digest);
  assert.deepEqual(replayedIssuance.body.contract, issued.body.contract);

  const weakened = await call(env, ctx, "POST", `${tenant}/intent-profiles/support_refund.v1/issue`, {
    ...issuance,
    hard_constraints: [],
  });
  assert.equal(weakened.status, 400);
  assert.equal(weakened.body.error_code, "intent_profile_issuance_invalid");
  assert.match(String(weakened.body.error), /unsupported intent profile issuance field/);
  const removedEvidence = await call(env, ctx, "POST", `${tenant}/intent-profiles/support_refund.v1/issue`, {
    ...issuance,
    evidence_requirements: [],
  });
  assert.equal(removedEvidence.status, 400);
  assert.match(String(removedEvidence.body.error), /unsupported intent profile issuance field/);
  const badVariable = await call(env, ctx, "POST", `${tenant}/intent-profiles/support_refund.v1/issue`, {
    ...issuance,
    intent_id: "intent-profile-refund-bad-variable",
    variables: { payment_id: "pi_123", refund_amount: 101 },
  });
  assert.equal(badVariable.status, 400);
  assert.match(String(badVariable.body.error), /exceeds maximum 100/);

  const preview = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/${issuance.intent_id}/evaluate`,
    { job: { completed_at: "2026-07-20T18:00:00.000Z" } },
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.body.profile, "support_refund.v1");
  assert.equal(preview.body.profile_version, "v1");
  assert.equal(preview.body.profile_digest, registered.body.profile_digest);
  const finalized = await call(
    env,
    ctx,
    "POST",
    `${tenant}/intent-contracts/${issuance.intent_id}/finalize`,
    { job: { completed_at: "2026-07-20T18:00:00.000Z" } },
  );
  assert.equal(finalized.status, 201);
  assert.equal(finalized.body.evaluation.profile_version, "v1");
  assert.equal(finalized.body.evaluation.profile_digest, registered.body.profile_digest);

  const otherTenant = await call(env, ctx, "GET", "/tenants/other/intent-profiles/support_refund.v1");
  assert.equal(otherTenant.status, 404);

  const untrustedNamespace = new MemoryNamespace();
  const untrustedEnv = {
    JIT_GRANTS: untrustedNamespace,
    AGENTID_MANIFEST_JSON: JSON.stringify(trustedObservationManifest({ verification_methods: ["unsigned_dev"] })),
  };
  const untrusted = await call(untrustedEnv, new TestContext(), "POST", "/tenants/untrusted/intent-profiles", profile);
  assert.equal(untrusted.status, 409);
  assert.equal(untrusted.body.error_code, "profile_trust_requirement_unsatisfied");

  const compatibleNamespace = new MemoryNamespace();
  const compatibleManifest = trustedObservationManifest({ verification_methods: ["oidc", "jws"] });
  (compatibleManifest.intent_assurance as Record<string, unknown>).contract_issuance = { mode: "raw_compatible" };
  const compatibleEnv = {
    JIT_GRANTS: compatibleNamespace,
    AGENTID_MANIFEST_JSON: JSON.stringify(compatibleManifest),
  };
  const compatibleRaw = await call(
    compatibleEnv,
    new TestContext(),
    "POST",
    "/tenants/compatible/intent-contracts",
    hostedRefundIntentContract("raw-compatible", "raw-compatible-job"),
  );
  assert.equal(compatibleRaw.status, 201);
  const compatibleProfileBound = await call(
    compatibleEnv,
    new TestContext(),
    "POST",
    "/tenants/compatible/intent-contracts",
    issued.body.contract,
  );
  assert.equal(compatibleProfileBound.status, 409);
  assert.equal(compatibleProfileBound.body.error_code, "profile_issuance_endpoint_required");

  await ctx.flush();
  const audit = await call(env, ctx, "GET", "/audit/events?tenant_id=acme&limit=50");
  const types = audit.body.events.map((event: Record<string, unknown>) => event.type);
  assert.ok(types.includes("agentpass.intent.profile.registered"));
  assert.ok(types.includes("agentpass.intent.profile.replayed"));
  assert.ok(types.includes("agentpass.intent.issued"));
  assert.ok(types.includes("agentpass.intent.issuance.replayed"));
});

test("profile-scoped quality rollups aggregate only finalized comparable receipts", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const profileDigest = "a".repeat(64);
  const v1Jobs = [
    {
      intentId: "quality-completed",
      agentId: "agent-a",
      verdict: "completed",
      compliance: "pass",
      qualifiedSuccess: true,
      goalAttainment: 1,
      confidence: 1,
      discipline: qualityDiscipline({
        tool_calls: 2,
        execution_receipts: 1,
        executions: 1,
        challenge_decisions: 1,
        estimated_cost_usd: 0.01,
        runtime_ms: 1_000,
        preferences_met: true,
      }),
    },
    {
      intentId: "quality-partial",
      agentId: "agent-a",
      verdict: "partial",
      compliance: "pass",
      qualifiedSuccess: false,
      goalAttainment: 0.5,
      confidence: 0.8,
      discipline: qualityDiscipline({
        tool_calls: 3,
        execution_receipts: 1,
        executions: 1,
        replays: 1,
        retries: 1,
        estimated_cost_usd: 0.02,
        runtime_ms: 2_000,
        preferences_met: false,
      }),
    },
    {
      intentId: "quality-failed",
      agentId: "agent-b",
      verdict: "failed",
      compliance: "fail",
      qualifiedSuccess: false,
      goalAttainment: 0,
      confidence: 0.5,
      discipline: qualityDiscipline({
        tool_calls: 1,
        retries: 2,
        denied_decisions: 1,
        estimated_cost_usd: 0.03,
        runtime_ms: 3_000,
        preferences_met: false,
      }),
    },
    {
      intentId: "quality-indeterminate",
      verdict: "indeterminate",
      compliance: "indeterminate",
      qualifiedSuccess: false,
      goalAttainment: 0,
      confidence: 0,
      discipline: qualityDiscipline({ preferences_met: null }),
    },
  ] as const;
  for (const [index, job] of v1Jobs.entries()) {
    seedIntentQualityFinalization(namespace, "acme", {
      ...job,
      profileKey: "support_refund.v1",
      profileVersion: "v1",
      profileDigest,
      finalizedAt: `2026-07-21T10:0${index}:00.000Z`,
    });
  }
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "quality-v2",
    agentId: "agent-a",
    profileKey: "support_refund.v2",
    profileVersion: "v2",
    profileDigest: "b".repeat(64),
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T11:00:00.000Z",
    discipline: qualityDiscipline({ runtime_ms: 500, preferences_met: true }),
  });
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "quality-unversioned",
    agentId: "agent-a",
    profileKey: "support_refund.v0",
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T12:00:00.000Z",
    discipline: qualityDiscipline({ runtime_ms: 500, preferences_met: true }),
  });
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "quality-invalid-final",
    agentId: "agent-a",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T12:30:00.000Z",
    discipline: qualityDiscipline({ runtime_ms: 500, preferences_met: true }),
  });
  const invalidFinal = namespace.stores.get("acme")?.get("intent:quality-invalid-final:finalization") as any;
  invalidFinal.evaluation.evidence_confidence = Number.NaN;
  seedIntentQualityPreview(namespace, "acme", "quality-preview-only");
  seedIntentQualityFinalization(namespace, "other", {
    intentId: "quality-other-tenant",
    agentId: "agent-a",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T10:00:00.000Z",
    discipline: qualityDiscipline({ runtime_ms: 100, preferences_met: true }),
  });

  const baseQuery = "from=2026-07-20T00%3A00%3A00.000Z&to=2026-07-22T00%3A00%3A00.000Z";
  const scopedPath = `/tenants/acme/intent-quality/rollups?${baseQuery}&profile_key=support_refund.v1&profile_version=v1&minimum_sample_size=4`;
  const scoped = await call(env, ctx, "GET", scopedPath);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.schema_version, "agentpass.intent-quality-rollups.v1");
  assert.equal(scoped.body.tenant_id, "acme");
  assert.equal(scoped.body.records_scanned, 8);
  assert.equal(scoped.body.finalized_records, 7);
  assert.equal(scoped.body.matched_records, 4);
  assert.deepEqual(scoped.body.excluded_records.by_reason, {
    not_finalized: 1,
    invalid_final_receipt: 1,
    unversioned_profile: 1,
    outside_time_window: 0,
    profile_filter: 1,
    agent_filter: 0,
    verdict_filter: 0,
    constraint_filter: 0,
  });
  assert.equal(scoped.body.pagination.total_groups, 1);
  assert.equal(scoped.body.pagination.next_cursor, null);
  const rollup = scoped.body.rollups[0];
  assert.equal(rollup.profile_key, "support_refund.v1");
  assert.equal(rollup.profile_version, "v1");
  assert.equal(rollup.profile_digest, profileDigest);
  assert.deepEqual(rollup.sample, {
    finalized_jobs: 4,
    minimum_sample_size: 4,
    meets_minimum_sample_size: true,
  });
  assert.deepEqual(rollup.outcomes.counts, { completed: 1, partial: 1, failed: 1, indeterminate: 1 });
  assert.deepEqual(rollup.outcomes.rates, { completed: 0.25, partial: 0.25, failed: 0.25, indeterminate: 0.25 });
  assert.deepEqual(rollup.outcomes.qualified_success, { count: 1, rate: 0.25 });
  assert.equal(rollup.outcomes.goal_attainment_average, 0.375);
  assert.deepEqual(rollup.constraint_compliance.counts, { pass: 2, fail: 1, indeterminate: 1 });
  assert.deepEqual(rollup.constraint_compliance.rates, { pass: 0.5, fail: 0.25, indeterminate: 0.25 });
  assert.equal(rollup.evidence_confidence.average, 0.575);
  assert.deepEqual(rollup.evidence_confidence.distribution, {
    high: { count: 1, rate: 0.25 },
    medium: { count: 1, rate: 0.25 },
    low: { count: 2, rate: 0.5 },
  });
  assert.deepEqual(rollup.execution_discipline.totals, {
    tool_calls: 6,
    execution_receipts: 2,
    executions: 2,
    replays: 1,
    retries: 3,
    denied_decisions: 1,
    challenge_decisions: 1,
    estimated_cost_usd: 0.06,
    runtime_ms: 6_000,
  });
  assert.equal(rollup.execution_discipline.averages.runtime_ms, 2_000);
  assert.deepEqual(rollup.execution_discipline.preference_compliance, {
    met: 1,
    not_met: 2,
    not_applicable: 1,
    rate: 0.3333,
  });
  assert.deepEqual(rollup.execution_discipline.coverage, { runtime_ms_records: 3, preference_records: 3 });
  assert.equal(rollup.data_quality.low_confidence_count, 2);
  assert.equal(rollup.data_quality.indeterminate_count, 1);
  assert.equal(rollup.data_quality.missing_agent_count, 1);
  assert.equal(rollup.data_quality.missing_runtime_count, 1);

  const deterministicReplay = await call(env, ctx, "GET", scopedPath);
  assert.deepEqual(deterministicReplay.body, scoped.body);

  const agentFiltered = await call(env, ctx, "GET", `${scopedPath}&agent_id=agent-a`);
  assert.equal(agentFiltered.body.matched_records, 2);
  assert.deepEqual(agentFiltered.body.rollups[0].outcomes.counts, {
    completed: 1,
    partial: 1,
    failed: 0,
    indeterminate: 0,
  });
  assert.equal(agentFiltered.body.excluded_records.by_reason.agent_filter, 2);
  assert.equal(agentFiltered.body.rollups[0].sample.meets_minimum_sample_size, false);
  assert.ok(agentFiltered.body.rollups[0].data_quality.findings.includes("sample size 2 is below minimum 4"));
  const verdictFiltered = await call(env, ctx, "GET", `${scopedPath}&verdict=indeterminate`);
  assert.equal(verdictFiltered.body.matched_records, 1);
  assert.equal(verdictFiltered.body.rollups[0].data_quality.indeterminate_count, 1);
  const complianceFiltered = await call(env, ctx, "GET", `${scopedPath}&constraint_compliance=fail`);
  assert.equal(complianceFiltered.body.matched_records, 1);
  assert.equal(complianceFiltered.body.rollups[0].constraint_compliance.counts.fail, 1);

  const firstPage = await call(env, ctx, "GET", `/tenants/acme/intent-quality/rollups?${baseQuery}&limit=1`);
  assert.equal(firstPage.body.pagination.total_groups, 2);
  assert.equal(firstPage.body.pagination.returned_groups, 1);
  assert.equal(firstPage.body.rollups[0].profile_key, "support_refund.v1");
  assert.equal(typeof firstPage.body.pagination.next_cursor, "string");
  const secondPage = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/rollups?${baseQuery}&limit=1&cursor=${encodeURIComponent(firstPage.body.pagination.next_cursor)}`,
  );
  assert.equal(secondPage.body.rollups[0].profile_key, "support_refund.v2");
  assert.equal(secondPage.body.pagination.next_cursor, null);

  const otherTenant = await call(
    env,
    ctx,
    "GET",
    `/tenants/other/intent-quality/rollups?${baseQuery}&profile_key=support_refund.v1`,
  );
  assert.equal(otherTenant.body.records_scanned, 1);
  assert.equal(otherTenant.body.matched_records, 1);
  assert.equal(otherTenant.body.rollups[0].sample.finalized_jobs, 1);

  const missingWindow = await call(env, ctx, "GET", "/tenants/acme/intent-quality/rollups");
  assert.equal(missingWindow.status, 400);
  assert.equal(missingWindow.body.error_code, "intent_quality_time_window_required");
  const oversizedWindow = await call(
    env,
    ctx,
    "GET",
    "/tenants/acme/intent-quality/rollups?from=2026-01-01T00%3A00%3A00Z&to=2026-07-21T00%3A00%3A00Z",
  );
  assert.equal(oversizedWindow.status, 400);
  assert.equal(oversizedWindow.body.error_code, "intent_quality_time_window_too_large");
});

test("finalized Jobs explorer is tenant scoped filterable and cursor stable without raw evidence", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const profileDigest = "a".repeat(64);
  const inputs = [
    {
      intentId: "jobs-completed",
      agentId: "agent-a",
      verdict: "completed",
      compliance: "pass",
      qualifiedSuccess: true,
      goalAttainment: 1,
      confidence: 1,
      finalizedAt: "2026-07-21T10:00:00.000Z",
      discipline: qualityDiscipline({ runtime_ms: 1_000, preferences_met: true }),
    },
    {
      intentId: "jobs-partial",
      agentId: "agent-a",
      verdict: "partial",
      compliance: "pass",
      qualifiedSuccess: false,
      goalAttainment: 0.5,
      confidence: 0.8,
      finalizedAt: "2026-07-21T10:01:00.000Z",
      discipline: qualityDiscipline({ retries: 1, replays: 1, runtime_ms: 2_000, preferences_met: false }),
    },
    {
      intentId: "jobs-failed",
      agentId: "agent-b",
      verdict: "failed",
      compliance: "fail",
      qualifiedSuccess: false,
      goalAttainment: 0,
      confidence: 0.5,
      finalizedAt: "2026-07-21T10:02:00.000Z",
      discipline: qualityDiscipline({ retries: 2, runtime_ms: 3_000, preferences_met: false }),
    },
    {
      intentId: "jobs-indeterminate",
      verdict: "indeterminate",
      compliance: "indeterminate",
      qualifiedSuccess: false,
      goalAttainment: 0,
      confidence: 0,
      finalizedAt: "2026-07-21T10:03:00.000Z",
      discipline: qualityDiscipline({ preferences_met: null }),
    },
  ] as const;
  for (const input of inputs) {
    seedIntentQualityFinalization(namespace, "acme", {
      ...input,
      profileKey: "support_refund.v1",
      profileVersion: "v1",
      profileDigest,
    });
  }
  seedIntentQualityPreviewHistory(namespace, "acme", "jobs-partial", 2);
  seedIntentQualityPreview(namespace, "acme", "jobs-preview-only");
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "jobs-tenant-mismatch",
    agentId: "agent-a",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T10:04:00.000Z",
    discipline: qualityDiscipline({ runtime_ms: 100, preferences_met: true }),
  });
  const mismatch = namespace.stores.get("acme")?.get("intent:jobs-tenant-mismatch:finalization") as any;
  mismatch.snapshot.tenant_id = "other";

  const baseQuery = "from=2026-07-20T00%3A00%3A00.000Z&to=2026-07-22T00%3A00%3A00.000Z";
  const firstPage = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/jobs?${baseQuery}&profile_key=support_refund.v1&limit=2`,
  );
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.schema_version, "agentpass.intent-quality-jobs.v1");
  assert.equal(firstPage.body.tenant_id, "acme");
  assert.equal(firstPage.body.matched_records, 4);
  assert.equal(firstPage.body.excluded_records.by_reason.not_finalized, 1);
  assert.equal(firstPage.body.excluded_records.by_reason.tenant_mismatch, 1);
  assert.deepEqual(firstPage.body.jobs.map((job: any) => job.intent_id), ["jobs-indeterminate", "jobs-failed"]);
  assert.equal(firstPage.body.jobs[0].final_status, "finalized");
  assert.equal(firstPage.body.jobs[0].data_quality.indeterminate, true);
  assert.equal(firstPage.body.jobs[0].data_quality.missing_agent, true);
  assert.equal(firstPage.body.jobs[0].data_quality.missing_runtime, true);
  assert.equal(firstPage.body.jobs[1].confidence_band, "low");
  assert.equal(typeof firstPage.body.pagination.next_cursor, "string");
  const serialized = JSON.stringify(firstPage.body.jobs);
  assert.equal(serialized.includes("snapshot_id"), false);
  assert.equal(serialized.includes("observations"), false);
  assert.equal(serialized.includes("execution_receipts"), false);

  const secondPage = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/jobs?${baseQuery}&profile_key=support_refund.v1&limit=2&cursor=${encodeURIComponent(firstPage.body.pagination.next_cursor)}`,
  );
  assert.equal(secondPage.status, 200);
  assert.deepEqual(secondPage.body.jobs.map((job: any) => job.intent_id), ["jobs-partial", "jobs-completed"]);
  assert.equal(secondPage.body.jobs[0].preview_count, 2);
  assert.equal(secondPage.body.jobs[0].execution_discipline.retries, 1);
  assert.equal(secondPage.body.jobs[0].execution_discipline.replays, 1);
  assert.equal(secondPage.body.pagination.next_cursor, null);
  assert.equal(
    new Set([...firstPage.body.jobs, ...secondPage.body.jobs].map((job: any) => job.intent_id)).size,
    4,
  );

  const filtered = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/jobs?${baseQuery}&agent_id=agent-a&confidence=medium&job_id=job-jobs-partial&intent_id=jobs-partial`,
  );
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.jobs.map((job: any) => job.intent_id), ["jobs-partial"]);
  assert.deepEqual(filtered.body.jobs[0].profile_binding, {
    key: "support_refund.v1",
    version: "v1",
    digest: profileDigest,
  });

  const invalidCursor = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/jobs?${baseQuery}&cursor=not-a-cursor`,
  );
  assert.equal(invalidCursor.status, 400);
  assert.equal(invalidCursor.body.error_code, "intent_quality_jobs_cursor_invalid");
  const oversizedWindow = await call(
    env,
    ctx,
    "GET",
    "/tenants/acme/intent-quality/jobs?from=2026-01-01T00%3A00%3A00Z&to=2026-07-21T00%3A00%3A00Z",
  );
  assert.equal(oversizedWindow.status, 400);
  assert.equal(oversizedWindow.body.error_code, "intent_quality_time_window_too_large");
});

test("finalized Job detail exposes an allowlisted deterministic frozen timeline", async () => {
  const namespace = new MemoryNamespace();
  const env = { JIT_GRANTS: namespace };
  const ctx = new TestContext();
  const profileDigest = "a".repeat(64);
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "detail-safe",
    jobId: "job-detail-safe",
    agentId: "agent-detail",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "partial",
    compliance: "fail",
    qualifiedSuccess: false,
    goalAttainment: 0.5,
    confidence: 0.6,
    finalizedAt: "2026-07-21T10:05:00.000Z",
    discipline: qualityDiscipline({
      tool_calls: 2,
      execution_receipts: 1,
      executions: 1,
      replays: 1,
      retries: 2,
      denied_decisions: 1,
      runtime_ms: 2_000,
      preferences_met: false,
      preference_findings: ["preference finding"],
    }),
    decisionEvents: [
      {
        schema_version: "agentpass.intent-decision-evidence.v1",
        decision_id: "decision-allow",
        agent_id: "agent-detail",
        tool: "zendesk.search_tickets",
        action: "read",
        decision: "allow",
        allow: true,
        decided_at: "2026-07-21T10:01:00.000Z",
        resource: "secret-resource",
        approval_evidence: { token: "secret-approval-token" },
        findings: [],
      },
      {
        schema_version: "agentpass.intent-decision-evidence.v1",
        decision_id: "decision-deny",
        agent_id: "agent-detail",
        tool: "stripe.create_refund",
        action: "write",
        decision: "deny",
        allow: false,
        findings: ["approval required"],
      },
    ],
    executionReceipts: [{
      schema_version: "agentpass.provider-execution-receipt.v1",
      decision_id: "receipt-replay",
      tool: "stripe.create_refund",
      action: "write",
      status: "replayed",
      executed_at: "2026-07-21T10:03:00.000Z",
      completed_at: "2026-07-21T10:03:01.000Z",
      replay_count: 1,
      replayed_from_decision_id: "receipt-original",
      request_digest: "secret-request-digest",
      result_body: "secret-provider-body",
    }],
    observations: [{
      schema_version: "agentpass.intent-observation.v1",
      observation_id: "observation-safe",
      issuer: "stripe-adapter",
      predicate: "refund.status",
      value: "secret-observation-value",
      observed_at: "2026-07-21T10:04:00.000Z",
      issued_at: "2026-07-21T10:04:01.000Z",
      payload_digest: "5".repeat(64),
      resource: "secret-observation-resource",
      claims: { access_token: "secret-observation-token" },
      provenance: {
        verification_method: "jws",
        verified_at: "2026-07-21T10:04:02.000Z",
        signature_kid: "stripe-2026",
        verified_subject: "secret-subject",
      },
    }],
    jobEvidence: {
      private_payload: "secret-job-payload",
      started_at: "2026-07-21T10:00:00.000Z",
      completed_at: "2026-07-21T10:05:00.000Z",
    },
    outcomes: [{
      predicate_id: "refund-created",
      status: "pass",
      observed_count: 1,
      reason: "refund creation observed",
      expected: "expected-secret",
      actual: "actual-secret",
    }],
    constraints: [{
      predicate_id: "approval-required",
      status: "fail",
      observed_count: 0,
      reason: "approval evidence missing",
    }],
    evidenceFindings: ["low confidence evidence"],
  });
  seedIntentQualityPreviewDetail(namespace, "acme", {
    intentId: "detail-safe",
    jobId: "job-detail-safe",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    evaluationId: "preview-valid",
    evaluatedAt: "not-a-time",
  });
  seedIntentQualityPreviewDetail(namespace, "acme", {
    intentId: "detail-safe",
    jobId: "job-detail-safe",
    profileKey: "support_refund.v2",
    profileVersion: "v2",
    profileDigest: "b".repeat(64),
    evaluationId: "preview-invalid",
    evaluatedAt: "2026-07-21T10:02:00.000Z",
  });
  seedIntentQualityPreview(namespace, "acme", "detail-preview-only");

  const detail = await call(env, ctx, "GET", "/tenants/acme/intent-quality/jobs/job-detail-safe");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.schema_version, "agentpass.intent-quality-job-detail.v1");
  assert.equal(detail.body.tenant_id, "acme");
  assert.equal(detail.body.job.job_id, "job-detail-safe");
  assert.equal(detail.body.job.intent_id, "detail-safe");
  assert.deepEqual(detail.body.job.profile_binding, {
    key: "support_refund.v1",
    version: "v1",
    digest: profileDigest,
  });
  assert.equal(detail.body.immutable_boundary.status, "finalized");
  assert.equal(detail.body.immutable_boundary.snapshot_id.startsWith("snapshot_"), true);
  assert.equal(detail.body.final_evaluation.verdict, "partial");
  assert.equal(detail.body.final_evaluation.constraints[0].status, "fail");
  assert.deepEqual(detail.body.final_evaluation.execution_discipline, {
    tool_calls: 2,
    execution_receipts: 1,
    executions: 1,
    replays: 1,
    retries: 2,
    denied_decisions: 1,
    challenge_decisions: 0,
    estimated_cost_usd: 0,
    runtime_ms: 2_000,
    preferences_met: false,
    preference_findings: ["preference finding"],
  });
  assert.equal(detail.body.previews.count, 1);
  assert.equal(detail.body.previews.invalid_count, 1);
  assert.equal(detail.body.previews.evaluations[0].evaluation_id, "preview-valid");
  assert.equal(detail.body.previews.evaluations[0].evaluated_at, null);
  assert.equal(detail.body.evidence_sources.decision_events.count, 2);
  assert.equal(detail.body.evidence_sources.execution_receipts.count, 1);
  assert.equal(detail.body.evidence_sources.observations.count, 1);
  assert.equal(detail.body.timeline.ordering.tie_breaker, "event_type, evidence_id, source_index");
  assert.deepEqual(
    detail.body.timeline.entries.map((entry: any) => entry.event_type),
    ["authorization_decision", "execution_receipt", "verified_observation", "finalization", "authorization_decision", "preview_evaluation"],
  );
  assert.equal(detail.body.timeline.entries[0].decision, "allow");
  assert.equal(detail.body.timeline.entries[1].status, "replayed");
  assert.equal(detail.body.timeline.entries[2].verification_method, "jws");
  assert.equal(detail.body.timeline.entries[4].timestamp_status, "missing");
  assert.equal(detail.body.timeline.entries[5].timestamp_status, "missing");
  assert.equal(detail.body.data_quality.missing_timestamps_count, 2);
  assert.equal(detail.body.data_quality.invalid_preview_count, 1);
  const serialized = JSON.stringify(detail.body);
  for (const forbidden of [
    "secret-resource",
    "secret-approval-token",
    "secret-request-digest",
    "secret-provider-body",
    "secret-observation-value",
    "secret-observation-resource",
    "secret-observation-token",
    "secret-subject",
    "secret-job-payload",
    "expected-secret",
    "actual-secret",
    "result_body",
    "approval_evidence",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  const otherTenant = await call(env, ctx, "GET", "/tenants/other/intent-quality/jobs/job-detail-safe");
  assert.equal(otherTenant.status, 404);
  assert.equal(otherTenant.body.error_code, "intent_quality_job_not_found");
  const previewOnly = await call(env, ctx, "GET", "/tenants/acme/intent-quality/jobs/detail-preview-only");
  assert.equal(previewOnly.status, 404);
  const invalidId = await call(env, ctx, "GET", "/tenants/acme/intent-quality/jobs/not%20safe");
  assert.equal(invalidId.status, 400);
  assert.equal(invalidId.body.error_code, "intent_quality_job_id_invalid");
  const queryRejected = await call(env, ctx, "GET", "/tenants/acme/intent-quality/jobs/job-detail-safe?debug=true");
  assert.equal(queryRejected.status, 400);
  assert.equal(queryRejected.body.error_code, "intent_quality_job_detail_query_not_allowed");

  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "ambiguous-one",
    jobId: "job-ambiguous",
    agentId: "agent-detail",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T11:00:00.000Z",
    discipline: qualityDiscipline({ preferences_met: true }),
  });
  seedIntentQualityFinalization(namespace, "acme", {
    intentId: "ambiguous-two",
    jobId: "job-ambiguous",
    agentId: "agent-detail",
    profileKey: "support_refund.v1",
    profileVersion: "v1",
    profileDigest,
    verdict: "completed",
    compliance: "pass",
    qualifiedSuccess: true,
    goalAttainment: 1,
    confidence: 1,
    finalizedAt: "2026-07-21T11:01:00.000Z",
    discipline: qualityDiscipline({ preferences_met: true }),
  });
  const ambiguous = await call(env, ctx, "GET", "/tenants/acme/intent-quality/jobs/job-ambiguous");
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguous.body.error_code, "intent_quality_job_ambiguous");
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

test("activity ingestion authenticates a tenant source and stores privacy-safe idempotent events", async () => {
  const namespace = new MemoryNamespace();
  const token = "hermes-source-secret";
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "dashboard-secret",
    AGENTID_MANIFEST_JSON: JSON.stringify(activityManifest(token)),
  };
  const ctx = new TestContext();
  const headers = {
    authorization: `Bearer ${token}`,
    "x-agentaction-source-id": "hermes-production",
  };
  const batch = activityBatch("acme", "obs_tool_1");

  const accepted = await call(env, ctx, "POST", "/tenants/acme/activity/batches", batch, headers);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.accepted, 1);
  assert.equal(accepted.body.duplicates, 0);

  const replayed = await call(env, ctx, "POST", "/tenants/acme/activity/batches", batch, headers);
  assert.equal(replayed.status, 202);
  assert.equal(replayed.body.accepted, 0);
  assert.equal(replayed.body.duplicates, 1);

  const page = await call(
    env,
    ctx,
    "GET",
    "/tenants/acme/activity/events?tool=browser.open&intent_binding=bound",
    undefined,
    { authorization: "Bearer dashboard-secret" },
  );
  assert.equal(page.status, 200);
  assert.equal(page.body.count, 1);
  assert.equal(page.body.events[0].intent.intent_id, "intent-123");
  assert.equal(page.body.events[0].evaluation.counterfactual_decision, "challenge_required");
  assert.equal(JSON.stringify(page.body.events).includes("args"), false);
  assert.equal(JSON.stringify(page.body.events).includes("result"), false);

  const otherTenant = await call(
    env,
    ctx,
    "GET",
    "/tenants/beta/activity/events",
    undefined,
    { authorization: "Bearer dashboard-secret" },
  );
  assert.equal(otherTenant.status, 200);
  assert.equal(otherTenant.body.count, 0);
});

test("activity ingestion rejects wrong credentials, tenant drift, raw fields, and conflicting replays", async () => {
  const namespace = new MemoryNamespace();
  const token = "hermes-source-secret";
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "dashboard-secret",
    AGENTID_MANIFEST_JSON: JSON.stringify(activityManifest(token)),
  };
  const ctx = new TestContext();
  const headers = {
    authorization: `Bearer ${token}`,
    "x-agentaction-source-id": "hermes-production",
  };
  const batch = activityBatch("acme", "obs_tool_2");

  const wrongToken = await call(env, ctx, "POST", "/tenants/acme/activity/batches", batch, {
    ...headers,
    authorization: "Bearer wrong",
  });
  assert.equal(wrongToken.status, 401);
  const tenantDrift = await call(env, ctx, "POST", "/tenants/beta/activity/batches", batch, headers);
  assert.equal(tenantDrift.status, 400);
  const rawField = structuredClone(batch);
  (rawField.events as Array<Record<string, unknown>>)[0].args = { password: "private" };
  const rawRejected = await call(env, ctx, "POST", "/tenants/acme/activity/batches", rawField, headers);
  assert.equal(rawRejected.status, 400);
  assert.match(String(rawRejected.body.error), /unsupported field: args/);

  const accepted = await call(env, ctx, "POST", "/tenants/acme/activity/batches", batch, headers);
  assert.equal(accepted.status, 202);
  const conflict = structuredClone(batch);
  const event = (conflict.events as Array<Record<string, any>>)[0];
  event.execution.status = "error";
  const conflicted = await call(env, ctx, "POST", "/tenants/acme/activity/batches", conflict, headers);
  assert.equal(conflicted.status, 409);
  assert.equal(conflicted.body.error_code, "activity_event_conflict");
});

test("activity source lifecycle creates one immutable observed-execution Job", async () => {
  const namespace = new MemoryNamespace();
  const token = "hermes-source-secret";
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "dashboard-secret",
    AGENTID_MANIFEST_JSON: JSON.stringify(activityManifest(token)),
  };
  const ctx = new TestContext();
  const headers = {
    authorization: `Bearer ${token}`,
    "x-agentaction-source-id": "hermes-production",
  };
  const started = activityJob("started");

  const created = await call(env, ctx, "POST", "/tenants/acme/activity/jobs", started, headers);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.phase, "started");
  assert.equal(created.body.profile_key, "agentaction_observed_execution.v1");
  assert.equal(created.body.profile_kind, "observed_execution");
  assert.match(created.body.job_id, /^hermes_[a-f0-9]{24}$/);
  assert.match(created.body.intent_id, /^intent_[a-f0-9]{24}$/);
  assert.match(created.body.intent_digest, /^[a-f0-9]{64}$/);

  const replayedStart = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    { ...started, started_at: "2026-08-31T18:00:02.000Z" },
    headers,
  );
  assert.equal(replayedStart.status, 200);
  assert.equal(replayedStart.body.replayed, true);
  assert.equal(replayedStart.body.intent_digest, created.body.intent_digest);

  const completed = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    activityJob("completed"),
    headers,
  );
  assert.equal(completed.status, 201, JSON.stringify(completed.body));
  assert.equal(completed.body.evaluation.verdict, "completed");
  assert.equal(completed.body.evaluation.qualified_success, true);
  assert.equal(completed.body.evaluation.profile, "agentaction_observed_execution.v1");

  const replayedCompletion = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    { ...activityJob("completed"), completed_at: "2026-08-31T18:00:05.000Z", status: "error" },
    headers,
  );
  assert.equal(replayedCompletion.status, 200);
  assert.equal(replayedCompletion.body.replayed, true);
  assert.deepEqual(replayedCompletion.body.evaluation, completed.body.evaluation);

  const jobs = await call(
    env,
    ctx,
    "GET",
    "/tenants/acme/intent-quality/jobs?from=2026-08-31T00:00:00.000Z&to=2026-09-02T00:00:00.000Z&agent_id=hermes-support",
    undefined,
    { authorization: "Bearer dashboard-secret" },
  );
  assert.equal(jobs.status, 200);
  assert.equal(jobs.body.matched_records, 1);
  assert.equal(jobs.body.jobs[0].job_id, created.body.job_id);
  assert.equal(jobs.body.jobs[0].profile_binding.key, "agentaction_observed_execution.v1");
  assert.deepEqual(jobs.body.jobs[0].agent_ids, ["hermes-support"]);

  const detail = await call(
    env,
    ctx,
    "GET",
    `/tenants/acme/intent-quality/jobs/${created.body.job_id}`,
    undefined,
    { authorization: "Bearer dashboard-secret" },
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.body.job.job_id, created.body.job_id);
  assert.equal(detail.body.job.profile_binding.key, "agentaction_observed_execution.v1");
  assert.equal(JSON.stringify(detail.body).includes("prompt"), false);
  assert.equal(JSON.stringify(detail.body).includes("result"), false);
});

test("activity source lifecycle stays tenant source and agent scoped", async () => {
  const namespace = new MemoryNamespace();
  const token = "hermes-source-secret";
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "dashboard-secret",
    AGENTID_MANIFEST_JSON: JSON.stringify(activityManifest(token)),
  };
  const ctx = new TestContext();
  const headers = {
    authorization: `Bearer ${token}`,
    "x-agentaction-source-id": "hermes-production",
  };
  const lifecycle = activityJob("started");

  const tenantDrift = await call(env, ctx, "POST", "/tenants/beta/activity/jobs", lifecycle, headers);
  assert.equal(tenantDrift.status, 400);
  const sourceDrift = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    { ...lifecycle, source_id: "different-source" },
    headers,
  );
  assert.equal(sourceDrift.status, 400);
  const agentDrift = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    { ...lifecycle, agent_id: "different-agent" },
    headers,
  );
  assert.equal(agentDrift.status, 400);
  const rawField = await call(
    env,
    ctx,
    "POST",
    "/tenants/acme/activity/jobs",
    { ...lifecycle, prompt: "private" },
    headers,
  );
  assert.equal(rawField.status, 400);
  assert.match(String(rawField.body.error), /unsupported field: prompt/);

  const readDenied = await call(
    env,
    ctx,
    "GET",
    "/tenants/acme/intent-quality/jobs?from=2026-08-31T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
    undefined,
    headers,
  );
  assert.equal(readDenied.status, 401);
});

test("control plane creates an isolated tenant and returns source secrets only once", async () => {
  const namespace = new MemoryNamespace();
  const manifests = new MemoryManifests();
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_API_KEY: "public-api-key",
    AGENTID_INTERNAL_SERVICE_TOKEN: "console-service-secret",
    AGENTID_MANIFESTS: manifests,
  };
  const ctx = new TestContext();
  const alice = controlHeaders("alice-subject", "alice@example.com");

  const denied = await call(env, ctx, "GET", "/control-plane/session");
  assert.equal(denied.status, 403);
  const publicKeyDenied = await call(env, ctx, "GET", "/control-plane/session", undefined, {
    authorization: "Bearer public-api-key",
    "x-agentaction-console-subject": "alice-subject",
    "x-agentaction-console-issuer": "https://access.example.com",
  });
  assert.equal(publicKeyDenied.status, 403);
  const created = await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "acme",
    display_name: "Acme Support",
    source_id: "hermes-production",
    agent_id: "support-agent",
  }, alice);
  assert.equal(created.status, 201);
  assert.equal(created.body.membership.role, "owner");
  assert.match(created.body.source_token, /^aa_src_/);
  assert.match(created.body.hermes.yaml, /tenant_id: acme/);
  assert.equal(created.body.hermes.yaml.includes(created.body.source_token), false);

  const manifest = JSON.parse(String(await manifests.get("acme")));
  const storedSource = manifest.observability.ingestion.sources["hermes-production"];
  assert.match(storedSource.token_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(manifest).includes(created.body.source_token), false);

  const setup = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, alice);
  assert.equal(setup.status, 200);
  assert.equal(setup.body.membership.role, "owner");
  assert.equal(setup.body.sources[0].source_id, "hermes-production");
  assert.equal(JSON.stringify(setup.body).includes("token_sha256"), false);
  assert.equal(JSON.stringify(setup.body).includes(created.body.source_token), false);
  assert.equal(setup.body.ingestion.observed, false);

  const session = await call(env, ctx, "GET", "/control-plane/session", undefined, alice);
  assert.equal(session.status, 200);
  assert.deepEqual(session.body.memberships.map((entry: any) => entry.tenant.tenant_id), ["acme"]);
});

test("control plane enforces roles, single-use invitations, source rotation, and tenant isolation", async () => {
  const namespace = new MemoryNamespace();
  const manifests = new MemoryManifests();
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_INTERNAL_SERVICE_TOKEN: "console-service-secret",
    AGENTID_MANIFESTS: manifests,
  };
  const ctx = new TestContext();
  const alice = controlHeaders("alice-subject", "alice@example.com");
  const bob = controlHeaders("bob-subject", "bob@example.com");
  const eve = controlHeaders("eve-subject", "eve@example.com");
  const mallory = controlHeaders("mallory-subject", "mallory@example.com");
  const provisioned = await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "acme",
    display_name: "Acme",
    source_id: "hermes-production",
    agent_id: "support-agent",
  }, alice);

  const directoryStore = namespace.stores.get("__agentaction_tenant_directory__")!;
  directoryStore.set("directory:invitation:invite_legacy0123456789abcdef", {
    schema_version: "agentaction.tenant-invitation.v1",
    invitation_id: "invite_legacy0123456789abcdef",
    tenant_id: "acme",
    email: "legacy@example.com",
    role: "operator",
    secret_digest: "a".repeat(64),
    created_at: "2026-07-24T12:00:00.000Z",
    created_by: "alice-subject",
    expires_at: "2099-01-01T00:00:00.000Z",
  });

  const expiredInvitation = await call(env, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "bob@example.com",
    role: "viewer",
  }, alice);
  const expiredInvitationId = String(expiredInvitation.body.invitation_code).split(".")[0];
  const expiredRecord = structuredClone(directoryStore.get(`directory:invitation:${expiredInvitationId}`) as Record<string, unknown>);
  expiredRecord.expires_at = "2020-01-01T00:00:00.000Z";
  directoryStore.set(`directory:invitation:${expiredInvitationId}`, expiredRecord);
  const expired = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: expiredInvitationId,
  }, bob);
  assert.equal(expired.status, 410);

  const invitation = await call(env, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "bob@example.com",
    role: "viewer",
  }, alice);
  assert.equal(invitation.status, 201);
  assert.match(invitation.body.invitation_code, /^invite_[a-f0-9]+\.aa_inv_/);
  assert.equal(JSON.stringify(invitation.body.invitation).includes("secret"), false);
  const invitationId = String(invitation.body.invitation.invitation_id);

  const ownerSetupWithInvitations = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, alice);
  assert.equal(ownerSetupWithInvitations.status, 200);
  assert.deepEqual(
    new Set(ownerSetupWithInvitations.body.invitations.map((entry: any) => entry.invitation_id)),
    new Set(["invite_legacy0123456789abcdef", expiredInvitationId, invitationId]),
  );
  const listedInvitations = JSON.stringify(ownerSetupWithInvitations.body.invitations);
  assert.equal(listedInvitations.includes("secret"), false);
  assert.equal(listedInvitations.includes("digest"), false);
  assert.equal(listedInvitations.includes("aa_inv_"), false);

  const malformed = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: "invite_bad",
  }, bob);
  assert.equal(malformed.status, 400);
  const missing = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: "invite_0123456789abcdef01234567",
  }, bob);
  assert.equal(missing.status, 404);
  const ambiguous = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    code: invitation.body.invitation_code,
    invitation_id: invitationId,
  }, bob);
  assert.equal(ambiguous.status, 400);
  const wrongSecret = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    code: `${invitationId}.aa_inv_wrong`,
  }, bob);
  assert.equal(wrongSecret.status, 404);

  const wrongEmail = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: invitationId,
  }, eve);
  assert.equal(wrongEmail.status, 403);
  const claimedElsewhere = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: invitationId,
  }, controlHeaders("bob-subject", "bob@example.com", "legacy-tenant", "viewer"));
  assert.equal(claimedElsewhere.status, 403);
  assert.equal(claimedElsewhere.body.error_code, "claimed_tenant_fixed");

  const redeemed = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: invitationId,
  }, bob);
  assert.equal(redeemed.status, 201);
  assert.equal(redeemed.body.membership.role, "viewer");
  const replay = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: invitationId,
  }, bob);
  assert.equal(replay.status, 409);

  const operatorInvitation = await call(env, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "eve@example.com",
    role: "operator",
  }, alice);
  const operatorInvitationId = String(operatorInvitation.body.invitation.invitation_id);
  const operatorRedeemed = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    invitation_id: operatorInvitationId,
  }, eve);
  assert.equal(operatorRedeemed.status, 201);
  assert.equal(operatorRedeemed.body.membership.role, "operator");

  const viewerSetup = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, bob);
  assert.equal(viewerSetup.status, 200);
  assert.deepEqual(viewerSetup.body.invitations, []);
  assert.equal(JSON.stringify(viewerSetup.body).includes("legacy@example.com"), false);

  const operatorSetup = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, eve);
  assert.equal(operatorSetup.status, 200);
  assert.deepEqual(operatorSetup.body.invitations, []);
  assert.equal(JSON.stringify(operatorSetup.body).includes("legacy@example.com"), false);

  const ownerSetupAfterRedemption = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, alice);
  assert.equal(ownerSetupAfterRedemption.status, 200);
  assert.equal(ownerSetupAfterRedemption.body.invitations.some((entry: any) => entry.invitation_id === invitationId), false);
  const viewerInvitation = await call(env, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "mallory@example.com",
    role: "viewer",
  }, bob);
  assert.equal(viewerInvitation.status, 403);
  const viewerSource = await call(env, ctx, "POST", "/control-plane/tenants/acme/sources", {
    source_id: "bob-source",
    agent_id: "bob-agent",
  }, bob);
  assert.equal(viewerSource.status, 403);
  const viewerWorkspace = await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "bob-workspace",
    display_name: "Bob Workspace",
  }, bob);
  assert.equal(viewerWorkspace.status, 403);
  assert.equal(viewerWorkspace.body.error_code, "workspace_creation_forbidden");
  const crossTenant = await call(env, ctx, "GET", "/control-plane/tenants/acme/setup", undefined, mallory);
  assert.equal(crossTenant.status, 403);

  const rotated = await call(env, ctx, "POST", "/control-plane/tenants/acme/sources/hermes-production/rotate", {}, alice);
  assert.equal(rotated.status, 200);
  assert.match(rotated.body.source_token, /^aa_src_/);
  const rotatedManifest = JSON.parse(String(await manifests.get("acme")));
  assert.equal(JSON.stringify(rotatedManifest).includes(rotated.body.source_token), false);
  const oldTokenBatch = activityBatch("acme", "obs_old_token");
  oldTokenBatch.events[0].agent_id = "support-agent";
  const oldToken = await call(env, ctx, "POST", "/tenants/acme/activity/batches", oldTokenBatch, {
    authorization: `Bearer ${provisioned.body.source_token}`,
    "x-agentaction-source-id": "hermes-production",
  });
  assert.equal(oldToken.status, 401);
  const newTokenBatch = activityBatch("acme", "obs_new_token");
  newTokenBatch.events[0].agent_id = "support-agent";
  const newToken = await call(env, ctx, "POST", "/tenants/acme/activity/batches", newTokenBatch, {
    authorization: `Bearer ${rotated.body.source_token}`,
    "x-agentaction-source-id": "hermes-production",
  });
  assert.equal(newToken.status, 202, JSON.stringify(newToken.body));
  const revoked = await call(env, ctx, "DELETE", "/control-plane/tenants/acme/sources/hermes-production", undefined, alice);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.source.enabled, false);
});

test("emails protected auto-redeem invitations and preserves fallback redemption when delivery fails", async () => {
  const namespace = new MemoryNamespace();
  const manifests = new MemoryManifests();
  const messages: Array<Record<string, any>> = [];
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_INTERNAL_SERVICE_TOKEN: "console-service-secret",
    AGENTID_MANIFESTS: manifests,
    AGENTACTION_CONSOLE_URL: "https://console.agentaction.dev/",
    AGENTACTION_INVITATION_FROM_EMAIL: "invites@agentaction.dev",
    INVITATION_EMAIL: {
      async send(message: Record<string, any>): Promise<{ messageId: string }> {
        messages.push(message);
        return { messageId: "message-1" };
      },
    },
  };
  const ctx = new TestContext();
  const alice = controlHeaders("alice-subject", "alice@example.com");
  const bob = controlHeaders("bob-subject", "bob@example.com");
  await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "acme",
    display_name: "Acme & Partners",
  }, alice);

  const invitation = await call(env, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "bob@example.com",
    role: "viewer",
  }, alice);
  assert.equal(invitation.status, 201);
  assert.equal(invitation.body.delivery.status, "sent");
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].from, { email: "invites@agentaction.dev", name: "AgentAction" });
  assert.equal(messages[0].to, "bob@example.com");
  assert.match(messages[0].subject, /Acme & Partners/);
  assert.match(messages[0].text, /Invited by: alice@example.com/);
  assert.match(messages[0].text, /Role: Viewer/);
  assert.match(messages[0].text, /redeems the invitation automatically/);
  assert.match(messages[0].text, /Cloudflare Access/);
  assert.match(messages[0].html, /Acme &amp; Partners/);
  assert.doesNotMatch(messages[0].html, /<h1>Join Acme & Partners/);
  const invitationCode = String(invitation.body.invitation_code);
  const invitationId = String(invitation.body.invitation.invitation_id);
  const link = String(messages[0].text).split("\n").find((line) => line.startsWith("https://")) || "";
  assert.equal(link, `https://console.agentaction.dev/?invitation=${invitationId}#setup`);
  assert.equal(link.includes(invitationCode), false);
  assert.doesNotMatch(link, /aa_inv_/);
  const storedDirectory = JSON.stringify([...namespace.stores.get("__agentaction_tenant_directory__")!.entries()]);
  assert.equal(storedDirectory.includes(invitationCode), false);

  const failingEnv = {
    ...env,
    INVITATION_EMAIL: {
      async send(): Promise<never> {
        throw new Error("delivery unavailable");
      },
    },
  };
  const failed = await call(failingEnv, ctx, "POST", "/control-plane/tenants/acme/invitations", {
    email: "carol@example.com",
    role: "operator",
  }, alice);
  assert.equal(failed.status, 201);
  assert.equal(failed.body.delivery.status, "failed");
  assert.match(failed.body.invitation_code, /^invite_[a-f0-9]+\.aa_inv_/);
  const redeemed = await call(failingEnv, ctx, "POST", "/control-plane/invitations/redeem", {
    code: failed.body.invitation_code,
  }, controlHeaders("carol-subject", "carol@example.com"));
  assert.equal(redeemed.status, 201);
  assert.equal(redeemed.body.membership.role, "operator");
});

test("signed tenant claims remain authoritative virtual memberships", async () => {
  const namespace = new MemoryNamespace();
  const manifests = new MemoryManifests();
  await manifests.put("legacy-tenant", JSON.stringify(activityManifest("legacy-source-token")));
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_INTERNAL_SERVICE_TOKEN: "console-service-secret",
    AGENTID_MANIFESTS: manifests,
  };
  const ctx = new TestContext();
  const claimed = controlHeaders("legacy-user", "legacy@example.com", "legacy-tenant", "viewer");
  const session = await call(env, ctx, "GET", "/control-plane/session", undefined, claimed);
  assert.equal(session.status, 200);
  assert.equal(session.body.memberships[0].tenant.tenant_id, "legacy-tenant");
  assert.equal(session.body.memberships[0].membership.role, "viewer");
  const setup = await call(env, ctx, "GET", "/control-plane/tenants/legacy-tenant/setup", undefined, claimed);
  assert.equal(setup.status, 200);
  const denied = await call(env, ctx, "POST", "/control-plane/tenants/legacy-tenant/sources", {
    source_id: "new-source",
    agent_id: "new-agent",
  }, claimed);
  assert.equal(denied.status, 403);
  const anotherTenant = await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "another-tenant",
    display_name: "Another tenant",
  }, claimed);
  assert.equal(anotherTenant.status, 403);
  assert.equal(anotherTenant.body.error_code, "claimed_tenant_fixed");

  const missingManifest = await call(
    env,
    ctx,
    "GET",
    "/control-plane/tenants/missing-tenant/setup",
    undefined,
    controlHeaders("missing-user", "missing@example.com", "missing-tenant", "owner"),
  );
  assert.equal(missingManifest.status, 404);
  assert.equal(missingManifest.body.error, "tenant manifest not found");
});

test("signed owners can adopt a workspace and then use directory memberships", async () => {
  const namespace = new MemoryNamespace();
  const manifests = new MemoryManifests();
  const legacyManifest = JSON.stringify(activityManifest("legacy-source-token"));
  await manifests.put("legacy-tenant", legacyManifest);
  const env = {
    JIT_GRANTS: namespace,
    AGENTID_INTERNAL_SERVICE_TOKEN: "console-service-secret",
    AGENTID_MANIFESTS: manifests,
  };
  const ctx = new TestContext();
  const owner = controlHeaders("legacy-owner", "owner@example.com", "legacy-tenant", "owner");
  const viewer = controlHeaders("legacy-viewer", "viewer@example.com", "legacy-tenant", "viewer");
  const otherOwner = controlHeaders("other-owner", "other@example.com");

  const fixedSession = await call(env, ctx, "GET", "/control-plane/session", undefined, owner);
  assert.equal(fixedSession.body.workspace_mode, "sso_fixed");
  const viewerMigration = await call(env, ctx, "POST", "/control-plane/tenants/legacy-tenant/migrate", {}, viewer);
  assert.equal(viewerMigration.status, 403);

  const migrated = await call(env, ctx, "POST", "/control-plane/tenants/legacy-tenant/migrate", {}, owner);
  assert.equal(migrated.status, 201);
  assert.equal(migrated.body.workspace_mode, "directory");
  assert.equal(migrated.body.membership.role, "owner");
  assert.equal(migrated.body.membership.workspace_mode, "directory");
  assert.equal(await manifests.get("legacy-tenant"), legacyManifest);

  const directoryStore = namespace.stores.get("__agentaction_tenant_directory__")!;
  const ownerPrincipal = `directory:principal:${createHash("sha256")
    .update("https://access.example.com\u0000legacy-owner")
    .digest("hex")}`;
  directoryStore.delete(`${ownerPrincipal}:workspace-mode`);
  const membershipKey = `${ownerPrincipal}:membership:legacy-tenant`;
  const adoptedMembership = directoryStore.get(membershipKey) as Record<string, unknown>;
  assert.equal((await call(env, ctx, "GET", "/control-plane/session", undefined, owner)).body.workspace_mode, "directory");

  directoryStore.set(membershipKey, Object.fromEntries(
    Object.entries(adoptedMembership).filter(([key]) => key !== "workspace_mode"),
  ));
  assert.equal((await call(env, ctx, "GET", "/control-plane/session", undefined, owner)).body.workspace_mode, "sso_fixed");
  const repeated = await call(env, ctx, "POST", "/control-plane/tenants/legacy-tenant/migrate", {}, owner);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.membership.workspace_mode, "directory");
  directoryStore.delete(`${ownerPrincipal}:workspace-mode`);
  assert.equal((await call(env, ctx, "GET", "/control-plane/session", undefined, owner)).body.workspace_mode, "directory");

  const beta = await call(env, ctx, "POST", "/control-plane/tenants", {
    tenant_id: "beta",
    display_name: "Beta",
  }, otherOwner);
  assert.equal(beta.status, 201);
  assert.equal(beta.body.source_token, undefined);
  const betaManifest = JSON.parse(String(await manifests.get("beta")));
  assert.deepEqual(betaManifest.observability.ingestion.sources, {});
  const invitation = await call(env, ctx, "POST", "/control-plane/tenants/beta/invitations", {
    email: "owner@example.com",
    role: "operator",
  }, otherOwner);
  const joined = await call(env, ctx, "POST", "/control-plane/invitations/redeem", {
    code: invitation.body.invitation_code,
  }, owner);
  assert.equal(joined.status, 201);

  const genericSource = await call(env, ctx, "POST", "/control-plane/tenants/beta/sources", {
    integration: "agentaction",
    source_id: "custom-source",
    agent_id: "custom-agent",
  }, owner);
  assert.equal(genericSource.status, 201);
  assert.equal(genericSource.body.source.integration, "agentaction");
  assert.equal(genericSource.body.hermes, undefined);
  assert.match(genericSource.body.setup.configuration, /AGENTACTION_TENANT_ID=beta/);

  const directorySession = await call(env, ctx, "GET", "/control-plane/session", undefined, owner);
  assert.equal(directorySession.body.workspace_mode, "directory");
  assert.deepEqual(
    directorySession.body.memberships.map((entry: any) => entry.tenant.tenant_id).sort(),
    ["beta", "legacy-tenant"],
  );
  const stillFixed = await call(
    env,
    ctx,
    "GET",
    "/control-plane/session",
    undefined,
    controlHeaders("another-legacy-owner", "another@example.com", "legacy-tenant", "owner"),
  );
  assert.equal(stillFixed.body.workspace_mode, "sso_fixed");
  assert.deepEqual(stillFixed.body.memberships.map((entry: any) => entry.tenant.tenant_id), ["legacy-tenant"]);
});

function controlHeaders(
  subject: string,
  email: string,
  tenantId?: string,
  role?: "owner" | "operator" | "viewer",
): Record<string, string> {
  return {
    authorization: "Bearer console-service-secret",
    "x-agentaction-console-subject": subject,
    "x-agentaction-console-email": email,
    "x-agentaction-console-issuer": "https://access.example.com",
    ...(tenantId ? { "x-agentaction-console-tenant-id": tenantId } : {}),
    ...(role ? { "x-agentaction-console-role": role } : {}),
  };
}

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

function qualityDiscipline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tool_calls: 0,
    execution_receipts: 0,
    executions: 0,
    replays: 0,
    retries: 0,
    denied_decisions: 0,
    challenge_decisions: 0,
    estimated_cost_usd: 0,
    preferences_met: null,
    preference_findings: [],
    ...overrides,
  };
}

function seedIntentQualityFinalization(
  namespace: MemoryNamespace,
  tenantId: string,
  input: {
    intentId: string;
    jobId?: string;
    agentId?: string;
    profileKey: string;
    profileVersion?: string;
    profileDigest?: string;
    verdict: "completed" | "partial" | "failed" | "indeterminate";
    compliance: "pass" | "fail" | "indeterminate";
    qualifiedSuccess: boolean;
    goalAttainment: number;
    confidence: number;
    finalizedAt: string;
    discipline: Record<string, unknown>;
    decisionEvents?: Record<string, unknown>[];
    executionReceipts?: Record<string, unknown>[];
    observations?: Record<string, unknown>[];
    jobEvidence?: Record<string, unknown>;
    outcomes?: Record<string, unknown>[];
    constraints?: Record<string, unknown>[];
    evidenceFindings?: string[];
  },
): void {
  namespace.get(tenantId);
  const store = namespace.stores.get(tenantId);
  assert.ok(store);
  const index = (store.get("intent:index") as string[] | undefined) || [];
  const sequence = index.length + 1;
  const intentDigest = sequence.toString(16).padStart(64, "c").slice(-64);
  const evidenceDigest = sequence.toString(16).padStart(64, "d").slice(-64);
  const snapshotId = `snapshot_${sequence.toString(16).padStart(24, "0")}`;
  const jobId = input.jobId || `job-${input.intentId}`;
  const decisionEvents = input.decisionEvents || [];
  const executionReceipts = input.executionReceipts || [];
  const observations = input.observations || [];
  const jobEvidence = {
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.jobEvidence || {}),
  };
  const evaluation = {
    schema_version: "agentpass.intent-evaluation.v1",
    evaluation_id: `eval-final-${input.intentId}`,
    intent_id: input.intentId,
    intent_digest: intentDigest,
    profile: input.profileKey,
    ...(input.profileVersion ? { profile_version: input.profileVersion } : {}),
    ...(input.profileDigest ? { profile_digest: input.profileDigest } : {}),
    job_id: jobId,
    evaluated_at: input.finalizedAt,
    verdict: input.verdict,
    constraint_compliance: input.compliance,
    qualified_success: input.qualifiedSuccess,
    goal_attainment: input.goalAttainment,
    evidence_confidence: input.confidence,
    outcomes: input.outcomes || [],
    constraints: input.constraints || [],
    execution_discipline: input.discipline,
    evidence_findings: input.evidenceFindings || [],
    evaluation_mode: "final",
    snapshot_id: snapshotId,
    evidence_digest: evidenceDigest,
  };
  const snapshot = {
    schema_version: "agentpass.intent-evidence-snapshot.v1",
    snapshot_id: snapshotId,
    tenant_id: tenantId,
    intent_id: input.intentId,
    intent_digest: intentDigest,
    job_id: jobId,
    captured_at: input.finalizedAt,
    evidence_digest: evidenceDigest,
    sources: {
      decision_events: {
        count: decisionEvents.length,
        evidence_ids: decisionEvents.map((event, index) => String(event.decision_id || `decision-${index + 1}`)),
        digest: "1".repeat(64),
      },
      execution_receipts: {
        count: executionReceipts.length,
        evidence_ids: executionReceipts.map((receipt, index) => String(receipt.decision_id || `receipt-${index + 1}`)),
        digest: "2".repeat(64),
      },
      observations: {
        count: observations.length,
        evidence_ids: observations.map((observation, index) => String(observation.observation_id || `observation-${index + 1}`)),
        digest: "3".repeat(64),
      },
      job: {
        count: Object.keys(jobEvidence).length > 0 ? 1 : 0,
        evidence_ids: Object.keys(jobEvidence).length > 0 ? [jobId] : [],
        digest: "4".repeat(64),
      },
    },
    evidence: {
      decision_events: decisionEvents,
      execution_receipts: executionReceipts,
      observations,
      job: jobEvidence,
    },
  };
  store.set(`intent:${input.intentId}:finalization`, {
    schema_version: "agentpass.intent-finalization.v1",
    finalized_at: input.finalizedAt,
    evaluation,
    snapshot,
  });
  store.set("intent:index", [input.intentId, ...index.filter((id) => id !== input.intentId)]);
}

function seedIntentQualityPreview(namespace: MemoryNamespace, tenantId: string, intentId: string): void {
  namespace.get(tenantId);
  const store = namespace.stores.get(tenantId);
  assert.ok(store);
  const index = (store.get("intent:index") as string[] | undefined) || [];
  store.set(`intent:${intentId}:evaluation:latest-preview`, { evaluation_mode: "preview" });
  store.set("intent:index", [intentId, ...index.filter((id) => id !== intentId)]);
}

function seedIntentQualityPreviewHistory(
  namespace: MemoryNamespace,
  tenantId: string,
  intentId: string,
  count: number,
): void {
  namespace.get(tenantId);
  const store = namespace.stores.get(tenantId);
  assert.ok(store);
  const evaluationIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const evaluationId = `eval-preview-${intentId}-${index + 1}`;
    evaluationIds.push(evaluationId);
    store.set(`intent:${intentId}:evaluation:${evaluationId}`, {
      schema_version: "agentpass.intent-evaluation.v1",
      evaluation_id: evaluationId,
      evaluation_mode: "preview",
    });
  }
  store.set(`intent:${intentId}:evaluation:index`, evaluationIds);
}

function seedIntentQualityPreviewDetail(
  namespace: MemoryNamespace,
  tenantId: string,
  input: {
    intentId: string;
    jobId: string;
    profileKey: string;
    profileVersion: string;
    profileDigest: string;
    evaluationId: string;
    evaluatedAt: string;
  },
): void {
  namespace.get(tenantId);
  const store = namespace.stores.get(tenantId);
  assert.ok(store);
  const evaluation = {
    schema_version: "agentpass.intent-evaluation.v1",
    evaluation_id: input.evaluationId,
    intent_id: input.intentId,
    intent_digest: String(
      (store.get(`intent:${input.intentId}:finalization`) as any)?.evaluation?.intent_digest || "",
    ),
    profile: input.profileKey,
    profile_version: input.profileVersion,
    profile_digest: input.profileDigest,
    job_id: input.jobId,
    evaluated_at: input.evaluatedAt,
    verdict: "partial",
    constraint_compliance: "indeterminate",
    qualified_success: false,
    goal_attainment: 0.5,
    evidence_confidence: 0.6,
    outcomes: [],
    constraints: [],
    execution_discipline: qualityDiscipline({ preferences_met: null }),
    evidence_findings: ["preview evidence incomplete"],
    evaluation_mode: "preview",
  };
  store.set(`intent:${input.intentId}:evaluation:${input.evaluationId}`, evaluation);
  const indexKey = `intent:${input.intentId}:evaluation:index`;
  const index = (store.get(indexKey) as string[] | undefined) || [];
  store.set(indexKey, [input.evaluationId, ...index.filter((id) => id !== input.evaluationId)]);
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

function hostedLifecycleIntentContract(intentId: string, jobId: string): Record<string, unknown> {
  return {
    schema_version: "agentpass.intent-contract.v1",
    intent_id: intentId,
    profile: "support_refund.v1",
    issuer: "support-application",
    job_id: jobId,
    objective: "Observe the provider outcome and finalize one trusted job result",
    required_outcomes: [
      {
        id: "refund-provider-succeeded",
        source: "observations",
        where: [{ path: "predicate", operator: "equals", value: "refund.status" }],
        assertion: { path: "value", operator: "equals", value: "succeeded" },
      },
      {
        id: "job-completed",
        source: "job",
        assertion: { path: "completed_at", operator: "exists" },
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
    evidence_requirements: ["decision_events", "observations", "job"],
    issued_at: "2026-07-20T17:59:00.000Z",
    expires_at: "2099-07-20T18:30:00.000Z",
  };
}

function hostedRefundIntentProfile(): Record<string, unknown> {
  return {
    schema_version: "agentpass.intent-profile.v1",
    profile: "support_refund",
    version: "v1",
    issuer: "support-application",
    issued_at: "2026-07-20T00:00:00.000Z",
    objective_template: "Refund duplicate payment {{payment_id}} for {{refund_amount}} {{currency}}",
    variables: {
      payment_id: { type: "string", required: true, pattern: "^pi_[A-Za-z0-9]+$" },
      refund_amount: { type: "number", required: true, minimum: 0.01, maximum: 100 },
      currency: { type: "string", default: "USD", enum: ["USD"] },
    },
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
        assertion: { path: "amount", operator: "equals", value: { $variable: "refund_amount" }, quantifier: "all" },
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
    trusted_observation_requirements: [{
      predicate: "refund.status",
      issuers: ["stripe-adapter"],
      verification_methods: ["oidc", "jws"],
    }],
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

function activityManifest(token: string): Record<string, unknown> {
  return {
    agent: { id: "hermes-support", environment: "production" },
    observability: {
      ingestion: {
        sources: {
          "hermes-production": {
            enabled: true,
            token_sha256: `sha256:${createHash("sha256").update(token).digest("hex")}`,
            agent_ids: ["hermes-support"],
          },
        },
      },
    },
  };
}

function activityBatch(tenantId: string, eventId: string): Record<string, any> {
  return {
    schema_version: "agentaction.observation-batch.v1",
    batch_id: `batch_${eventId}`,
    tenant_id: tenantId,
    source_id: "hermes-production",
    sent_at: "2026-08-31T18:00:01.000Z",
    events: [
      {
        schema_version: "agentaction.hermes-observation.v1",
        event_id: eventId,
        event_type: "tool_action",
        observed_at: "2026-08-31T18:00:00.000Z",
        source_id: "hermes-production",
        agent_id: "hermes-support",
        correlation: {
          session_id: "session-1",
          task_id: "task-1",
          turn_id: "turn-1",
          tool_call_id: eventId,
        },
        intent: {
          binding_status: "bound",
          intent_id: "intent-123",
          intent_digest: "digest-123",
        },
        tool: { name: "browser.open", action: "read" },
        evaluation: {
          status: "evaluated",
          counterfactual_decision: "challenge_required",
          findings: ["approval_required"],
        },
        execution: { status: "ok", duration_ms: 42 },
      },
    ],
  };
}

function activityJob(phase: "started" | "completed"): Record<string, unknown> {
  return {
    schema_version: "agentaction.activity-job.v1",
    phase,
    tenant_id: "acme",
    source_id: "hermes-production",
    agent_id: "hermes-support",
    session_id: "hermes-session-1",
    task_id: "hermes-task-1",
    turn_id: "hermes-turn-1",
    started_at: "2026-08-31T18:00:00.000Z",
    ...(phase === "completed"
      ? { completed_at: "2026-08-31T18:00:04.000Z", status: "completed" }
      : {}),
  };
}

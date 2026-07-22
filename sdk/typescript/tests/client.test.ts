import assert from "node:assert/strict";
import test from "node:test";

import { AgentIdClient, AgentPassClient, AgentPassDeniedError, AgentPassHttpError } from "../src/index.ts";

test("authorizeToolCall posts tenant authorize request with bearer token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com/",
    token: "token-1",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return jsonResponse(200, { allow: true, decision: "allow", findings: [], event: {} });
    },
  });

  const response = await client.authorizeToolCall("tenant-a", {
    agent_id: "agent-a",
    intent_id: "intent-1",
    intent_digest: "abc123",
    tool: "docs.search",
    action: "read",
  });

  assert.equal(response.allow, true);
  assert.equal(calls[0].url, "https://gateway.example.com/tenants/tenant-a/authorize");
  assert.deepEqual(calls[0].init.headers, {
    "content-type": "application/json",
    authorization: "Bearer token-1",
  });
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.tool, "docs.search");
  assert.equal(body.intent_id, "intent-1");
  assert.equal(body.intent_digest, "abc123");
});

test("assertAllowed throws on deny decisions", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    fetch: async () => jsonResponse(403, { allow: false, decision: "challenge_required", findings: ["approval required"], event: {} }),
  });

  await assert.rejects(
    () => client.assertAllowed("tenant-a", { agent_id: "agent-a", tool: "x", action: "write" }),
    AgentPassDeniedError,
  );
});

test("requestJitGrant posts JIT grant request", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    token: async () => "token-2",
    fetch: async (url, init) => {
      assert.equal(String(url), "https://gateway.example.com/tenants/tenant-a/jit-grants");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer token-2");
      return jsonResponse(201, {
        jit_grant_id: "grant-1",
        agent_id: "agent-a",
        tool: "stripe.create_refund",
        action: "write",
        resource: "refund/1",
        approval_id: "approval-1",
        user_id: "user-1",
        expires_at: "2026-01-01T00:00:00Z",
        used: false,
      });
    },
  });

  const response = await client.requestJitGrant("tenant-a", {
    tool: "stripe.create_refund",
    action: "write",
    approval_id: "approval-1",
  });

  assert.equal(response.jit_grant_id, "grant-1");
});

test("recordExecutionResult posts provider result for hosted replay", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    token: "token-3",
    fetch: async (url, init) => {
      assert.equal(String(url), "https://gateway.example.com/tenants/tenant-a/execution-results");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer token-3");
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.result, { refund_id: "re_123" });
      return jsonResponse(201, {
        schema_version: "agentpass.idempotency-result.v1",
        idempotency_key: "refund-case-1",
        request_digest: "sha256:abc",
        agent_id: "agent-a",
        tool: "stripe.create_refund",
        action: "write",
        result: { refund_id: "re_123" },
        receipt: {
          schema_version: "agentpass.provider-execution-receipt.v1",
          decision_id: "dec-1",
          tool: "stripe.create_refund",
          action: "write",
          request_digest: "sha256:abc",
          status: "executed",
          executed_at: "2026-01-01T00:00:00Z",
        },
        created_at: "2026-01-01T00:00:00Z",
        replay_count: 0,
      });
    },
  });

  const response = await client.recordExecutionResult("tenant-a", {
    agent_id: "agent-a",
    tool: "stripe.create_refund",
    action: "write",
    resource: "refund/1",
    jit_grant_id: "grant-1",
    idempotency_key: "refund-case-1",
    result: { refund_id: "re_123" },
  });

  assert.equal(response.receipt.status, "executed");
});

test("hosted intent lifecycle methods use tenant-scoped endpoints", async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const status = init?.method === "POST" && !String(url).endsWith("/evaluate") ? 201 : 200;
      return jsonResponse(status, String(url).endsWith("/intent-contracts") && !init?.method
        ? { intent_contracts: [], count: 0 }
        : {});
    },
  });
  const contract = {
    schema_version: "agentpass.intent-contract.v1" as const,
    intent_id: "intent-1",
    profile: "support_refund.v1",
    issuer: "support-app",
    job_id: "job-1",
    required_outcomes: [{
      id: "completed",
      source: "job" as const,
      assertion: { operator: "exists" as const, path: "completed_at" },
    }],
    hard_constraints: [],
    issued_at: "2026-07-20T00:00:00.000Z",
  };

  const profile = {
    schema_version: "agentpass.intent-profile.v1" as const,
    profile: "support_refund",
    version: "v1",
    issuer: "support-app",
    issued_at: "2026-07-20T00:00:00.000Z",
    variables: {
      refund_amount: { type: "number" as const, required: true },
    },
    required_outcomes: contract.required_outcomes,
    hard_constraints: [],
  };

  await client.registerIntentProfile("tenant-a", profile);
  await client.listIntentProfiles("tenant-a");
  await client.getIntentProfile("tenant-a", "support_refund.v1");
  await client.issueIntentContract("tenant-a", "support_refund.v1", {
    intent_id: "intent-1",
    job_id: "job-1",
    variables: { refund_amount: 49 },
    issued_at: "2026-07-20T00:00:00.000Z",
  });
  await client.registerIntentContract("tenant-a", contract);
  await client.listIntentContracts("tenant-a");
  await client.getIntentContract("tenant-a", "intent-1");
  await client.recordIntentObservation("tenant-a", "intent-1", {
    observation_id: "obs-1",
    predicate: "refund.status",
    value: "succeeded",
    observed_at: "2026-07-20T00:00:01.000Z",
    issued_at: "2026-07-20T00:00:01.000Z",
    issuer: "stripe-adapter",
  });
  await client.evaluateIntent("tenant-a", "intent-1", { job: { completed_at: "2026-07-20T00:00:01.000Z" } });
  await client.finalizeIntent("tenant-a", "intent-1", { job: { completed_at: "2026-07-20T00:00:01.000Z" } });
  await client.getIntentEvaluations("tenant-a", "intent-1", { limit: 25 });
  await client.getIntentQualityRollups("tenant-a", {
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-07-21T00:00:00.000Z",
    profile_key: "support_refund.v1",
    profile_version: "v1",
    agent_id: "agent-a",
    verdict: "completed",
    constraint_compliance: "pass",
    minimum_sample_size: 10,
    limit: 2,
    cursor: "support_refund.v1|v1|abc",
  });

  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: "https://gateway.example.com/tenants/tenant-a/intent-profiles", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-profiles", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-profiles/support_refund.v1", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-profiles/support_refund.v1/issue", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts/intent-1", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts/intent-1/observations", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts/intent-1/evaluate", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts/intent-1/finalize", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/intent-contracts/intent-1/evaluations?limit=25", method: "GET" },
    {
      url: "https://gateway.example.com/tenants/tenant-a/intent-quality/rollups?from=2026-07-20T00%3A00%3A00.000Z&to=2026-07-21T00%3A00%3A00.000Z&profile_key=support_refund.v1&profile_version=v1&agent_id=agent-a&verdict=completed&constraint_compliance=pass&minimum_sample_size=10&limit=2&cursor=support_refund.v1%7Cv1%7Cabc",
      method: "GET",
    },
  ]);
  assert.equal(calls[0].body?.profile, "support_refund");
  assert.equal(calls[3].body?.intent_id, "intent-1");
  assert.equal(calls[4].body?.intent_id, "intent-1");
  assert.equal(calls[7].body?.predicate, "refund.status");
  assert.equal(calls[7].body?.observation_id, "obs-1");
});

test("recordIntentObservation accepts a signed JWS envelope and idempotent replay", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    fetch: async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), { jws: "header.payload.signature" });
      return jsonResponse(200, {
        observation: { observation_id: "obs-signed-1" },
        replayed: true,
      });
    },
  });

  const response = await client.recordIntentObservation("tenant-a", "intent-1", {
    jws: "header.payload.signature",
  });

  assert.equal(response.replayed, true);
  assert.equal(response.observation.observation_id, "obs-signed-1");
});

test("approval lifecycle methods use tenant-scoped endpoints", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    token: "token-3",
    fetch: async (url, init) => {
      calls.push({ url: String(url), method: init?.method || "GET" });
      if (String(url).includes("?status=pending&limit=25")) {
        return jsonResponse(200, { approvals: [], count: 0 });
      }
      return jsonResponse(init?.method === "POST" && !String(url).endsWith("/approve") ? 201 : 200, {
        approval_id: "approval-1",
        status: "approved",
      });
    },
  });

  await client.createApprovalRequest("tenant-a", {
    tool: "stripe.create_refund",
    action: "write",
    reason: "refund duplicate charge",
  });
  await client.listApprovalRequests("tenant-a", { status: "pending", limit: 25 });
  await client.getApprovalRequest("tenant-a", "approval-1");
  await client.decideApprovalRequest("tenant-a", "approval-1", "approve", {
    decided_by: "manager-1",
    decision_reason: "evidence verified",
  });

  assert.deepEqual(calls, [
    { url: "https://gateway.example.com/tenants/tenant-a/approval-requests", method: "POST" },
    { url: "https://gateway.example.com/tenants/tenant-a/approval-requests?status=pending&limit=25", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/approval-requests/approval-1", method: "GET" },
    { url: "https://gateway.example.com/tenants/tenant-a/approval-requests/approval-1/approve", method: "POST" },
  ]);
});

test("listAuditEvents filters by approval correlation", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    fetch: async (url) => {
      assert.equal(String(url), "https://gateway.example.com/audit/events?tenant_id=tenant-a&intent_id=intent-1&approval_id=approval-1&limit=50");
      return jsonResponse(200, { events: [], count: 0 });
    },
  });

  const response = await client.listAuditEvents({ tenantId: "tenant-a", intentId: "intent-1", approvalId: "approval-1", limit: 50 });
  assert.equal(response.count, 0);
});

test("unexpected statuses throw AgentPassHttpError", async () => {
  const client = new AgentPassClient({
    baseUrl: "https://gateway.example.com",
    fetch: async () => jsonResponse(500, { error: "broken" }),
  });

  await assert.rejects(
    () => client.authorizeToolCall("tenant-a", { agent_id: "agent-a", tool: "x", action: "read" }),
    AgentPassHttpError,
  );
});

test("legacy AgentIdClient export remains a compatibility alias", () => {
  assert.equal(AgentIdClient, AgentPassClient);
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

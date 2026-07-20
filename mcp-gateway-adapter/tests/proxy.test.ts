import assert from "node:assert/strict";
import { createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { handleJsonRpc } from "../src/proxy.ts";
import type { AdapterConfig, AuthorizationDecisionLog, JsonWebKeySet } from "../src/types.ts";

test("filters tools/list to configured tools", async () => {
  const response = await handleJsonRpc(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    config,
    {},
    async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            { name: "provider.crm.search_customer" },
            { name: "provider.admin.delete_customer" },
          ],
        },
      }),
  );

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    result: { tools: [{ name: "provider.crm.search_customer" }] },
  });
});

test("denies tools/call when AgentPass denies", async () => {
  const calls: string[] = [];
  const logs: AuthorizationDecisionLog[] = [];
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "provider.crm.search_customer",
        arguments: { customer_id: "cus_123", job_id: "support_case_resolution" },
      },
    },
    config,
    { logger: (entry) => logs.push(entry) },
    async (url) => {
      calls.push(String(url));
      return jsonResponse({
        allow: false,
        decision: "deny",
        findings: ["blocked"],
        event: { tool: "provider.crm.search_customer" },
      });
    },
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(logs, [
    {
      event: "agentid.mcp.authorization",
      agent_id: "enterprise-support-agent",
      tenant_id: "tenant-a",
      tool: "provider.crm.search_customer",
      action: "read",
      resource: "cus_123",
      job_id: "support_case_resolution",
      allowed: false,
      decision: "deny",
      findings: ["blocked"],
    },
  ]);
  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 2,
    error: {
      code: -32003,
      message: "AgentPass denied MCP tool call",
      data: {
        findings: ["blocked"],
        event: { tool: "provider.crm.search_customer" },
      },
    },
  });
});

test("forwards tools/call when AgentPass allows", async () => {
  const calls: string[] = [];
  const logs: AuthorizationDecisionLog[] = [];
  let forwardedRequest: any;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "provider.crm.search_customer",
        arguments: { customer_id: "cus_123", job_id: "support_case_resolution" },
      },
    },
    config,
    { logger: (entry) => logs.push(entry) },
    async (url, init) => {
      calls.push(String(url));
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: {} });
      }
      forwardedRequest = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 3, result: { content: [] } });
    },
  );

  assert.deepEqual(calls, [
    "https://agentid.example.com/tenants/tenant-a/authorize",
    "https://mcp.example.com",
  ]);
  assert.deepEqual(logs, [
    {
      event: "agentid.mcp.authorization",
      agent_id: "enterprise-support-agent",
      tenant_id: "tenant-a",
      tool: "provider.crm.search_customer",
      action: "read",
      resource: "cus_123",
      job_id: "support_case_resolution",
      allowed: true,
      decision: "allow",
      findings: [],
    },
  ]);
  assert.equal(forwardedRequest.params.arguments._agentid_receipt, undefined);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 3, result: { content: [] } });
});

test("forwards provider receipt for high-risk tools", async () => {
  let forwardedRequest: any;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "provider.crm.update_customer",
        arguments: {
          customer_id: "cus_123",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          approved: true,
          jit_grant_id: "grant-1",
          approval_id: "approval-1",
        },
      },
    },
    {
      ...config,
      tools: {
        ...config.tools,
        "provider.crm.update_customer": {
          action: "write",
          data_from: "enterprise_crm",
          data_to: "provider_crm",
          resource_template: "provider/customer/{customer_id}",
          job_id_arg: "job_id",
          case_id_arg: "case_id",
          customer_id_arg: "customer_id",
          approved_arg: "approved",
          jit_grant_id_arg: "jit_grant_id",
          approval_id_arg: "approval_id",
          receipt_required: true,
          receipt_ttl_seconds: 300,
        },
      },
    },
    {
      intentId: "intent-case-1042",
      intentDigest: "digest-1042",
    },
    async (url, init) => {
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
      }
      forwardedRequest = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 5, result: { content: [] } });
    },
  );

  const receipt = forwardedRequest.params.arguments._agentid_receipt;
  assert.equal(receipt.decision_id, "dec-1");
  assert.equal(receipt.intent_id, "intent-case-1042");
  assert.equal(receipt.intent_digest, "digest-1042");
  assert.equal(receipt.tenant_id, "tenant-a");
  assert.equal(receipt.agent_id, "enterprise-support-agent");
  assert.equal(receipt.tool, "provider.crm.update_customer");
  assert.equal(receipt.action, "write");
  assert.equal(receipt.resource, "provider/customer/cus_123");
  assert.equal(receipt.job_id, "support_case_resolution");
  assert.equal(receipt.case_id, "case-1042");
  assert.equal(receipt.customer_id, "cus_123");
  assert.equal(receipt.approval_id, "approval-1");
  assert.equal(receipt.jit_grant_id, "grant-1");
  assert.equal(typeof receipt.issued_at, "string");
  assert.equal(typeof receipt.expires_at, "string");
  assert.deepEqual(response, { jsonrpc: "2.0", id: 5, result: { content: [] } });
});

test("binds enterprise auth context into provider receipts", async () => {
  let forwardedRequest: any;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "provider.crm.update_customer",
        arguments: {
          customer_id: "cus_123",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          approved: true,
          jit_grant_id: "grant-1",
          approval_id: "approval-1",
        },
      },
    },
    {
      ...config,
      tools: {
        ...config.tools,
        "provider.crm.update_customer": {
          action: "write",
          data_from: "enterprise_crm",
          data_to: "provider_crm",
          resource_template: "provider/customer/{customer_id}",
          job_id_arg: "job_id",
          case_id_arg: "case_id",
          customer_id_arg: "customer_id",
          approved_arg: "approved",
          jit_grant_id_arg: "jit_grant_id",
          approval_id_arg: "approval_id",
          receipt_required: true,
        },
      },
    },
    {
      enterpriseAuth: {
        issuer: "https://idp.example.com",
        subject: "user-17",
        clientId: "claude-enterprise",
        tokenAudience: "provider-crm-mcp",
        idJagGrantId: "id-jag-1",
        scopes: ["openid", "mcp:provider-crm", "crm.write"],
        groups: ["support", "support-admins"],
        acr: "urn:okta:loa:2fa",
        amr: ["pwd", "mfa"],
      },
    },
    async (url, init) => {
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
      }
      forwardedRequest = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 12, result: { content: [] } });
    },
  );

  const receipt = forwardedRequest.params.arguments._agentid_receipt;
  assert.equal(receipt.enterprise_issuer, "https://idp.example.com");
  assert.equal(receipt.enterprise_subject, "user-17");
  assert.equal(receipt.enterprise_client_id, "claude-enterprise");
  assert.equal(receipt.enterprise_token_audience, "provider-crm-mcp");
  assert.equal(receipt.enterprise_id_jag_grant_id, "id-jag-1");
  assert.deepEqual(receipt.enterprise_scopes, ["openid", "mcp:provider-crm", "crm.write"]);
  assert.deepEqual(receipt.enterprise_groups, ["support", "support-admins"]);
  assert.equal(receipt.enterprise_acr, "urn:okta:loa:2fa");
  assert.deepEqual(receipt.enterprise_amr, ["pwd", "mfa"]);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 12, result: { content: [] } });
});

test("validates enterprise JWT and maps claims into authorize payload and provider receipt", async () => {
  const { privateKey, jwks } = rsaKeyPair();
  const token = signJwt(
    {
      iss: "https://idp.example.com",
      aud: "provider-crm-mcp",
      sub: "user-17",
      azp: "claude-enterprise",
      tid: "tenant-a",
      agent_id: "enterprise-support-agent",
      scp: ["openid", "mcp:provider-crm", "crm.write"],
      groups: ["support", "support-admins"],
      id_jag: "id-jag-1",
      acr: "urn:okta:loa:2fa",
      amr: ["pwd", "mfa"],
      iat: 1_781_437_140,
      exp: 4_102_444_800,
    },
    privateKey,
  );
  let authorizePayload: any;
  let forwardedRequest: any;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "provider.crm.update_customer",
        arguments: {
          customer_id: "cus_123",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          approved: true,
          jit_grant_id: "grant-1",
          approval_id: "approval-1",
        },
      },
    },
    enterpriseJwtConfig(jwks),
    { bearerToken: token },
    async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).includes("/authorize")) {
        authorizePayload = body;
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
      }
      forwardedRequest = body;
      return jsonResponse({ jsonrpc: "2.0", id: 13, result: { content: [] } });
    },
  );

  assert.equal(authorizePayload.tenant_id, "tenant-a");
  assert.equal(authorizePayload.user_id, "user-17");
  assert.equal(authorizePayload.enterprise_auth.issuer, "https://idp.example.com");
  assert.equal(authorizePayload.enterprise_auth.clientId, "claude-enterprise");
  assert.deepEqual(authorizePayload.enterprise_auth.scopes, ["openid", "mcp:provider-crm", "crm.write"]);
  assert.deepEqual(authorizePayload.enterprise_auth.groups, ["support", "support-admins"]);
  assert.equal(authorizePayload.enterprise_auth.idJagGrantId, "id-jag-1");
  const receipt = forwardedRequest.params.arguments._agentid_receipt;
  assert.equal(receipt.enterprise_issuer, "https://idp.example.com");
  assert.equal(receipt.enterprise_subject, "user-17");
  assert.equal(receipt.enterprise_client_id, "claude-enterprise");
  assert.equal(receipt.enterprise_id_jag_grant_id, "id-jag-1");
  assert.deepEqual(response, { jsonrpc: "2.0", id: 13, result: { content: [] } });
});

test("denies tools/call before forwarding when enterprise JWT is expired", async () => {
  const { privateKey, jwks } = rsaKeyPair();
  const token = signJwt(
    {
      iss: "https://idp.example.com",
      aud: "provider-crm-mcp",
      sub: "user-17",
      azp: "claude-enterprise",
      tid: "tenant-a",
      agent_id: "enterprise-support-agent",
      scp: ["mcp:provider-crm", "crm.write"],
      groups: ["support-admins"],
      iat: 1_781_437_140,
      exp: 1,
    },
    privateKey,
  );
  let calls = 0;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "provider.crm.update_customer",
        arguments: { customer_id: "cus_123" },
      },
    },
    enterpriseJwtConfig(jwks),
    { bearerToken: token },
    async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: 14, result: { content: [] } });
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 14,
    error: {
      code: -32003,
      message: "AgentPass denied enterprise auth",
      data: {
        findings: ["enterprise JWT is expired"],
      },
    },
  });
});

test("caches enterprise JWT JWKS across repeated calls", async () => {
  const { privateKey, jwks } = rsaKeyPair("enterprise-cache-1");
  const token = enterpriseToken(privateKey, "enterprise-cache-1");
  const fetch = mockFetch([jwks]);

  await handleJsonRpc(jwtProtectedRequest(15), enterpriseJwtUriConfig(fetch.uri), {
    bearerToken: token,
  }, fetch);
  await handleJsonRpc(jwtProtectedRequest(16), enterpriseJwtUriConfig(fetch.uri), {
    bearerToken: token,
  }, fetch);

  assert.deepEqual(fetch.calls, [fetch.uri, "https://agentid.example.com/tenants/tenant-a/authorize", "https://mcp.example.com", "https://agentid.example.com/tenants/tenant-a/authorize", "https://mcp.example.com"]);
});

test("refreshes enterprise JWT JWKS when token kid is missing from cache", async () => {
  const { jwks: oldJwks } = rsaKeyPair("enterprise-rotation-old");
  const { privateKey, jwks: newJwks } = rsaKeyPair("enterprise-rotation-new");
  const token = enterpriseToken(privateKey, "enterprise-rotation-new");
  const fetch = mockFetch([oldJwks, newJwks]);

  const response = await handleJsonRpc(
    jwtProtectedRequest(17),
    enterpriseJwtUriConfig(fetch.uri),
    { bearerToken: token },
    fetch,
  );

  assert.deepEqual(fetch.calls, [fetch.uri, fetch.uri, "https://agentid.example.com/tenants/tenant-a/authorize", "https://mcp.example.com"]);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 17, result: { content: [] } });
});

test("uses stale enterprise JWT JWKS when refresh fails within stale window", async () => {
  const { privateKey, jwks } = rsaKeyPair("enterprise-stale-1");
  const token = enterpriseToken(privateKey, "enterprise-stale-1");
  const fetch = mockFetch([jwks, new Error("idp unavailable")]);
  const configWithShortTtl = {
    ...enterpriseJwtUriConfig(fetch.uri),
    enterprise_auth: {
      jwt: {
        ...enterpriseJwtUriConfig(fetch.uri).enterprise_auth?.jwt,
        jwks_cache_ttl_ms: 0,
        jwks_stale_if_error_ms: 300_000,
      },
    },
  } as AdapterConfig;

  await handleJsonRpc(jwtProtectedRequest(18), configWithShortTtl, { bearerToken: token }, fetch);
  const response = await handleJsonRpc(jwtProtectedRequest(19), configWithShortTtl, { bearerToken: token }, fetch);

  assert.deepEqual(fetch.calls, [fetch.uri, "https://agentid.example.com/tenants/tenant-a/authorize", "https://mcp.example.com", fetch.uri, "https://agentid.example.com/tenants/tenant-a/authorize", "https://mcp.example.com"]);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 19, result: { content: [] } });
});

test("forwards configured domain context in logs and provider receipts", async () => {
  let forwardedRequest: any;
  const logs: AuthorizationDecisionLog[] = [];
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "devops.deploy.production",
        arguments: {
          service_id: "checkout-api",
          environment: "production",
          job_id: "production_deploy",
          change_request_id: "CHG-1042",
          incident_id: "INC-2048",
          commit_sha: "abc123",
          approved: true,
          jit_grant_id: "grant-1",
          approval_id: "approval-1",
        },
      },
    },
    devopsConfig,
    { logger: (entry) => logs.push(entry) },
    async (url, init) => {
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
      }
      forwardedRequest = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 7, result: { content: [] } });
    },
  );

  assert.equal(logs[0].environment, "production");
  assert.equal(logs[0].change_request_id, "CHG-1042");
  const receipt = forwardedRequest.params.arguments._agentid_receipt;
  assert.equal(receipt.environment, "production");
  assert.equal(receipt.service_id, "checkout-api");
  assert.equal(receipt.change_request_id, "CHG-1042");
  assert.equal(receipt.incident_id, "INC-2048");
  assert.equal(receipt.commit_sha, "abc123");
  assert.deepEqual(response, { jsonrpc: "2.0", id: 7, result: { content: [] } });
});

test("signs provider receipt when hmac secret is configured", async () => {
  let forwardedRequest: any;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "provider.crm.update_customer",
        arguments: {
          customer_id: "cus_123",
          job_id: "support_case_resolution",
          case_id: "case-1042",
          approved: true,
          jit_grant_id: "grant-1",
          approval_id: "approval-1",
        },
      },
    },
    {
      ...config,
      provider_receipts: { tenant_id: "tenant-a", hmac_secret: "test-secret" },
      tools: {
        ...config.tools,
        "provider.crm.update_customer": {
          action: "write",
          resource_template: "provider/customer/{customer_id}",
          job_id_arg: "job_id",
          case_id_arg: "case_id",
          customer_id_arg: "customer_id",
          approved_arg: "approved",
          jit_grant_id_arg: "jit_grant_id",
          approval_id_arg: "approval_id",
          receipt_required: true,
        },
      },
    },
    {},
    async (url, init) => {
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
      }
      forwardedRequest = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 6, result: { content: [] } });
    },
  );

  const envelope = forwardedRequest.params.arguments._agentid_receipt;
  assert.equal(envelope.alg, "HS256");
  assert.equal(envelope.payload.tool, "provider.crm.update_customer");
  assert.equal(envelope.payload.resource, "provider/customer/cus_123");
  assert.equal(typeof envelope.signature, "string");
  assert.ok(envelope.signature.length > 20);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 6, result: { content: [] } });
});

test("uses local /authorize endpoint when tenant_id is omitted", async () => {
  const calls: string[] = [];
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "provider.crm.search_customer",
        arguments: { customer_id: "cus_123", job_id: "support_case_resolution" },
      },
    },
    { ...config, agentid: { base_url: "https://agentid.example.com" } },
    {},
    async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: {} });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 4, result: { content: [] } });
    },
  );

  assert.equal(calls[0], "https://agentid.example.com/authorize");
  assert.deepEqual(response, { jsonrpc: "2.0", id: 4, result: { content: [] } });
});

test("local guard mode forwards allowed tools/call without hosted authorize", async () => {
  const calls: string[] = [];
  const logs: AuthorizationDecisionLog[] = [];
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "provider.crm.search_customer",
        arguments: { customer_id: "cus_123", job_id: "support_case_resolution" },
      },
    },
    localGuardConfig(),
    { logger: (entry) => logs.push(entry) },
    async (url) => {
      calls.push(String(url));
      return jsonResponse({ jsonrpc: "2.0", id: 8, result: { content: [] } });
    },
  );

  assert.deepEqual(calls, ["https://mcp.example.com"]);
  assert.equal(logs[0].decision, "allow");
  assert.equal(logs[0].tool, "provider.crm.search_customer");
  assert.deepEqual(response, { jsonrpc: "2.0", id: 8, result: { content: [] } });
});

test("local guard mode denies duplicate side effects before forwarding", async () => {
  const localConfig = localGuardConfig();
  let downstreamCalls = 0;
  const request = {
    jsonrpc: "2.0" as const,
    id: 9,
    method: "tools/call",
    params: {
      name: "provider.billing.issue_credit",
      arguments: {
        customer_id: "cus_123",
        job_id: "support_case_resolution",
        amount_usd: 49,
        idempotency_key: "credit-case-1042-cus_123",
        approval_id: "approval-1",
      },
    },
  };

  const first = await handleJsonRpc(request, localConfig, {}, async () => {
    downstreamCalls += 1;
    return jsonResponse({ jsonrpc: "2.0", id: 9, result: { content: [] } });
  });
  const second = await handleJsonRpc(request, localConfig, {}, async () => {
    downstreamCalls += 1;
    return jsonResponse({ jsonrpc: "2.0", id: 9, result: { content: [] } });
  });

  assert.equal(downstreamCalls, 1);
  assert.deepEqual(first, { jsonrpc: "2.0", id: 9, result: { content: [] } });
  assert.equal((second as any).error.code, -32003);
  assert.deepEqual((second as any).error.data.findings, ["idempotencyKey was already used"]);
});

test("local guard mode uses job state to stop tool thrashing", async () => {
  const localConfig = localGuardConfig();
  let downstreamCalls = 0;
  const request = {
    jsonrpc: "2.0" as const,
    id: 10,
    method: "tools/call",
    params: {
      name: "provider.crm.search_customer",
      arguments: { customer_id: "cus_123", job_id: "looping_job" },
    },
  };
  const fetchImpl = async () => {
    downstreamCalls += 1;
    return jsonResponse({ jsonrpc: "2.0", id: 10, result: { content: [] } });
  };

  await handleJsonRpc(request, localConfig, {}, fetchImpl);
  await handleJsonRpc(request, localConfig, {}, fetchImpl);
  const third = await handleJsonRpc(request, localConfig, {}, fetchImpl);

  assert.equal(downstreamCalls, 2);
  assert.equal((third as any).error.code, -32003);
  assert.deepEqual((third as any).error.data.findings, ["job exceeds maxSameToolCallsPerJob 2"]);
});

test("local guard mode blocks PII egress before forwarding", async () => {
  const localConfig = localGuardConfig();
  let downstreamCalls = 0;
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "provider.email.send_external",
        arguments: {
          customer_id: "cus_123",
          job_id: "support_case_resolution",
          domain: "attacker.example",
          fields: ["customer_id", "ssn"],
          approval_id: "approval-1",
        },
      },
    },
    localConfig,
    {},
    async () => {
      downstreamCalls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: 11, result: { content: [] } });
    },
  );

  assert.equal(downstreamCalls, 0);
  assert.equal((response as any).error.code, -32003);
  assert.ok((response as any).error.data.findings.includes("externalDomain is not allowed: attacker.example"));
  assert.ok((response as any).error.data.findings.includes("field is blocked: ssn"));
});

const config: AdapterConfig = {
  agentid: { base_url: "https://agentid.example.com", tenant_id: "tenant-a" },
  downstream: { url: "https://mcp.example.com" },
  agent: { id: "enterprise-support-agent" },
  tools: {
    "provider.crm.search_customer": {
      action: "read",
      data_from: "provider_crm",
      data_to: "agent_context",
      resource_arg: "customer_id",
      job_id_arg: "job_id",
    },
  },
};

const devopsConfig: AdapterConfig = {
  agentid: { base_url: "https://agentid.example.com", tenant_id: "tenant-a" },
  downstream: { url: "https://mcp.example.com" },
  agent: { id: "platform-release-agent" },
  provider_receipts: { tenant_id: "tenant-a" },
  tools: {
    "devops.deploy.production": {
      action: "execute",
      data_from: "release_pipeline",
      data_to: "production_runtime",
      resource_template: "service/{service_id}/environment/{environment}",
      job_id_arg: "job_id",
      approved_arg: "approved",
      jit_grant_id_arg: "jit_grant_id",
      approval_id_arg: "approval_id",
      receipt_required: true,
      context_args: {
        service_id: "service_id",
        environment: "environment",
        change_request_id: "change_request_id",
        incident_id: "incident_id",
        commit_sha: "commit_sha",
      },
    },
  },
};

function enterpriseJwtConfig(jwks: JsonWebKeySet): AdapterConfig {
  return {
    ...config,
    enterprise_auth: {
      jwt: {
        issuer: "https://idp.example.com",
        audience: "provider-crm-mcp",
        jwks,
        required_scopes: ["mcp:provider-crm"],
        required_groups: ["support-admins"],
        claim_mapping: {
          tenant_id: "tid",
          user_id: "sub",
          agent_id: "agent_id",
          client_id: "azp",
          scopes: "scp",
          groups: "groups",
          id_jag_grant_id: "id_jag",
        },
      },
    },
    tools: {
      ...config.tools,
      "provider.crm.update_customer": {
        action: "write",
        data_from: "enterprise_crm",
        data_to: "provider_crm",
        resource_template: "provider/customer/{customer_id}",
        job_id_arg: "job_id",
        case_id_arg: "case_id",
        customer_id_arg: "customer_id",
        approved_arg: "approved",
        jit_grant_id_arg: "jit_grant_id",
        approval_id_arg: "approval_id",
        receipt_required: true,
      },
    },
  };
}

function enterpriseJwtUriConfig(jwksUri: string): AdapterConfig {
  const configured = enterpriseJwtConfig({ keys: [] });
  return {
    ...configured,
    enterprise_auth: {
      jwt: {
        ...configured.enterprise_auth?.jwt,
        jwks: undefined,
        jwks_uri: jwksUri,
      },
    },
  };
}

function jwtProtectedRequest(id: number) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "tools/call",
    params: {
      name: "provider.crm.update_customer",
      arguments: {
        customer_id: "cus_123",
        job_id: "support_case_resolution",
        case_id: "case-1042",
        approved: true,
        jit_grant_id: "grant-1",
        approval_id: "approval-1",
      },
    },
  };
}

function enterpriseToken(privateKey: string, kid: string): string {
  return signJwt(
    {
      iss: "https://idp.example.com",
      aud: "provider-crm-mcp",
      sub: "user-17",
      azp: "claude-enterprise",
      tid: "tenant-a",
      agent_id: "enterprise-support-agent",
      scp: ["openid", "mcp:provider-crm", "crm.write"],
      groups: ["support", "support-admins"],
      iat: 1_781_437_140,
      exp: 4_102_444_800,
    },
    privateKey,
    kid,
  );
}

function localGuardConfig(): AdapterConfig {
  return {
    agentid: { base_url: "https://agentid.example.com", tenant_id: "tenant-a" },
    downstream: { url: "https://mcp.example.com" },
    agent: { id: "enterprise-support-agent" },
    local_guard: {
      policy: {
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
            blockedFields: ["ssn", "access_token"],
          },
        },
        flows: [
          {
            from: "provider_crm",
            to: "agent_context",
            dataClassification: ["customer_data", "pii"],
            maxRecords: 10,
          },
          {
            from: "provider_crm",
            to: "external_email",
            destinationType: "external_email",
            dataClassification: ["customer_data", "pii"],
            requiresApproval: true,
            allowedDomains: ["customer.example"],
            blockedFields: ["ssn", "access_token"],
          },
        ],
        budgets: {
          maxSameToolCallsPerJob: 2,
        },
      },
    },
    tools: {
      "provider.crm.search_customer": {
        action: "read",
        data_from: "provider_crm",
        data_to: "agent_context",
        resource_arg: "customer_id",
        job_id_arg: "job_id",
        customer_id_arg: "customer_id",
        data_classification: ["customer_data", "pii"],
        field_set: ["customer_id", "case_id", "plan"],
        record_count_arg: "record_count",
      },
      "provider.billing.issue_credit": {
        action: "pay",
        data_from: "enterprise_billing_context",
        data_to: "provider_billing",
        resource_template: "provider/billing/customer/{customer_id}",
        job_id_arg: "job_id",
        customer_id_arg: "customer_id",
        approval_id_arg: "approval_id",
        amount_arg: "amount_usd",
        idempotency_key_arg: "idempotency_key",
      },
      "provider.email.send_external": {
        action: "send",
        data_from: "provider_crm",
        data_to: "external_email",
        resource_arg: "customer_id",
        job_id_arg: "job_id",
        customer_id_arg: "customer_id",
        approval_id_arg: "approval_id",
        destination_type: "external_email",
        external_domain_arg: "domain",
        data_classification: ["customer_data", "pii"],
        field_set_arg: "fields",
      },
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rsaKeyPair(kid = "enterprise-2026-07") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    jwks: { keys: [jwk] },
  };
}

function signJwt(claims: Record<string, unknown>, privateKeyPem: string, kid = "enterprise-2026-07"): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem)).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mockFetch(responses: Array<unknown>) {
  const queue = [...responses];
  const calls: string[] = [];
  const uri = `https://idp.example.com/jwks/${Math.random().toString(36).slice(2)}`;
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === uri) {
      const payload = queue.shift();
      if (payload === undefined) throw new Error("unexpected enterprise JWKS fetch");
      if (payload instanceof Error) throw payload;
      return jsonResponse(payload);
    }
    if (url.includes("/authorize")) {
      return jsonResponse({ allow: true, decision: "allow", findings: [], event: { decision_id: "dec-1" } });
    }
    return jsonResponse(JSON.parse(String(init?.body || "{}")).id
      ? { jsonrpc: "2.0", id: JSON.parse(String(init?.body)).id, result: { content: [] } }
      : { jsonrpc: "2.0", result: { content: [] } });
  }) as typeof globalThis.fetch & { calls: string[]; uri: string };
  fetch.calls = calls;
  fetch.uri = uri;
  return fetch;
}

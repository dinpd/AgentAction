import assert from "node:assert/strict";
import test from "node:test";

import { handleJsonRpc } from "../src/proxy.ts";
import type { AdapterConfig, AuthorizationDecisionLog } from "../src/types.ts";

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

test("denies tools/call when AgentID denies", async () => {
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
      message: "AgentID denied MCP tool call",
      data: {
        findings: ["blocked"],
        event: { tool: "provider.crm.search_customer" },
      },
    },
  });
});

test("forwards tools/call when AgentID allows", async () => {
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
    {},
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

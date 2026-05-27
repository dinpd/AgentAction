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
    async (url) => {
      calls.push(String(url));
      if (String(url).includes("/authorize")) {
        return jsonResponse({ allow: true, decision: "allow", findings: [], event: {} });
      }
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
  assert.deepEqual(response, { jsonrpc: "2.0", id: 3, result: { content: [] } });
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

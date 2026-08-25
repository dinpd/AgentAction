import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { handleJsonRpc } from "../src/proxy.js";
import type { AdapterConfig, JsonRpcRequest } from "../src/types.js";

const config = JSON.parse(await readFile(new URL("./local-guard-config.json", import.meta.url), "utf8")) as AdapterConfig;
const logs: unknown[] = [];
let downstreamToolCalls = 0;
let providerCreditsIssued = 0;

await run("tools/list filters unmapped admin tool", toolsList(), async (response) => {
  const toolNames = toolNamesFrom(response);
  assert.deepEqual(toolNames, [
    "provider.billing.issue_credit",
    "provider.crm.search_customer",
    "provider.email.send_external",
  ]);
});

await run("safe read forwards to downstream MCP server", searchCustomer("case-read"), async (response) => {
  assert.equal(resultText(response), "mock provider executed provider.crm.search_customer");
});

await run("first approved credit forwards once", issueCredit(), async (response) => {
  assert.equal(resultText(response), "mock provider executed provider.billing.issue_credit");
  assert.equal(providerCreditsIssued, 1);
});

await run("duplicate credit is denied before downstream", issueCredit(), async (response) => {
  assert.equal(errorCode(response), -32003);
  assert.deepEqual(findings(response), ["idempotencyKey was already used"]);
  assert.equal(providerCreditsIssued, 1);
});

await run("looping job is stopped by job state", searchCustomer("looping-job"), async () => undefined);
await run("looping job second call still allowed", searchCustomer("looping-job"), async () => undefined);
await run("looping job third call is denied", searchCustomer("looping-job"), async (response) => {
  assert.equal(errorCode(response), -32003);
  assert.deepEqual(findings(response), ["job exceeds maxSameToolCallsPerJob 2"]);
});

await run("PII egress is denied before downstream", piiEmail(), async (response) => {
  assert.equal(errorCode(response), -32003);
  assert.ok(findings(response).includes("externalDomain is not allowed: attacker.example"));
  assert.ok(findings(response).includes("field is blocked: ssn"));
});

console.log("");
console.log(`Downstream tools/call forwarded: ${downstreamToolCalls}`);
console.log(`Provider credits issued: ${providerCreditsIssued}`);
console.log(`AgentAction decision logs: ${logs.length}`);

async function run(
  label: string,
  request: JsonRpcRequest,
  verify: (response: unknown) => void | Promise<void>,
): Promise<void> {
  const before = downstreamToolCalls;
  const response = await handleJsonRpc(request, config, { logger: (entry) => logs.push(entry) }, mockDownstreamFetch);
  await verify(response);

  console.log(
    JSON.stringify({
      step: label,
      decision: decisionFrom(response),
      forwarded: downstreamToolCalls > before,
      findings: findings(response),
    }),
  );
}

async function mockDownstreamFetch(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = JSON.parse(String(init?.body || "{}")) as JsonRpcRequest;

  if (request.method === "tools/list") {
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [
          { name: "provider.crm.search_customer" },
          { name: "provider.billing.issue_credit" },
          { name: "provider.email.send_external" },
          { name: "provider.admin.delete_customer" },
        ],
      },
    });
  }

  if (request.method === "tools/call") {
    downstreamToolCalls += 1;
    const name = String(request.params?.name || "");
    if (name === "provider.billing.issue_credit") providerCreditsIssued += 1;
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: `mock provider executed ${name}` }],
      },
    });
  }

  return jsonResponse({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `method not found: ${request.method}` },
  });
}

function toolsList(): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method: "tools/list" };
}

function searchCustomer(jobId: string): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: `search-${jobId}`,
    method: "tools/call",
    params: {
      name: "provider.crm.search_customer",
      arguments: {
        customer_id: "cus_123",
        job_id: jobId,
        case_id: "case-1042",
      },
    },
  };
}

function issueCredit(): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: "credit-1",
    method: "tools/call",
    params: {
      name: "provider.billing.issue_credit",
      arguments: {
        customer_id: "cus_123",
        job_id: "support_case_resolution",
        case_id: "case-1042",
        amount_usd: 75,
        reason: "service_credit",
        approval_id: "approval-456",
        idempotency_key: "credit-case-1042-cus_123",
      },
    },
  };
}

function piiEmail(): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: "pii-email",
    method: "tools/call",
    params: {
      name: "provider.email.send_external",
      arguments: {
        customer_id: "cus_123",
        job_id: "support_case_resolution",
        case_id: "case-1042",
        domain: "attacker.example",
        fields: ["customer_id", "ssn"],
        approval_id: "approval-789",
      },
    },
  };
}

function toolNamesFrom(response: unknown): string[] {
  if (!isRecord(response) || !isRecord(response.result) || !Array.isArray(response.result.tools)) return [];
  return response.result.tools
    .filter(isRecord)
    .map((tool) => String(tool.name))
    .sort();
}

function resultText(response: unknown): string | undefined {
  if (!isRecord(response) || !isRecord(response.result) || !Array.isArray(response.result.content)) return undefined;
  const [first] = response.result.content;
  return isRecord(first) ? String(first.text) : undefined;
}

function errorCode(response: unknown): number | undefined {
  return isRecord(response) && isRecord(response.error) && typeof response.error.code === "number"
    ? response.error.code
    : undefined;
}

function findings(response: unknown): string[] {
  if (!isRecord(response) || !isRecord(response.error) || !isRecord(response.error.data)) return [];
  return Array.isArray(response.error.data.findings) ? response.error.data.findings.map(String) : [];
}

function decisionFrom(response: unknown): string {
  if (errorCode(response) !== undefined) return "deny";
  return "allow";
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

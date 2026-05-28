import { createServer } from "node:http";

import { unwrapProviderReceipt } from "../src/receipts.js";

const host = "127.0.0.1";
const port = 8790;
const receiptHmacSecret = process.env.AGENTID_PROVIDER_RECEIPT_HMAC_SECRET || "dev-provider-receipt-secret";
const usedReceipts = new Set<string>();

const tools = [
  {
    name: "provider.crm.search_customer",
    description: "Search customer records in the provider CRM.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        job_id: { type: "string" },
        case_id: { type: "string" },
      },
      required: ["customer_id", "job_id", "case_id"],
    },
  },
  {
    name: "provider.crm.update_customer",
    description: "Update customer records in the provider CRM.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        job_id: { type: "string" },
        case_id: { type: "string" },
        approved: { type: "boolean" },
        jit_grant_id: { type: "string" },
        approval_id: { type: "string" },
        patch: { type: "object" },
      },
      required: ["customer_id", "job_id", "case_id", "approved", "jit_grant_id", "approval_id"],
    },
  },
  {
    name: "provider.billing.issue_credit",
    description: "Issue a customer billing credit.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        job_id: { type: "string" },
        case_id: { type: "string" },
        amount_usd: { type: "number" },
        reason: { type: "string" },
        approved: { type: "boolean" },
        jit_grant_id: { type: "string" },
        approval_id: { type: "string" },
      },
      required: ["customer_id", "job_id", "case_id", "amount_usd", "approved", "jit_grant_id", "approval_id"],
    },
  },
  {
    name: "provider.admin.delete_customer",
    description: "Administrative delete operation intentionally not mapped in AgentID.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
];

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const body = JSON.parse(await readBody(request));
  const result = handleRequest(body);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(result));
});

server.listen(port, host, () => {
  console.log(`Mock provider MCP server listening on http://${host}:${port}/mcp`);
});

function handleRequest(request: { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> }) {
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    const args = isRecord(request.params?.arguments) ? request.params.arguments : {};
    const verification = verifyProviderAuthorization(String(name), args);
    if (!verification.ok) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32010,
          message: "Provider denied MCP tool call",
          data: { findings: verification.findings },
        },
      };
    }

    const businessFindings = providerBusinessFindings(String(name), args);
    if (businessFindings.length) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32011,
          message: "Provider business authorization denied MCP tool call",
          data: { findings: businessFindings },
        },
      };
    }

    if (verification.receiptId) usedReceipts.add(verification.receiptId);
    console.log(
      JSON.stringify({
        event: "agentid.provider.execution",
        provider_execution_id: `exec-${String(request.id ?? "notification")}`,
        agentid_decision_id: verification.receiptId,
        tenant_id: verification.tenantId,
        tool: String(name),
        resource: resourceForTool(String(name), args),
        result: "executed",
        provider_policy_version: "2026-05-28",
      }),
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [
          {
            type: "text",
            text: `mock provider executed ${String(name)}`,
          },
        ],
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `method not found: ${request.method}` },
  };
}

function verifyProviderAuthorization(tool: string, args: Record<string, unknown>) {
  if (!receiptRequired(tool)) return { ok: true, findings: [] as string[], receiptId: undefined, tenantId: undefined };

  const receiptEnvelope = isRecord(args._agentid_receipt) ? args._agentid_receipt : undefined;
  const unwrapped = unwrapProviderReceipt(receiptEnvelope, receiptHmacSecret);
  const receipt = unwrapped.receipt;
  if (!receipt) return { ok: false, findings: ["missing _agentid_receipt", ...unwrapped.findings] };

  const findings: string[] = [...unwrapped.findings];
  const receiptId = stringValue(receipt.decision_id);
  if (!receiptId) findings.push("receipt decision_id is required");
  if (receiptId && usedReceipts.has(receiptId)) findings.push("receipt was already used");
  if (stringValue(receipt.tenant_id) !== "tenant-a") findings.push("receipt tenant_id mismatch");
  if (stringValue(receipt.agent_id) !== "enterprise-support-agent") findings.push("receipt agent_id mismatch");
  if (stringValue(receipt.tool) !== tool) findings.push("receipt tool mismatch");
  if (stringValue(receipt.action) !== "write") findings.push("receipt action mismatch");
  if (stringValue(receipt.resource) !== resourceForTool(tool, args)) findings.push("receipt resource mismatch");
  if (stringValue(receipt.job_id) !== stringValue(args.job_id)) findings.push("receipt job_id mismatch");
  if (stringValue(receipt.case_id) !== stringValue(args.case_id)) findings.push("receipt case_id mismatch");
  if (stringValue(receipt.customer_id) !== stringValue(args.customer_id)) findings.push("receipt customer_id mismatch");
  if (!stringValue(receipt.approval_id)) findings.push("receipt approval_id is required");
  if (stringValue(receipt.approval_id) !== stringValue(args.approval_id)) findings.push("receipt approval_id mismatch");
  if (!stringValue(receipt.jit_grant_id)) findings.push("receipt jit_grant_id is required");
  if (stringValue(receipt.jit_grant_id) !== stringValue(args.jit_grant_id)) findings.push("receipt jit_grant_id mismatch");
  if (tool === "provider.billing.issue_credit" && stringValue(receipt.amount) !== stringValue(args.amount_usd)) {
    findings.push("receipt amount mismatch");
  }

  const expiresAt = Date.parse(stringValue(receipt.expires_at));
  if (!Number.isFinite(expiresAt)) findings.push("receipt expires_at is invalid");
  else if (expiresAt <= Date.now()) findings.push("receipt is expired");

  return {
    ok: findings.length === 0,
    findings,
    receiptId,
    tenantId: stringValue(receipt.tenant_id),
  };
}

function providerBusinessFindings(tool: string, args: Record<string, unknown>): string[] {
  if (tool !== "provider.billing.issue_credit") return [];
  const amount = Number(args.amount_usd);
  if (!Number.isFinite(amount)) return ["amount_usd is required"];
  if (amount > 100) return ["amount_usd exceeds provider limit of 100"];
  return [];
}

function receiptRequired(tool: string): boolean {
  return tool === "provider.crm.update_customer" || tool === "provider.billing.issue_credit";
}

function resourceForTool(tool: string, args: Record<string, unknown>): string {
  const customerId = stringValue(args.customer_id);
  if (tool === "provider.billing.issue_credit") return `provider/billing/customer/${customerId}`;
  return `provider/customer/${customerId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data || "{}"));
    request.on("error", reject);
  });
}

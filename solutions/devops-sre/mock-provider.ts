import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import { RemoteJwksCache, unwrapProviderReceiptWithJwks } from "../../mcp-gateway-adapter/src/receipts.js";

const host = process.env.DEVOPS_MOCK_PROVIDER_HOST || "127.0.0.1";
const port = Number(process.env.DEVOPS_MOCK_PROVIDER_PORT || "8790");
const receiptHmacSecret = process.env.AGENTID_PROVIDER_RECEIPT_HMAC_SECRET || "dev-provider-receipt-secret";
const receiptJwks = parseJwks(process.env.AGENTID_PROVIDER_RECEIPT_JWKS);
const receiptJwksUri = process.env.AGENTID_PROVIDER_RECEIPT_JWKS_URI;
const receiptIssuer = process.env.AGENTID_PROVIDER_RECEIPT_ISSUER;
const receiptAudience = process.env.AGENTID_PROVIDER_RECEIPT_AUDIENCE;
const receiptAllowedAlgorithms = process.env.AGENTID_PROVIDER_RECEIPT_ALLOWED_ALGS?.split(",")
  .map((alg) => alg.trim())
  .filter(Boolean);
const receiptJwksCache = new RemoteJwksCache();
const usedReceipts = new Set<string>();

const toolsList = JSON.parse(readFileSync(new URL("./tools-list.json", import.meta.url), "utf8")) as {
  result?: { tools?: unknown[] };
};
const tools = Array.isArray(toolsList.result?.tools) ? toolsList.result.tools : [];

const receiptPolicies: Record<string, { action: string; required: string[]; resource: (args: Record<string, unknown>) => string }> = {
  "devops.deploy.production": {
    action: "execute",
    required: ["environment", "service_id", "repo", "branch", "commit_sha", "change_request_id", "approval_id", "jit_grant_id"],
    resource: (args) => `service/${stringValue(args.service_id)}/environment/${stringValue(args.environment)}`,
  },
  "devops.rollback.production": {
    action: "execute",
    required: ["environment", "service_id", "incident_id", "deployment_id", "rollback_plan_id", "approval_id", "jit_grant_id"],
    resource: (args) => `service/${stringValue(args.service_id)}/environment/${stringValue(args.environment)}/rollback`,
  },
  "devops.terraform.apply": {
    action: "admin",
    required: ["repo", "workspace", "change_request_id", "approval_id", "jit_grant_id"],
    resource: (args) => `repo/${stringValue(args.repo)}/workspace/${stringValue(args.workspace)}/apply`,
  },
};

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  try {
    const body = JSON.parse(await readBody(request));
    const result = await handleRequest(body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: String((error as Error).message) }));
  }
});

server.listen(port, host, () => {
  console.log(`Mock DevOps MCP provider listening on http://${host}:${port}/mcp`);
});

async function handleRequest(request: { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> }) {
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }

  if (request.method === "tools/call") {
    const name = stringValue(request.params?.name);
    const args = isRecord(request.params?.arguments) ? request.params.arguments : {};
    const verification = await verifyProviderAuthorization(name, args);
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

    const businessFindings = providerBusinessFindings(name, args);
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
        provider_execution_id: `ops-exec-${String(request.id ?? "notification")}`,
        agentid_decision_id: verification.receiptId,
        tenant_id: verification.tenantId,
        tool: name,
        resource: resourceForTool(name, args),
        environment: stringValue(args.environment) || undefined,
        service_id: stringValue(args.service_id) || undefined,
        change_request_id: stringValue(args.change_request_id) || undefined,
        incident_id: stringValue(args.incident_id) || undefined,
        result: "executed",
        provider_policy_version: "2026-06-06",
      }),
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [
          {
            type: "text",
            text: `mock DevOps provider executed ${name}`,
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

async function verifyProviderAuthorization(tool: string, args: Record<string, unknown>) {
  const policy = receiptPolicies[tool];
  if (!policy) return { ok: true, findings: [] as string[], receiptId: undefined, tenantId: undefined };

  const receiptEnvelope = isRecord(args._agentid_receipt) ? args._agentid_receipt : undefined;
  const unwrapped = await unwrapProviderReceiptWithJwks(receiptEnvelope, {
    secret: receiptHmacSecret,
    jwks: receiptJwks,
    jwksUri: receiptJwksUri,
    jwksCache: receiptJwksCache,
    issuer: receiptIssuer,
    audience: receiptAudience,
    allowedAlgorithms: receiptAllowedAlgorithms,
  });
  const receipt = unwrapped.receipt;
  if (!receipt) return { ok: false, findings: ["missing _agentid_receipt", ...unwrapped.findings] };

  const findings: string[] = [...unwrapped.findings];
  const receiptId = stringValue(receipt.decision_id);
  if (!receiptId) findings.push("receipt decision_id is required");
  if (receiptId && usedReceipts.has(receiptId)) findings.push("receipt was already used");
  if (stringValue(receipt.tenant_id) !== "tenant-a") findings.push("receipt tenant_id mismatch");
  if (stringValue(receipt.agent_id) !== "platform-release-agent") findings.push("receipt agent_id mismatch");
  if (stringValue(receipt.tool) !== tool) findings.push("receipt tool mismatch");
  if (stringValue(receipt.action) !== policy.action) findings.push("receipt action mismatch");
  if (stringValue(receipt.resource) !== policy.resource(args)) findings.push("receipt resource mismatch");
  if (stringValue(receipt.job_id) !== stringValue(args.job_id)) findings.push("receipt job_id mismatch");

  for (const field of policy.required) {
    if (!stringValue(receipt[field])) findings.push(`receipt ${field} is required`);
    if (stringValue(receipt[field]) !== stringValue(args[field])) findings.push(`receipt ${field} mismatch`);
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
  if (tool === "devops.deploy.production" && stringValue(args.environment) !== "production") {
    return ["production deploy tool may only target production"];
  }
  if (tool === "devops.rollback.production" && !stringValue(args.incident_id)) {
    return ["rollback requires incident_id"];
  }
  if (tool === "devops.terraform.apply" && stringValue(args.workspace) === "production-destroy") {
    return ["workspace production-destroy is blocked by provider policy"];
  }
  return [];
}

function resourceForTool(tool: string, args: Record<string, unknown>): string {
  const policy = receiptPolicies[tool];
  if (policy) return policy.resource(args);
  if (tool === "devops.logs.read") return `service/${stringValue(args.service_id)}/environment/${stringValue(args.environment)}/logs`;
  if (tool === "devops.deployment.status") {
    return `service/${stringValue(args.service_id)}/environment/${stringValue(args.environment)}/deployment`;
  }
  if (tool === "devops.terraform.plan") return `repo/${stringValue(args.repo)}/workspace/${stringValue(args.workspace)}/plan`;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function parseJwks(value: string | undefined): { keys?: JsonWebKey[] } | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.keys)) {
    throw new Error("AGENTID_PROVIDER_RECEIPT_JWKS must be a JWKS JSON object");
  }
  return parsed as { keys?: JsonWebKey[] };
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

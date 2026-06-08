import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import { RemoteJwksCache, unwrapProviderReceiptWithJwks } from "../../mcp-gateway-adapter/src/receipts.js";

const host = process.env.DEVOPS_GITHUB_PROVIDER_HOST || "127.0.0.1";
const port = Number(process.env.DEVOPS_GITHUB_PROVIDER_PORT || "8790");
const githubApiUrl = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
const githubToken = process.env.GITHUB_TOKEN;
const executeGitHubActions = process.env.GITHUB_ACTIONS_EXECUTE === "true";
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
    required: [
      "environment",
      "service_id",
      "repo",
      "workflow_id",
      "branch",
      "commit_sha",
      "change_request_id",
      "approval_id",
      "jit_grant_id",
    ],
    resource: (args) => `service/${stringValue(args.service_id)}/environment/${stringValue(args.environment)}`,
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
  console.log(`GitHub Actions DevOps MCP provider listening on http://${host}:${port}/mcp`);
  console.log(`GitHub Actions execution is ${executeGitHubActions ? "enabled" : "dry-run only"}`);
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

    if (name !== "devops.deploy.production") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: `GitHub provider does not execute ${name}` }] },
      };
    }

    const dispatch = await dispatchWorkflow(args, verification.receiptId);
    if (!dispatch.ok) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32012,
          message: "GitHub Actions workflow dispatch failed",
          data: { findings: dispatch.findings },
        },
      };
    }

    if (verification.receiptId) usedReceipts.add(verification.receiptId);
    console.log(
      JSON.stringify({
        event: "agentid.provider.execution",
        provider_execution_id: `github-dispatch-${String(request.id ?? "notification")}`,
        agentid_decision_id: verification.receiptId,
        tenant_id: verification.tenantId,
        tool: name,
        resource: resourceForTool(name, args),
        repo: normalizeRepo(stringValue(args.repo)),
        workflow_id: stringValue(args.workflow_id),
        ref: stringValue(args.branch),
        environment: stringValue(args.environment),
        service_id: stringValue(args.service_id),
        change_request_id: stringValue(args.change_request_id),
        incident_id: stringValue(args.incident_id) || undefined,
        result: executeGitHubActions ? "dispatched" : "dry_run",
        provider_policy_version: "2026-06-08",
      }),
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [
          {
            type: "text",
            text: dispatch.message,
          },
        ],
        metadata: dispatch.metadata,
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
  if (tool !== "devops.deploy.production") return [];
  const findings: string[] = [];
  if (stringValue(args.environment) !== "production") findings.push("production deploy tool may only target production");
  if (!repoParts(stringValue(args.repo))) findings.push("repo must be owner/name or github.com/owner/name");
  if (!stringValue(args.workflow_id)) findings.push("workflow_id is required");
  if (!stringValue(args.branch)) findings.push("branch is required");
  if (!stringValue(args.commit_sha)) findings.push("commit_sha is required");
  if (!stringValue(args.change_request_id)) findings.push("change_request_id is required");
  return findings;
}

async function dispatchWorkflow(args: Record<string, unknown>, decisionId: string | undefined) {
  const repo = normalizeRepo(stringValue(args.repo));
  const parts = repoParts(repo);
  const workflowId = stringValue(args.workflow_id);
  const ref = stringValue(args.branch);
  const metadata = {
    repo,
    workflow_id: workflowId,
    ref,
    dry_run: !executeGitHubActions,
  };

  if (!executeGitHubActions) {
    return {
      ok: true,
      findings: [] as string[],
      message: `dry run: would dispatch ${workflowId} in ${repo} at ${ref}`,
      metadata,
    };
  }

  if (!githubToken) {
    return { ok: false, findings: ["GITHUB_TOKEN is required when GITHUB_ACTIONS_EXECUTE=true"], metadata };
  }
  if (!parts) {
    return { ok: false, findings: ["repo must be owner/name or github.com/owner/name"], metadata };
  }

  const [owner, name] = parts;
  const response = await fetch(`${githubApiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "content-type": "application/json",
      "user-agent": "agentid-devops-sre-provider",
      "x-github-api-version": "2026-03-10",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        environment: stringValue(args.environment),
        service_id: stringValue(args.service_id),
        commit_sha: stringValue(args.commit_sha),
        change_request_id: stringValue(args.change_request_id),
        incident_id: stringValue(args.incident_id),
        agentid_decision_id: decisionId || "",
      },
    }),
  });

  if (response.status !== 204 && response.status !== 200) {
    const detail = await response.text();
    return {
      ok: false,
      findings: [`GitHub workflow dispatch returned ${response.status}: ${detail}`],
      metadata,
    };
  }

  return {
    ok: true,
    findings: [] as string[],
    message: `dispatched ${workflowId} in ${repo} at ${ref}`,
    metadata: { ...metadata, status: response.status },
  };
}

function resourceForTool(tool: string, args: Record<string, unknown>): string {
  const policy = receiptPolicies[tool];
  if (policy) return policy.resource(args);
  return "";
}

function normalizeRepo(value: string): string {
  return value
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "");
}

function repoParts(value: string): [string, string] | undefined {
  const repo = normalizeRepo(value);
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return [parts[0], parts[1]];
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

import { AgentIdClient } from "./agentid.js";
import { authorizeWithLocalGuard } from "./local-guard.js";
import { mapToolCallToAuthorize } from "./mapper.js";
import { signProviderReceipt, signProviderReceiptJws } from "./receipts.js";
import type {
  AdapterConfig,
  AgentIdAuthorizeRequest,
  AgentIdAuthorizeResponse,
  AuthorizationDecisionLog,
  JsonRpcRequest,
  JsonRpcResponse,
  JwsProviderAuthorizationReceipt,
  ProviderAuthorizationReceipt,
  RequestContext,
  SignedProviderAuthorizationReceipt,
  ToolMapping,
} from "./types.js";

const DENIED = -32003;
const BAD_REQUEST = -32600;

export async function handleJsonRpc(
  body: unknown,
  config: AdapterConfig,
  context: RequestContext = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((request) => handleSingle(request, config, context, fetchImpl)));
  }
  return handleSingle(body, config, context, fetchImpl);
}

async function handleSingle(
  body: unknown,
  config: AdapterConfig,
  context: RequestContext,
  fetchImpl: typeof fetch,
): Promise<JsonRpcResponse> {
  const request = body as Partial<JsonRpcRequest>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(request.id, BAD_REQUEST, "Invalid JSON-RPC request");
  }

  if (request.method === "tools/list") {
    return filterToolsList(await forward(request as JsonRpcRequest, config, fetchImpl), config);
  }

  if (request.method !== "tools/call") {
    return forward(request as JsonRpcRequest, config, fetchImpl);
  }

  const params = request.params || {};
  const toolName = typeof params.name === "string" ? params.name : "";
  const args = isRecord(params.arguments) ? params.arguments : {};

  if (!toolName) {
    return errorResponse(request.id, BAD_REQUEST, "MCP tools/call is missing params.name");
  }

  let authorizePayload;
  try {
    authorizePayload = mapToolCallToAuthorize(config, toolName, args, context);
  } catch (error) {
    return errorResponse(request.id, DENIED, String((error as Error).message));
  }

  const decision = config.local_guard
    ? authorizeWithLocalGuard(config, toolName, args, context)
    : await new AgentIdClient(config.agentid, fetchImpl).authorize(authorizePayload);
  context.logger?.(authorizationLog(authorizePayload, decision));
  if (!decision.allow) {
    return errorResponse(request.id, DENIED, "AgentPass denied MCP tool call", compactObject({
      findings: decision.findings,
      event: decision.event,
      challenge: decision.challenge,
    }));
  }

  const mapped = config.tools[toolName];
  const downstreamRequest =
    mapped.receipt_required === true
      ? withProviderReceipt(request as JsonRpcRequest, authorizePayload, decision, mapped, args, config)
      : (request as JsonRpcRequest);
  return forward(downstreamRequest, config, fetchImpl);
}

function authorizationLog(
  payload: AgentIdAuthorizeRequest,
  decision: AgentIdAuthorizeResponse,
): AuthorizationDecisionLog {
  return compactLog({
    event: "agentid.mcp.authorization",
    agent_id: payload.agent_id,
    tenant_id: payload.tenant_id,
    user_id: payload.user_id,
    tool: payload.tool,
    action: payload.action,
    resource: payload.resource,
    job_id: payload.job_id,
    case_id: payload.case_id,
    customer_id: payload.customer_id,
    allowed: decision.allow,
    decision: decision.decision,
    findings: decision.findings,
    ...contextFromPayload(payload),
  });
}

function compactLog(entry: AuthorizationDecisionLog): AuthorizationDecisionLog {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as AuthorizationDecisionLog;
}

function compactObject<T extends Record<string, unknown>>(entry: T): T {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as T;
}

async function forward(request: JsonRpcRequest, config: AdapterConfig, fetchImpl: typeof fetch): Promise<JsonRpcResponse> {
  const response = await fetchImpl(config.downstream.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return (await response.json()) as JsonRpcResponse;
}

function withProviderReceipt(
  request: JsonRpcRequest,
  payload: AgentIdAuthorizeRequest,
  decision: AgentIdAuthorizeResponse,
  mapping: ToolMapping,
  args: Record<string, unknown>,
  config: AdapterConfig,
): JsonRpcRequest {
  const params = isRecord(request.params) ? request.params : {};
  const currentArgs = isRecord(params.arguments) ? params.arguments : {};
  return {
    ...request,
    params: {
      ...params,
      arguments: {
        ...currentArgs,
        _agentid_receipt: maybeSignReceipt(providerReceipt(request, payload, decision, mapping, args, config), config),
      },
    },
  };
}

function providerReceipt(
  request: JsonRpcRequest,
  payload: AgentIdAuthorizeRequest,
  decision: AgentIdAuthorizeResponse,
  mapping: ToolMapping,
  args: Record<string, unknown>,
  config: AdapterConfig,
): ProviderAuthorizationReceipt {
  const now = new Date();
  const ttlSeconds = mapping.receipt_ttl_seconds || 300;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  return compactReceipt({
    decision_id: decisionId(request, payload, decision),
    tenant_id: payload.tenant_id || config.provider_receipts?.tenant_id,
    agent_id: payload.agent_id,
    user_id: payload.user_id,
    tool: payload.tool,
    action: payload.action,
    resource: payload.resource,
    job_id: payload.job_id,
    case_id: payload.case_id,
    customer_id: payload.customer_id,
    approval_id: stringFromArg(args, mapping.approval_id_arg),
    jit_grant_id: payload.jit_grant_id,
    amount: stringFromArg(args, mapping.amount_arg),
    ...receiptContextFromArgs(args, mapping),
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
}

function decisionId(
  request: JsonRpcRequest,
  payload: AgentIdAuthorizeRequest,
  decision: AgentIdAuthorizeResponse,
): string {
  const event = decision.event;
  if (typeof event.decision_id === "string") return event.decision_id;
  if (typeof event.decisionId === "string") return event.decisionId;
  if (typeof payload.jit_grant_id === "string" && payload.jit_grant_id) return payload.jit_grant_id;
  return `${payload.agent_id}:${payload.tool}:${payload.resource || "resource"}:${String(request.id ?? "notification")}`;
}

function compactReceipt(receipt: ProviderAuthorizationReceipt): ProviderAuthorizationReceipt {
  return Object.fromEntries(Object.entries(receipt).filter(([, value]) => value !== undefined)) as ProviderAuthorizationReceipt;
}

function maybeSignReceipt(
  receipt: ProviderAuthorizationReceipt,
  config: AdapterConfig,
): ProviderAuthorizationReceipt | SignedProviderAuthorizationReceipt | JwsProviderAuthorizationReceipt {
  const jws = config.provider_receipts?.jws;
  const privateKey = jws?.private_key_pem || (jws?.private_key_env ? process.env[jws.private_key_env] : undefined);
  if (privateKey) {
    return signProviderReceiptJws(receipt, privateKey, {
      issuer: jws?.issuer,
      subject: jws?.subject || receipt.agent_id,
      audience: jws?.audience,
      keyId: jws?.key_id,
      algorithm: jws?.algorithm,
    });
  }
  const secret = config.provider_receipts?.hmac_secret;
  if (!secret) return receipt;
  return signProviderReceipt(receipt, secret);
}

function stringFromArg(args: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function receiptContextFromArgs(args: Record<string, unknown>, mapping: ToolMapping): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, argName] of Object.entries(mapping.context_args || {})) {
    const value = stringFromArg(args, argName);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function contextFromPayload(payload: AgentIdAuthorizeRequest): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!KNOWN_PAYLOAD_FIELDS.has(key) && value !== undefined) result[key] = value;
  }
  return result;
}

const KNOWN_PAYLOAD_FIELDS = new Set([
  "agent_id",
  "tenant_id",
  "user_id",
  "tool",
  "action",
  "data_from",
  "data_to",
  "resource",
  "job_id",
  "case_id",
  "customer_id",
  "approved",
  "jit_grant_id",
]);

function filterToolsList(response: JsonRpcResponse, config: AdapterConfig): JsonRpcResponse {
  if (config.filter_tools_list === false) return response;
  const result = response.result;
  if (!isRecord(result) || !Array.isArray(result.tools)) return response;

  const allowedTools = new Set(Object.keys(config.tools));
  return {
    ...response,
    result: {
      ...result,
      tools: result.tools.filter((tool) => isRecord(tool) && allowedTools.has(String(tool.name))),
    },
  };
}

function errorResponse(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

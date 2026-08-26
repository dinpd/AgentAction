import { AgentIdClient } from "./agentid.js";
import { resolveEnterpriseAuthContext } from "./enterprise-auth.js";
import { authorizeWithLocalGuard } from "./local-guard.js";
import { mapToolCallToAuthorize } from "./mapper.js";
import { signProviderReceipt, signProviderReceiptJws } from "./receipts.js";
import type {
  AdapterConfig,
  AgentIdAuthorizeRequest,
  AgentIdAuthorizeResponse,
  AuthorizationDecisionLog,
  GatewayDecisionLog,
  JsonRpcRequest,
  JsonRpcResponse,
  ObservationDecisionLog,
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
    const response = await forward(request as JsonRpcRequest, config, fetchImpl);
    return config.mode === "observe" ? response : filterToolsList(response, config);
  }

  if (request.method !== "tools/call") {
    return forward(request as JsonRpcRequest, config, fetchImpl);
  }

  const params = request.params || {};
  const toolName = typeof params.name === "string" ? params.name : "";
  const args = isRecord(params.arguments) ? params.arguments : {};

  if (config.mode === "observe") {
    return observeToolCall(request as JsonRpcRequest, toolName, args, config, context, fetchImpl);
  }

  if (!toolName) {
    return errorResponse(request.id, BAD_REQUEST, "MCP tools/call is missing params.name");
  }

  const enterpriseAuth = await resolveEnterpriseAuth(config, context, fetchImpl);
  if (!enterpriseAuth.ok) {
    return errorResponse(request.id, DENIED, "AgentAction denied enterprise auth", {
      findings: enterpriseAuth.findings,
    });
  }

  let authorizePayload;
  try {
    authorizePayload = mapToolCallToAuthorize(config, toolName, args, enterpriseAuth.context);
  } catch (error) {
    return errorResponse(request.id, DENIED, String((error as Error).message));
  }

  const decision = config.local_guard
    ? authorizeWithLocalGuard(config, toolName, args, enterpriseAuth.context)
    : await new AgentIdClient(config.agentid, fetchImpl).authorize(authorizePayload);
  enterpriseAuth.context.logger?.(authorizationLog(authorizePayload, decision));
  if (!decision.allow) {
    return errorResponse(request.id, DENIED, "AgentAction denied MCP tool call", compactObject({
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

async function observeToolCall(
  request: JsonRpcRequest,
  toolName: string,
  args: Record<string, unknown>,
  config: AdapterConfig,
  context: RequestContext,
  fetchImpl: typeof fetch,
): Promise<JsonRpcResponse> {
  let evaluation: Omit<ObservationDecisionLog, "downstream_outcome"> = {
    event: "agentaction.mcp.observation",
    mode: "observe",
    gateway_outcome: "forwarded",
    evaluation_status: "skipped",
    agent_id: context.agentId || config.agent.id,
    intent_id: context.intentId,
    intent_digest: context.intentDigest,
    tenant_id: context.tenantId || config.agentid.tenant_id,
    user_id: context.userId,
    tool: toolName,
    findings: toolName ? [] : ["MCP tools/call is missing params.name"],
  };

  if (toolName) {
    const enterpriseAuth = await resolveEnterpriseAuth(config, context, fetchImpl);
    if (!enterpriseAuth.ok) {
      evaluation = {
        ...evaluation,
        findings: enterpriseAuth.findings,
      };
    } else {
      try {
        const payload = mapToolCallToAuthorize(config, toolName, args, enterpriseAuth.context);
        if (!config.local_guard) {
          evaluation = {
            ...observationLogContext(payload),
            event: "agentaction.mcp.observation",
            mode: "observe",
            gateway_outcome: "forwarded",
            evaluation_status: "error",
            findings: ["observe mode requires local_guard.policy"],
          };
        } else {
          const decision = authorizeWithLocalGuard(config, toolName, args, enterpriseAuth.context);
          evaluation = {
            ...observationLogContext(payload),
            event: "agentaction.mcp.observation",
            mode: "observe",
            gateway_outcome: "forwarded",
            evaluation_status: "evaluated",
            counterfactual_allow: decision.allow,
            counterfactual_decision: decision.decision,
            findings: decision.findings,
          };
        }
      } catch {
        evaluation = {
          ...evaluation,
          evaluation_status: config.tools[toolName] ? "error" : "skipped",
          findings: [
            config.tools[toolName]
              ? "local policy evaluation failed"
              : `No AgentAction mapping configured for MCP tool: ${toolName}`,
          ],
        };
      }
    }
  }

  try {
    const response = await forward(request, config, fetchImpl);
    logObservation(context.logger, {
      ...evaluation,
      downstream_outcome: response.error ? "error" : "success",
    });
    return response;
  } catch (error) {
    logObservation(context.logger, {
      ...evaluation,
      downstream_outcome: "transport_error",
    });
    throw error;
  }
}

function observationLogContext(payload: AgentIdAuthorizeRequest): Pick<
  ObservationDecisionLog,
  | "agent_id"
  | "intent_id"
  | "intent_digest"
  | "tenant_id"
  | "user_id"
  | "tool"
  | "action"
  | "resource"
  | "job_id"
  | "case_id"
  | "customer_id"
  | "enterprise_auth"
> {
  return compactLog({
    agent_id: payload.agent_id,
    intent_id: payload.intent_id,
    intent_digest: payload.intent_digest,
    tenant_id: payload.tenant_id,
    user_id: payload.user_id,
    tool: payload.tool,
    action: payload.action,
    resource: payload.resource,
    job_id: payload.job_id,
    case_id: payload.case_id,
    customer_id: payload.customer_id,
    ...contextFromPayload(payload),
  });
}

function logObservation(logger: RequestContext["logger"], entry: ObservationDecisionLog): void {
  try {
    logger?.(entry);
  } catch {
    // Observation must remain passive even when a caller-provided log sink fails.
  }
}

async function resolveEnterpriseAuth(
  config: AdapterConfig,
  context: RequestContext,
  fetchImpl: typeof fetch,
): Promise<
  | {
      ok: true;
      context: RequestContext;
    }
  | {
      ok: false;
      findings: string[];
    }
> {
  try {
    return await resolveEnterpriseAuthContext(config, context, fetchImpl);
  } catch (error) {
    return { ok: false, findings: [String((error as Error).message || error)] };
  }
}

function authorizationLog(
  payload: AgentIdAuthorizeRequest,
  decision: AgentIdAuthorizeResponse,
): AuthorizationDecisionLog {
  return compactLog({
    event: "agentid.mcp.authorization",
    agent_id: payload.agent_id,
    intent_id: payload.intent_id,
    intent_digest: payload.intent_digest,
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

function compactLog<T extends GatewayDecisionLog | Partial<GatewayDecisionLog>>(entry: T): T {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as T;
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
    intent_id: payload.intent_id,
    intent_digest: payload.intent_digest,
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
    ...enterpriseReceiptContext(payload),
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

function enterpriseReceiptContext(payload: AgentIdAuthorizeRequest): Partial<ProviderAuthorizationReceipt> {
  const auth = payload.enterprise_auth;
  if (!auth) return {};
  return {
    enterprise_issuer: auth.issuer,
    enterprise_subject: auth.subject,
    enterprise_client_id: auth.clientId,
    enterprise_token_audience: auth.tokenAudience,
    enterprise_id_jag_grant_id: auth.idJagGrantId,
    enterprise_scopes: auth.scopes,
    enterprise_groups: auth.groups,
    enterprise_acr: auth.acr,
    enterprise_amr: auth.amr,
  };
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
  "intent_id",
  "intent_digest",
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

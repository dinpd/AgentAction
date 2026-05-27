import { AgentIdClient } from "./agentid.js";
import { mapToolCallToAuthorize } from "./mapper.js";
import type {
  AdapterConfig,
  AgentIdAuthorizeRequest,
  AgentIdAuthorizeResponse,
  AuthorizationDecisionLog,
  JsonRpcRequest,
  JsonRpcResponse,
  RequestContext,
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

  const agentid = new AgentIdClient(config.agentid, fetchImpl);
  const decision = await agentid.authorize(authorizePayload);
  context.logger?.(authorizationLog(authorizePayload, decision));
  if (!decision.allow) {
    return errorResponse(request.id, DENIED, "AgentID denied MCP tool call", {
      findings: decision.findings,
      event: decision.event,
    });
  }

  return forward(request as JsonRpcRequest, config, fetchImpl);
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
  });
}

function compactLog(entry: AuthorizationDecisionLog): AuthorizationDecisionLog {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as AuthorizationDecisionLog;
}

async function forward(request: JsonRpcRequest, config: AdapterConfig, fetchImpl: typeof fetch): Promise<JsonRpcResponse> {
  const response = await fetchImpl(config.downstream.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return (await response.json()) as JsonRpcResponse;
}

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

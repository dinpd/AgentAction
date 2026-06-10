import type { AdapterConfig, AgentIdAuthorizeRequest, RequestContext, ToolMapping } from "./types.js";

export function mapToolCallToAuthorize(
  config: AdapterConfig,
  toolName: string,
  args: Record<string, unknown>,
  context: RequestContext = {},
): AgentIdAuthorizeRequest {
  const mapping = config.tools[toolName];
  if (!mapping) {
    throw new Error(`No AgentPass mapping configured for MCP tool: ${toolName}`);
  }

  return compactPayload({
    agent_id: context.agentId || config.agent.id,
    tenant_id: context.tenantId || config.agentid.tenant_id,
    user_id: valueFromArg(args, mapping.user_id_arg) || context.userId,
    tool: toolName,
    action: mapping.action,
    data_from: mapping.data_from,
    data_to: mapping.data_to,
    resource: resourceFromMapping(mapping, args),
    job_id: valueFromArg(args, mapping.job_id_arg),
    case_id: valueFromArg(args, mapping.case_id_arg),
    customer_id: valueFromArg(args, mapping.customer_id_arg),
    approved: booleanFromArg(args, mapping.approved_arg),
    jit_grant_id: valueFromArg(args, mapping.jit_grant_id_arg),
    ...contextFromArgs(args, mapping),
  });
}

function resourceFromMapping(mapping: ToolMapping, args: Record<string, unknown>): string | undefined {
  if (mapping.resource) return mapping.resource;
  if (mapping.resource_arg) return valueFromArg(args, mapping.resource_arg);
  if (!mapping.resource_template) return undefined;

  return mapping.resource_template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    return valueFromArg(args, key) || "";
  });
}

function valueFromArg(args: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function booleanFromArg(args: Record<string, unknown>, key: string | undefined): boolean | undefined {
  if (!key) return undefined;
  return args[key] === true;
}

function contextFromArgs(args: Record<string, unknown>, mapping: ToolMapping): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, argName] of Object.entries(mapping.context_args || {})) {
    const value = valueFromArg(args, argName);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function compactPayload(payload: AgentIdAuthorizeRequest): AgentIdAuthorizeRequest {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as AgentIdAuthorizeRequest;
}

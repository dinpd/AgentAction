import { createGuard, type AgentPassGuard, type GuardCheck } from "@dinpd/ai-agent-guard";

import { mapToolCallToAuthorize } from "./mapper.js";
import type { AdapterConfig, AgentIdAuthorizeResponse, RequestContext, ToolMapping } from "./types.js";

const guardsByConfig = new WeakMap<AdapterConfig, AgentPassGuard>();

export function authorizeWithLocalGuard(
  config: AdapterConfig,
  toolName: string,
  args: Record<string, unknown>,
  context: RequestContext = {},
): AgentIdAuthorizeResponse {
  const guard = localGuardFor(config);
  const check = mapToolCallToGuardCheck(config, toolName, args, context);
  const decision = guard.check(check);
  return {
    allow: decision.allow,
    decision: decision.type,
    findings: decision.reasons,
    event: {
      decision_id: decision.event.decisionId,
      ...decision.event,
    },
    challenge: decision.challenge,
  };
}

export function mapToolCallToGuardCheck(
  config: AdapterConfig,
  toolName: string,
  args: Record<string, unknown>,
  context: RequestContext = {},
): GuardCheck {
  const mapping = config.tools[toolName];
  if (!mapping) {
    throw new Error(`No AgentPass mapping configured for MCP tool: ${toolName}`);
  }

  const payload = mapToolCallToAuthorize(config, toolName, args, context);
  return compactCheck({
    agentId: payload.agent_id,
    tenantId: payload.tenant_id,
    userId: payload.user_id,
    tool: payload.tool,
    action: payload.action,
    resource: payload.resource,
    jobId: payload.job_id,
    caseId: payload.case_id,
    customerId: payload.customer_id,
    amountUsd: numberFromArg(args, mapping.amount_arg),
    idempotencyKey: stringFromArg(args, mapping.idempotency_key_arg),
    approvalId: approvalIdFrom(mapping, args),
    dataFrom: payload.data_from,
    dataTo: payload.data_to,
    destinationType: mapping.destination_type,
    externalDomain: stringFromArg(args, mapping.external_domain_arg),
    dataClassification: mapping.data_classification,
    fieldSet: stringListFrom(mapping, args),
    recordCount: numberFromArg(args, mapping.record_count_arg),
    estimatedTokens: numberFromArg(args, mapping.estimated_tokens_arg),
    estimatedCostUsd: numberFromArg(args, mapping.estimated_cost_usd_arg),
    enterpriseAuth: payload.enterprise_auth,
  });
}

function localGuardFor(config: AdapterConfig): AgentPassGuard {
  if (!config.local_guard) {
    throw new Error("Adapter config does not include local_guard.policy");
  }
  const existing = guardsByConfig.get(config);
  if (existing) return existing;

  const guard = createGuard({ policy: config.local_guard.policy });
  guardsByConfig.set(config, guard);
  return guard;
}

function approvalIdFrom(mapping: ToolMapping, args: Record<string, unknown>): string | undefined {
  return stringFromArg(args, mapping.approval_id_arg) || stringFromArg(args, mapping.jit_grant_id_arg);
}

function stringFromArg(args: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function numberFromArg(args: Record<string, unknown>, key: string | undefined): number | undefined {
  const value = stringFromArg(args, key);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringListFrom(mapping: ToolMapping, args: Record<string, unknown>): string[] | undefined {
  if (mapping.field_set) return mapping.field_set;
  const key = mapping.field_set_arg;
  if (!key) return undefined;

  const value = args[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }
  return undefined;
}

function compactCheck(check: GuardCheck): GuardCheck {
  return Object.fromEntries(Object.entries(check).filter(([, value]) => value !== undefined)) as GuardCheck;
}

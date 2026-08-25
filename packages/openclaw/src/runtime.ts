import { createGuard, type GuardCheck } from "@dinpd/ai-agent-guard";

import { loadLocalPolicy, normalizeAgentActionOpenClawConfig } from "./config.js";
import type { AgentActionOpenClawConfig, AgentActionOpenClawDecision, AgentActionOpenClawRuntime } from "./types.js";

export type CreateAgentActionOpenClawRuntimeOptions = {
  config?: AgentActionOpenClawConfig | Record<string, unknown>;
  fetch?: typeof fetch;
  logger?: {
    debug?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
};

export function createAgentActionOpenClawRuntime(
  options: CreateAgentActionOpenClawRuntimeOptions = {},
): AgentActionOpenClawRuntime {
  const config = normalizeRuntimeConfig(options.config);
  const fetchImpl = options.fetch || globalThis.fetch;
  const guard = config.mode === "local" ? createGuard({ policy: loadLocalPolicy(config) }) : undefined;

  return {
    async authorize(check: GuardCheck): Promise<AgentActionOpenClawDecision> {
      if (!config.enabled) return allowDecision(check);

      try {
        if (config.mode === "local") {
          return guard!.check(check);
        }
        return await authorizeRemote(check, config, fetchImpl);
      } catch (error) {
        options.logger?.warn?.("AgentAction OpenClaw authorization failed", error);
        if (config.failClosed) {
          return denyDecision(check, error instanceof Error ? error.message : String(error));
        }
        return allowDecision(check, ["AgentAction unavailable; failClosed=false"]);
      }
    },
    recordApprovalResolution(input) {
      options.logger?.debug?.("AgentAction OpenClaw approval resolved", {
        resolution: input.resolution,
        tool: input.check.tool,
        action: input.check.action,
        decision: decisionType(input.decision),
      });
    },
    recordAllowedDecision(input) {
      options.logger?.debug?.("AgentAction OpenClaw allowed", {
        tool: input.check.tool,
        action: input.check.action,
        decision: decisionType(input.decision),
      });
    },
  };
}

function normalizeRuntimeConfig(
  config: AgentActionOpenClawConfig | Record<string, unknown> | undefined,
): AgentActionOpenClawConfig {
  if (!config) return normalizeAgentActionOpenClawConfig();
  if ("challengeTimeoutMs" in config && "failClosed" in config && "mode" in config && "enabled" in config) {
    return config as AgentActionOpenClawConfig;
  }
  return normalizeAgentActionOpenClawConfig(config as Record<string, unknown>);
}

async function authorizeRemote(
  check: GuardCheck,
  config: AgentActionOpenClawConfig,
  fetchImpl: typeof fetch | undefined,
): Promise<AgentActionOpenClawDecision> {
  if (!config.authorizeUrl) throw new Error("AgentAction authorizeUrl is required in remote mode");
  if (!fetchImpl) throw new Error("fetch is not available for AgentAction remote mode");

  const response = await fetchImpl(config.authorizeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(toRemoteAuthorizePayload(check)),
  });
  if (!response.ok && response.status !== 403) {
    throw new Error(`AgentAction authorization failed with HTTP ${response.status}`);
  }
  return normalizeRemoteDecision((await response.json()) as AgentActionOpenClawDecision & { findings?: string[] });
}

export function decisionType(decision: AgentActionOpenClawDecision): "allow" | "deny" | "challenge_required" {
  return decision.type || decision.decision || (decision.allow === false ? "deny" : "allow");
}

export function isAllowedDecision(decision: AgentActionOpenClawDecision): boolean {
  return decision.allow !== false && decisionType(decision) === "allow";
}

export function isChallengeDecision(decision: AgentActionOpenClawDecision): boolean {
  return decision.challengeRequired === true || decisionType(decision) === "challenge_required";
}

export function decisionReasons(decision: AgentActionOpenClawDecision): string[] {
  return decision.reasons?.filter(Boolean) || [];
}

function toRemoteAuthorizePayload(check: GuardCheck): GuardCheck & Record<string, unknown> {
  return {
    ...check,
    agent_id: check.agentId,
    tenant_id: check.tenantId,
    job_id: check.jobId,
    case_id: check.caseId,
    customer_id: check.customerId,
    user_id: check.userId,
    approval_id: check.approvalId,
    data_from: check.dataFrom,
    data_to: check.dataTo,
    destination_type: check.destinationType,
    external_domain: check.externalDomain,
    data_classification: check.dataClassification,
    field_set: check.fieldSet,
    record_count: check.recordCount,
    estimated_tokens: check.estimatedTokens,
    estimated_cost_usd: check.estimatedCostUsd,
  };
}

function normalizeRemoteDecision(
  decision: AgentActionOpenClawDecision & { findings?: string[] },
): AgentActionOpenClawDecision {
  if (decision.reasons || !decision.findings) return decision;
  return {
    ...decision,
    reasons: decision.findings.filter(Boolean),
  };
}

function allowDecision(check: GuardCheck, reasons: string[] = []): AgentActionOpenClawDecision {
  return {
    type: "allow",
    allow: true,
    challengeRequired: false,
    reasons,
    event: {
      decisionId: "agentpass-openclaw-local-allow",
      decision: "allow",
      allowed: true,
      reasons,
      agentId: check.agentId,
      tool: check.tool,
      action: check.action,
      dataClassification: check.dataClassification || [],
      fieldSet: check.fieldSet || [],
      issuedAt: new Date().toISOString(),
      approvalEvidence: {
        schema_version: "agentpass.approval-evidence.v1",
        agent_id: check.agentId,
        tool: check.tool,
        action: check.action,
        field_set: check.fieldSet || [],
        policy_findings: check.policyFindings || [],
      },
    },
  };
}

function denyDecision(check: GuardCheck, reason: string): AgentActionOpenClawDecision {
  return {
    type: "deny",
    allow: false,
    challengeRequired: false,
    reasons: [reason],
    event: {
      decisionId: "agentpass-openclaw-local-deny",
      decision: "deny",
      allowed: false,
      reasons: [reason],
      agentId: check.agentId,
      tool: check.tool,
      action: check.action,
      dataClassification: check.dataClassification || [],
      fieldSet: check.fieldSet || [],
      issuedAt: new Date().toISOString(),
      approvalEvidence: {
        schema_version: "agentpass.approval-evidence.v1",
        agent_id: check.agentId,
        tool: check.tool,
        action: check.action,
        field_set: check.fieldSet || [],
        policy_findings: check.policyFindings || [],
      },
    },
  };
}

// Backward-compatible export retained for existing AgentPass integrations.
export type CreateAgentPassOpenClawRuntimeOptions = CreateAgentActionOpenClawRuntimeOptions;
export const createAgentPassOpenClawRuntime = createAgentActionOpenClawRuntime;

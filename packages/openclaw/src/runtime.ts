import { createGuard, type GuardCheck } from "@dinpd/ai-agent-guard";

import { loadLocalPolicy, normalizeAgentPassOpenClawConfig } from "./config.js";
import type { AgentPassOpenClawConfig, AgentPassOpenClawDecision, AgentPassOpenClawRuntime } from "./types.js";

export type CreateAgentPassOpenClawRuntimeOptions = {
  config?: AgentPassOpenClawConfig | Record<string, unknown>;
  fetch?: typeof fetch;
  logger?: {
    debug?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
};

export function createAgentPassOpenClawRuntime(
  options: CreateAgentPassOpenClawRuntimeOptions = {},
): AgentPassOpenClawRuntime {
  const config = normalizeRuntimeConfig(options.config);
  const fetchImpl = options.fetch || globalThis.fetch;
  const guard = config.mode === "local" ? createGuard({ policy: loadLocalPolicy(config) }) : undefined;

  return {
    async authorize(check: GuardCheck): Promise<AgentPassOpenClawDecision> {
      if (!config.enabled) return allowDecision(check);

      try {
        if (config.mode === "local") {
          return guard!.check(check);
        }
        return await authorizeRemote(check, config, fetchImpl);
      } catch (error) {
        options.logger?.warn?.("AgentPass OpenClaw authorization failed", error);
        if (config.failClosed) {
          return denyDecision(check, error instanceof Error ? error.message : String(error));
        }
        return allowDecision(check, ["AgentPass unavailable; failClosed=false"]);
      }
    },
    recordApprovalResolution(input) {
      options.logger?.debug?.("AgentPass OpenClaw approval resolved", {
        resolution: input.resolution,
        tool: input.check.tool,
        action: input.check.action,
        decision: decisionType(input.decision),
      });
    },
    recordAllowedDecision(input) {
      options.logger?.debug?.("AgentPass OpenClaw allowed", {
        tool: input.check.tool,
        action: input.check.action,
        decision: decisionType(input.decision),
      });
    },
  };
}

function normalizeRuntimeConfig(
  config: AgentPassOpenClawConfig | Record<string, unknown> | undefined,
): AgentPassOpenClawConfig {
  if (!config) return normalizeAgentPassOpenClawConfig();
  if ("challengeTimeoutMs" in config && "failClosed" in config && "mode" in config && "enabled" in config) {
    return config as AgentPassOpenClawConfig;
  }
  return normalizeAgentPassOpenClawConfig(config as Record<string, unknown>);
}

async function authorizeRemote(
  check: GuardCheck,
  config: AgentPassOpenClawConfig,
  fetchImpl: typeof fetch | undefined,
): Promise<AgentPassOpenClawDecision> {
  if (!config.authorizeUrl) throw new Error("AgentPass authorizeUrl is required in remote mode");
  if (!fetchImpl) throw new Error("fetch is not available for AgentPass remote mode");

  const response = await fetchImpl(config.authorizeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(check),
  });
  if (!response.ok) {
    throw new Error(`AgentPass authorization failed with HTTP ${response.status}`);
  }
  return (await response.json()) as AgentPassOpenClawDecision;
}

export function decisionType(decision: AgentPassOpenClawDecision): "allow" | "deny" | "challenge_required" {
  return decision.type || decision.decision || (decision.allow === false ? "deny" : "allow");
}

export function isAllowedDecision(decision: AgentPassOpenClawDecision): boolean {
  return decision.allow !== false && decisionType(decision) === "allow";
}

export function isChallengeDecision(decision: AgentPassOpenClawDecision): boolean {
  return decision.challengeRequired === true || decisionType(decision) === "challenge_required";
}

export function decisionReasons(decision: AgentPassOpenClawDecision): string[] {
  return decision.reasons?.filter(Boolean) || [];
}

function allowDecision(check: GuardCheck, reasons: string[] = []): AgentPassOpenClawDecision {
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

function denyDecision(check: GuardCheck, reason: string): AgentPassOpenClawDecision {
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


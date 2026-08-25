import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentActionOpenClawConfig } from "./types.js";

const DEFAULT_CHALLENGE_TIMEOUT_MS = 120_000;

export function normalizeAgentActionOpenClawConfig(raw: Record<string, unknown> = {}): AgentActionOpenClawConfig {
  const mode = raw.mode === "remote" ? "remote" : "local";
  const policy = isRecord(raw.policy) ? raw.policy : undefined;
  const policyPath = typeof raw.policyPath === "string" && raw.policyPath.trim() ? raw.policyPath.trim() : undefined;

  return {
    enabled: raw.enabled !== false,
    mode,
    policy: policy as AgentActionOpenClawConfig["policy"],
    policyPath,
    authorizeUrl:
      typeof raw.authorizeUrl === "string" && raw.authorizeUrl.trim() ? raw.authorizeUrl.trim() : undefined,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : undefined,
    failClosed: raw.failClosed !== false,
    challengeTimeoutMs: readPositiveInteger(raw.challengeTimeoutMs, DEFAULT_CHALLENGE_TIMEOUT_MS),
    defaultAction: typeof raw.defaultAction === "string" && raw.defaultAction.trim() ? raw.defaultAction : "read",
  };
}

export function loadLocalPolicy(config: AgentActionOpenClawConfig): NonNullable<AgentActionOpenClawConfig["policy"]> {
  if (config.policy) return config.policy;
  if (!config.policyPath) return defaultOpenClawPolicy();

  const path = config.policyPath.startsWith("~")
    ? config.policyPath.replace(/^~/, process.env.HOME || "")
    : config.policyPath;
  const body = readFileSync(resolve(path), "utf8");
  const parsed = JSON.parse(body) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("AgentAction OpenClaw policy must be a JSON object");
  }
  return parsed as NonNullable<AgentActionOpenClawConfig["policy"]>;
}

export function defaultOpenClawPolicy(): NonNullable<AgentActionOpenClawConfig["policy"]> {
  return {
    tools: {
      read: { action: "read" },
      web_fetch: { action: "read" },
      web_search: { action: "read" },
      browser: { action: "write", requiresApproval: true },
      write: {
        action: "write",
        requiresApproval: true,
        blockedFields: ["api_key", "access_token", "password", "private_key", "secret"],
      },
      edit: {
        action: "write",
        requiresApproval: true,
        blockedFields: ["api_key", "access_token", "password", "private_key", "secret"],
      },
      apply_patch: {
        action: "write",
        requiresApproval: true,
        blockedFields: ["api_key", "access_token", "password", "private_key", "secret"],
      },
      exec: {
        action: "admin",
        requiresApproval: true,
        blockedFields: ["api_key", "access_token", "password", "private_key", "secret"],
      },
      process: {
        action: "admin",
        requiresApproval: true,
        blockedFields: ["api_key", "access_token", "password", "private_key", "secret"],
      },
      cron: { action: "write", requiresApproval: true, requireIdempotencyKey: true },
      message: {
        action: "send",
        requiresApprovalIfPii: true,
        blockedFields: ["ssn", "access_token", "payment_method", "full_date_of_birth", "private_key", "secret"],
      },
      sessions_send: { action: "send", requiresApproval: true },
      sessions_spawn: { action: "admin", requiresApproval: true },
    },
    budgets: {
      challengeAfterTokensPerJob: 16_000,
      challengeAfterRuntimeMsPerJob: 120_000,
      maxTokensPerJob: 32_000,
      maxRuntimeMsPerJob: 300_000,
      maxToolCallsPerJob: 30,
      maxSameToolCallsPerJob: 8,
      maxIdenticalToolCallsPerJob: 2,
    },
    defaultSensitiveDestinationDecision: "deny",
  };
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// Backward-compatible export retained for existing AgentPass integrations.
export const normalizeAgentPassOpenClawConfig = normalizeAgentActionOpenClawConfig;

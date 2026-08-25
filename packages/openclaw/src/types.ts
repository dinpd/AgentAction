import type { AgentAction, GuardCheck, GuardDecision, GuardPolicy } from "@dinpd/ai-agent-guard";

export type PluginApprovalResolution =
  | "allow-once"
  | "allow-always"
  | "deny"
  | "timeout"
  | "cancelled";

export type OpenClawBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  requireApproval?: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    timeoutBehavior?: "allow" | "deny";
    allowedDecisions?: Array<"allow-once" | "allow-always" | "deny">;
    pluginId?: string;
    onResolution?: (decision: PluginApprovalResolution) => Promise<void> | void;
  };
};

export type OpenClawBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  toolKind?: string;
  toolInputKind?: string;
  runId?: string;
  toolCallId?: string;
  derivedPaths?: readonly string[];
};

export type OpenClawToolContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  toolName: string;
  toolKind?: string;
  toolInputKind?: string;
  toolCallId?: string;
  channelId?: string;
  getSessionExtension?: (namespace: string) => unknown;
};

export type OpenClawTrustedToolPolicy = {
  id: string;
  description: string;
  evaluate: (
    event: OpenClawBeforeToolCallEvent,
    ctx: OpenClawToolContext,
  ) => OpenClawBeforeToolCallResult | void | Promise<OpenClawBeforeToolCallResult | void>;
};

export type OpenClawPluginApi = {
  id?: string;
  name?: string;
  config?: unknown;
  pluginConfig?: Record<string, unknown>;
  logger?: {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  registerTrustedToolPolicy: (policy: OpenClawTrustedToolPolicy) => void;
};

export type AgentActionOpenClawConfig = {
  enabled: boolean;
  mode: "local" | "remote";
  policy?: GuardPolicy;
  policyPath?: string;
  authorizeUrl?: string;
  apiKey?: string;
  failClosed: boolean;
  challengeTimeoutMs: number;
  defaultAction: AgentAction;
};

export type AgentActionOpenClawDecision =
  | GuardDecision
  | {
      type?: "allow" | "deny" | "challenge_required";
      decision?: "allow" | "deny" | "challenge_required";
      allow?: boolean;
      challengeRequired?: boolean;
      reasons?: string[];
      event?: { decisionId?: string };
      challenge?: GuardDecision["challenge"];
    };

export type AgentActionOpenClawRuntime = {
  authorize(check: GuardCheck): Promise<AgentActionOpenClawDecision>;
  recordApprovalResolution(input: {
    resolution: PluginApprovalResolution;
    check: GuardCheck;
    decision: AgentActionOpenClawDecision;
    event: OpenClawBeforeToolCallEvent;
    ctx: OpenClawToolContext;
  }): Promise<void> | void;
  recordAllowedDecision(input: {
    check: GuardCheck;
    decision: AgentActionOpenClawDecision;
    event: OpenClawBeforeToolCallEvent;
    ctx: OpenClawToolContext;
  }): Promise<void> | void;
};

// Backward-compatible types retained for existing AgentPass integrations.
export type AgentPassOpenClawConfig = AgentActionOpenClawConfig;
export type AgentPassOpenClawDecision = AgentActionOpenClawDecision;
export type AgentPassOpenClawRuntime = AgentActionOpenClawRuntime;

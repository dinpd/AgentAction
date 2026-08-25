import { normalizeAgentActionOpenClawConfig } from "./config.js";
import {
  approvalDescription,
  approvalSeverity,
  approvalTitle,
  mapOpenClawToolCallToAgentAction,
  summarizeAgentActionDecision,
} from "./mapper.js";
import {
  createAgentActionOpenClawRuntime,
  decisionReasons,
  isAllowedDecision,
  isChallengeDecision,
} from "./runtime.js";
import type { OpenClawPluginApi } from "./types.js";

export * from "./config.js";
export * from "./mapper.js";
export * from "./runtime.js";
export * from "./types.js";

export function registerAgentActionOpenClawPlugin(api: OpenClawPluginApi): void {
  const config = normalizeAgentActionOpenClawConfig(api.pluginConfig || {});
  const runtime = createAgentActionOpenClawRuntime({
    config,
    logger: api.logger,
  });

  api.registerTrustedToolPolicy({
    id: "agentpass",
    description: "AgentAction runtime authorization for OpenClaw tool calls",
    async evaluate(event, ctx) {
      if (!config.enabled) return undefined;

      const check = mapOpenClawToolCallToAgentAction(event, ctx, config);
      const decision = await runtime.authorize(check);

      if (isChallengeDecision(decision)) {
        return {
          requireApproval: {
            title: approvalTitle(check),
            description: approvalDescription(check, { reasons: decisionReasons(decision) }),
            severity: approvalSeverity(check),
            timeoutMs: config.challengeTimeoutMs,
            timeoutBehavior: "deny",
            allowedDecisions: ["allow-once", "deny"],
            async onResolution(resolution) {
              await runtime.recordApprovalResolution({ resolution, check, decision, event, ctx });
            },
          },
        };
      }

      if (!isAllowedDecision(decision)) {
        return {
          block: true,
          blockReason: summarizeAgentActionDecision(decision),
        };
      }

      await runtime.recordAllowedDecision({ check, decision, event, ctx });
      return undefined;
    },
  });
}

// Backward-compatible export retained for existing AgentPass integrations.
export const registerAgentPassOpenClawPlugin = registerAgentActionOpenClawPlugin;

export default {
  id: "agentpass",
  name: "AgentAction",
  description: "Runtime authorization for OpenClaw tool calls.",
  register: registerAgentActionOpenClawPlugin,
};

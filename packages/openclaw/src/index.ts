import { normalizeAgentPassOpenClawConfig } from "./config.js";
import {
  approvalDescription,
  approvalSeverity,
  approvalTitle,
  mapOpenClawToolCallToAgentPass,
  summarizeAgentPassDecision,
} from "./mapper.js";
import {
  createAgentPassOpenClawRuntime,
  decisionReasons,
  isAllowedDecision,
  isChallengeDecision,
} from "./runtime.js";
import type { OpenClawPluginApi } from "./types.js";

export * from "./config.js";
export * from "./mapper.js";
export * from "./runtime.js";
export * from "./types.js";

export function registerAgentPassOpenClawPlugin(api: OpenClawPluginApi): void {
  const config = normalizeAgentPassOpenClawConfig(api.pluginConfig || {});
  const runtime = createAgentPassOpenClawRuntime({
    config,
    logger: api.logger,
  });

  api.registerTrustedToolPolicy({
    id: "agentpass",
    description: "AgentPass runtime authorization for OpenClaw tool calls",
    async evaluate(event, ctx) {
      if (!config.enabled) return undefined;

      const check = mapOpenClawToolCallToAgentPass(event, ctx, config);
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
          blockReason: summarizeAgentPassDecision(decision),
        };
      }

      await runtime.recordAllowedDecision({ check, decision, event, ctx });
      return undefined;
    },
  });
}

export default {
  id: "agentpass",
  name: "AgentPass",
  description: "Runtime authorization for OpenClaw tool calls.",
  register: registerAgentPassOpenClawPlugin,
};


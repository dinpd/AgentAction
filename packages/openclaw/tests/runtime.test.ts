import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentPassOpenClawRuntime,
  decisionType,
  isAllowedDecision,
  isChallengeDecision,
} from "../src/index.ts";

test("local runtime allows declared read tools", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      policy: {
        tools: {
          read: { action: "read" },
        },
      },
    },
  });

  const decision = await runtime.authorize({
    agentId: "main",
    tool: "read",
    action: "read",
  });

  assert.equal(decisionType(decision), "allow");
  assert.equal(isAllowedDecision(decision), true);
});

test("local runtime returns challenge for approval-required tools", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      policy: {
        tools: {
          write: { action: "write", requiresApproval: true },
        },
      },
    },
  });

  const decision = await runtime.authorize({
    agentId: "main",
    tool: "write",
    action: "write",
    resource: "README.md",
  });

  assert.equal(decisionType(decision), "challenge_required");
  assert.equal(isChallengeDecision(decision), true);
});

test("runtime fails closed on remote authorization errors by default", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      mode: "remote",
      authorizeUrl: "https://agentpass.invalid/authorize",
    },
    fetch: async () => {
      throw new Error("network unavailable");
    },
  });

  const decision = await runtime.authorize({
    agentId: "main",
    tool: "write",
    action: "write",
  });

  assert.equal(decisionType(decision), "deny");
  assert.equal(isAllowedDecision(decision), false);
  assert.ok(decision.reasons?.includes("network unavailable"));
});

test("runtime can fail open when explicitly configured", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      mode: "remote",
      authorizeUrl: "https://agentpass.invalid/authorize",
      failClosed: false,
    },
    fetch: async () => {
      throw new Error("network unavailable");
    },
  });

  const decision = await runtime.authorize({
    agentId: "main",
    tool: "write",
    action: "write",
  });

  assert.equal(decisionType(decision), "allow");
  assert.equal(isAllowedDecision(decision), true);
});


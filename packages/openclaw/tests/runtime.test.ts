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

test("local runtime returns challenge for token budget crossings", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      policy: {
        tools: {
          read: { action: "read" },
        },
        budgets: {
          challengeAfterTokensPerJob: 100,
          maxTokensPerJob: 200,
        },
      },
    },
  });

  const first = await runtime.authorize({
    agentId: "main",
    jobId: "job-token-challenge",
    tool: "read",
    action: "read",
    estimatedTokens: 60,
  });
  const second = await runtime.authorize({
    agentId: "main",
    jobId: "job-token-challenge",
    tool: "read",
    action: "read",
    estimatedTokens: 50,
  });

  assert.equal(decisionType(first), "allow");
  assert.equal(decisionType(second), "challenge_required");
  assert.equal(isChallengeDecision(second), true);
});

test("local runtime denies hard token budget crossings", async () => {
  const runtime = createAgentPassOpenClawRuntime({
    config: {
      policy: {
        tools: {
          read: { action: "read" },
        },
        budgets: {
          maxTokensPerJob: 100,
        },
      },
    },
  });

  const first = await runtime.authorize({
    agentId: "main",
    jobId: "job-token-deny",
    tool: "read",
    action: "read",
    estimatedTokens: 60,
  });
  const second = await runtime.authorize({
    agentId: "main",
    jobId: "job-token-deny",
    tool: "read",
    action: "read",
    estimatedTokens: 50,
  });

  assert.equal(decisionType(first), "allow");
  assert.equal(decisionType(second), "deny");
  assert.equal(isAllowedDecision(second), false);
  assert.ok(second.reasons?.includes("job exceeds maxTokensPerJob 100"));
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

import assert from "node:assert/strict";
import test from "node:test";

import { registerAgentPassOpenClawPlugin, type OpenClawTrustedToolPolicy } from "../src/index.ts";

test("registers an AgentPass trusted tool policy", () => {
  const policies: OpenClawTrustedToolPolicy[] = [];

  registerAgentPassOpenClawPlugin({
    pluginConfig: {
      policy: {
        tools: {
          read: { action: "read" },
        },
      },
    },
    registerTrustedToolPolicy(policy) {
      policies.push(policy);
    },
  });

  assert.equal(policies.length, 1);
  assert.equal(policies[0]?.id, "agentpass");
});

test("trusted policy returns undefined for allowed calls", async () => {
  const policy = registeredPolicy({
    policy: {
      tools: {
        read: { action: "read" },
      },
    },
  });

  const result = await policy.evaluate(
    { toolName: "read", params: { path: "README.md" } },
    { toolName: "read", agentId: "main" },
  );

  assert.equal(result, undefined);
});

test("trusted policy returns plugin approval for challenged calls", async () => {
  const policy = registeredPolicy({
    policy: {
      tools: {
        write: { action: "write", requiresApproval: true },
      },
    },
  });

  const result = await policy.evaluate(
    { toolName: "write", params: { path: "README.md", content: "new" } },
    { toolName: "write", agentId: "main" },
  );

  assert.equal(result?.block, undefined);
  assert.equal(result?.requireApproval?.title, "Approve Write with write");
  assert.equal(result?.requireApproval?.timeoutBehavior, "deny");
  assert.deepEqual(result?.requireApproval?.allowedDecisions, ["allow-once", "deny"]);
});

test("trusted policy blocks denied calls", async () => {
  const policy = registeredPolicy({
    policy: {
      tools: {
        write: { action: "read" },
      },
    },
  });

  const result = await policy.evaluate(
    { toolName: "write", params: { path: "README.md", content: "new" } },
    { toolName: "write", agentId: "main" },
  );

  assert.equal(result?.block, true);
  assert.match(result?.blockReason || "", /tool action mismatch/);
});

test("trusted policy routes token budget challenges through OpenClaw approval", async () => {
  const policy = registeredPolicy({
    policy: {
      tools: {
        read: { action: "read" },
      },
      budgets: {
        challengeAfterTokensPerJob: 100,
        maxTokensPerJob: 1000,
      },
    },
  });

  const allowed = await policy.evaluate(
    { toolName: "read", runId: "run-token-challenge", params: { path: "README.md" } },
    { toolName: "read", agentId: "main" },
  );
  const challenged = await policy.evaluate(
    { toolName: "read", runId: "run-token-challenge", params: { content: "status ".repeat(200) } },
    { toolName: "read", agentId: "main" },
  );

  assert.equal(allowed, undefined);
  assert.equal(challenged?.block, undefined);
  assert.equal(challenged?.requireApproval?.title, "Approve Read with read");
  assert.match(challenged?.requireApproval?.description || "", /Reason: approval is required/);
});

test("trusted policy blocks hard token budget violations", async () => {
  const policy = registeredPolicy({
    policy: {
      tools: {
        read: { action: "read" },
      },
      budgets: {
        maxTokensPerJob: 1,
      },
    },
  });

  const result = await policy.evaluate(
    { toolName: "read", runId: "run-token-deny", params: { path: "README.md" } },
    { toolName: "read", agentId: "main" },
  );

  assert.equal(result?.block, true);
  assert.match(result?.blockReason || "", /job exceeds maxTokensPerJob 1/);
});

function registeredPolicy(pluginConfig: Record<string, unknown>): OpenClawTrustedToolPolicy {
  let captured: OpenClawTrustedToolPolicy | undefined;
  registerAgentPassOpenClawPlugin({
    pluginConfig,
    registerTrustedToolPolicy(policy) {
      captured = policy;
    },
  });
  assert.ok(captured);
  return captured;
}

import assert from "node:assert/strict";
import test from "node:test";

import { estimateOpenClawToolCallTokens, inferAction, mapOpenClawToolCallToAgentPass } from "../src/index.ts";

test("maps OpenClaw exec calls to AgentPass admin checks", () => {
  const check = mapOpenClawToolCallToAgentPass(
    {
      toolName: "exec",
      toolCallId: "call-1",
      params: { command: "npm run deploy" },
    },
    {
      agentId: "main",
      sessionKey: "telegram:user-1",
      toolName: "exec",
    },
  );

  assert.equal(check.agentId, "main");
  assert.equal(check.jobId, "telegram:user-1");
  assert.equal(check.tool, "exec");
  assert.equal(check.action, "admin");
  assert.equal(check.resource, "npm run deploy");
  assert.equal(typeof check.callFingerprint, "string");
  assert.equal(typeof check.idempotencyKey, "string");
  assert.equal(typeof check.estimatedTokens, "number");
  assert.ok(check.estimatedTokens > 0);
});

test("maps derived paths and secret fields for filesystem writes", () => {
  const check = mapOpenClawToolCallToAgentPass(
    {
      toolName: "apply_patch",
      params: { input: "*** Begin Patch\n*** Add File: .env\n+API_KEY=x\n*** End Patch" },
      derivedPaths: [".env"],
    },
    {
      agentId: "main",
      sessionId: "session-1",
      toolName: "apply_patch",
      channelId: "telegram",
    },
  );

  assert.equal(check.action, "write");
  assert.equal(check.resource, ".env");
  assert.equal(check.dataFrom, "local_files");
  assert.ok(check.policyFindings?.includes("openclaw.channelId=telegram"));
});

test("detects likely PII in message sends", () => {
  const check = mapOpenClawToolCallToAgentPass(
    {
      toolName: "message",
      params: {
        to: "customer@example.com",
        body: "Customer SSN is 123-45-6789",
      },
    },
    {
      agentId: "support",
      toolName: "message",
    },
  );

  assert.equal(check.action, "send");
  assert.equal(check.destinationType, "external_message");
  assert.ok(check.dataClassification?.includes("pii"));
});

test("estimates larger token budgets for larger OpenClaw payloads", () => {
  const small = estimateOpenClawToolCallTokens({
    toolName: "read",
    params: { path: "README.md" },
  });
  const large = estimateOpenClawToolCallTokens({
    toolName: "read",
    params: { path: "heartbeat.txt", content: "status ".repeat(2000) },
  });

  assert.ok(small > 0);
  assert.ok(large > small);
});

test("infers common OpenClaw tool actions", () => {
  assert.equal(inferAction("read", {}, "read"), "read");
  assert.equal(inferAction("write", {}, "read"), "write");
  assert.equal(inferAction("cron", {}, "read"), "write");
  assert.equal(inferAction("sessions_spawn", {}, "read"), "admin");
  assert.equal(inferAction("slack.send", {}, "read"), "send");
});

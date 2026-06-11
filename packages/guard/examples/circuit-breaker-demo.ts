import { createToolGate, type GuardCheck, type GuardPolicy } from "../src/index.ts";

const repeatedCallGate = createToolGate({
  policy: {
    tools: {
      "web.search": {
        action: "read",
      },
    },
    budgets: {
      maxIdenticalToolCallsPerJob: 2,
    },
  },
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds("repeat"),
});

const spendGate = createToolGate({
  policy: spendPolicy(),
  now: () => new Date("2026-06-11T12:00:00Z"),
  idGenerator: demoIds("spend"),
});

await runSearch(repeatedCallGate, "1. Search executes", {
  agentId: "research-agent",
  jobId: "repeat-loop",
  tool: "web.search",
  action: "read",
  resource: "query:best refund workflow",
  callFingerprint: "web.search:best-refund-workflow",
});

await runSearch(repeatedCallGate, "2. Same search executes once more", {
  agentId: "research-agent",
  jobId: "repeat-loop",
  tool: "web.search",
  action: "read",
  resource: "query:best refund workflow",
  callFingerprint: "web.search:best-refund-workflow",
});

await runSearch(repeatedCallGate, "3. Third identical search is denied", {
  agentId: "research-agent",
  jobId: "repeat-loop",
  tool: "web.search",
  action: "read",
  resource: "query:best refund workflow",
  callFingerprint: "web.search:best-refund-workflow",
});

await runSearch(spendGate, "4. First expensive search executes", {
  agentId: "research-agent",
  jobId: "spend-loop",
  tool: "web.search",
  action: "read",
  resource: "query:agent framework survey",
  estimatedTokens: 500,
  estimatedCostUsd: 0.04,
});

await runSearch(spendGate, "5. Soft token threshold requires approval", {
  agentId: "research-agent",
  jobId: "spend-loop",
  tool: "web.search",
  action: "read",
  resource: "query:agent framework survey details",
  estimatedTokens: 400,
  estimatedCostUsd: 0.03,
});

await runSearch(spendGate, "6. Approved search executes", {
  agentId: "research-agent",
  jobId: "spend-loop",
  tool: "web.search",
  action: "read",
  resource: "query:agent framework survey details",
  estimatedTokens: 400,
  estimatedCostUsd: 0.03,
  approvalId: "approval-budget-1",
});

await runSearch(spendGate, "7. Hard token and cost caps deny execution", {
  agentId: "research-agent",
  jobId: "spend-loop",
  tool: "web.search",
  action: "read",
  resource: "query:agent framework survey more",
  estimatedTokens: 400,
  estimatedCostUsd: 0.04,
  approvalId: "approval-budget-1",
});

async function runSearch(
  gate: ReturnType<typeof createToolGate>,
  label: string,
  check: GuardCheck,
): Promise<void> {
  const execution = await gate.run(check, async () => ({
    results: [`result for ${check.resource || check.tool}`],
  }));

  console.log(
    JSON.stringify(
      {
        label,
        executed: execution.executed,
        decision: execution.decision.type,
        reasons: execution.decision.reasons,
        challenge: execution.decision.challenge,
        result: execution.executed ? execution.result : undefined,
      },
      null,
      2,
    ),
  );
}

function spendPolicy(): GuardPolicy {
  return {
    tools: {
      "web.search": {
        action: "read",
      },
    },
    budgets: {
      challengeAfterTokensPerJob: 800,
      challengeAfterEstimatedCostUsdPerJob: 0.08,
      maxTokensPerJob: 1200,
      maxEstimatedCostUsdPerJob: 0.1,
      maxSameToolCallsPerJob: 10,
    },
  };
}

function demoIds(prefix: string): () => string {
  let next = 1;
  return () => `${prefix}-demo-dec-${next++}`;
}

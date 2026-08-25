#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const adapterPath = resolve(root, "packages/openclaw/dist/index.js");

let adapter;
try {
  adapter = await import(adapterPath);
} catch (error) {
  console.error("Could not load packages/openclaw/dist/index.js.");
  console.error("Run `cd packages/openclaw && npm run build` before this use-case test.");
  throw error;
}

const {
  createAgentActionOpenClawRuntime,
  decisionReasons,
  decisionType,
  mapOpenClawToolCallToAgentAction,
} = adapter;

function createRuntime(budgets) {
  return createAgentActionOpenClawRuntime({
    config: {
      mode: "local",
      policy: {
        tools: {
          read: { action: "read" },
        },
        budgets,
      },
    },
  });
}

const loopRuntime = createRuntime({
  challengeAfterToolCallsPerJob: 2,
  maxToolCallsPerJob: 3,
  maxTokensPerJob: 200,
});

const hardBudgetRuntime = createRuntime({
  maxTokensPerJob: 120,
});

async function loadFixture(name) {
  const body = await readFile(resolve(here, "fixtures", name), "utf8");
  return JSON.parse(body);
}

async function authorizeFixture(runtime, name, overrides = {}) {
  const { event, context } = await loadFixture(name);
  const mappedEvent = { ...event, ...overrides };
  const check = mapOpenClawToolCallToAgentAction(mappedEvent, context);
  const decision = await runtime.authorize(check);
  return {
    check,
    summary: {
      type: decisionType(decision),
      reasons: decisionReasons(decision),
    },
  };
}

const first = await authorizeFixture(loopRuntime, "openclaw-loop-read-event.json", { toolCallId: "loop-read-1" });
const second = await authorizeFixture(loopRuntime, "openclaw-loop-read-event.json", { toolCallId: "loop-read-2" });
const third = await authorizeFixture(loopRuntime, "openclaw-loop-read-event.json", { toolCallId: "loop-read-3" });
const oversized = await authorizeFixture(hardBudgetRuntime, "openclaw-large-heartbeat-event.json");

if (first.summary.type !== "allow" || second.summary.type !== "allow") {
  console.error(JSON.stringify({ first, second }, null, 2));
  throw new Error("expected first two repeated reads to be allowed");
}

if (third.summary.type !== "challenge_required") {
  console.error(JSON.stringify({ third }, null, 2));
  throw new Error("expected repeated read loop to require approval after soft budget");
}

if (oversized.summary.type !== "deny" || !oversized.summary.reasons.some((reason) => reason.includes("maxTokensPerJob"))) {
  console.error(JSON.stringify({ oversized }, null, 2));
  throw new Error("expected oversized context payload to be denied by token budget");
}

console.log(
  JSON.stringify(
    {
      useCase: "tool-loop-budget-gate",
      outcome: "passed",
      repeatedReads: [
        { decision: first.summary.type, estimatedTokens: first.check.estimatedTokens },
        { decision: second.summary.type, estimatedTokens: second.check.estimatedTokens },
        { decision: third.summary.type, estimatedTokens: third.check.estimatedTokens },
      ],
      oversizedContext: {
        decision: oversized.summary.type,
        estimatedTokens: oversized.check.estimatedTokens,
        reasons: oversized.summary.reasons,
      },
    },
    null,
    2,
  ),
);

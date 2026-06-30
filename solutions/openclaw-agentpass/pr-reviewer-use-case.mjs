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
  createAgentPassOpenClawRuntime,
  decisionReasons,
  decisionType,
  isAllowedDecision,
  mapOpenClawToolCallToAgentPass,
} = adapter;

const gatewayUrl = process.env.AGENTPASS_GATEWAY_URL || "http://127.0.0.1:8787";
const apiKey = process.env.AGENTPASS_GATEWAY_API_KEY || "dev-token";

const runtime = createAgentPassOpenClawRuntime({
  config: {
    mode: "remote",
    authorizeUrl: `${gatewayUrl.replace(/\/$/, "")}/authorize`,
    apiKey,
    failClosed: true,
  },
});

async function loadFixture(name) {
  const body = await readFile(resolve(here, "fixtures", name), "utf8");
  return JSON.parse(body);
}

async function authorizeFixture(name) {
  const { event, context } = await loadFixture(name);
  const check = mapOpenClawToolCallToAgentPass(event, context);
  const decision = await runtime.authorize(check);
  return {
    check,
    summary: {
      type: decisionType(decision),
      allow: isAllowedDecision(decision),
      reasons: decisionReasons(decision),
    },
  };
}

const fetchDiff = await authorizeFixture("openclaw-fetch-pr-diff-event.json");
const submitReview = await authorizeFixture("openclaw-submit-pr-review-event.json");

if (!fetchDiff.summary.allow) {
  console.error(JSON.stringify({ fetchDiff: fetchDiff.summary, check: fetchDiff.check }, null, 2));
  throw new Error("expected PR diff fetch to be allowed");
}

if (submitReview.summary.allow) {
  console.error(JSON.stringify({ submitReview: submitReview.summary, check: submitReview.check }, null, 2));
  throw new Error("expected PR review submission to be denied without JIT");
}

if (!submitReview.summary.reasons.some((reason) => reason.includes("requires JIT") || reason.includes("missing jit_grant_id"))) {
  console.error(JSON.stringify({ submitReview: submitReview.summary, check: submitReview.check }, null, 2));
  throw new Error("expected PR review submission denial to mention missing JIT");
}

console.log(
  JSON.stringify(
    {
      useCase: "pr-reviewer-gated-publication",
      outcome: "passed",
      fetchDiff: {
        tool: fetchDiff.check.tool,
        action: fetchDiff.check.action,
        resource: fetchDiff.check.resource,
        decision: fetchDiff.summary.type,
      },
      submitReview: {
        tool: submitReview.check.tool,
        action: submitReview.check.action,
        resource: submitReview.check.resource,
        decision: submitReview.summary.type,
        reasons: submitReview.summary.reasons,
      },
    },
    null,
    2,
  ),
);

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
    event,
    check,
    decision,
    summary: {
      type: decisionType(decision),
      allow: isAllowedDecision(decision),
      reasons: decisionReasons(decision),
    },
  };
}

const read = await authorizeFixture("openclaw-read-readme-event.json");
const write = await authorizeFixture("openclaw-write-readme-event.json");

if (!read.summary.allow) {
  console.error(JSON.stringify({ read: read.summary, check: read.check }, null, 2));
  throw new Error("expected README read to be allowed");
}

if (write.summary.allow) {
  console.error(JSON.stringify({ write: write.summary, check: write.check }, null, 2));
  throw new Error("expected README write to be denied without JIT");
}

if (!write.summary.reasons.some((reason) => reason.includes("requires JIT") || reason.includes("missing jit_grant_id"))) {
  console.error(JSON.stringify({ write: write.summary, check: write.check }, null, 2));
  throw new Error("expected README write denial to mention missing JIT");
}

console.log(
  JSON.stringify(
    {
      useCase: "repo-maintenance-doc-update",
      outcome: "passed",
      read: {
        tool: read.check.tool,
        action: read.check.action,
        resource: read.check.resource,
        decision: read.summary.type,
      },
      write: {
        tool: write.check.tool,
        action: write.check.action,
        resource: write.check.resource,
        decision: write.summary.type,
        reasons: write.summary.reasons,
      },
    },
    null,
    2,
  ),
);

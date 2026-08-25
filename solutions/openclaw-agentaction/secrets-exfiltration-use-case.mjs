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
  isAllowedDecision,
  mapOpenClawToolCallToAgentAction,
} = adapter;

const gatewayUrl = process.env.AGENTPASS_GATEWAY_URL || "http://127.0.0.1:8787";
const apiKey = process.env.AGENTPASS_GATEWAY_API_KEY || "dev-token";

const runtime = createAgentActionOpenClawRuntime({
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
  const check = mapOpenClawToolCallToAgentAction(event, context);
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

const readEnv = await authorizeFixture("openclaw-read-env-event.json");
const submitSecret = await authorizeFixture("openclaw-submit-secret-event.json");

if (!readEnv.summary.allow) {
  console.error(JSON.stringify({ readEnv: readEnv.summary, check: readEnv.check }, null, 2));
  throw new Error("expected .env read to be allowed for local analysis");
}

if (submitSecret.summary.allow) {
  console.error(JSON.stringify({ submitSecret: submitSecret.summary, check: submitSecret.check }, null, 2));
  throw new Error("expected browser secret submission to be denied");
}

if (!submitSecret.summary.reasons.some((reason) => reason.includes("blocked data flow used: secrets_manager -> browser_form"))) {
  console.error(JSON.stringify({ submitSecret: submitSecret.summary, check: submitSecret.check }, null, 2));
  throw new Error("expected browser secret submission denial to mention blocked secret exfiltration flow");
}

console.log(
  JSON.stringify(
    {
      useCase: "secrets-exfiltration-boundary",
      outcome: "passed",
      readEnv: {
        tool: readEnv.check.tool,
        action: readEnv.check.action,
        resource: readEnv.check.resource,
        dataFrom: readEnv.check.dataFrom,
        dataTo: readEnv.check.dataTo,
        decision: readEnv.summary.type,
      },
      submitSecret: {
        tool: submitSecret.check.tool,
        action: submitSecret.check.action,
        resource: submitSecret.check.resource,
        dataFrom: submitSecret.check.dataFrom,
        dataTo: submitSecret.check.dataTo,
        dataClassification: submitSecret.check.dataClassification,
        decision: submitSecret.summary.type,
        reasons: submitSecret.summary.reasons,
      },
    },
    null,
    2,
  ),
);

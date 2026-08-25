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

const readCustomer = await authorizeFixture("openclaw-read-customer-record-event.json");
const sendSlack = await authorizeFixture("openclaw-send-slack-customer-event.json");

if (!readCustomer.summary.allow) {
  console.error(JSON.stringify({ readCustomer: readCustomer.summary, check: readCustomer.check }, null, 2));
  throw new Error("expected customer record read to be allowed");
}

if (sendSlack.summary.allow) {
  console.error(JSON.stringify({ sendSlack: sendSlack.summary, check: sendSlack.check }, null, 2));
  throw new Error("expected Slack send with customer data to be denied");
}

if (!sendSlack.summary.reasons.some((reason) => reason.includes("blocked data flow used: customer_records -> external_channel"))) {
  console.error(JSON.stringify({ sendSlack: sendSlack.summary, check: sendSlack.check }, null, 2));
  throw new Error("expected Slack send denial to mention blocked customer data flow");
}

console.log(
  JSON.stringify(
    {
      useCase: "slack-send-guard",
      outcome: "passed",
      readCustomer: {
        tool: readCustomer.check.tool,
        action: readCustomer.check.action,
        resource: readCustomer.check.resource,
        dataFrom: readCustomer.check.dataFrom,
        dataTo: readCustomer.check.dataTo,
        decision: readCustomer.summary.type,
      },
      sendSlack: {
        tool: sendSlack.check.tool,
        action: sendSlack.check.action,
        resource: sendSlack.check.resource,
        dataFrom: sendSlack.check.dataFrom,
        dataTo: sendSlack.check.dataTo,
        dataClassification: sendSlack.check.dataClassification,
        decision: sendSlack.summary.type,
        reasons: sendSlack.summary.reasons,
      },
    },
    null,
    2,
  ),
);

import { readFile } from "node:fs/promises";

import {
  bindIntentContract,
  createToolGate,
  digestIntentObservation,
  evaluateIntent,
  type IntentContract,
  type IntentObservation,
} from "../src/index.ts";

const rawContract = JSON.parse(
  await readFile(new URL("./support-refund-intent.json", import.meta.url), "utf8"),
) as IntentContract;
const contract = bindIntentContract(rawContract);
const startedAt = "2026-07-20T18:00:00.000Z";
const completedAt = "2026-07-20T18:00:01.000Z";

const gate = createToolGate({
  policy: {
    tools: {
      "stripe.refund": {
        action: "pay",
        requiresApproval: true,
        maxAmountUsd: 100,
        requireIdempotencyKey: true,
        singleUse: true,
      },
    },
  },
  now: () => new Date(completedAt),
  idGenerator: () => "dec-refund-1042",
});

const execution = await gate.run(
  {
    agentId: "support-agent",
    intentId: contract.intent_id,
    intentDigest: contract.intent_digest,
    jobId: contract.job_id,
    tool: "stripe.refund",
    action: "pay",
    resource: "payment/pi_123",
    amountUsd: 49,
    idempotencyKey: "refund-case-1042-pi_123",
    approvalId: "approval-1042",
    estimatedCostUsd: 0.01,
  },
  async () => ({ refund_id: "re_123", status: "succeeded" }),
);

if (!execution.executed) throw new Error(`refund was not executed: ${execution.decision.reasons.join(", ")}`);

const observation: IntentObservation = {
  schema_version: "agentpass.intent-observation.v1",
  observation_id: "obs-refund-1042",
  tenant_id: "tenant-support",
  intent_id: contract.intent_id,
  intent_digest: contract.intent_digest || "",
  predicate: "refund.status",
  value: execution.result.status,
  resource: `refund/${execution.result.refund_id}`,
  observed_at: completedAt,
  issued_at: completedAt,
  expires_at: "2026-07-20T18:05:01.000Z",
  issuer: "stripe-adapter",
  payload_digest: "",
  provenance: {
    verification_method: "jws",
    verified_issuer: "stripe-adapter",
    verified_at: completedAt,
    verified_subject: "stripe-service",
    signature_kid: "stripe-2026-07",
  },
};
observation.payload_digest = digestIntentObservation(observation);

const evaluation = evaluateIntent(
  contract,
  {
    decision_events: [execution.decision.event],
    execution_receipts: [execution.receipt],
    observations: [observation],
    job: {
      intent_id: contract.intent_id,
      intent_digest: contract.intent_digest,
      job_id: contract.job_id,
      started_at: startedAt,
      completed_at: completedAt,
    },
  },
  {
    now: () => new Date(completedAt),
    idGenerator: () => "eval-refund-1042",
  },
);

console.log(JSON.stringify(evaluation, null, 2));

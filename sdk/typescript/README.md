# AgentAction TypeScript Client

Small helper client for calling an AgentAction gateway from a SaaS app or agent
runtime.

```ts
import { AgentActionClient } from "@agentaction/client";

const agentaction = new AgentActionClient({
  baseUrl: "https://agentaction-gateway.example.com",
  token: async () => getAccessTokenFromYourIdP(),
});

await agentaction.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "zendesk.search_tickets",
  action: "read",
  data_from: "zendesk",
  data_to: "agent_context",
});

const grant = await agentaction.requestJitGrant("tenant-a", {
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approval_id: "approval-123",
  user_id: "support-rep-17",
  idempotency_key: "refund-case-1042",
});

await agentaction.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
  idempotency_key: "refund-case-1042",
});

await agentaction.recordExecutionResult("tenant-a", {
  agent_id: "refund-agent",
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
  idempotency_key: "refund-case-1042",
  result: {
    refund_id: "re_123",
    amount: 49,
  },
});
```

For comparable intent-bound jobs, register a frozen profile, issue the per-job
contract from typed variables, carry the returned digest on every request, and
evaluate the durable evidence after execution:

```ts
const profile = await agentpass.registerIntentProfile("tenant-a", profileDefinition);

const registered = await agentaction.issueIntentContract(
  "tenant-a",
  profile.profile_key,
  {
    intent_id: "refund-case-1042",
    job_id: "case-1042",
    variables: { payment_id: "pi_123", refund_amount: 49 },
    issued_at: "2026-07-20T17:59:00Z",
    expires_at: "2026-07-20T18:30:00Z",
  },
);

const binding = {
  intent_id: registered.intent_id,
  intent_digest: registered.intent_digest,
  job_id: registered.job_id,
};

const recorded = await agentaction.recordIntentObservation("tenant-a", registered.intent_id, {
  observation_id: "obs-refund-case-1042",
  predicate: "refund.status",
  value: "succeeded",
  observed_at: new Date().toISOString(),
  issued_at: new Date().toISOString(),
  issuer: "stripe-adapter",
});

if (recorded.replayed) {
  console.log("The identical observation was already stored");
}

const evaluation = await agentaction.evaluateIntent("tenant-a", registered.intent_id, {
  job: {
    ...binding,
    started_at: jobStartedAt,
    completed_at: jobCompletedAt,
  },
});

const finalization = await agentaction.finalizeIntent("tenant-a", registered.intent_id, {
  job: {
    ...binding,
    started_at: jobStartedAt,
    completed_at: jobCompletedAt,
  },
});

const lifecycle = await agentaction.getIntentEvaluations(
  "tenant-a",
  registered.intent_id,
);
```

`registerIntentProfile` is idempotent for identical contents and freezes each
profile name/version. `listIntentProfiles` and `getIntentProfile` expose the
tenant registry. `issueIntentContract` rejects unknown or incorrectly typed
variables and returns the same contract for the same normalized inputs.
`registerIntentContract` remains available for tenants using the explicit
`raw_compatible` policy mode; profile-bound contracts cannot use that route.
`listIntentContracts` and `getIntentContract` expose issued job contracts and
lifecycle status.
`recordIntentObservation` accepts either direct OIDC-bound observation input or
`{ jws: compactRs256Jws }`, and returns the verified observation plus its replay
status. The gateway supplies route-bound tenant and intent fields and records
verification provenance; signed envelopes must include those bindings and the
canonical payload digest inside the signature.
`evaluateIntent` creates a preview and leaves evidence open. `finalizeIntent`
freezes the canonical evidence snapshot and returns the one snapshot-bound final
receipt; identical retries set `replayed` without creating another evaluation.
`getIntentEvaluations` returns history plus the latest preview, final receipt,
snapshot, and finalization status.

Once jobs are finalized, query comparable quality groups with an explicit,
bounded time window:

```ts
const quality = await agentaction.getIntentQualityRollups("tenant-a", {
  from: "2026-07-20T00:00:00Z",
  to: "2026-07-22T00:00:00Z",
  profile_key: "support_refund.v1",
  profile_version: "v1",
  agent_id: "refund-agent",
  minimum_sample_size: 10,
});

for (const rollup of quality.rollups) {
  console.log(rollup.profile_key, rollup.outcomes, rollup.data_quality);
}
```

`getIntentQualityRollups` includes only immutable final receipts. Unlike profile
versions or digests remain separate groups, and indeterminate or low-confidence
jobs remain visible. Optional `verdict` and `constraint_compliance` filters
narrow the job population. Use `limit` and `cursor` to page profile groups; the
aggregate for each returned group is calculated over its complete matching
population.

For approval-gated actions, the client can drive the durable hosted lifecycle:

```ts
const approval = await agentaction.createApprovalRequest("tenant-a", {
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  requested_by: "support-rep-17",
  user_id: "support-rep-17",
  reason: "duplicate charge verified",
  amount: 49,
  currency: "USD",
});

await agentaction.decideApprovalRequest(
  "tenant-a",
  approval.approval_id,
  "approve",
  {
    decided_by: "manager-1",
    decision_reason: "customer, amount, and refund scope verified",
  },
);

const queue = await agentaction.listApprovalRequests("tenant-a", {
  status: "pending",
});
const timeline = await agentaction.listAuditEvents({
  tenantId: "tenant-a",
  approvalId: approval.approval_id,
});
```

For hosted PII egress checks, include the exact data-flow context:

```ts
const decision = await agentaction.authorizeToolCall("tenant-a", {
  agent_id: "support-agent",
  tool: "email.send_external",
  action: "send",
  resource: "email/customer/cus_123",
  data_from: "provider_crm",
  data_to: "external_email",
  destination_type: "external_email",
  external_domain: "alice.customer.example",
  data_classification: ["customer_data", "pii"],
  field_set: ["customer_id", "case_id"],
  record_count: 1,
  redaction_state: "minimum_fields",
  retention: "transient",
});

if (decision.decision === "challenge_required") {
  // Create an approval request with the same fields and retry only the exact scope.
}
```

Use the same fields for browser-form, model-provider, webhook, and file-export
paths. Model-provider flows can require `redaction_state: "redacted"` or
`"tokenized"` before raw customer fields leave the system of record.

Every hosted approval includes `agentpass.approval-evidence.v1`, an expiry, and
a canonical request digest. JIT issuance fails closed when the requested scope
does not match that evidence.

When hosted provider trust signing is configured, successful non-replayed
authorization responses also include `authorization_receipt.jws`. Forward that
compact JWS to the provider so it can verify the exact approved scope against
the gateway JWKS endpoint before executing.

For side-effectful tools, record the completed provider result after the first
allowed execution. Identical retries to `authorizeToolCall` return the cached
result with `replayed: true`; changed arguments under the same idempotency key
are denied.

The legacy `AgentIdClient` export remains available as a compatibility alias.

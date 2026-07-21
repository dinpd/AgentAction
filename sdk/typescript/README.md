# AgentPass TypeScript Client

Small helper client for calling an AgentPass gateway from a SaaS app or agent
runtime.

```ts
import { AgentPassClient } from "@agentpass/client";

const agentpass = new AgentPassClient({
  baseUrl: "https://agentpass-gateway.example.com",
  token: async () => getAccessTokenFromYourIdP(),
});

await agentpass.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "zendesk.search_tickets",
  action: "read",
  data_from: "zendesk",
  data_to: "agent_context",
});

const grant = await agentpass.requestJitGrant("tenant-a", {
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approval_id: "approval-123",
  user_id: "support-rep-17",
  idempotency_key: "refund-case-1042",
});

await agentpass.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
  idempotency_key: "refund-case-1042",
});

await agentpass.recordExecutionResult("tenant-a", {
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

For intent-bound jobs, register the contract before requesting authority, carry
the returned digest on every request, and evaluate the durable evidence after
execution:

```ts
const registered = await agentpass.registerIntentContract("tenant-a", contract);

const binding = {
  intent_id: registered.intent_id,
  intent_digest: registered.intent_digest,
  job_id: registered.job_id,
};

await agentpass.recordIntentObservation("tenant-a", registered.intent_id, {
  predicate: "refund.status",
  value: "succeeded",
  observed_at: new Date().toISOString(),
  issuer: "stripe-adapter",
});

const evaluation = await agentpass.evaluateIntent("tenant-a", registered.intent_id, {
  job: {
    ...binding,
    started_at: jobStartedAt,
    completed_at: jobCompletedAt,
  },
});
```

`registerIntentContract` is idempotent for identical contents and fails if an
existing `intent_id` is reused with changed contents. `listIntentContracts` and
`getIntentContract` expose the tenant registry and lifecycle status.

For approval-gated actions, the client can drive the durable hosted lifecycle:

```ts
const approval = await agentpass.createApprovalRequest("tenant-a", {
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  requested_by: "support-rep-17",
  user_id: "support-rep-17",
  reason: "duplicate charge verified",
  amount: 49,
  currency: "USD",
});

await agentpass.decideApprovalRequest(
  "tenant-a",
  approval.approval_id,
  "approve",
  {
    decided_by: "manager-1",
    decision_reason: "customer, amount, and refund scope verified",
  },
);

const queue = await agentpass.listApprovalRequests("tenant-a", {
  status: "pending",
});
const timeline = await agentpass.listAuditEvents({
  tenantId: "tenant-a",
  approvalId: approval.approval_id,
});
```

For hosted PII egress checks, include the exact data-flow context:

```ts
const decision = await agentpass.authorizeToolCall("tenant-a", {
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

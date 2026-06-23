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
});

await agentpass.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
});
```

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

Every hosted approval includes `agentpass.approval-evidence.v1`, an expiry, and
a canonical request digest. JIT issuance fails closed when the requested scope
does not match that evidence.

The legacy `AgentIdClient` export remains available as a compatibility alias.

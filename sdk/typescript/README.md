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

The legacy `AgentIdClient` export remains available as a compatibility alias.

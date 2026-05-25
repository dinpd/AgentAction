# AgentID TypeScript Client

Small helper client for calling an AgentID gateway from a SaaS app or agent
runtime.

```ts
import { AgentIdClient } from "@agentid/client";

const agentid = new AgentIdClient({
  baseUrl: "https://agentid-gateway.example.com",
  token: async () => getAccessTokenFromYourIdP(),
});

await agentid.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "zendesk.search_tickets",
  action: "read",
  data_from: "zendesk",
  data_to: "agent_context",
});

const grant = await agentid.requestJitGrant("tenant-a", {
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approval_id: "approval-123",
  user_id: "support-rep-17",
});

await agentid.assertAllowed("tenant-a", {
  agent_id: "refund-agent",
  tool: "stripe.create_refund",
  action: "write",
  resource: "refund/case-1042",
  approved: true,
  jit_grant_id: grant.jit_grant_id,
});
```

# @agentpass/provider-express

Express-compatible middleware for provider-side AgentPass receipt verification.

Use this when an MCP provider wants to verify that a forwarded `tools/call`
contains a scoped AgentPass authorization receipt before executing a guarded
high-risk tool. It is the provider-side verification companion to the runtime
action gate; it complements provider business authorization, not replace it.

## Install

This package is currently part of the AgentPass repository and is marked private
while the provider receipt contract settles.

```bash
cd packages/provider-express
npm install
npm test
npm run build
```

## Usage

```ts
import express from "express";
import {
  MemoryReceiptLedger,
  MemoryExecutionResultStore,
  MemoryReplayStore,
  MemoryRevocationStore,
  createAgentPassReceiptMiddleware,
  executeProviderTool,
} from "@agentpass/provider-express";

const app = express();
app.use(express.json());

app.post(
  "/mcp",
createAgentPassReceiptMiddleware({
    jwksUri: "https://enterprise.example.com/.well-known/jwks.json",
    issuer: "https://enterprise.example.com",
    audience: "provider-crm-mcp",
    replayStore: new MemoryReplayStore(),
    revocationStore: new MemoryRevocationStore(),
    receiptLedger: new MemoryReceiptLedger(),
    tools: {
      "provider.crm.update_customer": {
        action: "write",
        resourceTemplate: "provider/customer/{customer_id}",
        requiredReceiptFields: [
          "tenant_id",
          "user_id",
          "job_id",
          "case_id",
          "customer_id",
          "approval_id",
          "jit_grant_id",
          "enterprise_issuer",
          "enterprise_subject",
          "enterprise_client_id",
          "enterprise_id_jag_grant_id",
        ],
        requiredReceiptValues: {
          enterprise_issuer: "https://idp.example.com",
          enterprise_client_id: "claude-enterprise",
          enterprise_scopes: ["mcp:provider-crm", "crm.write"],
          enterprise_groups: ["support-admins"],
        },
        bindArgs: {
          job_id: "job_id",
          case_id: "case_id",
          customer_id: "customer_id",
          approval_id: "approval_id",
          jit_grant_id: "jit_grant_id",
        },
      },
    },
  }),
  async (req, res) => {
    // req.agentpassReceipt is available after successful verification.
    // Provider business authorization should still run here.
    res.json({ ok: true });
  },
);
```

For side-effectful tools, use `executeProviderTool` instead of attaching the
standalone receipt middleware to that route. With a shared result store, an
identical retry returns the recorded result and a changed retry is rejected
before the mutating handler runs:

```ts
const outcome = await executeProviderTool(req.body, (receipt) => issueCredit(receipt, req.body), {
  secret: process.env.AGENTPASS_RECEIPT_SECRET,
  resultStore: new MemoryExecutionResultStore(),
  tools: { "provider.billing.issue_credit": receiptPolicy },
});
res.json({ status: outcome.status, result: outcome.result });
```

The legacy `createAgentIdReceiptMiddleware` export and `req.agentidReceipt`
property remain available as compatibility aliases.

## What It Checks

- Signed JWS receipt envelopes against a local JWKS
- Signed JWS receipt envelopes against a remote JWKS URI
- Optional issuer, audience, and allowed-algorithm checks
- Signed HMAC receipt envelopes for local demos
- Required receipt fields
- Required receipt values, including enterprise auth fields from OIDC/EMA
- Tool name
- Expected action
- Expected resource from a template or callback
- Receipt fields bound to MCP tool arguments
- `issued_at` and `expires_at`
- Optional single-use replay protection
- Optional receipt revocation before execution
- Receipt-level bounded-use and spend-cap consumption
- Provider execution-result replay for identical retries

Remote JWKS fetches are cached for 5 minutes by default, fall back to stale
keys for up to 5 more minutes when refresh fails, and force a refresh when a
receipt `kid` is missing so key rotation can land before the TTL expires. Use
`jwks` for a local key set or `jwksUri` for a remote key set.

HMAC receipts are intended for local demos and simple integrations. Production
providers should prefer managed keys with JWS/JWKS or receipt introspection.
Use durable, atomic revocation and ledger implementations in production; the
in-memory stores are deterministic references for tests and local development.
Use a durable execution-result store shared by all provider instances in the
same way.

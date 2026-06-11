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
  MemoryReplayStore,
  createAgentPassReceiptMiddleware,
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
        ],
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

The legacy `createAgentIdReceiptMiddleware` export and `req.agentidReceipt`
property remain available as compatibility aliases.

## What It Checks

- Signed JWS receipt envelopes against a local JWKS
- Signed JWS receipt envelopes against a remote JWKS URI
- Optional issuer, audience, and allowed-algorithm checks
- Signed HMAC receipt envelopes for local demos
- Required receipt fields
- Tool name
- Expected action
- Expected resource from a template or callback
- Receipt fields bound to MCP tool arguments
- `issued_at` and `expires_at`
- Optional single-use replay protection

Remote JWKS fetches are cached for 5 minutes by default, fall back to stale
keys for up to 5 more minutes when refresh fails, and force a refresh when a
receipt `kid` is missing so key rotation can land before the TTL expires. Use
`jwks` for a local key set or `jwksUri` for a remote key set.

HMAC receipts are intended for local demos and simple integrations. Production
providers should prefer managed keys with JWS/JWKS or receipt introspection.

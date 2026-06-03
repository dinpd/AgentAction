# @agentid/provider-express

Express-compatible middleware for provider-side AgentID receipt verification.

Use this when an MCP provider wants to verify that a forwarded `tools/call`
contains a scoped AgentID authorization receipt before executing high-risk
tools. It is designed to complement provider business authorization, not replace
it.

## Install

This package is currently part of the AgentID repository and is marked private
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
  createAgentIdReceiptMiddleware,
} from "@agentid/provider-express";

const app = express();
app.use(express.json());

app.post(
  "/mcp",
createAgentIdReceiptMiddleware({
    jwks: {
      keys: [
        /* enterprise receipt signing public keys */
      ],
    },
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
    // req.agentidReceipt is available after successful verification.
    // Provider business authorization should still run here.
    res.json({ ok: true });
  },
);
```

## What It Checks

- Signed JWS receipt envelopes against a local JWKS
- Optional issuer, audience, and allowed-algorithm checks
- Signed HMAC receipt envelopes for local demos
- Required receipt fields
- Tool name
- Expected action
- Expected resource from a template or callback
- Receipt fields bound to MCP tool arguments
- `issued_at` and `expires_at`
- Optional single-use replay protection

HMAC receipts are intended for local demos and simple integrations. Production
providers should prefer managed keys with JWS/JWKS or receipt introspection.

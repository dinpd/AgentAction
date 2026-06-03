# agentid-provider-fastapi

FastAPI-compatible helpers for provider-side AgentID receipt verification.

Use this when an MCP provider wants to verify that a forwarded `tools/call`
contains a scoped AgentID authorization receipt before executing high-risk
tools. It complements provider business authorization; it does not replace it.

## Install

This package is currently part of the AgentID repository while the provider
receipt contract settles.

```bash
python -m pytest packages/provider-fastapi/tests
```

## Usage

```python
from fastapi import Depends, FastAPI
from agentid_provider_fastapi import (
    InMemoryReplayStore,
    ProviderReceiptVerifier,
    ToolReceiptPolicy,
)

app = FastAPI()

verifier = ProviderReceiptVerifier(
    jwks={"keys": [...]},
    issuer="https://enterprise.example.com",
    audience="provider-crm-mcp",
    replay_store=InMemoryReplayStore(),
    tools={
        "provider.crm.update_customer": ToolReceiptPolicy(
            action="write",
            resource_template="provider/customer/{customer_id}",
            required_receipt_fields=[
                "tenant_id",
                "user_id",
                "job_id",
                "case_id",
                "customer_id",
                "approval_id",
                "jit_grant_id",
            ],
            bind_args={
                "job_id": "job_id",
                "case_id": "case_id",
                "customer_id": "customer_id",
                "approval_id": "approval_id",
                "jit_grant_id": "jit_grant_id",
            },
        )
    },
)

@app.post("/mcp")
async def mcp_endpoint(body: dict, receipt=Depends(verifier.dependency)):
    # `receipt` is the verified AgentID receipt for protected tools, or None for
    # tools that do not have a configured receipt policy.
    # Provider business authorization should still run here.
    return {"ok": True}
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

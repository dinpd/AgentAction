# AgentPass MCP Gateway Adapter

This is a reference MCP gateway adapter for enforcing AgentPass checks before MCP
tool calls.

```text
MCP client -> AgentPass MCP gateway adapter -> AgentPass check -> downstream MCP server
```

The adapter is intentionally small. It demonstrates the enforcement pattern
without trying to be a production MCP gateway.

## What It Does

- Accepts HTTP JSON-RPC requests.
- Proxies non-tool MCP methods to a downstream MCP server.
- Filters `tools/list` to tools configured in the adapter.
- Intercepts `tools/call`.
- Maps MCP tool name and arguments to an AgentPass authorization event.
- Calls AgentPass `/authorize` or runs the local guard in-process.
- Logs each AgentPass authorization decision as a structured JSON line.
- Returns a JSON-RPC error when AgentPass denies the call.
- Forwards allowed calls to the downstream MCP server.
- Preserves state across calls in local guard mode for duplicate side effects,
  job budgets, tool thrashing, and PII/data-flow enforcement.

## Run Locally

Install dependencies:

```bash
cd mcp-gateway-adapter
npm install
npm test
npm run build
```

Run the self-contained local guard demo:

```bash
npm run demo:local-guard
```

This runs the gateway logic in process and demonstrates `tools/list` filtering,
safe forwarding, duplicate-side-effect denial, same-tool loop denial, and PII
egress denial without starting the hosted AgentPass service.

Start the AgentPass authorization service:

```bash
agentpass gateway ../examples/provider-mcp-support-agent.yaml --host 127.0.0.1 --port 8787 --api-key dev-token
```

Start the adapter:

```bash
npm run dev
```

The example config listens on `http://127.0.0.1:8788` and forwards allowed MCP
requests to `http://127.0.0.1:8790/mcp`.

For a complete local demo with a mock provider MCP server and sample JSON-RPC
requests, see [`../docs/mcp-gateway-demo.md`](../docs/mcp-gateway-demo.md).

To try the MCP boundary without running the hosted AgentPass authorization
service, use local guard mode. Start these in separate terminals:

```bash
npm run mock-provider
npm run dev:local-guard
```

Then send the sample requests:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @examples/local-allowed-issue-credit.json

curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @examples/local-allowed-issue-credit.json

curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @examples/local-denied-pii-email.json
```

The first credit call is forwarded. The repeated credit call is denied before
the provider sees it because the idempotency key was already used. The PII email
call is denied before forwarding because the payload includes a blocked field
and an unapproved external domain.

## Config

See [`examples/config.json`](examples/config.json).
For a self-contained stateful guard demo, see
[`examples/local-guard-config.json`](examples/local-guard-config.json).

Each tool mapping tells the adapter how to build an AgentPass authorize payload:

```json
{
  "provider.crm.update_customer": {
    "action": "write",
    "data_from": "enterprise_crm",
    "data_to": "provider_crm",
    "resource_template": "provider/customer/{customer_id}",
    "job_id_arg": "job_id",
    "case_id_arg": "case_id",
    "customer_id_arg": "customer_id",
    "approved_arg": "approved",
    "jit_grant_id_arg": "jit_grant_id"
  }
}
```

Allowed calls can also carry a provider-verifiable authorization receipt in
`_agentid_receipt`. For local demos, configure `provider_receipts.hmac_secret`.
For production-oriented integrations, configure `provider_receipts.jws` with a
private signing key, key ID, issuer, and audience so providers can verify the
receipt against JWKS. Providers can verify against a local JWKS object or a
remote JWKS URI with a 5 minute cache TTL, a 5 minute stale-on-error window,
and an immediate refresh when a receipt `kid` is missing from the cached keys:

```json
{
  "provider_receipts": {
    "tenant_id": "tenant-a",
    "jws": {
      "private_key_env": "AGENTID_RECEIPT_PRIVATE_KEY_PEM",
      "key_id": "agentid-2026-06",
      "issuer": "https://enterprise.example.com",
      "audience": "provider-crm-mcp"
    }
  }
}
```

## Limitations

This adapter is not a full production MCP gateway. It does not yet implement:

- stdio transport.
- streamable HTTP or SSE transport behavior.
- MCP session negotiation.
- cancellation.
- streaming tool results.
- downstream authentication.
- JIT grant issuance flow.
- provider-specific argument mappers.
- tool drift reporting.

Local guard mode is intentionally process-local. It is useful for demos,
single-process runtimes, and reference tests. Production gateways should back
job state, idempotency records, approval grants, and audit events with durable
storage or call a hosted AgentPass authorization service.

Those are the next pieces to add around this reference enforcement path.

## Decision Logs

The adapter writes one structured JSON log line for each intercepted
`tools/call` authorization decision:

```json
{
  "event": "agentid.mcp.authorization",
  "agent_id": "enterprise-support-agent",
  "tenant_id": "tenant-a",
  "tool": "provider.crm.update_customer",
  "action": "write",
  "resource": "provider/customer/cus_123",
  "job_id": "support_case_resolution",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "allowed": false,
  "decision": "deny",
  "findings": [
    "missing jit_grant_id",
    "event[0]: provider.crm.update_customer requires approval but event is not approved",
    "event[0]: provider.crm.update_customer requires JIT authorization but no jit_grant_id is present",
    "event[0]: JIT grant is marked invalid"
  ]
}
```

This makes the local demo easier to evaluate and gives upstream gateway
maintainers a concrete audit shape to review.

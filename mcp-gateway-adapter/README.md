# AgentAction MCP Gateway Adapter

This is a reference MCP gateway adapter for observing or enforcing AgentAction
checks before MCP tool calls.

```text
MCP client -> AgentAction MCP gateway adapter -> AgentAction check -> downstream MCP server
```

The adapter is intentionally small. It demonstrates the enforcement pattern
without trying to be a production MCP gateway.

## What It Does

- Accepts HTTP JSON-RPC requests.
- Proxies non-tool MCP methods to a downstream MCP server.
- Filters `tools/list` to tools configured in the adapter.
- Intercepts `tools/call`.
- Maps MCP tool name and arguments to an AgentAction authorization event.
- Calls AgentAction `/authorize` or runs the local guard in-process.
- Logs each AgentAction authorization decision as a structured JSON line.
- Returns a JSON-RPC error when AgentAction denies the call.
- Forwards allowed calls to the downstream MCP server.
- Preserves state across calls in local guard mode for duplicate side effects,
  job budgets, tool thrashing, and PII/data-flow enforcement.
- Supports an explicit passive observe mode for onboarding and policy testing.

## Observe Before Enforce

Set `"mode": "observe"` to evaluate representative MCP traffic without changing
its behavior:

```json
{
  "mode": "observe",
  "local_guard": {
    "policy": {
      "tools": {
        "provider.billing.issue_credit": {
          "action": "pay",
          "requiresApproval": true,
          "requireIdempotencyKey": true,
          "singleUse": true
        }
      }
    }
  }
}
```

Observe mode forwards `tools/list` unchanged and forwards every `tools/call`
unchanged, even when identity validation, mapping, or local policy evaluation
would fail. It never calls the hosted `/authorize` endpoint, consumes hosted
approval or JIT state, filters tool discovery, or attaches provider receipts.
The local stateful guard still tracks the observed stream, so later duplicate
side effects and tool loops appear as counterfactual denials.

Observation is fail-open only when explicitly configured. Omitting `mode`, or
setting it to `"enforce"`, preserves the existing fail-closed behavior.

Run the self-contained onboarding example:

```bash
npm run demo:observe
```

The example forwards an initial credit, its duplicate, and a PII-bearing email
call while showing which calls would be denied under enforcement. After the
policy findings match the intended boundary, change the mode to `"enforce"`.

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
egress denial without starting the hosted AgentAction service.

Run the self-contained enterprise auth and provider receipt demo:

```bash
npm run demo:enterprise-auth
```

This generates a sample enterprise JWT and JWKS, has the gateway validate the
JWT before authorization, attaches a signed provider receipt, and verifies the
enterprise-bound receipt in a mock provider before execution.

Start the AgentAction authorization service:

```bash
agentaction gateway ../examples/provider-mcp-support-agent.yaml --host 127.0.0.1 --port 8787 --api-key dev-token
```

Start the adapter:

```bash
npm run dev
```

The example config listens on `http://127.0.0.1:8788` and forwards allowed MCP
requests to `http://127.0.0.1:8790/mcp`.

For a complete local demo with a mock provider MCP server and sample JSON-RPC
requests, see [`../docs/mcp-gateway-demo.md`](../docs/mcp-gateway-demo.md).

To try the MCP boundary without running the hosted AgentAction authorization
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

Each tool mapping tells the adapter how to build an AgentAction authorize payload:

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
storage or call a hosted AgentAction authorization service.

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

Observe mode emits a separate privacy-safe event after the downstream response:

```json
{
  "event": "agentaction.mcp.observation",
  "mode": "observe",
  "gateway_outcome": "forwarded",
  "evaluation_status": "evaluated",
  "downstream_outcome": "success",
  "agent_id": "enterprise-support-agent",
  "tool": "provider.billing.issue_credit",
  "action": "pay",
  "counterfactual_allow": false,
  "counterfactual_decision": "deny",
  "findings": ["idempotencyKey was already used"]
}
```

The event contains normalized mapping and policy fields, not raw tool arguments
or results. `evaluation_status` is `skipped` when trusted identity or a tool
mapping is unavailable and `error` when the local evaluator is unavailable.
The call remains forwarded in all three states. A caller-provided log sink is
also isolated so its failure cannot block observe-mode traffic.

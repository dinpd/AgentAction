# Provider MCP Authorization Demo

This demo extends the MCP gateway adapter demo with provider-side receipt
verification.

The flow is:

```text
MCP client
  -> AgentID MCP gateway adapter
  -> AgentID /authorize
  -> mock provider MCP server
  -> provider receipt verification
  -> provider business authorization
  -> tool execution
```

It demonstrates both sides of the authorization boundary:

- The enterprise gateway checks whether the agent may attempt the tool call.
- The provider MCP server checks whether the forwarded call carries a valid
  authorization receipt before executing high-risk tools.

## Provider Contract

The provider-published contract lives at
[`../examples/provider-mcp-contract.yaml`](../examples/provider-mcp-contract.yaml).

It declares:

- provider tool names and input schemas
- action and risk classifications
- protected-resource mappings
- required authorization context
- receipt binding requirements
- JIT and approval expectations
- provider-side constraints such as `max_amount_usd`

Validate it before running the demo:

```bash
agentid provider validate examples/provider-mcp-contract.yaml
```

Compare reviewed versions before enabling updated provider tools:

```bash
agentid provider diff old-provider-contract.yaml new-provider-contract.yaml
```

Generate a reviewable enterprise AgentID manifest starter:

```bash
agentid provider import examples/provider-mcp-contract.yaml \
  --agent enterprise-support-agent \
  --output generated-agent.yaml
```

For providers starting from an existing OpenAPI document, generate a contract
starter first:

```bash
agentid provider from-openapi openapi.yaml \
  --provider example-crm \
  --output provider-mcp-contract.yaml
```

## 1. Start AgentID

From the repo root in terminal 1:

```bash
agentid gateway examples/provider-mcp-support-agent.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

## 2. Start the Mock Provider

In terminal 2:

```bash
cd mcp-gateway-adapter
npm install
npm run mock-provider
```

The mock provider listens on `http://127.0.0.1:8790/mcp`.

For high-risk tools, it requires `_agentid_receipt` in the MCP tool arguments.
It accepts raw local demo receipts and signed HMAC receipt envelopes. It also
emits provider execution receipts as structured JSON logs.

## 3. Start the Adapter

In terminal 3:

```bash
cd mcp-gateway-adapter
npm run dev
```

The adapter listens on `http://127.0.0.1:8788`.

When AgentID allows a tool call, the adapter forwards the downstream MCP request
with a receipt in `_agentid_receipt`. The example config signs the receipt with
`provider_receipts.hmac_secret`:

```json
{
  "provider_receipts": {
    "tenant_id": "tenant-a",
    "hmac_secret": "dev-provider-receipt-secret"
  }
}
```

The mock provider verifies that signature using
`AGENTID_PROVIDER_RECEIPT_HMAC_SECRET`, defaulting to the same demo secret. In
production, use managed signing keys, JWS, or introspection rather than a static
demo secret in config.

## 4. Read Call: Enterprise Allows, Provider Executes

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-search-customer.json
```

`provider.crm.search_customer` is a scoped read. The enterprise gateway checks
the manifest and the provider executes the tool.

## 5. Write Call: Enterprise Denies Without JIT

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/denied-update-customer.json
```

`provider.crm.update_customer` is a high-risk write. AgentID denies it before
the request reaches the provider because no JIT grant is present.

## 6. Provider Denies Missing Receipt

Call the provider directly, bypassing the enterprise adapter:

```bash
curl -s http://127.0.0.1:8790/mcp \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/provider-denied-missing-receipt.json
```

The provider denies the call because `_agentid_receipt` is missing.

Expected shape:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32010,
    "message": "Provider denied MCP tool call",
    "data": {
      "findings": ["missing _agentid_receipt"]
    }
  }
}
```

## 7. Provider Denies Resource Mismatch

```bash
curl -s http://127.0.0.1:8790/mcp \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/provider-denied-resource-mismatch.json
```

The provider denies the call because the receipt is bound to
`provider/customer/cus_999`, but the tool arguments target `cus_123`.

## 8. Provider Allows Valid Receipt Once

```bash
curl -s http://127.0.0.1:8790/mcp \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/provider-allowed-update-with-receipt.json
```

The provider accepts the valid local demo receipt and emits an execution receipt
log. Running the same command a second time is denied because the mock provider
treats the receipt as single-use.

## 9. Enterprise JIT Then Provider Verification

Issue a JIT grant:

```bash
curl -s http://127.0.0.1:8787/jit-grants \
  -H 'authorization: Bearer dev-token' \
  -H 'content-type: application/json' \
  -d '{
    "tool": "provider.crm.update_customer",
    "action": "write",
    "resource": "provider/customer/cus_123",
    "job_id": "support_case_resolution",
    "case_id": "case-1042",
    "customer_id": "cus_123",
    "approval_id": "approval-123",
    "user_id": "support-rep-17"
  }'
```

Copy the returned `jit_grant_id` into
`mcp-gateway-adapter/examples/allowed-update-customer.json`, then run:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-update-customer.json
```

The enterprise gateway allows the write, attaches `_agentid_receipt`, and the
provider verifies the receipt before execution.

## 10. Provider Business Authorization Still Applies

Issue a JIT grant for `provider.billing.issue_credit` with resource
`provider/billing/customer/cus_123`, then copy the grant into
`allowed-issue-credit.json` or `denied-issue-credit-over-limit.json`.

The provider allows the credit when `amount_usd` is at or below `100` and denies
the over-limit fixture even if the enterprise receipt is otherwise valid.

This is the intended split:

```text
AgentID receipt proves enterprise-side agent authorization.
Provider business authorization decides whether the operation may execute.
```

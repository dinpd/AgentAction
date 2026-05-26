# MCP Gateway Adapter Demo

This demo shows the reference MCP gateway adapter enforcing AgentID before
forwarding tool calls to a mock provider MCP server.

The flow is:

```text
MCP client -> AgentID MCP gateway adapter -> AgentID gateway -> mock provider MCP server
```

## 1. Start AgentID

From the repo root:

```bash
agentid gateway examples/provider-mcp-support-agent.yaml \
  --host 127.0.0.1 \
  --port 8787 \
  --api-key dev-token
```

## 2. Start the Mock Provider

In a second terminal:

```bash
cd mcp-gateway-adapter
npm install
npm run mock-provider
```

The mock provider listens on `http://127.0.0.1:8790/mcp`.

## 3. Start the Adapter

In a third terminal:

```bash
cd mcp-gateway-adapter
npm run dev
```

The adapter listens on `http://127.0.0.1:8788`.

## 4. Filter tools/list

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/tools-list.json
```

The mock provider exposes an admin delete tool, but the adapter filters it out
because it is not mapped in `examples/config.json`.

## 5. Allow a Read Tool

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-search-customer.json
```

The adapter maps the MCP arguments into an AgentID event and forwards the call
because `provider.crm.search_customer` is a declared read tool for the current
job and customer case.

## 6. Deny a Sensitive Write Without JIT

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/denied-update-customer.json
```

AgentID denies the call because `provider.crm.update_customer` is a
just-in-time write tool and no JIT grant is present.

## 7. Issue a JIT Grant and Retry

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
`mcp-gateway-adapter/examples/allowed-update-customer.json`, then retry:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-update-customer.json
```

The adapter forwards the call once. A second retry with the same grant is denied
because the grant is single-use.

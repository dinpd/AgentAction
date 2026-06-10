# MCP Gateway Adapter Demo

This demo shows the reference MCP gateway adapter enforcing AgentPass before
forwarding tool calls to a mock provider MCP server.

For the companion provider-side receipt verification flow, see
[`provider-mcp-demo.md`](provider-mcp-demo.md).

The flow is:

```text
MCP client -> AgentPass MCP gateway adapter -> AgentPass /authorize -> mock provider MCP server
```

The demo takes about ten minutes and shows five behaviors:

- `tools/list` filtering hides an unmapped admin tool.
- A read call is allowed and forwarded.
- A sensitive write is denied without a JIT grant.
- The same write is allowed with a scoped JIT grant.
- Reusing the single-use JIT grant is denied.

## 1. Start AgentPass

From the repo root in terminal 1:

```bash
agentpass gateway examples/provider-mcp-support-agent.yaml \
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

## 3. Start the Adapter

In terminal 3:

```bash
cd mcp-gateway-adapter
npm run dev
```

The adapter listens on `http://127.0.0.1:8788`.

Keep this terminal visible. It prints one structured JSON line for every
AgentPass authorization decision.

## 4. Filter tools/list

From the repo root in terminal 4:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/tools-list.json
```

The mock provider exposes an admin delete tool, but the adapter filters it out
because it is not mapped in `examples/config.json`.

Expected shape, trimmed to the tool names:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "provider.crm.search_customer" },
      { "name": "provider.crm.update_customer" },
      { "name": "provider.billing.issue_credit" }
    ]
  }
}
```

There is no AgentPass decision log for `tools/list`; the adapter only logs
intercepted `tools/call` authorization decisions.

## 5. Allow a Read Tool

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-search-customer.json
```

The adapter maps the MCP arguments into an AgentPass event and forwards the call
because `provider.crm.search_customer` is a declared read tool for the current
job and customer case.

Expected response shape, trimmed to the key fields:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "mock provider executed provider.crm.search_customer"
      }
    ]
  }
}
```

Expected adapter log shape:

```json
{
  "event": "agentid.mcp.authorization",
  "agent_id": "enterprise-support-agent",
  "tool": "provider.crm.search_customer",
  "action": "read",
  "resource": "cus_123",
  "job_id": "support_case_resolution",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "allowed": true,
  "decision": "allow",
  "findings": []
}
```

## 6. Deny a Sensitive Write Without JIT

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/denied-update-customer.json
```

AgentPass denies the call because `provider.crm.update_customer` is a
just-in-time write tool and no JIT grant is present.

Expected response shape:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32003,
    "message": "AgentPass denied MCP tool call",
    "data": {
      "findings": [
        "missing jit_grant_id",
        "event[0]: provider.crm.update_customer requires approval but event is not approved",
        "event[0]: provider.crm.update_customer requires JIT authorization but no jit_grant_id is present",
        "event[0]: JIT grant is marked invalid"
      ]
    }
  }
}
```

Expected adapter log shape:

```json
{
  "event": "agentid.mcp.authorization",
  "agent_id": "enterprise-support-agent",
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

Expected response shape, trimmed to the key fields:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "mock provider executed provider.crm.update_customer"
      }
    ]
  }
}
```

Expected adapter log shape:

```json
{
  "event": "agentid.mcp.authorization",
  "agent_id": "enterprise-support-agent",
  "tool": "provider.crm.update_customer",
  "action": "write",
  "resource": "provider/customer/cus_123",
  "job_id": "support_case_resolution",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "allowed": true,
  "decision": "allow",
  "findings": []
}
```

## 8. Retry the Same JIT Grant

Run the same request again:

```bash
curl -s http://127.0.0.1:8788 \
  -H 'content-type: application/json' \
  --data @mcp-gateway-adapter/examples/allowed-update-customer.json
```

The adapter denies the retry because JIT grants are single-use in this manifest.

Expected response shape:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32003,
    "message": "AgentPass denied MCP tool call",
    "data": {
      "findings": [
        "JIT grant was already used",
        "event[0]: JIT grant is marked invalid"
      ]
    }
  }
}
```

Expected adapter log shape:

```json
{
  "event": "agentid.mcp.authorization",
  "agent_id": "enterprise-support-agent",
  "tool": "provider.crm.update_customer",
  "action": "write",
  "resource": "provider/customer/cus_123",
  "job_id": "support_case_resolution",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "allowed": false,
  "decision": "deny",
  "findings": [
    "JIT grant was already used",
    "event[0]: JIT grant is marked invalid"
  ]
}
```

## What This Proves

The adapter demonstrates the upstream integration shape AgentPass should take:

- A gateway or router can enforce AgentPass before forwarding `tools/call`.
- Downstream MCP servers do not need to know about AgentPass.
- Tool-list filtering prevents unmapped tools from being advertised.
- Sensitive writes require scoped, short-lived authority.
- Decision logs give maintainers and security reviewers concrete audit evidence.

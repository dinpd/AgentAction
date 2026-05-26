# AgentID MCP Gateway Adapter

This is a reference MCP gateway adapter for enforcing AgentID checks before MCP
tool calls.

```text
MCP client -> AgentID MCP gateway adapter -> AgentID /authorize -> downstream MCP server
```

The adapter is intentionally small. It demonstrates the enforcement pattern
without trying to be a production MCP gateway.

## What It Does

- Accepts HTTP JSON-RPC requests.
- Proxies non-tool MCP methods to a downstream MCP server.
- Filters `tools/list` to tools configured in the adapter.
- Intercepts `tools/call`.
- Maps MCP tool name and arguments to an AgentID authorization event.
- Calls AgentID `/authorize`.
- Returns a JSON-RPC error when AgentID denies the call.
- Forwards allowed calls to the downstream MCP server.

## Run Locally

Install dependencies:

```bash
cd mcp-gateway-adapter
npm install
npm test
npm run build
```

Start an AgentID gateway:

```bash
agentid gateway ../examples/provider-mcp-support-agent.yaml --host 127.0.0.1 --port 8787 --api-key dev-token
```

Start the adapter:

```bash
npm run dev
```

The example config listens on `http://127.0.0.1:8788` and forwards allowed MCP
requests to `http://127.0.0.1:8790/mcp`.

For a complete local demo with a mock provider MCP server and sample JSON-RPC
requests, see [`../docs/mcp-gateway-demo.md`](../docs/mcp-gateway-demo.md).

## Config

See [`examples/config.json`](examples/config.json).

Each tool mapping tells the adapter how to build an AgentID authorize payload:

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

Those are the next pieces to add around this reference enforcement path.

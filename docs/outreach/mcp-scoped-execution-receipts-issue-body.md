# Example pattern for scoped execution receipts on high-risk provider tools

## Context

The MCP authorization spec covers OAuth-based access to protected MCP servers,
resource indicators, protected resource metadata, dynamic scopes, and important
confused-deputy protections. It also notes that required scopes may be
determined dynamically based on request arguments and context.

For provider-hosted MCP tools with meaningful blast radius, transport-level
authorization is necessary but not always sufficient. A provider often needs to
know whether the enterprise gateway authorized this exact agent-originated tool
call for the current user, job, case, customer, approval, and resource.

This is especially relevant for tools that mutate durable state, issue credits
or refunds, send external messages, change identity/permissions, export data, or
trigger downstream automations.

## Proposal

Would the project be open to a non-normative example pattern for scoped
execution receipts on high-risk provider tools?

For high-risk tools, provider-published metadata or an adjacent authorization
contract could declare the context required before execution:

```json
{
  "tool": "provider.crm.update_customer",
  "action": "write",
  "receipt_required": true,
  "requires_jit": true,
  "required_context": [
    "tenant_id",
    "agent_id",
    "user_id",
    "job_id",
    "case_id",
    "customer_id",
    "approval_id"
  ],
  "bind_receipt_to": [
    "tenant_id",
    "agent_id",
    "user_id",
    "tool",
    "action",
    "resource",
    "case_id",
    "customer_id",
    "approval_id"
  ],
  "receipt": {
    "ttl_seconds": 300,
    "single_use": true,
    "verification": "signed_or_introspected"
  }
}
```

When the enterprise gateway allows the call, it forwards a scoped receipt in the
tool request metadata or arguments:

```json
{
  "decision_id": "dec_123",
  "tenant_id": "acme-corp",
  "agent_id": "enterprise-support-agent",
  "user_id": "support-rep-17",
  "tool": "provider.crm.update_customer",
  "action": "write",
  "resource": "provider/customer/cus_123",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "approval_id": "approval-456",
  "jit_grant_id": "grant_789",
  "expires_at": "2026-06-03T18:00:00Z"
}
```

The provider MCP server verifies that the receipt is valid, fresh, and bound to
the exact tool call before applying its normal business authorization.

## Why this helps

This pattern gives providers a way to distinguish:

- a client that is allowed to reach the MCP server
- an agent action that was authorized by an enterprise gateway or app runtime
- a business operation the provider is willing to execute

It also creates a shared audit handle between enterprise authorization and
provider execution.

## Non-goals

- Do not replace OAuth or MCP authorization.
- Do not require a specific receipt issuer.
- Do not require a specific implementation or product.
- Do not make the provider receipt a business authorization override.
- Do not require the core protocol to standardize a full receipt schema in this
  issue.

## Related implementation

I have been working on AgentID, which implements this as provider-published MCP
authorization contracts, short-lived JIT grants, signed authorization receipts,
provider-side receipt verification, and provider execution receipts.

Reference: https://github.com/dinpd/AgentID/blob/main/docs/provider-mcp-authorization.md

If this pattern fits the project direction, I can turn this into a small docs PR
as an example/security consideration rather than a normative protocol change.

# Provider MCP Authorization

AgentID should cover both sides of the MCP authorization boundary:

- The enterprise side decides whether its agent may attempt a provider tool call.
- The provider side decides whether its MCP server should honor and execute that agent-originated call.

The provider side is not a replacement for the enterprise MCP gateway pattern in
[`mcp-gateway-integration.md`](mcp-gateway-integration.md). It is the other half
of the same control plane.

For provider-hosted MCP tools, the authorization contract should start with the
provider. The provider is the source of truth for what a tool does, which
arguments identify protected resources, what the blast radius is, which context
is required, and whether receipt verification is required before execution. The
enterprise then imports or reviews that provider contract and overlays local
agent policy: which agents, users, jobs, cases, customers, approvals, and data
flows are allowed.

```text
Enterprise Agent
  -> Enterprise MCP Gateway
  -> Enterprise AgentID authorization
  -> Provider MCP Server
  -> Provider AgentID receipt verification
  -> Provider business authorization
  -> Tool execution
```

## Standards Landscape

There is no complete standard yet for a provider-originated, per-tool
authorization contract for MCP tools with real blast radius.

Existing standards cover important pieces:

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  defines transport-level access to protected MCP servers using OAuth-style
  flows, protected resource metadata, resource indicators, scopes, and token
  validation.
- [MCP tool schemas](https://modelcontextprotocol.io/specification/2025-11-25/schema)
  define the input and output shapes for tool execution.
- MCP tool annotations describe behavioral hints such as `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint`. These are useful
  for client behavior and confirmation UX, but they are explicitly hints rather
  than trusted authorization contracts.
- [OAuth 2.0 Rich Authorization Requests](https://www.ietf.org/rfc/rfc9396.html)
  provide a standard way to carry structured authorization details, but the
  meaning of those details is API-specific and does not define MCP tool risk,
  resource binding, JIT approval, receipt verification, or provider execution
  audit semantics.

AgentID should treat those standards as foundations, not competitors. The gap is
the action-level MCP provider contract:

```text
provider tool -> action
tool arguments -> protected resources
required context -> authorization event
allowed approval/JIT state -> execution precondition
authorization receipt -> provider verification
provider execution receipt -> shared audit handle
```

In other words, OAuth can prove that a client may access the MCP server. MCP
schemas can prove what arguments the tool accepts. MCP annotations can hint at
tool behavior. AgentID should define the missing contract for whether this
agent-originated action, on this resource, for this job and approval state,
should be allowed to execute.

## Grounded Use Case

Use a provider-hosted CRM and billing MCP server for enterprise customer support
agents.

An enterprise support agent is resolving `case-1042` for customer `cus_123`.
The provider exposes MCP tools such as:

- `provider.crm.search_customer`
- `provider.crm.update_customer`
- `provider.billing.lookup_invoices`
- `provider.billing.issue_credit`

Read-only calls can usually be authorized through delegated enterprise policy.
Writes, billing credits, account changes, and identity-sensitive updates should
require approval plus short-lived just-in-time authority.

```text
Support agent asks to update customer billing email
  -> enterprise gateway checks the AgentID manifest
  -> enterprise gateway forwards the call with an authorization receipt
  -> provider MCP server verifies the receipt
  -> provider checks tenant, user, customer, and business rules
  -> provider executes or denies the tool call
```

This keeps the division of responsibility clear:

- The provider publishes the tool capability, risk, resource mapping,
  authorization requirements, and receipt-verification contract.
- The enterprise controls which agents may attempt provider tools, for which
  jobs, cases, customers, approvals, and data flows.
- The provider controls tenant isolation, user delegation, product-level
  authorization, rate limits, fraud checks, audit retention, and execution.

## Contract Ownership

The provider should publish the base contract first. This contract should travel
with the MCP server or be discoverable from provider metadata:

```text
Provider MCP contract
  -> tool schemas
  -> action and risk classification
  -> protected-resource mappings
  -> required authorization context
  -> receipt binding requirements
  -> JIT and approval expectations
  -> drift metadata
```

AgentID includes a draft JSON Schema for this contract at
[`../schema/provider-mcp-contract.schema.json`](../schema/provider-mcp-contract.schema.json).
Providers can expose that schema in published contract files with:

```yaml
$schema: https://raw.githubusercontent.com/dinpd/AgentID/main/schema/provider-mcp-contract.schema.json
```

The enterprise should consume that contract and produce a tenant-specific
AgentID manifest:

```text
Enterprise AgentID manifest
  -> allowed agents and users
  -> allowed jobs, cases, and customers
  -> allowed provider tools
  -> local approval workflow
  -> data-flow policy
  -> JIT grant policy
  -> enterprise audit requirements
```

This ordering avoids asking every enterprise customer to reverse-engineer the
same provider tool. It also lets providers mark high-blast-radius tools as
requiring receipt verification before any enterprise can enable them.

Receipt verification can be implemented several ways:

- raw JSON receipts for local development and fixtures
- signed receipt envelopes for direct provider verification
- introspection against an AgentID gateway or authorization service

The reference adapter supports a dependency-free HMAC-signed envelope for the
local provider demo. Production deployments should use managed keys, key
rotation, replay protection, and either signed JWS-style receipts or
introspection.

Provider contracts can also advertise a receipt profile in
`provider_agentid.receipt.profile`. The profile names the URI, canonicalization
rule, default bound fields, outcome vocabulary, and privacy-preserving basis
handling that verifiers should apply to scoped authorization receipts. See
[`receipt-profiles.md`](receipt-profiles.md) for the AgentID profile shape and
the `agentid_canonical_json_v1` canonicalization rule.

For local validation and CI tests, providers can verify a receipt without
running the mock server:

```bash
agentid provider verify-receipt examples/provider-signed-receipt.json \
  --secret dev-provider-receipt-secret \
  --require-signed \
  --tool provider.crm.update_customer \
  --resource provider/customer/cus_123
```

## When Provider-Side Auth Matters

Provider-side AgentID receipt verification is useful for most provider-hosted
MCP tools, but it becomes necessary when a tool has meaningful blast radius. A
provider should not rely only on the enterprise gateway for tools that can
change durable state, expose sensitive data, move money, contact third parties,
or affect other users and tenants.

Provider-side verification is **beneficial** when:

- The provider wants a consistent audit handle that ties tool execution back to
  an enterprise-side AgentID decision.
- The provider exposes read tools that return customer, account, ticket,
  billing, or operational data.
- The same MCP server supports multiple enterprise tenants or agent platforms.
- The provider wants to detect enterprise policy drift, tool schema drift, or
  unexpected use of newly exposed tools.
- The provider wants a safer onboarding path for customers before enabling
  higher-risk tools.

Provider-side verification is **necessary** when:

- The tool writes or mutates durable provider state.
- The tool can issue credits, refunds, payments, discounts, purchases, or other
  financial actions.
- The tool can send email, chat, notifications, webhooks, or other external
  communications.
- The tool can change identity, access, roles, permissions, API keys, tokens, or
  security policy.
- The tool can delete, archive, export, bulk update, or reassign data.
- The tool can trigger code execution, deployment, workflow runs, integrations,
  or downstream automations.
- The tool can access regulated, confidential, cross-tenant, or high-volume
  customer data.
- The tool's result can affect a customer relationship, legal obligation,
  compliance record, or production system.

The rule of thumb is:

```text
If a provider would require user confirmation, elevated permission, audit review,
or rate limiting in its normal UI/API, the provider-hosted MCP version should
verify a scoped AgentID authorization receipt before executing.
```

For low-risk tools, provider-side receipt verification can start in audit-only
mode. For high-blast-radius tools, it should be an execution precondition.

## Provider Tool Metadata

The provider should publish stable metadata for each MCP tool so enterprise
gateways do not have to infer risk from names and schemas alone.

```yaml
provider_agentid:
  provider: example-crm
  mcp_server: provider-crm-mcp
  tools:
    provider.crm.search_customer:
      action: read
      risk: low
      resource_template: provider/customer/{customer_id}
      data_from: provider_crm
      data_to: agent_context
      requires_jit: false

    provider.crm.update_customer:
      action: write
      risk: high
      resource_template: provider/customer/{customer_id}
      data_from: enterprise_crm
      data_to: provider_crm
      requires_jit: true
      approval: human_confirm
      authorization_requirements:
        required_context:
          - tenant_id
          - agent_id
          - user_id
          - job_id
          - case_id
          - customer_id
          - approval_id
        bind_receipt_to:
          - tenant_id
          - agent_id
          - user_id
          - tool
          - action
          - resource
          - case_id
          - customer_id
          - approval_id
        resource_arg: customer_id
        receipt_required: true
        receipt_ttl_seconds: 300

    provider.billing.issue_credit:
      action: write
      risk: high
      resource_template: provider/billing/customer/{customer_id}
      data_from: enterprise_billing_context
      data_to: provider_billing
      requires_jit: true
      approval: manager
      constraints:
        max_amount_usd: 100
```

This metadata should include enough information for an enterprise gateway to
build an AgentID authorization event:

- tool name
- action category
- resource template
- argument-to-resource mapping
- data source and destination
- risk tier
- approval and JIT expectations
- authorization requirements
- schema hash or version

## Authorization Requirements Schema

The provider should publish a schema that tells enterprise gateways what they
must supply to authorize and bind a tool call. This is separate from the normal
MCP tool input schema:

- The MCP tool input schema describes arguments needed to execute the tool.
- The authorization requirements schema describes context needed to authorize
  the tool and verify the forwarded receipt.

For example, `provider.crm.update_customer` may accept a simple tool input:

```json
{
  "customer_id": "cus_123",
  "patch": {
    "billing_email": "new@example.com"
  }
}
```

But the provider should also declare the authorization context required around
that input:

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
  "resource": {
    "template": "provider/customer/{customer_id}",
    "args": ["customer_id"]
  },
  "receipt": {
    "ttl_seconds": 300,
    "single_use": true,
    "verification": "signed_or_introspected"
  }
}
```

This lets the enterprise gateway fail closed before a tool call reaches the
provider. If the agent runtime cannot supply `case_id`, `customer_id`, or the
required approval, the gateway should not attempt the provider call.

The requirements schema should be machine-readable and versioned. At minimum,
it should define:

- required authorization context fields
- which MCP arguments map to resource, customer, account, amount, recipient, or
  other sensitive fields
- which fields must be bound into the authorization receipt
- whether a receipt is required, audit-only, or optional
- whether JIT authority is required
- receipt TTL and single-use expectations
- receipt profile URI, canonicalization rule, outcome vocabulary, and basis
  handling
- provider-side constraints such as amount limits, allowed operations, or
  recipient restrictions
- schema version, tool version, and schema hash for drift detection

## Authorization Receipt

After an enterprise gateway allows a provider MCP tool call, it should forward a
verifiable receipt with the MCP request. The provider can verify a signed
receipt locally or introspect it with the AgentID gateway.

```json
{
  "decision_id": "dec_123",
  "tenant_id": "acme-corp",
  "agent_id": "enterprise-support-agent",
  "user_id": "support-rep-17",
  "tool": "provider.crm.update_customer",
  "action": "write",
  "resource": "provider/customer/cus_123",
  "job_id": "support_case_resolution",
  "case_id": "case-1042",
  "customer_id": "cus_123",
  "approval_id": "approval-456",
  "jit_grant_id": "grant_789",
  "expires_at": "2026-05-28T20:15:00Z"
}
```

The provider-side verifier should reject the call if the receipt is missing,
expired, invalid, already consumed when single-use authority is required, or not
bound to the exact tool, action, tenant, resource, customer, case, and user in
the MCP request.

## Provider-Side Enforcement

Provider MCP servers should enforce three checks before executing a tool:

1. **Caller authentication**

   Validate the enterprise gateway, tenant, client, or mTLS/OAuth credentials
   that are allowed to call the provider MCP server.

2. **AgentID receipt verification**

   Verify that the enterprise authorized this exact agent-originated call. For
   JIT operations, verify the grant is scoped, fresh, and single-use where
   required.

3. **Provider business authorization**

   Apply the provider's normal product rules. For example: can this enterprise
   tenant access this customer, can this delegated user issue a credit, is the
   amount inside provider limits, and is the account eligible for the operation?

The provider should not treat an AgentID receipt as a business authorization
override. It is proof of enterprise-side agent authorization, not proof that the
provider must execute the operation.

## Tool Drift Contract

Provider-hosted MCP tools can change over time. Providers should expose enough
metadata for customers to detect meaningful drift:

```json
{
  "tool": "provider.crm.update_customer",
  "schema_hash": "sha256:...",
  "risk": "high",
  "version": "2026-05-28",
  "breaking_change": false,
  "introduced_at": "2026-05-28T00:00:00Z"
}
```

Enterprise gateways can compare this metadata against reviewed manifests and
deny or flag new tools, schema changes, newly sensitive arguments, and risk-tier
increases.

## Execution Receipt

After the provider executes or denies the tool, it should emit an audit receipt:

```json
{
  "provider_execution_id": "exec_789",
  "agentid_decision_id": "dec_123",
  "tenant_id": "acme-corp",
  "tool": "provider.crm.update_customer",
  "resource": "provider/customer/cus_123",
  "result": "executed",
  "provider_policy_version": "2026-05-28"
}
```

This gives the enterprise and provider matching audit handles for incident
review, customer support, compliance export, and dispute resolution.

## MVP Scope

The first provider-side implementation should stay narrow:

- Define a provider MCP metadata shape for CRM and billing tools.
- Add a mock provider MCP verifier that checks an unsigned receipt shape in
  local development.
- Extend the existing MCP gateway adapter demo to forward a receipt on allowed
  calls.
- Add provider-side denial examples for missing, expired, mismatched, and reused
  JIT receipts.
- Log provider execution receipts alongside existing gateway authorization logs.

Do not start by building a full provider IAM layer, OAuth authorization server,
or generalized entitlement engine. The MVP should demonstrate the boundary:
enterprise authorization receipt first, provider business authorization second,
execution only when both pass.

## Execution Plan

1. **Document the contract**

   Finalize the provider metadata schema, authorization receipt fields, execution
   receipt fields, and error semantics for provider-side denial.

2. **Add local reference code**

   Extend `mcp-gateway-adapter/examples/mock-provider.ts` with provider-side
   receipt verification. Keep it deterministic and in-memory for the demo.

3. **Forward receipts from the gateway adapter**

   Add an optional receipt builder after AgentID returns `allow`. Attach the
   receipt to the downstream MCP request in a reserved argument or metadata
   field.

4. **Expand demo fixtures**

   Add JSON-RPC examples for:

   - allowed CRM read
   - denied CRM write without enterprise JIT
   - denied provider execution with missing receipt
   - denied provider execution with mismatched resource
   - allowed CRM write with scoped receipt
   - denied receipt reuse

5. **Add tests**

   Cover receipt construction in the adapter, provider verification in the mock
   provider, and end-to-end allow/deny behavior.

6. **Promote to schema support**

   After the demo proves the shape, add optional manifest/schema support for
   provider metadata import, receipt requirements, and provider execution audit
   expectations.

7. **Harden for production**

   Replace unsigned local receipts with signed receipts or introspection, add
   key rotation, replay protection, clock-skew handling, structured provider
   errors, and audit export hooks.

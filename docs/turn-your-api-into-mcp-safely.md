# Turn Your API Into MCP, Safely

Authorization contracts for agent tools

Links:

- Code: [`github.com/dinpd/AgentAction`](https://github.com/dinpd/AgentAction)
- Demo: [`provider-mcp-demo.md`](provider-mcp-demo.md)
- Schema: [`provider-mcp-contract.schema.json`](../schema/provider-mcp-contract.schema.json)
- Example contract: [`provider-mcp-contract.yaml`](../examples/provider-mcp-contract.yaml)

MCP makes APIs callable by agents. That is useful, but it also changes the risk
model for API providers.

An API endpoint that used to be called from a product UI or a controlled backend
can now be exposed as an agent tool. The tool might search a customer record,
update billing details, issue a credit, send a message, trigger a workflow, or
delete data. A tool schema can describe the inputs, but it does not answer the
authorization question:

> Should this agent execute this action on this resource for this user, job,
> customer, approval, and time window?

That is the missing layer for provider-hosted MCP tools.

## API to MCP Is Not Enough

Most "turn your API into MCP" examples focus on tool exposure:

```text
API endpoint -> MCP tool schema -> agent can call it
```

That is fine for low-risk reads. It is not enough for tools with real blast
radius.

If a provider exposes tools like these, tool schemas alone are not sufficient:

- `provider.crm.update_customer`
- `provider.billing.issue_credit`
- `provider.email.send_message`
- `provider.identity.change_role`
- `provider.files.bulk_export`
- `provider.deployments.run_release`

These tools can mutate durable state, move money, contact third parties, change
permissions, export data, or trigger downstream systems. Providers should not
ask every enterprise customer to reverse-engineer the risk and authorization
requirements from a generic MCP schema.

The provider should publish the authorization contract.

## What Existing Standards Cover

The existing standards are useful foundations:

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  secures access to protected MCP servers using OAuth-style flows, scopes,
  resource indicators, and token validation.
- [MCP tool schemas](https://modelcontextprotocol.io/specification/2025-11-25/schema)
  describe the input and output shapes for tool execution.
- MCP tool annotations can provide hints such as `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint`.
- [OAuth 2.0 Rich Authorization Requests](https://www.ietf.org/rfc/rfc9396.html)
  can carry structured authorization details, but the meaning of those details
  is API-specific.

What is still missing is a provider-originated, per-tool contract for:

- what action the tool performs
- which arguments identify protected resources
- what authorization context the client must provide
- which fields must be bound into an authorization receipt
- whether approval or just-in-time authority is required
- what blast radius the tool has
- what provider-side constraints must still be enforced
- what audit receipt the provider should emit after execution

OAuth can prove that a client may access an MCP server. A tool schema can prove
what arguments a tool accepts. A tool annotation can hint at behavior. None of
those, by themselves, proves that this agent should execute this action on this
resource for this job.

## Start With the Provider Contract

For provider-hosted MCP tools, the authorization contract should start with the
provider.

The provider is the source of truth for:

- what the tool does
- whether the tool is read, write, admin, execute, or financial
- which arguments identify customer, account, amount, recipient, or resource
- which calls require approval or JIT authority
- which receipt fields must be bound before execution
- which provider-side business rules still apply

The enterprise then imports or reviews that provider contract and overlays local
policy:

- which agents may use the tool
- which users they may act for
- which jobs, cases, and customers are in scope
- which data flows are allowed
- which approval workflow issues JIT authority
- how decisions and executions are audited

The result is a two-sided authorization model:

```text
Provider publishes MCP tool contract
  -> enterprise imports and reviews it
  -> enterprise gateway authorizes the agent action
  -> provider MCP server verifies the receipt
  -> provider applies business authorization
  -> tool executes
```

## A Concrete Example: CRM and Billing

Imagine a SaaS provider exposing CRM and billing tools through MCP:

```text
provider.crm.search_customer
provider.crm.update_customer
provider.billing.lookup_invoices
provider.billing.issue_credit
```

A support agent at an enterprise customer is resolving `case-1042` for customer
`cus_123`.

Searching for a customer is a scoped read:

```yaml
provider.crm.search_customer:
  action: read
  risk: low
  resource_template: provider/customer/{customer_id}
  data_from: provider_crm
  data_to: agent_context
  requires_jit: false
```

Updating the customer has higher blast radius:

```yaml
provider.crm.update_customer:
  action: write
  risk: high
  resource_template: provider/customer/{customer_id}
  data_from: enterprise_crm
  data_to: provider_crm
  requires_jit: true
  approval: human_confirm
  receipt_required: true
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
      - job_id
      - case_id
      - customer_id
      - approval_id
      - jit_grant_id
    resource_arg: customer_id
    receipt_ttl_seconds: 300
    single_use: true
```

Issuing a credit adds financial constraints:

```yaml
provider.billing.issue_credit:
  action: write
  risk: high
  resource_template: provider/billing/customer/{customer_id}
  data_from: enterprise_billing_context
  data_to: provider_billing
  requires_jit: true
  approval: manager
  receipt_required: true
  constraints:
    max_amount_usd: 100
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
      - job_id
      - case_id
      - customer_id
      - approval_id
      - jit_grant_id
    resource_arg: customer_id
    amount_arg: amount_usd
    receipt_ttl_seconds: 180
    single_use: true
```

This contract tells the enterprise gateway what it must know before forwarding a
call. If the agent runtime cannot supply a `case_id`, `customer_id`, or required
approval, the gateway should fail closed.

## The Authorization Receipt

When the enterprise gateway allows a sensitive tool call, it forwards a scoped
authorization receipt to the provider MCP server:

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
  "issued_at": "2026-05-28T20:10:00Z",
  "expires_at": "2026-05-28T20:15:00Z"
}
```

The provider verifies that the receipt is valid, fresh, and bound to the exact
tool call. For JIT operations, the provider should reject missing, expired,
mismatched, or reused receipts.

The receipt does not replace provider authorization. It proves enterprise-side
agent authorization. The provider still checks tenant isolation, delegated-user
rights, product rules, rate limits, fraud limits, and account eligibility before
execution.

## The Execution Receipt

After the provider executes or denies the call, it should emit an execution
receipt:

```json
{
  "event": "agentid.provider.execution",
  "provider_execution_id": "exec_789",
  "agentid_decision_id": "dec_123",
  "tenant_id": "acme-corp",
  "tool": "provider.crm.update_customer",
  "resource": "provider/customer/cus_123",
  "result": "executed",
  "provider_policy_version": "2026-05-28"
}
```

Now both sides have an audit handle:

- the enterprise has the authorization decision and JIT grant
- the provider has the execution decision and product authorization result
- both can correlate on `agentid_decision_id`

That matters for compliance, incident review, customer support, and dispute
resolution.

## When This Should Be Required

Provider-side receipt verification can be audit-only for low-risk reads. It
should be an execution precondition for tools that can:

- mutate durable state
- issue credits, refunds, payments, discounts, or purchases
- send external messages or webhooks
- change roles, permissions, API keys, tokens, or security policy
- delete, archive, export, bulk update, or reassign data
- trigger code execution, deployments, workflows, or integrations
- access regulated, confidential, cross-tenant, or high-volume customer data

The rule of thumb is simple:

```text
If the provider would require confirmation, elevated permission, audit review,
or rate limiting in its normal UI/API, the MCP version should verify a scoped
authorization receipt before executing.
```

## What AgentAction Provides

AgentAction gives this pattern a concrete shape:

- provider-published MCP authorization contracts
- a provider MCP contract JSON Schema for editor and CI validation
- OpenAPI-to-provider-contract generation for auth-first onboarding
- enterprise-reviewed AgentAction manifests
- runtime authorization checks before tool calls
- short-lived JIT grants for sensitive actions
- authorization receipts bound to tool, action, resource, user, job, case, and
  approval
- provider-side receipt verification
- provider execution receipts for shared audit
- drift detection when provider tools or schemas change

The concrete path looks like this:

```text
OpenAPI description
  -> provider MCP authorization contract
  -> enterprise AgentAction manifest starter
  -> gateway authorization
  -> signed authorization receipt
  -> provider receipt verification
  -> provider business authorization
```

The goal is not to replace MCP authorization, OAuth, provider IAM, OPA, Cedar,
or enterprise security tools. The goal is to define the missing contract between
agent tool exposure and safe execution.

## Try the Pattern Locally

The reference flow is intentionally small:

```text
MCP client
  -> AgentAction MCP gateway adapter
  -> AgentAction /authorize
  -> mock provider MCP server
  -> provider receipt verification
  -> provider business authorization
```

The demo shows:

- a CRM read allowed
- a CRM write denied without JIT
- a provider write denied without a valid receipt
- a CRM write allowed with a scoped receipt
- receipt reuse denied
- a billing credit denied over provider limits
- provider execution receipts emitted as structured logs

Start with the provider demo:

- [`provider-mcp-demo.md`](provider-mcp-demo.md)

Useful commands:

```bash
agentaction provider schema > schema/provider-mcp-contract.schema.json

agentaction provider from-openapi examples/provider-openapi.yaml \
  --provider example-crm \
  --output provider-mcp-contract.yaml

agentaction provider validate examples/provider-mcp-contract.yaml

agentaction provider import examples/provider-mcp-contract.yaml \
  --agent enterprise-support-agent \
  --output generated-agent.yaml

agentaction provider verify-receipt examples/provider-signed-receipt.json \
  --secret dev-provider-receipt-secret \
  --require-signed \
  --tool provider.crm.update_customer \
  --resource provider/customer/cus_123
```

The reference adapter uses dependency-free HMAC receipts for the local demo and
CI-friendly fixtures. Production providers should use managed keys, key
rotation, replay protection, and either JWS/JWKS-style receipts or
introspection.

The implementation lives in:

- [`provider-mcp-authorization.md`](provider-mcp-authorization.md)
- [`mcp-gateway-integration.md`](mcp-gateway-integration.md)

The adoption message is:

> Turn your API into MCP, safely. Publish the contract, let enterprises review
> it, require scoped receipts for high-blast-radius actions, and keep provider
> business authorization in the execution path.

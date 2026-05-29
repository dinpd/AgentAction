# AgentID Ecosystem Positioning

AgentID exists to make agent tool execution reviewable, enforceable, and
auditable across provider-hosted MCP tools, enterprise MCP gateways, SaaS apps,
and internal systems.

The business requirement is simple:

> AgentID must make MCP and agent tool ecosystems safe enough for enterprise adoption by turning tool authority into a portable, reviewable, enforceable contract shared between providers and enterprises.

## The market gap

MCP makes APIs callable by agents. That is useful, but it changes the risk model
for every API provider and enterprise platform team.

OAuth can prove that a client may access an MCP server. MCP tool schemas can
describe the inputs a tool accepts. Tool annotations can hint at behavior. None
of those, by themselves, answers whether this agent should perform this action
on this resource for this user, job, customer, approval, and time window.

AgentID fills that gap with an authorization contract for agent tool execution.

## What AgentID is

AgentID is the agent authority layer between identity and execution:

```text
Agent or app runtime
  -> AgentID authorization contract and runtime check
  -> SaaS, internal, cloud, database, or MCP tool
```

For provider-hosted MCP tools, AgentID supports a two-sided model:

```text
Provider publishes MCP tool contract
  -> enterprise imports and reviews it
  -> enterprise gateway authorizes the agent action
  -> provider MCP server verifies the receipt
  -> provider applies business authorization
  -> tool executes
```

This lets providers describe tool blast radius and authorization requirements,
while enterprises overlay local policy for agents, users, jobs, cases,
customers, data flows, approvals, and JIT grants.

## What AgentID is not

AgentID is not:

- another API-to-MCP wrapper
- another MCP gateway
- another IAM system
- a replacement for OAuth, OIDC, or customer identity providers
- a replacement for OPA, Cedar, OpenFGA, or application authorization
- a replacement for provider-side tenant isolation and business rules
- a generic agent identity registry

AgentID should make existing systems more useful for agentic execution by giving
them a shared, reviewable contract for agent authority.

## Primary users

The first user is a SaaS or API provider that wants to expose write-capable MCP
tools to enterprise customers without asking those customers to accept broad,
ambiguous authority.

The second user is an enterprise AI platform or security team that needs a
reviewable contract before approving agents to use internal, SaaS, cloud,
database, or provider-hosted MCP tools.

MCP gateway builders are a third audience. They need a policy artifact and
runtime decision path before forwarding `tools/call` requests.

## Provider value

AgentID should help providers:

- make high-impact MCP tools acceptable to enterprise customers
- publish stable authorization requirements alongside tool schemas
- identify which tool arguments map to protected resources
- require scoped receipts before high-blast-radius execution
- keep provider business authorization in the execution path
- provide audit handles that connect enterprise authorization to provider
  execution
- reduce repeated security-review friction for each enterprise customer

The provider owns tool semantics. That means the provider is best positioned to
publish the base contract for action, risk, protected resources, receipt
bindings, approval expectations, and provider-side constraints.

## Enterprise value

AgentID should help enterprises:

- review agent authority before enabling tools
- import provider contracts instead of reverse-engineering risk from tool
  schemas
- constrain tool calls by agent, user, job, case, customer, resource, approval,
  and time window
- avoid broad standing authority for write, admin, execute, financial,
  external-send, deletion, export, and regulated-data actions
- enforce policy at an MCP gateway, app runtime, or internal tool boundary
- produce audit evidence for approvals, JIT grants, decisions, denials, and
  tool execution
- detect MCP tool drift before newly exposed tools become available to agents

## Relationship to the ecosystem

AgentID should complement, not compete with, the existing security stack.

Use OAuth and OIDC to prove caller identity and server access. Use MCP
authorization to protect MCP server access. Use MCP schemas to describe tool
inputs. Use OPA, Cedar, OpenFGA, IAM, and application authorization for business
object decisions. Use AgentID to define and enforce whether an agent-originated
tool action is eligible to proceed.

The clean boundary is:

- identity systems answer who is calling
- business authorization answers what the user or tenant may do
- AgentID answers what the agent may attempt, for this job and approval state
- the provider still decides whether the underlying business operation executes

## Adoption motion

The preferred adoption loop is:

1. Provider publishes `provider-mcp-contract.yaml`.
2. Enterprise validates and reviews the contract.
3. Enterprise imports it into a tenant or agent manifest.
4. Gateway or app runtime checks AgentID before tool execution.
5. Sensitive calls receive short-lived, scoped JIT authority.
6. Provider verifies the forwarded receipt before high-risk execution.
7. Both sides keep audit handles for review, support, and compliance.

The demo path should be runnable in minutes. The production path should map to
existing IdPs, gateways, policy engines, audit pipelines, and provider business
authorization.

## Trust requirements

AgentID must be credible to security reviewers:

- fail closed for ambiguous high-risk actions
- classify write, admin, execute, financial, external-send, delete, export,
  permission, and regulated-data tools as high blast radius by default
- require explicit approval and short-lived scoped authority for sensitive
  actions
- bind JIT grants and receipts to concrete agent, user, tool, action, resource,
  job, case, customer, approval, and expiration fields when present
- preserve provider-side authorization as mandatory
- make policy changes reviewable in pull requests
- produce audit records that security, compliance, platform, and provider teams
  can understand

## Success metrics

Useful success metrics include:

- a provider can publish a reviewed first AgentID MCP contract in under 30
  minutes
- an enterprise can validate, inspect, and import a provider contract in under
  10 minutes in the demo path
- high-risk provider tools are blocked by default unless JIT, approval, receipt,
  and binding requirements are present
- CI catches risky MCP tool drift before release
- gateway decisions produce audit records suitable for security review
- providers can give enterprise customers a clear authorization story for
  write-capable MCP tools

## Repeatable language

Short phrases that describe AgentID's role:

- Auth-first MCP
- Agent-safe API exposure
- MCP tools with blast-radius contracts
- Provider-verified agent actions
- Receipts for agent tool execution

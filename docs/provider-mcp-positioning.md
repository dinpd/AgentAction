# Provider MCP Positioning

The most tangible wedge is:

> Turn your API into an MCP server without giving agents a blank check.

Most "API to MCP" stories focus on exposing tools. AgentID should position the
missing step: if the tool can write, send, refund, delete, deploy, export, or
touch regulated data, the provider needs an authorization contract before
customers can safely let agents use it.

## Core Narrative

Providers want their APIs to be agent-accessible. Enterprises want those tools
available to agents without accepting broad, ambiguous authority.

AgentID bridges that gap:

```text
Provider publishes MCP tool contract
  -> enterprise imports and reviews it
  -> AgentID enforces agent, job, approval, JIT, and data-flow policy
  -> provider verifies the receipt before execution
  -> both sides get audit handles
```

This is different from generic MCP enablement. The pitch is not "we wrap your
API as tools." The pitch is "we make those tools safe enough to expose to
enterprise agents."

## Primary Article

Publish an article titled:

```text
Turn Your API Into MCP, Safely: Authorization Contracts for Agent Tools
```

Draft: [`turn-your-api-into-mcp-safely.md`](turn-your-api-into-mcp-safely.md)

Recommended outline:

1. MCP makes APIs callable by agents.
2. That creates a new problem: tool schemas describe inputs, not authority.
3. OAuth proves access to a server, but not whether this agent should execute
   this action on this resource for this job.
4. Providers should publish an MCP authorization contract with each high-impact
   tool.
5. Enterprises should import that provider contract and overlay local agent
   policy.
6. Sensitive calls should carry a scoped receipt that the provider verifies
   before execution.
7. Demo: CRM search is allowed, CRM update requires JIT, billing credit requires
   manager approval and provider-side amount checks.

The article should include code snippets for:

- provider tool metadata
- authorization requirements
- enterprise AgentID manifest entry
- forwarded authorization receipt
- provider execution receipt

End with a local demo command path rather than a sales CTA.

## Example Package

Build one complete example package around CRM and billing:

```text
examples/provider-mcp-contract.yaml
mcp-gateway-adapter/examples/mock-provider.ts
mcp-gateway-adapter/examples/*.json
docs/provider-mcp-demo.md
```

The package should show:

- provider publishes tool and authorization requirements
- enterprise imports or reviews the contract
- read call succeeds
- write call fails without enterprise JIT
- write call fails at provider without a valid receipt
- write call succeeds with a scoped receipt
- receipt reuse fails
- over-limit billing credit fails provider business authorization
- provider emits execution receipts

This gives users a working mental model in ten minutes.

## Integration Options

### 1. Provider Contract Manifest

Create `examples/provider-mcp-contract.yaml` as the canonical provider artifact.
It should include:

- tool names
- MCP input schema references or inline schemas
- action classification
- risk tier
- protected-resource mappings
- required authorization context
- receipt binding fields
- approval and JIT expectations
- provider-side constraints
- schema hash or version
- execution receipt expectations

### 2. Express/Node Provider Middleware

Ship a small TypeScript helper that provider MCP servers can use:

```ts
verifyAgentIdReceipt(request, {
  tool: "provider.crm.update_customer",
  resource: "provider/customer/cus_123",
  requiredBindings: ["tenant_id", "agent_id", "tool", "action", "resource"],
});
```

Start with local unsigned receipts for the demo. Make signed JWS or
introspection the production path. The reference adapter now also supports a
dependency-free HMAC-signed envelope for the local provider demo, which is a
bridge between raw fixtures and a production signing/introspection design.

### 3. Enterprise Gateway Adapter Receipt Forwarding

Extend the existing MCP gateway adapter to build a receipt after an AgentID
allow decision and forward it to the provider MCP server.

For the reference adapter, attach it in a reserved metadata field. Later, this
can become a signed token in an MCP metadata/header convention if the ecosystem
settles on one.

### 4. Contract Validator

CLI support:

```bash
agentid provider validate examples/provider-mcp-contract.yaml
agentid provider diff old-contract.yaml new-contract.yaml
```

The validator should catch missing resource mappings, missing receipt bindings
for high-risk tools, weak TTLs, and inconsistent action/risk labels. The diff
should catch added tools, removed tools, risk increases, action changes,
resource mapping changes, receipt binding changes, TTL changes, constraints
changes, and input-schema drift.

### 5. Contract Import

Add a generator:

```bash
agentid provider import examples/provider-mcp-contract.yaml \
  --agent enterprise-support-agent \
  --output examples/provider-mcp-support-agent.generated.yaml
```

The generated manifest should be a reviewable starting point, not an automatic
grant. It should mark high-risk tools as JIT by default.

### 6. OpenAPI to MCP Contract Bridge

For providers with existing OpenAPI specs, add a guided conversion:

```bash
agentid provider from-openapi openapi.yaml --output provider-mcp-contract.yaml
```

This does not pretend to infer everything. It infers operation names, HTTP
method-based actions, path-derived resources, request input schemas, and
conservative risk/JIT/receipt requirements for write, delete, admin, and
financial-looking operations. Providers still need to review action labels,
resource mappings, risk tiers, constraints, and receipt requirements.

## Adoption Hooks

Use concrete labels that users can repeat:

- "Auth-first MCP"
- "MCP tools with blast-radius contracts"
- "Agent-safe API exposure"
- "Provider-verified agent actions"
- "Receipts for agent tool execution"

Useful artifacts:

- a short article
- a ten-minute local demo
- a provider contract YAML example
- a mock provider with receipt verification
- a CLI validator
- a generated enterprise manifest
- a README badge such as "AgentID-ready MCP contract"

The first user should be a SaaS/API provider that wants to expose write-capable
MCP tools to enterprise customers. The second user is the enterprise AI platform
team that needs a reviewable contract before approving those tools for agents.

## Suggested Build Order

1. Add `examples/provider-mcp-contract.yaml`.
2. Add provider-side receipt verification to the mock provider.
3. Add receipt forwarding to the MCP gateway adapter.
4. Add JSON-RPC fixtures for the allow and deny cases.
5. Add tests around receipt construction, provider verification, and replay
   denial.
6. Add `docs/provider-mcp-demo.md`.
7. Add signed receipt or introspection support for the production path.
8. Publish the "Turn Your API Into MCP, Safely" article with the working demo.

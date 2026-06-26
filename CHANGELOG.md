# Changelog

## Unreleased

### Hosted PII egress gate

- Added hosted data-flow enforcement for classification, destination type,
  external domain, field set, record count, redaction state, and retention
  context.
- Added flow-level blocked-field, allowed-domain, max-record, and approval
  challenge handling for email and webhook PII exports.
- Bound non-JIT approved hosted actions to approval evidence and request digest
  so changed domains or field sets fail closed.

### Double-refund protection with result replay

- Added local tool-gate idempotency result replay for side-effectful actions.
- Added stable request digest validation so a used idempotency key cannot replay
  changed refund arguments.
- Added provider execution receipts for first execution and replayed results.
- Added hosted idempotency result records, `POST /execution-results`, replay
  responses from `/authorize`, and provider execution/replay audit events.
- Updated the approval console to record a provider result after execution and
  replay it on identical retry.
- Updated refund tests and demo to prove an identical retry returns the original
  result without running the provider mutation again.

### Hosted approval to single-use execution

- Added a durable approval queue endpoint with status filtering and expiration.
- Added the versioned `agentpass.approval-evidence.v1` contract across the
  local TypeScript guard, hosted gateway, JIT grants, TypeScript client, audit
  events, and approval console.
- Bound approval and JIT issuance to a canonical SHA-256 request digest covering
  the exact action scope and custom context.
- Required approver identity and a decision reason for hosted approval actions.
- Added approval-console controls for queue review, approval or denial, JIT
  issuance, one-time authorization, replay testing, and audit timelines.
- Added hosted lifecycle tests for queue listing, scope mismatch, expiration,
  single-use consumption, replay denial, and audit correlation.

## 0.2.0 - 2026-06-05

### Provider MCP authorization and receipts

- Added provider-side MCP authorization contracts for provider-published tool
  metadata, resource mappings, required context, receipt requirements, and
  provider constraints.
- Added provider MCP contract JSON Schema support, schema emission, validation,
  diffing, OpenAPI import, and enterprise manifest starter generation.
- Added provider MCP contract CI guidance and a copyable GitHub Actions
  workflow for provider contract validation and drift checks.
- Added provider authorization receipt verification for raw fixtures,
  HMAC-signed demo receipts, JWS/JWKS receipts, issuer and audience checks,
  remote JWKS fetching, JWKS cache TTLs, stale-on-error behavior, and key
  rotation refresh on unknown `kid`.
- Added provider receipt profile metadata with canonicalization, default binding,
  outcome, and privacy-preserving basis handling.
- Added provider contract validation for receipt profile defaults on high-risk
  tools.
- Added Express-compatible and FastAPI-compatible provider receipt verification
  middleware/helpers.
- Added a provider MCP authorization demo with local receipt verification,
  provider denial cases, replay handling, and provider execution receipts.

### MCP gateway and analyzer

- Added a TypeScript gateway client helper.
- Added the reference MCP gateway adapter for `tools/list` and `tools/call`
  authorization, argument mapping, denial responses, and structured decision
  logs.
- Added the MCP gateway adapter demo with a mock provider server.
- Added `agentpass mcp fetch` for fetching `tools/list` from HTTP MCP servers.
- Added `agentpass mcp analyze` for scoring saved MCP `tools/list` output.
- Added `agentpass mcp check` for CI-friendly MCP risk gates.
- Added `agentpass mcp diff` for detecting newly exposed tools and tool schema drift.
- Added `agentpass mcp ui` for writing a self-contained browser MCP analyzer.
- Added `agentpass mcp serve-ui` for localhost MCP analysis with local remote-fetch support.
- Added MCP analyzer UI compare mode and Markdown report export.
- Added MCP analyzer manifest snippet generation and JSON export support.
- Added a sample MCP `tools/list` response for analyzer testing.

### Authority model, skills, and policy

- Added job-boundary enforcement for binding tool calls to allowed jobs and
  out-of-scope checks.
- Added scoped agent-to-agent delegation checks for allowed agents, delegated
  tools, depth, and approvals.
- Added skill capability guardrails for skill-carried AgentPass contracts and
  allowed downstream tool invocation.
- Clarified AgentPass core concepts around skills, tools, flows, runtime
  authorization, and provider business authorization.

### Docs, standards, and positioning

- Added the getting-started guide, SaaS integration patterns guide, MCP gateway
  integration guide, provider MCP authorization guide, provider MCP positioning
  guide, and provider MCP demo guide.
- Added the "Turn Your API Into MCP, Safely" article and API-to-MCP adoption
  flow.
- Added ecosystem positioning material, visual assets, API monetization
  positioning, and MCP stable capability layer article.
- Added standards-alignment and outreach drafts for A2A, MCP, AGNTCY/OASF, and
  scoped authorization receipt feedback.
- Switched the project license to Apache 2.0.

## 0.1.2

- Added first-class just-in-time authorization support.
- Added `jit_authorization` section to the manifest.
- Added `auth_mode` support for tools: `delegated`, `service`, and `just_in_time`.
- Updated validation to require JIT configuration when tools use `auth_mode: just_in_time`.
- Updated risk scoring to reward short-lived JIT grants and penalize standing write/admin access.
- Updated audit checks for missing or invalid JIT grants.
- Updated OPA policy generation with starter JIT grant checks.

## 0.1.1

- Reframed AgentPass as an agent authority contract, not just an identity manifest.
- Added support for `intent`, `data_flows`, `delegation_chain`, `risk_tiers`, and `runtime`.
- Added validation warnings for missing runtime, intent, delegation-chain, and data-flow controls.
- Updated risk scoring to account for data-flow and agent-to-agent delegation risk.
- Updated audit checks for data-flow violations and agent-to-agent calls.
- Updated OPA policy generation with basic data-flow enforcement.

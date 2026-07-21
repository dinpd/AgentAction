# Changelog

## Unreleased

### Intent assurance

- Added versioned schemas for immutable per-job intent contracts and
  post-execution intent evaluation receipts.
- Added canonical intent hashing, typed deterministic predicates, evidence
  binding, outcome and constraint evaluation, execution-discipline metrics,
  and explicit indeterminate results for missing evidence.
- Bound optional intent identifiers and digests through guard decisions,
  approval evidence, local and hosted execution receipts, the TypeScript
  client, and MCP gateway authorization receipts.
- Added a runnable `support_refund.v1` intent demo and tests for completed,
  partial, noncompliant, indeterminate, and tampered-contract cases.
- Added a tenant-scoped hosted intent registry that canonically binds and
  freezes contracts, with idempotent registration and lifecycle reads.
- Made hosted intent-bound approval, JIT, authorization, and execution paths
  fail closed for incomplete, unknown, altered, expired, or job-mismatched
  contracts while preserving compatibility for unbound calls.
- Added durable decision, execution-receipt, observation, and job evidence plus
  a hosted evaluation endpoint and intent-filtered audit events.
- Replaced the Node-only intent hashing dependency with a portable synchronous
  SHA-256 implementation shared by local and Cloudflare runtimes.
- Added tenant-scoped trusted observation policies by issuer, intent profile,
  predicate, and verification method, with OIDC identity binding and RS256/JWKS
  signed-envelope verification.
- Added stable observation IDs, canonical payload digests, stored verification
  provenance, freshness enforcement, machine-readable failure reasons, and
  development-only unsigned input behind an explicit opt-in.
- Made exact observation retries idempotent without increasing evidence counts,
  rejected changed payloads under the same ID, ignored unverified observations
  during evaluation, and added value-redacted accepted/rejected/replayed audit
  events.
- Added preview and final intent-evaluation lifecycle APIs, canonical immutable
  evidence snapshots with per-source IDs/counts/digests, deterministic final
  receipts, idempotent finalization, evaluation history reads, and fail-closed
  late-evidence rejection.

### Provider trust gate

- Added hosted provider authorization receipts signed as RS256 JWS tokens on
  successful `/authorize` decisions when receipt signing is configured.
- Added public hosted JWKS endpoints at `/.well-known/jwks.json` and `/jwks`.
- Added Worker tests that verify receipt signatures, active `kid` selection,
  key-rotation JWKS publication, issuer/audience claims, grant-bound expiry, and
  request-digest binding.
- Updated the TypeScript SDK response type for hosted authorization receipts.

### Production deploy action gate

- Added hosted constraint enforcement for tool `required_context` and
  `allowed_values`.
- Added `POST /github-actions/dispatch` to authorize a scoped DevOps action,
  dispatch the bound GitHub Actions workflow, record the provider result, and
  replay identical retries without another dispatch.
- Added hosted production deploy and rollback tests covering read-only
  inspection, missing change request denial, production-only deploy scope,
  approval-bound commit drift denial, rollback-plan drift denial, JIT issuance,
  GitHub workflow dispatch, provider result recording, cached retry replay, and
  correlated audit events.
- Updated the approval inbox preview with structured deploy and rollback
  evidence bound to service, branch, commit, change request or incident,
  rollback plan, workflow, and idempotency key.

### Hosted PII egress gate

- Added hosted data-flow enforcement for classification, destination type,
  external domain, field set, record count, redaction state, and retention
  context.
- Added flow-level blocked-field, allowed-domain, max-record,
  allowed-redaction-state, and approval challenge handling for email, webhook,
  browser-form, model-provider, and file-export PII paths.
- Bound non-JIT approved hosted actions to approval evidence and request digest
  so changed domains or field sets fail closed.
- Added a preview PII egress review item to the hosted approval inbox.

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

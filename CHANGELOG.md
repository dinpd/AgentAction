# Changelog

## Unreleased

No changes yet.

## 0.9.8 - 2026-08-31

### Hermes runs in Jobs

- Finalize completed Hermes turns/runs as immutable, source-scoped Jobs under a
  server-owned observed-execution lifecycle profile.
- Keep source credentials write-only and bound to their registered tenant,
  source, and agent while making lifecycle retries deterministic.
- Label observed-execution Jobs separately from explicit semantic intent in the
  operator console and continue excluding prompts, arguments, and results.

## 0.9.7 - 2026-08-31

### Hermes plugin installation compatibility

- Make the AgentAction native plugin installable by the current official
  Hermes Agent release while preserving its v1 runtime hook contract.
- Keep the existing fail-open, privacy-safe shadow observability behavior and
  require no migration for existing deployments.

## 0.9.6 - 2026-08-31

### Workspace-aware activity filters

- Make disabled agent sources visibly revoked and remove token actions that no
  longer apply after disablement.
- Populate the Activity agent filter from the selected workspace's configured
  agent IDs, clearing selections that belong to another workspace or name a
  source instead of an agent.
- Label the exact-match Tool filter as optional and distinguish an unconnected
  event stream from a filtered query with no matches.

## 0.9.5 - 2026-08-31

### Focused operator overview

- Keep the synthetic nine-stage execution walkthrough in the public demo while
  removing it from authenticated operator consoles.
- Allow the shared console client to initialize and navigate when the optional
  demo lifecycle panel is absent.

## 0.9.4 - 2026-08-31

### Connected workspace setup hierarchy

- Put current-workspace connection, ingestion, and team setup ahead of actions
  for creating or joining another workspace.
- Collapse invitation redemption into a compact **Join another workspace**
  control for connected identities while keeping full onboarding visible for
  first-time users.

## 0.9.3 - 2026-08-31

### Reliable workspace invitation links

- Carry only a random, non-secret invitation identifier through Cloudflare
  Access so protected email links can auto-redeem after sign-in.
- Remove the identifier from browser history before redemption, bind the join
  to the exact verified invitee email, and preserve expiry and one-time use.
- Keep secret-bearing manual codes and previously issued fragment links as
  fallbacks.

## 0.9.2 - 2026-08-31

### Compact responsive header

- Keep the console brand, compact GitHub link, and account controls on one row
  at laptop and tablet widths instead of stacking the entire header.
- Use a two-row phone treatment and reserve full account stacking for very
  narrow screens, substantially reducing the space before console content.

## 0.9.1 - 2026-08-31

### Console account controls

- Added a same-origin Cloudflare Access logout action for operators who need to
  authenticate with another identity; the public demo keeps it hidden.
- Grouped workspace count, selection, management, identity, and session actions
  into a responsive account panel while keeping repository navigation separate.

## 0.9.0 - 2026-08-31

### Workspace invitation onboarding

- Deliver owner-created viewer/operator invitations through Cloudflare Email
  Service with workspace, inviter, role, expiry, Access sign-in guidance, and a
  one-time fallback code.
- Auto-redeem protected invitation links after Cloudflare Access authenticates
  the exact invited email, while removing the secret-bearing fragment before
  any redemption request.
- Preserve invitations and expose manual fallback instructions when email
  delivery is unavailable or fails.
- Restrict additional workspace creation to existing workspace owners while
  still allowing an identity with no memberships to create its first workspace.
- Show integration-specific Hermes or generic AgentAction connection steps in
  the operator console.

## 0.8.1 - 2026-08-31

### Workspace adoption

- Persist directory-mode state on the adopted principal membership so a fresh
  production session reliably enables workspace switching after adoption.
- Upgrade an already-adopted owner membership idempotently when the owner
  repeats the action; the mode remains scoped to the exact Access issuer and
  subject.
- Make the hosted SaaS console explicitly directory-backed so a legacy static
  tenant variable preserved by Cloudflare deployment settings cannot keep the
  workspace selector pinned.

## 0.8.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.8.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing SSO-pinned tenant claims remain fixed until an owner explicitly
  enables workspace switching. The one-way adoption preserves the existing
  manifest, sources, credentials, and activity data.
- Existing tenant/source API names and `agentpass.*` protocol identifiers remain
  compatible. npm packages retain their independent versions.

### Workspace switching and agent connections

- Added an always-visible authenticated workspace control and directory-backed
  switching among only the operator's server-authorized memberships.
- Added an owner-only UI action that adopts the current SSO-pinned workspace as
  a directory-owned membership. Migration is idempotent and scoped to the
  verified Access principal; other identities remain pinned.
- Kept create and invitation-redeem actions available after a workspace is
  selected so operators can manage multiple workspaces without changing Access
  configuration.
- Generalized Connect agents so workspace creation is framework-neutral.
  Hermes is the first named integration, alongside a generic AgentAction source,
  and integration configuration is shown only after a source is selected.

## 0.7.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.7.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing enforcement, shadow Activity, intent assurance, signed tenant
  claims, and versioned `agentpass.*` protocol identifiers remain compatible.
  Existing single-tenant consoles can keep `CONSOLE_STATIC_TENANT_ID`; SaaS
  deployments omit it and use directory-backed memberships.
- The console's service credential should now match the gateway's separate
  `AGENTID_INTERNAL_SERVICE_TOKEN`. `AGENTID_GATEWAY_TOKEN` remains a console
  compatibility alias. npm packages retain their independent versions.

### Self-service observability SaaS

- Added a durable tenant directory with isolated tenant records, owner,
  operator, and viewer memberships, email-bound expiring single-use
  invitations, and signed-claim compatibility.
- Added private internal-service-only tenant provisioning and activity-source
  lifecycle APIs. Tenant creation returns the first source secret once;
  rotation invalidates the prior token, disabling stops new ingestion, and only
  SHA-256 secret digests are persisted.
- Added an Access-authenticated Setup view for tenant creation, invitation
  redemption, tenant switching, Hermes configuration, ingestion-health checks,
  role-aware source controls, invitations, and members. The public demo cannot
  call any onboarding route.
- Renamed the general console chrome to **AgentAction Observability**. Activity
  remains the operational surface, while intent contracts and finalized Jobs
  remain the explicit intent-relative assurance surfaces.

## 0.6.0 - 2026-08-31

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.6.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing enforcement, MCP observe mode, intent assurance, operator-console
  authentication, and versioned `agentpass.*` protocol identifiers remain
  compatible. No migration is required.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Hermes shadow observer

- Added a native Hermes plugin with fail-open model, tool, API, and subagent
  lifecycle hooks, stable Hermes correlations, counterfactual tool decisions,
  bounded asynchronous batching, and a profile-scoped retry spool.
- Excluded prompts, messages, tool arguments, terminal commands, tool results,
  provider bodies, and subagent goals/summaries from the exported schema.
- Added optional explicit intent ID/digest binding. Unbound traffic stays named
  as unbound; prompt text and model-generated goals are never promoted into
  authoritative intent.

### Multi-tenant activity observability

- Added tenant- and source-scoped hashed ingestion credentials, strict batch
  and event validation, bounded payloads and retention, idempotent replay, and
  conflict rejection in tenant-isolated durable stores.
- Added a tenant-scoped Activity API and an Access-protected Activity console
  with bounded agent, event, tool, shadow-decision, execution, and explicit
  intent-binding filters.
- Kept browser routes read only and ingestion credentials server-side. The
  public console demonstrates Activity with synthetic fixtures only and has no
  live gateway binding or credential.

## 0.5.0 - 2026-08-30

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.5.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing operator-console authentication, tenant isolation, gateway routes,
  schemas, CLI behavior, package aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible. No migration is required.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Public observability demo

- Added a separately deployable public observability console backed only by
  bundled synthetic fixtures, with no production service binding, gateway
  credential, tenant selection, audit routes, or approval routes.
- Reused the production Fleet Overview, finalized Jobs explorer, Job detail,
  filters, and deterministic evidence timeline without weakening the existing
  Cloudflare Access-protected operator console.
- Added automated boundary coverage and independent Wrangler configuration for
  the public Worker.
- Surfaced the public demo and protected operator sign-in in the main README,
  console documentation, and AgentAction.dev while keeping richer OpenTelemetry
  causal correlation labeled as roadmap work.

## 0.4.0 - 2026-08-26

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.4.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- MCP gateway enforcement remains the default. Observe mode is explicitly
  enabled with `"mode": "observe"`, so existing configurations require no
  migration.
- Existing `agentpass` and `agentid` CLI aliases, Python import paths,
  AgentPass-named public API aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible.
- npm packages retain their independent versions and are not republished by
  this repository release.

### MCP gateway onboarding and policy testing

- Added a passive observe mode to the reference MCP gateway adapter. It uses the
  local stateful guard to evaluate representative traffic without filtering
  tool discovery, blocking tool calls, calling hosted authorization, consuming
  hosted approval or JIT state, or attaching provider receipts.
- Added privacy-safe `agentaction.mcp.observation` events with evaluation status,
  counterfactual allow, deny, or challenge decisions, normalized findings, and
  downstream outcome while excluding raw tool arguments and results.
- Made observe mode isolate missing identity, missing mappings, local evaluator
  failures, and caller-provided log-sink failures so onboarding traffic remains
  transparent. Enforce mode retains its existing fail-closed behavior.
- Added regression coverage for transparent request forwarding, stateful
  duplicate detection, identity and mapping failures, evaluator isolation, no
  hosted authorization or receipt mutation, and existing enforcement behavior.
- Added a runnable `npm run demo:observe` example and documented the deliberate
  transition from representative observation to enforcement.

## 0.3.0 - 2026-08-25

### Upgrade and compatibility

- The canonical GitHub and Python distribution version is `0.3.0`; install the
  wheel attached to the GitHub release until trusted PyPI publishing is
  configured.
- Existing `agentpass` and `agentid` CLI aliases, Python import paths,
  AgentPass-named public API aliases, and versioned `agentpass.*` protocol
  identifiers remain compatible. No migration is required for existing users.
- npm packages retain their independent versions and are not republished by
  this repository release.

### Project identity

- Renamed the project, repository references, Python distribution metadata, primary CLI,
  GitHub Action, active documentation, and public APIs to AgentAction to align
  with [AgentAction.dev](https://agentaction.dev/).
- Retained the `agentpass` and `agentid` CLI aliases, AgentPass-named public API
  aliases, existing Python import paths, and versioned `agentpass.*` protocol
  identifiers for compatibility.
- Chose the collision-free `agentaction-dev` Python distribution name because
  the bare `agentaction` name is already owned by an unrelated PyPI project.

### Hosted observability console

- Added a dedicated Cloudflare Worker UI/BFF foundation with verified Access
  JWT identity, signed tenant-claim isolation, a private gateway service
  binding, read-only route/query allowlists, sanitized freshness states, and no
  browser-visible gateway credentials.
- Added an accessible responsive console shell, production and fail-closed
  local-development configuration, security-boundary tests, conditional
  Cloudflare deployment workflow, and operator setup and smoke-check guidance.
- Added the profile-scoped Fleet Overview with bounded UTC and
  profile/agent/verdict/constraint filters, separate immutable profile groups,
  outcomes, constraints, evidence confidence, execution discipline, query
  coverage, exclusions, and explicit small-sample and data-quality findings.
- Added normalized freshness age metadata, loading/empty/partial/stale/error
  presentation, a two-version support-refund fixture server, safe-rendering and
  interaction tests, and desktop/narrow-width runtime verification.

### Intent assurance

- Added privacy-safe `agentpass.decision-basis.v1` records, deterministic
  gateway policy bases, opt-in practitioner prompt guidance, and immutable
  `agentpass.intent-evidence-snapshot.v2` finalizations while retaining the V1
  snapshot schema for compatibility.
- Added tenant-scoped `agentpass.intent-quality-rollup.v1` aggregation over
  immutable final receipts, with bounded windows, exact profile-version/digest
  grouping, agent/verdict/compliance filters, group pagination, explicit
  exclusions, minimum-sample findings, confidence distributions, and
  execution-discipline metrics.
- Added frozen, tenant-scoped `agentpass.intent-profile.v1` definitions with
  canonical profile digests, typed variables, deterministic contract issuance,
  trusted-observation requirements, version lifecycle reads, and a reference
  `support_refund.v1` profile.
- Added `registered_profile_required` and `raw_compatible` tenant issuance
  modes, profile version/digest propagation on contracts and evaluation
  receipts, TypeScript client methods, and audit events for profile
  registration and issuance replay.
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
- Added `agentaction mcp fetch` for fetching `tools/list` from HTTP MCP servers.
- Added `agentaction mcp analyze` for scoring saved MCP `tools/list` output.
- Added `agentaction mcp check` for CI-friendly MCP risk gates.
- Added `agentaction mcp diff` for detecting newly exposed tools and tool schema drift.
- Added `agentaction mcp ui` for writing a self-contained browser MCP analyzer.
- Added `agentaction mcp serve-ui` for localhost MCP analysis with local remote-fetch support.
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

# AgentAction Gateway Product Requirements

**Status:** Design-partner draft

**Last updated:** 2026-08-18

**Related:** [Action Gate Roadmap](action-gate-roadmap.md),
[Project Positioning](positioning.md), and
[Standards Crosswalk](agentic-identity-standards-crosswalk.md)

## Product Summary

AgentAction Gateway is the enterprise deployment surface for AgentAction's
action-authorization and execution-assurance boundary. It provides one governed
ingress while preserving two independently controlled paths:

```text
model request -> company constraints -> qualified-model routing -> model response
tool action   -> exact-action policy -> allow / deny / challenge -> execute once -> evidence
```

![AgentAction Gateway illustration: one enterprise request enters a governed gateway, then separates into model routing and exact-action authorization paths that converge into shared evidence.](agentaction-gateway-overview.png)

*One governed ingress, two independently controlled paths, and shared evidence
closure.*

The gateway is not a generic inference proxy with an audit feature. Its
differentiator is deterministic control and evidence for consequential actions;
routing, caching, and cost optimization make that boundary easier to adopt.

## Problem Statement

Companies are connecting multiple models, agents, MCP servers, SaaS APIs, and
internal tools faster than platform and security teams can govern them.
Existing controls are fragmented:

- inference gateways optimize cost and availability but do not authorize an
  exact consequential action;
- IAM and OAuth establish access but do not evaluate payload, job state,
  approval, prior execution, or destination at call time;
- prompts and model guardrails influence behavior but are not enforcement; and
- retries, fallbacks, and agent loops can repeat side effects or fragment
  evidence across systems.

Enterprises need a deployable control point that reduces AI operating cost
without weakening action safety, data policy, or evidence quality.

## Value Proposition

> Route each request to an approved, cost-effective model, apply company policy
> before data leaves or tools execute, retry without repeating side effects,
> and preserve evidence from selection through execution.

The product creates value through:

1. **Control:** company policy across providers, models, tools, destinations,
   data classes, budgets, and exact actions.
2. **Economics:** least-cost selection only after privacy, region, capability,
   quality, and risk constraints are satisfied.
3. **Reliability:** eligible inference caching, safe fallback, and replay of a
   prior action result without repeating the side effect.
4. **Assurance:** correlated routing, policy, approval, execution, replay, and
   outcome evidence.

## Target Customer And Users

The initial customer is a mid-market or enterprise organization running
production agents or MCP workflows across multiple models or providers, with at
least one consequential action such as a refund, outbound message, record
mutation, deployment, privileged command, or sensitive-data transfer.

| User | Primary job |
| --- | --- |
| AI platform lead | Standardize model and tool access without mandating one agent framework |
| Security or identity lead | Enforce policy from verified identity, workload, job, approval, and resource context |
| Agent developer | Adopt one compatible endpoint with actionable allow, deny, challenge, and replay behavior |
| FinOps or engineering leader | Reduce spend without silently degrading quality or violating constraints |
| Risk and assurance team | Explain why a route or action was allowed and what executed |

## Goals

- Onboard one consequential workflow without rewriting the agent loop.
- Make observe mode valuable before enforcement.
- Keep routing optimization subordinate to enterprise constraints and quality
  gates.
- Make duplicate-action prevention and provider-result replay first-class
  safety properties.
- Support managed, customer-controlled, and existing-gateway deployments with
  consistent policy and evidence semantics.
- Reuse established standards instead of creating a proprietary agent protocol.

## Non-Goals

- Replacing IAM, OAuth, provider business authorization, MCP authorization,
  OPA, Cedar, or existing network gateways.
- Treating a system prompt or model refusal as proof of enforcement.
- Selecting the cheapest model without a qualified-model evaluation.
- Providing a universal semantic cache for sensitive or cross-tenant content.
- Building a new agent framework, model provider, or general observability
  platform.

## Product Principles

1. **The action is the unit of control.** Optimization cannot bypass exact-action
   authorization.
2. **Constraints precede cost.** Approved provider, privacy, residency,
   capability, quality, and risk filter the model pool before ranking.
3. **Context is not authority.** Company prompts are versioned inputs; policy
   decisions live outside the model.
4. **Inference caching is not action replay.** They use different keys,
   isolation rules, evidence, and failure modes.
5. **Observe before enforce.** Policy begins with evidence from real traffic.
6. **Proof follows execution.** Authorization links to, but remains distinct
   from, execution and outcome evidence.

## Scope And Status

| Stage | Included capabilities |
| --- | --- |
| Available foundation | Exact-action decisions; approvals and JIT grants; tenant manifests; data-flow and budget controls; digest-bound idempotency and result replay; signed receipts; provider middleware; MCP reference integration |
| Design-partner launch | Managed ingress; OpenAI-compatible model requests; current MCP `tools/call`; tenant-approved routing; observe and enforce modes; corporate policy and company context; action control, replay, evidence export, identity, credentials, and scoped administration |
| Later direction | Evaluation-driven least-cost routing; semantic cache; route recommendations; quality monitoring; customer-controlled data planes; broader model, MCP, A2A, workload-identity, revocation, and transparency support |

Available components are proof and integration assets, not yet a complete
commercial gateway lifecycle.

## Product Requirements

### 1. Tenant And Identity Isolation

Every request must resolve a tenant before policy, credentials, cache, state, or
evidence is accessed. OAuth/OIDC validation must bind issuer, audience,
protected resource, scopes, tenant, and principal. Provider credentials remain
encrypted, tenant-scoped, auditable, and unavailable to prompts or model output.

### 2. Model Governance And Routing

Administrators define approved providers, models, regions, data terms,
capabilities, tool support, quality thresholds, and budgets. Launch routing may
be deterministic or priority-based but records requested and actual model,
route reason, fallback, and policy version. Automated least-cost routing
requires a workload evaluation set and may never relax privacy, residency,
quality, or approved-model constraints.

### 3. Corporate Policy And Company Context

Policy covers provider, model, tool, action, resource, destination, data class,
amount, budget, job state, approval, and prior execution. It supports observe,
challenge, deny, and allow with versioned, reviewable decisions. Company system
context is separately versioned and recorded; it may guide a model but cannot
grant authority or override a policy or provider denial.

The gateway deterministically records the normalized basis of its own policy
decisions. An optional practitioner prompt may request a self-asserted proposal
basis, but the gateway does not silently inject that prompt or treat the model's
response as policy, authorization, or outcome evidence.

### 4. Smart Inference Cache

Exact-cache keys include tenant, request, model parameters, tool schema,
company-context version, policy version, region, and cache-policy version.
Eligibility defaults off for sensitive or regulated traffic, non-deterministic
tool use, or incompatible provider terms. Entries never cross tenant, identity,
region, or policy boundaries. Semantic caching is later scope and requires
workload evaluations, similarity thresholds, and false-hit monitoring.

### 5. Action Deduplication And Replay

An idempotency key binds to the canonical digest of the exact action, tenant,
principal, resource, policy, and relevant job or approval context. Consumption
is atomic. A matching retry returns the recorded provider result or known state
without repeating the side effect; a changed digest or incompatible context
fails closed. Model caching never proves execution or prevents duplicate
actions.

### 6. Evidence And Privacy

Each request receives stable correlation across route, policy, approval,
dispatch, replay, provider execution, and outcome. Evidence identifies actual
target, context and policy versions, decision, reason, timing, and replay state.
Prompt content, arguments, and results are omitted or redacted by default.
Tenants can export privacy-safe audit events and OpenTelemetry traces.

### 7. Onboarding And Administration

A tenant connects identity and existing provider credentials, enters observe
mode, inventories models, tools, costs, data flows, retries, and action
candidates, then applies and simulates a versioned baseline before enforcement.
Denials and challenges provide safe remediation without revealing policy
internals.

### 8. Deployment And Failure Behavior

Managed, customer-controlled, and existing-gateway integrations must preserve
the same policy and evidence semantics. Initial seams include OpenAI-compatible
APIs, Anthropic Messages, MCP, Envoy external authorization, and
agentgateway-style MCP processing. Model traffic may use an approved fallback;
consequential actions fail closed when trusted context is missing.

## Enterprise Onboarding Flow

1. **Select** one workflow, owner, model pool, and consequential action.
2. **Connect** identity, credentials, endpoint, and evidence destination.
3. **Observe** routing, cost, data, retries, and actions without blocking.
4. **Model** the approved pool, company context, cache eligibility, and policy.
5. **Simulate** recorded metadata against policies and evaluations without
   re-executing side effects.
6. **Enforce** routing constraints and challenge or deny for the selected action.
7. **Expand** only after the workflow meets reliability and evidence gates.

## Interoperability

Launch compatibility targets OpenAI Responses and Chat Completions, Anthropic
Messages, MCP `2026-07-28`, OAuth/OIDC, OpenID AuthZEN 1.0, W3C Trace Context,
versioned OpenTelemetry GenAI conventions, JOSE JWS/JWKS, canonical action
digests, Envoy external authorization, and agentgateway ExtMCP-style seams.

Design compatibility preserves extension points for A2A 1.0, WIMSE/SPIFFE,
ID-JAG and transaction tokens, Shared Signals, Kubernetes Gateway API Inference
Extension, and SCITT/COSE. Draft compatibility is directional and does not
imply certification.

## Pilot Success Measures

These are initial design-partner exit targets, not current production claims.

| Measure | Initial target |
| --- | --- |
| First observe-mode traffic | Within one business day after access is available |
| First enforced workflow | Within five business days after traffic discovery |
| Approved-route adherence | 100% of evaluated requests remain inside configured provider, model, privacy, region, and capability constraints |
| Duplicate-action safety | Zero repeated side effects in retry and concurrency acceptance tests |
| Action evidence coverage | 100% of in-scope actions link decision, dispatch or replay, and provider result state |
| Cross-tenant isolation | Zero cache, credential, policy, state, or evidence crossover in acceptance tests |
| Routing economics | Material cost reduction without breaching the agreed workload quality threshold before automated routing |
| Operating adoption | Partner can change a policy, investigate a denial, and export evidence without project-team intervention |

Latency, availability, retention, and support objectives must be set from
representative pilot traffic.

## Commercial Packaging Hypothesis

- **Open-source proof:** guards, contracts, adapters, fixtures, and conformance
  cases reduce adoption risk.
- **Managed Gateway:** paid governance plane and ingress with tenant policy,
  durable state, approvals, routing, evidence, and support.
- **Enterprise deployment:** customer-controlled data plane, private
  connectivity, advanced identity and policy integration, retention controls,
  and enterprise support.

The sales motion lands on one consequential workflow, then expands through
demonstrated action safety, governance consistency, and model-economics
evidence. Pricing remains an open decision.

## Risks And Open Decisions

| Risk | Mitigation |
| --- | --- |
| Commodity gateway positioning | Lead with exact-action control, safe replay, and provider-verifiable evidence |
| Cost routing degrades quality | Approved pools, workload evaluations, thresholds, route reasons, and rollback |
| Prompts are mistaken for policy | Separate versioned context from trusted enforcement |
| Cache leakage or staleness | Default-deny eligibility, tenant-scoped keys, versioning, TTLs, and purge controls |
| Retries repeat side effects | Atomic digest-bound state and provider-result replay |
| Sensitive data concentration | Minimal retention, redacted telemetry, isolated credentials, and customer-controlled deployment |
| Standards change | Version interfaces, label maturity, and avoid certification claims |

Open decisions are the initial data plane strategy, evaluation thresholds,
whether exact caching belongs in launch scope, required credential patterns,
customer-controlled data boundaries, pilot service commitments, pricing, and
the durable boundary between open-source AgentAction assets and the commercial
AgentAction Gateway.

## Release Gates

| Gate | Exit condition |
| --- | --- |
| G0: Product path | Website, PRD, and roadmap distinguish available proof from product direction |
| G1: Action gateway | Current MCP traffic demonstrates observe and enforce with durable decisions, replay, and evidence |
| G2: Enterprise pilot | A partner completes connect, observe, simulate, enforce, investigate, and export for one workflow |
| G3: Qualified routing | Automated routing meets approved-pool, quality, cost, stickiness, and evidence gates |
| G4: Deployment choice | Managed and customer-controlled paths demonstrate equivalent policy and evidence semantics |

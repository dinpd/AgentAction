# AgentPass Project Positioning

## Category

**Action authorization and execution assurance for AI agents.**

AgentPass is an action-control and evidence layer outside the agent loop. It
decides whether a specific agent action may execute and preserves durable,
independently verifiable evidence of what was authorized and executed.

The canonical one-sentence promise is:

> AgentPass controls consequential AI agent actions and produces independently
> verifiable evidence of what was authorized and executed.

## Product Hierarchy

### 1. Runtime Authorization And Control

This is the core product. AgentPass evaluates the exact tool, arguments,
resource, principal, agent, job state, approval, budget, data-flow boundary,
and prior execution state immediately before dispatch. It can allow, deny, or
challenge the action and can prevent unsafe retries and duplicate effects.

### 2. Portable Provider Trust And Interoperability

This is the cross-boundary differentiator. Signed, action-bound authorization
evidence lets an MCP server, SaaS API, or other provider independently verify
the decision before applying its own business authorization. Public mappings,
fixtures, reference verifiers, and conformance suites make that behavior
testable across implementations.

### 3. Execution And Outcome Assurance

This completes the lifecycle. Provider execution receipts, immutable evidence,
verified observations, causal traces, and intent assessments establish what
happened after authorization and whether the intended outcome was achieved
within constraints.

The layers compose as:

```text
Identity and workload context
  -> runtime authorization and control
  -> portable provider verification
  -> execution and outcome assurance
```

## Capability Story

Lead with operational control:

- stateful policy at the tool-execution boundary;
- exact-action approvals and step-up authorization;
- idempotency, replay protection, budgets, and circuit breakers;
- PII and sensitive-data movement controls; and
- explainable decisions and durable audit evidence.

Then explain the differentiator:

- authorization evidence bound to the exact action;
- independent verification across organizational or provider boundaries;
- linked execution closure and outcome evidence; and
- open interoperability fixtures and conformance tests.

## Audience Entry Points

| Audience | Lead with |
|---|---|
| Enterprise and security teams | Control consequential agent actions with policy, approvals, state, and audit |
| Agent and application developers | Add a small authorization boundary around existing tool calls |
| MCP gateway and platform builders | Enforce consistent action policy before forwarding `tools/call` |
| SaaS, API, and MCP providers | Independently verify action-specific authorization before mutation |
| Risk, compliance, and assurance teams | Link authorization, execution, observations, and assessment evidence |
| Standards and open-source communities | Reusable mappings, test vectors, profiles, and implementation feedback |

## Standards And Open-Source Strategy

Identity establishes the actors. Policy decides. AgentPass enforces and proves
the authority for a specific action, then links it to execution evidence.

AgentPass reuses OIDC, OAuth, AuthZEN, SPIFFE, WIMSE, MCP authorization, JOSE,
HTTP Message Signatures, Shared Signals, and provenance work where applicable.
Its standards role is to contribute mappings, negative fixtures, reference
implementations, conformance tests, and narrowly scoped profiles before
proposing new vocabulary.

Conformance is how AgentPass proves portability; it is not the product
category. Passing an AgentPass suite means agreement with experimental
AgentPass reference cases, not certification by an external standards body.

## What AgentPass Is Not

AgentPass is not:

- an identity provider or universal agent registry;
- a new DID method or OAuth replacement;
- a replacement for MCP authorization, AuthZEN, SPIFFE, WIMSE, OPA, or Cedar;
- a substitute for provider business authorization;
- a prompt-safety system controlled by the model; or
- an observability product that merely records an action after it occurs.

## Messaging Guardrails

- Lead with concrete actions and failure modes, not abstract agent identity.
- Describe identity as an input to authorization, not the product category.
- Describe provider verification as the differentiator, not the entire product.
- Describe conformance and standards participation as the ecosystem strategy.
- Use “deterministic” only for enforceable policy and state transitions, not
  model behavior.
- Preserve experimental labels and avoid unsupported certification claims.

## Current Proof

The repository already demonstrates the hierarchy through:

- local guards, MCP adapters, gateways, approvals, and stateful controls;
- provider contracts, JWS/JWKS receipts, provider middleware, and conformance
  cases; and
- execution receipts, evidence snapshots, verified observations, and intent
  assurance.

The next external proof milestone is two independent providers passing the same
public action-authorization suite without AgentPass-specific coordination at
runtime.

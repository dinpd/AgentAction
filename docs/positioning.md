# AgentAction And AgentPass Project Positioning

## Brand And Category

**Trust infrastructure for autonomous AI agents.**

AgentAction is the public product brand for AgentPass. Existing packages,
schemas, commands, environment variables, and repository links retain
AgentPass-compatible names during the migration.

AgentAction is the trust layer between autonomous agents and enterprise
systems. It evaluates decisions, enforces policy, authorizes actions, and
preserves verifiable evidence across the agent lifecycle.

The canonical one-sentence promise is:

> AgentAction evaluates decisions, enforces policy, authorizes actions, and
> preserves verifiable evidence from intent through execution and continuous
> evaluation.

## Trust Lifecycle

The project connects six distinct claims:

```text
Intent -> decision assurance -> policy enforcement -> action authorization
       -> execution -> evidence -> continuous evaluation
```

1. **Declare intent:** record the goal, proposed action, and relevant context.
2. **Assure the decision:** assess the declared basis, uncertainty, and safer
   alternatives without inspecting hidden chain-of-thought.
3. **Enforce policy:** use trusted identity, policy, approval, and durable-state
   inputs to allow, deny, or challenge the action.
4. **Execute:** let the provider verify exact-action authority and apply its own
   business authorization.
5. **Preserve evidence:** keep authorization receipts, execution receipts, and
   independently verified observations distinct and correlated.
6. **Evaluate continuously:** create immutable assessments and comparable
   assurance signals across runs, profiles, and versions.

Authorization is not proof of execution. Execution is not proof of a successful
outcome. An assessment must identify the evidence and uncertainty behind its
claim rather than treating an earlier decision as its own ground truth.

## Platform Control Surfaces

### 1. Agent Evaluation

Define versioned intent profiles, exercise synthetic scenarios, and aggregate
profile-scoped assurance signals before and during wider deployment. Packaged
certification workflows are a product direction, not an external certification
claim.

### 2. Decision Assurance

Assess the declared basis for a consequential choice: policy factors,
alternatives, assumptions, uncertainty, and supporting evidence. Decision
assurance uses normalized evidence, not private chain-of-thought or hidden model
reasoning.

### 3. Action Authorization

Evaluate the exact tool, arguments, resource, principal, agent, job state,
approval, budget, data-flow boundary, and prior execution state immediately
before dispatch. The action gate can allow, deny, or challenge the action and
can stop unsafe retries, duplicate effects, and disallowed data movement.

The action gate is the current enforcement wedge. It is a concrete control
surface inside the broader trust-infrastructure category, not the whole project
scope.

### Shared Evidence And Provider Trust

Signed, action-bound authorization evidence lets an MCP server, SaaS API, or
other provider independently verify authority before applying its own business
authorization. Provider execution receipts, immutable evidence, verified
observations, causal traces, and outcome assessments connect all three control
surfaces across the lifecycle.

Public mappings, fixtures, reference verifiers, and conformance suites make
provider trust and evidence handling testable across implementations.

## Capability Story

Lead with the complete trust problem:

- evaluate agent behavior against versioned intent profiles;
- assess whether consequential decisions are justified by declared evidence;
- enforce action-specific policy, approval, budgets, and durable state;
- issue authority that downstream providers can independently verify;
- preserve authorization, execution, observation, and assessment evidence; and
- evaluate outcomes and constraints continuously across runs and versions.

Then show the current enforcement wedge:

```text
Agent proposes tool call -> AgentPass checks policy + state -> allow / deny / challenge
```

The wedge is practical because it stops real side effects and creates the
trusted evidence needed by the rest of the lifecycle.

## Audience Entry Points

| Audience | Lead with |
|---|---|
| Enterprise and security teams | Govern agent decisions and actions with policy, approvals, state, evidence, and continuous assurance |
| Agent and application developers | Add a small authorization boundary around existing tool calls, then connect its evidence to evaluation |
| MCP gateway and platform builders | Enforce consistent action policy before forwarding `tools/call` and preserve cross-system evidence |
| SaaS, API, and MCP providers | Independently verify action-specific authority before mutation, then return execution evidence |
| Risk, compliance, and assurance teams | Link intent, decision basis, authorization, execution, observations, and assessment without trusting the model as the record of truth |
| Standards and open-source communities | Reusable mappings, negative cases, test vectors, profiles, and implementation feedback |

## Standards And Open-Source Strategy

Identity establishes the actors. AgentAction adds decision assurance, action
authorization, and evidence controls across the trust lifecycle. Within that
scope, AgentPass standards work focuses on portable action authority, provider
verification, execution closure, and interoperable evidence.

The project reuses OIDC, OAuth, AuthZEN, SPIFFE, WIMSE, MCP authorization, JOSE,
HTTP Message Signatures, Shared Signals, OpenTelemetry, and provenance work
where applicable. Its standards role is to contribute mappings, negative
fixtures, reference implementations, conformance tests, and narrowly scoped
profiles before proposing new vocabulary.

Conformance proves portability for a defined experimental profile; it is not
the product category. Passing an AgentPass suite means agreement with published
reference cases, not certification by an external standards body.

## What AgentAction Is Not

AgentAction is not:

- an identity provider or universal agent registry;
- a new DID method or OAuth replacement;
- a replacement for MCP authorization, AuthZEN, SPIFFE, WIMSE, OPA, or Cedar;
- a substitute for provider business authorization;
- a prompt-safety system controlled by the model;
- a system that requires or records private chain-of-thought;
- an observability product that treats activity logs as authorization; or
- an external certification body.

## Messaging Guardrails

- Lead with the trust lifecycle, then make the action gate concrete.
- Describe Agent Evaluation, Decision Assurance, and Action Authorization as
  connected control surfaces rather than unrelated products.
- Describe identity as a trusted input, not the product category.
- Keep authorization, execution, observation, and assessment as distinct
  claims linked by evidence.
- Describe provider verification as a cross-boundary differentiator, not the
  entire platform.
- Describe conformance and standards participation as the ecosystem strategy.
- Use “deterministic” only for enforceable policy and state transitions, not
  model behavior or outcome truth.
- Preserve experimental labels and avoid unsupported certification claims.
- Use AgentAction for the public product and AgentPass where compatibility
  identifiers or implementation artifacts require it.

## Current Proof

The repository demonstrates the platform scope through:

- versioned intent profiles, synthetic runners, quality rollups, and immutable
  assessments for the Agent Evaluation foundation;
- normalized decision-basis evidence and decision assurance without hidden
  chain-of-thought;
- local guards, MCP adapters, gateways, approvals, and stateful controls for
  Action Authorization;
- provider contracts, JWS/JWKS receipts, middleware, fixtures, and conformance
  cases for portable provider trust; and
- execution receipts, evidence snapshots, verified observations, causal
  correlation, and intent-outcome assessment for lifecycle assurance.

The next external proof milestone is two independent providers passing the same
public action-authorization suite without AgentPass-specific coordination at
runtime.

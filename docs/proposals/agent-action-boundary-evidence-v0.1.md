# Agent Action Boundary Evidence

**Status:** Community draft 0.1

**Maturity:** Experimental; not an adopted standard

**Discussion:** [AgentAction issue #43](https://github.com/dinpd/AgentAction/issues/43)

**Intended audience:** Agent runtimes, gateways, tool providers, authorization
services, observability systems, and evaluation platforms

## Abstract

Agentic systems increasingly use distributed traces to describe model calls,
tool calls, and orchestration. A trace can explain what software attempted, but
it does not by itself establish what crossed a trusted action boundary.

This proposal defines a small, vendor-neutral evidence model that distinguishes:

1. an action proposed by an agent or runtime;
2. the authorization decision made at an enforcement boundary;
3. any approval or challenge used to grant authority;
4. whether the action executed, failed, or replayed a prior result;
5. an independently observed outcome; and
6. a later assessment of goal attainment or constraint compliance.

The proposal complements W3C Trace Context, OpenTelemetry, OAuth, MCP, policy
engines, and provider audit systems. It does not replace them.

The minimal core covers action, authorization, and execution evidence. An
optional intent-assurance extension adds expected outcomes, trusted
observations, immutable evidence snapshots, and assessments.

## Draft status and feedback

This document is intentionally a pre-standard community draft. The field names,
record envelope, signing profile, and standards venue are open for discussion.
Independent implementations should expect incompatible changes until a stable
version is declared.

Feedback is especially useful from teams operating:

- MCP hosts, gateways, and tool servers;
- agent frameworks and multi-agent runtimes;
- API gateways and authorization services;
- security, risk, compliance, and audit systems;
- OpenTelemetry and AI observability tooling; and
- evaluation, experiment, and incident-review platforms.

## Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** in this document are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear
in all capitals.

Because this is an experimental draft, these terms describe the behavior
required for interoperability with this draft; they do not imply adoption by a
standards organization.

## Problem

Several facts are commonly collapsed into one "tool call":

```text
model emitted a tool call
        !=
the action was authorized
        !=
the provider executed it
        !=
the intended real-world outcome occurred
        !=
the overall job was successful
```

This ambiguity creates practical failures:

- a model-generated tool call is treated as proof of execution;
- an `allow` decision is treated as proof that execution succeeded;
- an HTTP success is treated as proof that the business outcome occurred;
- a retry is mistaken for a second side effect or a second execution is
  mistaken for an idempotent replay;
- caller-supplied trace context is treated as trusted authorization context;
- raw arguments and provider responses are copied into broadly accessible
  telemetry; and
- later evaluations cannot identify the exact evidence on which they were
  based.

## Goals

The proposal aims to:

- preserve the distinction between proposal, authorization, execution,
  observation, and assessment;
- provide stable identifiers and joins across those records;
- make evidence provenance and verification status explicit;
- support gateways, embedded guards, remote providers, asynchronous work, and
  multi-agent delegation;
- represent denial, challenge, execution failure, and replay as first-class
  states;
- correlate with traces without making telemetry an authority source;
- minimize sensitive content by using digests and protected artifact
  references; and
- allow independent systems to produce and consume compatible evidence.

## Non-goals

This proposal does not:

- define an authorization protocol or replace OAuth, OIDC, IAM, policy
  languages, or capability systems;
- replace W3C Trace Context or OpenTelemetry;
- replace MCP or define tool input/output schemas;
- define prompts, model reasoning, or chain-of-thought formats;
- require a particular event bus, database, trace backend, or evaluator;
- define one universal policy vocabulary;
- prove that a signed issuer is trustworthy without an external trust policy;
  or
- standardize AgentAction-specific infrastructure or product fields.

## Trust model

The model recognizes four relevant parties:

- **Proposer:** the agent, model adapter, or runtime that proposes an action.
- **Boundary:** the enforcement component that evaluates policy and mints the
  authoritative authorization decision.
- **Executor:** the tool runtime or provider that attempts the authorized
  action and reports execution status.
- **Observer:** a component capable of independently observing a relevant
  outcome.

One component may fill multiple roles, but each record MUST identify the role
and producer responsible for its claim.

### Trust assumptions

1. A proposal is a claim about what the caller wants to happen. It is not proof
   of authority or execution.
2. An authorization decision is authoritative only within the scope of the
   boundary and trust policy that issued it.
3. An execution receipt is a claim by the executor. Consumers MUST evaluate
   its provenance before treating it as verified evidence.
4. An outcome observation is independent only to the degree that its issuer,
   collection path, and verification method are independent.
5. A signature proves possession of a signing key. It does not by itself prove
   that the signer is trusted for the claimed action or observation.
6. Trace IDs, span IDs, baggage, and caller-supplied correlation values MUST NOT
   grant authority.

## Evidence lifecycle

```text
Action proposal
      |
      v
Authorization decision ----> deny
      |                       challenge
      | allow
      v
Execution receipt ----------> executed
      |                       failed
      |                       replayed
      v
Outcome observation --------> observed state
      |
      v
Assessment -----------------> goal and constraint judgment
```

Denial and challenge are terminal authorization outcomes unless a new decision
is issued. They MUST remain observable even though no execution receipt follows.

## Core identifiers

The following logical identifiers are defined:

| Identifier | Minted by | Purpose |
| --- | --- | --- |
| `record_id` | Record producer | Idempotent identity of one evidence record |
| `proposal_id` | Proposer | Correlation with the original proposal; untrusted unless independently verified |
| `boundary_action_id` | Boundary | Identity assigned to one action attempt at the enforcement boundary |
| `decision_id` | Boundary | Identity of one authorization decision |
| `execution_receipt_id` | Executor | Identity of one execution claim |
| `observation_id` | Observer | Identity of one outcome observation |
| `assessment_id` | Evaluator | Identity of one later assessment |
| `run_id` | Workflow authority | Bounded job or workflow execution |
| `logical_step_id` | Workflow authority | Logical step that may have multiple attempts |
| `attempt_id` | Runtime or boundary | One attempt of a logical step |

`proposal_id`, model tool-call IDs, and trace identifiers are correlation
identifiers. They MUST NOT substitute for `decision_id` or
`boundary_action_id`.

An implementation MAY use one value for multiple identifiers when it controls
all relevant roles, but portable records SHOULD preserve their distinct
semantics.

## Common logical envelope

This draft defines a transport-neutral logical envelope. A record MUST contain:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `schema_version` | REQUIRED | Version of the record schema |
| `record_id` | REQUIRED | Producer-scoped idempotency identifier |
| `record_type` | REQUIRED | Evidence record type |
| `occurred_at` | REQUIRED | RFC 3339 timestamp for the claimed occurrence |
| `producer` | REQUIRED | Issuer and role making the claim |
| `boundary_action_id` | REQUIRED for authorization, approval, and execution records; OPTIONAL for an unbound proposal or run-scoped extension record | Boundary-scoped action attempt |
| `action` | REQUIRED for core records; OPTIONAL for a run-scoped observation or assessment | Tool, operation, and request binding |
| `context` | REQUIRED | Run, step, attempt, and tenant-local context |
| `correlation` | OPTIONAL | Trace and protocol correlation values |
| `provenance` | REQUIRED | How the record was authenticated or verified |
| `data` | REQUIRED | Record-type-specific content |

Unknown fields SHOULD be ignored by consumers unless a selected profile states
otherwise. Consumers MUST preserve the distinction between an absent value and
a value that was observed to be empty, zero, or false.

### Producer

`producer` identifies the claimant, not necessarily the network sender:

```json
{
  "role": "boundary",
  "issuer": "https://authorization.example",
  "subject": "gateway-production"
}
```

`role` is one of `proposer`, `boundary`, `executor`, `observer`, or `evaluator`.

### Action

The portable action descriptor is:

```json
{
  "tool": "payments.refund",
  "operation": "execute",
  "resource_ref": "payment:masked-reference",
  "request_digest": {
    "algorithm": "sha-256",
    "value": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "idempotency_key_ref": "sha256:bbbbbbbbbbbbbbbb"
}
```

`tool`, `operation`, and `request_digest` are REQUIRED for authorization and
execution records. `resource_ref` and `idempotency_key_ref` are OPTIONAL and
SHOULD be pseudonymous or protected references.

The digest algorithm, canonicalization profile, and schema version used to
produce `request_digest` MUST be declared by the selected interoperability
profile. Raw tool arguments are not required.

### Context

```json
{
  "tenant_id": "tenant-local-id",
  "run_id": "job-1042",
  "logical_step_id": "refund-payment",
  "attempt_id": "attempt-2"
}
```

`run_id` is REQUIRED. Other identifiers are OPTIONAL unless required by a
selected profile. Globally unique tenant or user identifiers SHOULD NOT be
required by portable profiles.

### Correlation

```json
{
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "trace_context_trust": "linked_untrusted",
  "protocol_request_id": "mcp-request-84",
  "proposal_id": "proposal-84"
}
```

`trace_context_trust` is one of:

- `continued_trusted`: the boundary accepted authenticated internal trace
  context as its parent;
- `linked_untrusted`: the boundary created a new trace and linked the incoming
  context for correlation only;
- `local`: the boundary created the trace without upstream context; or
- `unknown`: the producer cannot establish how context was handled.

The correlation object MUST NOT be included in an authorization request digest
unless a selected policy explicitly and separately defines a correlation field
as authority-relevant. A new trace for the same request must not silently
change its idempotency or approval scope.

### Provenance

```json
{
  "verification_method": "jws",
  "verified_issuer": "https://authorization.example",
  "verified_subject": "gateway-production",
  "verified_at": "2026-07-25T22:40:03Z",
  "key_id": "boundary-key-2026-07"
}
```

`verification_method` is one of `self_asserted`, `transport_authenticated`,
`oidc`, `jws`, `dsse`, or a profile-defined extension.

Consumers MUST apply a local trust policy to `verified_issuer`,
`verified_subject`, key purpose, audience, and record type. They MUST NOT infer
trust solely from a non-empty signature or `verification_method`.

## Core record types

### `action.proposed`

Describes an action proposed by a model, agent, or runtime.

Required `data` fields:

- `proposal_id`;
- `proposed_by`; and
- `tool_call_id` when the originating protocol supplies one.

This record MAY omit `boundary_action_id` because it can exist before the
proposal reaches an enforcement boundary.

### `action.authorization_decided`

Describes the boundary's decision for one action attempt.

Required `data` fields:

- `decision_id`;
- `decision`: `allow`, `deny`, or `challenge_required`;
- `reason_codes`: an array of stable, non-secret reason identifiers;
- `policy_ref`; and
- `decided_at`.

Optional fields include:

- `approval_ref`;
- `grant_ref`;
- `expires_at`;
- `constraints`;
- `human_summary`; and
- `risk_class`.

`human_summary` MUST NOT contain secrets or unredacted sensitive arguments.

### `action.approval_decided`

Describes a human or automated approval decision used by an authorization
boundary.

Required `data` fields:

- `approval_id`;
- `decision`: `approved`, `denied`, or `expired`;
- `scope_digest`;
- `decided_at`; and
- `decided_by`.

An approval MUST be scoped independently of trace context. A boundary using an
approval MUST verify that the current action binding still matches the approval
scope.

### `action.execution_completed`

Describes an executor's claim about what happened after authorization.

Required `data` fields:

- `execution_receipt_id`;
- `decision_id`;
- `status`: `executed`, `failed`, or `replayed`;
- `started_at`; and
- `completed_at`.

Optional fields include:

- `result_digest`;
- `outcome_code`;
- `error_code`;
- `provider_resource_ref`;
- `replayed_from_execution_receipt_id`; and
- `replay_count`.

An execution receipt with `status: replayed` MUST identify the prior execution
receipt or prior decision from which the result was replayed.

### Core invariants

Conforming core implementations MUST preserve these invariants:

1. Authorization and execution are separate records.
2. `allow` is not proof of execution.
3. Transport success is not proof of the intended outcome.
4. Every execution receipt references an applicable `allow` decision under
   which execution was attempted. Approval alone is not authority to execute.
5. The action binding on an execution receipt matches the referenced decision.
6. Replay is distinguishable from a new side effect.
7. Deny and challenge decisions are retained even without execution.
8. Trace context is correlation metadata and never authority.
9. Record provenance is explicit.
10. Missing evidence remains missing; consumers do not convert absence into
    failure or success without an explicit assessment rule.

## Optional intent-assurance extension

The intent-assurance extension adds evidence about whether a bounded job
achieved its expected outcome.

### Intent contract

An intent contract is issued by a workflow or policy authority and binds:

- a stable `intent_id`;
- the `run_id`;
- required outcome predicates;
- hard constraints;
- expected evidence sources;
- an issuance time and optional expiry; and
- a canonical `intent_digest`.

An agent MAY propose variables used to issue a contract. It MUST NOT be able to
mutate the contract, approve its own evidence, or change the evaluator after
execution begins.

### `action.outcome_observed`

Describes a provider or application observation relevant to the intent.

Required `data` fields:

- `observation_id`;
- `intent_id` and `intent_digest`;
- `predicate`;
- `value` or a protected `value_ref`;
- `observed_at`.

The common `provenance` envelope field describes observation provenance. An
observation MUST NOT be treated as trusted merely because it matches the
desired value. Trust is determined by the selected predicate, allowed issuer,
verification method, lifetime, and binding.

### Evidence snapshot

A final assessment SHOULD identify an immutable evidence snapshot containing or
referencing the exact decisions, execution receipts, observations, and job
evidence it evaluated.

The snapshot SHOULD include:

- stable evidence identifiers;
- per-source counts and canonical digests;
- a combined evidence digest;
- a capture timestamp; and
- the intent and run binding.

Late evidence MUST NOT silently mutate a finalized assessment. It requires a
new snapshot and assessment version.

### Optional decision-basis extension

A profile MAY associate a proposal, authorization decision, approval, or
assessment with a structured decision-basis record. Such a record describes
the producer-declared conclusion, normalized factors, alternatives,
assumptions, uncertainty, and evidence or policy references. It is not a raw
reasoning transcript and MUST NOT be treated as proof that its conclusion is
correct.

Decision bases SHOULD use stable, non-secret codes and bounded summaries. A
model-produced basis is self-asserted proposer context. A boundary-produced
basis can describe the policy evaluation performed by that boundary, subject
to the same provenance and local trust rules as other evidence records.

AgentAction's non-normative extension is documented in
[Decision-Basis Evidence](../decision-basis.md).

### `action.assessed`

Describes a deterministic, model-based, or human assessment.

Required `data` fields:

- `assessment_id`;
- `target_ref`;
- `metric`;
- `value`;
- `evaluator_ref` and evaluator version;
- `assessed_at`; and
- evidence snapshot or evidence digest when the assessment is final.

Outcome status, constraint compliance, goal attainment, and evidence confidence
SHOULD remain separate dimensions. A technically completed execution may still
have a failed or indeterminate assessment.

## End-to-end example

The following abbreviated records describe an allowed refund, its execution,
and an independently observed outcome. The portable evidence contains digests
and protected references rather than raw payment details.

### Authorization decision

```json
{
  "schema_version": "agent-action-boundary-evidence/0.1",
  "record_id": "decision-record-7",
  "record_type": "action.authorization_decided",
  "occurred_at": "2026-07-25T22:40:03Z",
  "producer": {
    "role": "boundary",
    "issuer": "https://authorization.example",
    "subject": "gateway-production"
  },
  "boundary_action_id": "boundary-action-84",
  "action": {
    "tool": "payments.refund",
    "operation": "execute",
    "resource_ref": "payment:masked-reference",
    "request_digest": {
      "algorithm": "sha-256",
      "value": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "idempotency_key_ref": "sha256:bbbbbbbbbbbbbbbb"
  },
  "context": {
    "tenant_id": "tenant-local-id",
    "run_id": "job-1042",
    "logical_step_id": "refund-payment",
    "attempt_id": "attempt-2"
  },
  "correlation": {
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "trace_context_trust": "linked_untrusted",
    "proposal_id": "proposal-84"
  },
  "provenance": {
    "verification_method": "transport_authenticated",
    "verified_issuer": "https://authorization.example",
    "verified_subject": "gateway-production",
    "verified_at": "2026-07-25T22:40:03Z"
  },
  "data": {
    "decision_id": "decision-84",
    "decision": "allow",
    "reason_codes": ["policy.allowed", "approval.scope_match"],
    "policy_ref": "refund-policy@2026-07",
    "approval_ref": "approval-31",
    "decided_at": "2026-07-25T22:40:03Z",
    "risk_class": "high"
  }
}
```

### Execution receipt

```json
{
  "schema_version": "agent-action-boundary-evidence/0.1",
  "record_id": "execution-record-9",
  "record_type": "action.execution_completed",
  "occurred_at": "2026-07-25T22:40:04Z",
  "producer": {
    "role": "executor",
    "issuer": "https://payments.example",
    "subject": "refund-service"
  },
  "boundary_action_id": "boundary-action-84",
  "action": {
    "tool": "payments.refund",
    "operation": "execute",
    "resource_ref": "payment:masked-reference",
    "request_digest": {
      "algorithm": "sha-256",
      "value": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "idempotency_key_ref": "sha256:bbbbbbbbbbbbbbbb"
  },
  "context": {
    "tenant_id": "tenant-local-id",
    "run_id": "job-1042",
    "logical_step_id": "refund-payment",
    "attempt_id": "attempt-2"
  },
  "correlation": {
    "trace_id": "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
    "span_id": "1234567890abcdef",
    "trace_context_trust": "local"
  },
  "provenance": {
    "verification_method": "jws",
    "verified_issuer": "https://payments.example",
    "verified_subject": "refund-service",
    "verified_at": "2026-07-25T22:40:04Z",
    "key_id": "payments-receipts-2026-07"
  },
  "data": {
    "execution_receipt_id": "execution-84",
    "decision_id": "decision-84",
    "status": "executed",
    "started_at": "2026-07-25T22:40:03Z",
    "completed_at": "2026-07-25T22:40:04Z",
    "result_digest": {
      "algorithm": "sha-256",
      "value": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    "outcome_code": "accepted"
  }
}
```

### Outcome observation

```json
{
  "schema_version": "agent-action-boundary-evidence/0.1",
  "record_id": "observation-record-4",
  "record_type": "action.outcome_observed",
  "occurred_at": "2026-07-25T22:40:05Z",
  "producer": {
    "role": "observer",
    "issuer": "https://ledger.example",
    "subject": "refund-observer"
  },
  "boundary_action_id": "boundary-action-84",
  "action": {
    "tool": "payments.refund",
    "operation": "execute",
    "resource_ref": "payment:masked-reference",
    "request_digest": {
      "algorithm": "sha-256",
      "value": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  },
  "context": {
    "tenant_id": "tenant-local-id",
    "run_id": "job-1042",
    "logical_step_id": "refund-payment",
    "attempt_id": "attempt-2"
  },
  "provenance": {
    "verification_method": "oidc",
    "verified_issuer": "https://ledger.example",
    "verified_subject": "refund-observer",
    "verified_at": "2026-07-25T22:40:05Z"
  },
  "data": {
    "observation_id": "observation-84",
    "intent_id": "refund-intent-1042",
    "intent_digest": {
      "algorithm": "sha-256",
      "value": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    },
    "predicate": "refund.status",
    "value": "succeeded",
    "observed_at": "2026-07-25T22:40:05Z"
  }
}
```

## OpenTelemetry mapping

This proposal does not redefine distributed tracing.

Evidence records are not required to be spans. A deployment MAY export them as
OpenTelemetry logs or span events, or attach their stable identifiers to spans,
while retaining authoritative records in a system appropriate to their
integrity and retention requirements. Evidence needed for authorization,
replay detection, or final assessment MUST NOT depend on trace sampling.

Suggested mapping:

| Evidence | Trace representation |
| --- | --- |
| Proposal | Model output/tool-call data on the originating inference span, when content capture is permitted |
| Authorization decision | Event or attributes on an authorization span owned by the boundary |
| Approval | Separate approval span or event linked by `approval_id` |
| Execution receipt | Logical tool-execution span plus standard HTTP/RPC/database child spans |
| Outcome observation | Event or linked observation span produced by the observer |
| Assessment | Evaluation event or evaluator span linked to the evaluated trace/span |

W3C `traceparent` and `tracestate` provide distributed correlation. They do not
authenticate the caller or authorize the action. At an untrusted boundary, an
implementation SHOULD start a new trace and use a span link to the incoming
context instead of accepting it as an authoritative parent.

Large or sensitive evidence SHOULD be stored as protected artifacts. Trace
attributes should contain only allowlisted metadata, digests, and artifact
references.

Candidate attributes not currently standardized by OpenTelemetry could include:

```text
agent.action.boundary_action.id
agent.action.decision.id
agent.action.decision.result
agent.action.execution_receipt.id
agent.action.execution.status
agent.action.request.digest
agent.action.trace_context.trust
```

These names are placeholders for discussion and MUST NOT be represented as
accepted OpenTelemetry semantic conventions.

## CloudEvents mapping

The logical envelope can be carried by CloudEvents without requiring
CloudEvents as the only transport:

| Logical field | CloudEvents field |
| --- | --- |
| `record_id` | `id` |
| Producer issuer | `source` |
| `record_type` | `type` |
| `occurred_at` | `time` |
| Schema URI | `dataschema` |
| `boundary_action_id` | `subject` |
| Remaining logical record, including action, context, provenance, and record-specific content | `data` |

A possible event type is
`org.agentaction.authorization.decided.v1`. The final reverse-DNS namespace,
schema URI, and extension attributes require community ownership and are not
settled by this draft.

CloudEvents context attributes are commonly inspected and logged. Sensitive
action content should remain in protected event data or referenced artifacts,
not routing attributes.

## MCP mapping

For an MCP `tools/call` flow:

1. The client or host creates the proposal and protocol request correlation.
2. The host, gateway, or external policy decision point creates the
   authorization decision.
3. A challenge or human approval remains distinct from OAuth authorization and
   from the final tool call.
4. The tool server or trusted gateway creates the execution receipt.
5. A provider or application observer creates any outcome observation.

OAuth establishes access to an MCP server. The evidence model describes the
per-action decision and what happened after that decision. It should not change
MCP request or result semantics.

## Asynchronous and multi-agent work

Synchronous child work may share one trace. Asynchronous delegation or
long-running execution may use a new trace linked to its initiating trace.

Portable evidence remains joined by `boundary_action_id`, `decision_id`,
`run_id`, and digest bindings even when trace continuity is unavailable.

When one agent delegates to another:

- each enforcement boundary mints its own `boundary_action_id` and
  `decision_id`;
- delegation correlation MAY record a parent boundary action;
- the downstream agent's trace context remains correlation metadata;
- upstream authority MUST NOT be inferred unless an explicit delegation or
  capability record authorizes it; and
- execution receipts identify the decision under which the downstream action
  actually ran.

## Replay and failure semantics

Implementations MUST distinguish:

- **retry:** a new attempt that may result in a new execution;
- **replay:** return of a prior terminal result without repeating the side
  effect;
- **duplicate execution:** a second side effect for the same logical request;
- **authorization denial:** execution was not authorized;
- **execution failure:** authorization existed, but the executor failed;
- **unknown:** available evidence cannot establish what happened; and
- **outcome failure:** execution occurred, but the required real-world outcome
  was not observed.

An idempotency key is insufficient by itself. The executor or boundary SHOULD
bind it to the normalized action and request digest. Reuse with a changed
binding SHOULD be rejected.

## Privacy and data minimization

Portable evidence records:

- MUST NOT require credentials, bearer tokens, private keys, or reusable
  approval grants;
- SHOULD NOT contain raw prompts, chain-of-thought, unrestricted tool
  arguments, provider responses, or direct personal identifiers;
- SHOULD use digests, stable reason codes, pseudonymous resource references,
  and access-controlled artifact references;
- SHOULD declare data classification and retention profiles outside broadly
  propagated correlation fields;
- MUST distinguish redacted or unavailable content from empty content; and
- SHOULD support deletion or cryptographic erasure policies for referenced
  sensitive artifacts.

Trace baggage and CloudEvents context attributes are especially unsuitable for
sensitive data because intermediaries may propagate or log them.

## Security considerations

### Trace-context spoofing

External callers can submit forged trace identifiers. Boundaries must sanitize,
ignore, or link untrusted context without treating it as authenticated identity
or authority.

### Confused deputy

An executor must verify that a decision applies to its tool, operation, request
digest, resource scope, audience, and lifetime. Possession of an unrelated
valid decision is insufficient.

### Replay

Signed records remain replayable unless consumers enforce record identifiers,
lifetimes, nonce/idempotency semantics, and action bindings.

### Signature trust

Consumers need an issuer trust policy, key lifecycle, audience rules, algorithm
allowlist, and revocation strategy. A portable signing profile remains an open
question.

### Evidence omission

Bounded indexes, sampling, exporter failure, and partial snapshots can create a
false appearance of completeness. Final assessments should expose source
counts, exclusions, missing evidence, and confidence rather than silently
dropping records.

### Cross-tenant correlation

Tenant identifiers, traces, event streams, indexes, and artifact access must
remain tenant-scoped. Global identifiers should not expose customer identity or
become high-cardinality metric labels.

## Non-normative AgentAction mapping

AgentAction is one reference implementation of the concepts; it is not the
normative schema.

| Draft concept | AgentAction artifact |
| --- | --- |
| Action descriptor | Guard check and approval evidence |
| Authorization decision | Guard decision event / intent decision evidence |
| Approval | Approval request and single-use JIT grant |
| Execution receipt | Provider authorization and execution receipts |
| Outcome observation | Verified intent observation |
| Intent contract | Versioned intent profile and issued contract |
| Evidence snapshot | Immutable intent evidence snapshot |
| Assessment | Intent evaluation receipt |
| Aggregate quality | Profile-scoped intent quality rollup |

AgentAction-specific fields such as manifest shape, policy findings, JIT grant
format, and console storage are outside the portable core.

## Relationship to existing work

- [W3C Trace Context](https://www.w3.org/TR/trace-context/) standardizes
  distributed trace propagation.
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
  define developing conventions for GenAI clients, agents, tools, metrics, and
  events.
- [OpenInference](https://arize-ai.github.io/openinference/spec/) defines an
  OpenTelemetry-based AI observability taxonomy.
- [CloudEvents](https://github.com/cloudevents/spec/blob/ce@stable/cloudevents/spec.md)
  defines a vendor-neutral event envelope and transport bindings.
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  defines authorization for HTTP-based MCP transports.

This draft focuses on a gap between those layers: portable evidence about a
specific agent-originated action at an enforcement and execution boundary.

## Interoperability profiles

A deployable profile will need to select:

- envelope and transport;
- schema and namespace version;
- canonical JSON or other digest input;
- digest algorithms;
- required identifiers;
- authentication and signing methods;
- issuer, audience, and key trust rules;
- timestamp precision and allowed clock skew;
- artifact-reference scheme;
- retention and privacy behavior; and
- OpenTelemetry attribute and event mappings.

The core model should remain stable across profiles.

## Open questions

1. Is the action-boundary scope useful and sufficiently narrow?
2. Which record types belong in the minimal interoperable core?
3. Should approval be a core record or an authorization-profile extension?
4. Should the canonical envelope be CloudEvents, OTLP logs/events, another
   existing envelope, or transport-neutral?
5. Which canonicalization and signature formats are already deployed
   successfully: JCS/JWS, DSSE, COSE, in-toto, or another profile?
6. Should `boundary_action_id` or `decision_id` be the primary subject joining
   authorization and execution?
7. How should batch, streaming, and partially completed tool executions be
   represented?
8. How should revocation or compensation be recorded after execution?
9. Which fields are safe and useful as OpenTelemetry sampling attributes?
10. Should the intent-assurance extension remain part of the same proposal?
11. Is this best advanced through OpenTelemetry GenAI semantic conventions, an
    MCP SEP, CloudEvents extensions, a standalone specification, or coordinated
    profiles across them?

## Suggested validation experiments

Community implementations can test the model with:

1. a locally embedded guard wrapping a tool executor;
2. an MCP gateway authorizing a remote tool server;
3. a provider that returns a signed execution receipt;
4. a denied action with no execution;
5. an exact idempotent replay;
6. reuse of an idempotency key with a changed request digest;
7. asynchronous execution in a trace linked to the original agent trace;
8. a trusted observer reporting an outcome different from transport success;
   and
9. a final assessment that remains indeterminate when required evidence is
   missing.

The most useful feedback will include sample records, implementation friction,
privacy concerns, and examples that the current lifecycle cannot represent.

## Change process

Changes to this draft should:

1. preserve a public discussion trail;
2. identify compatibility impact;
3. include or update an end-to-end example;
4. distinguish normative core changes from implementation guidance; and
5. avoid presenting draft names as adopted conventions in other standards.

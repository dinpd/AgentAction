# Decision-Basis Evidence

AgentPass decision-basis records explain the declared inputs and normalized
factors behind a consequential proposal, authorization decision, approval, or
assessment. They do not capture hidden model state or raw chain-of-thought.

The portable contract is `agentpass.decision-basis.v1`, defined by
[`schema/decision-basis.schema.json`](../schema/decision-basis.schema.json).
Adding decision bases to an immutable intent snapshot changes its source
manifest and canonical digest, so new hosted finalizations use
[`agentpass.intent-evidence-snapshot.v2`](../schema/intent-evidence-snapshot-v2.schema.json).
The V1 snapshot schema remains unchanged for existing records and consumers.

## Trust boundary

A decision basis is a claim made by its producer:

- A `rule_evaluation` basis produced by the gateway describes the boundary's
  deterministic policy evaluation. It is authoritative only for what that
  identified boundary evaluated under the referenced policy.
- A `structured_summary` produced by an agent or model describes the
  proposer's declared basis. It is self-asserted context, not proof that the
  cited facts are true and never authority to execute.
- A human or evaluator basis has the same provenance requirement. Consumers
  apply local trust policy to the producer, subject, method, and record type.

No basis proves that its conclusion was correct. Execution receipts,
independent observations, and assessments retain their separate meanings.

## Normalized shape

Each record contains:

- a stable `basis_id` and a typed `subject` reference;
- producer, context, capture mode, policy reference, and provenance;
- one bounded conclusion code and summary;
- normalized factors with stable codes, evidence or policy references, and
  optional dependencies;
- alternatives and their dispositions;
- explicit assumptions and uncertainty;
- a digest of the action input under a declared canonicalization profile; and
- an optional classification and retention profile.

Factor dependencies form a small directed graph. In addition to JSON Schema
validation, conforming producers and gateways must reject duplicate factor IDs,
self-dependencies, and dependencies that do not identify another factor in the
same record.

See the [boundary authorization example](../examples/decision-basis-authorization.json)
and [self-asserted proposal example](../examples/decision-basis-proposal.json).

## Gateway behavior

For each new intent-bound authorization decision, the hosted gateway creates
one `rule_evaluation` basis and adds its `basis_id` to the decision event. The
gateway:

- derives stable, non-secret reason codes from policy outcomes;
- includes approval and JIT-grant references when they contributed to an
  allowed decision;
- hashes the canonical action input rather than copying arguments;
- stores the decision and basis together before responding; and
- freezes both source manifests into the V2 evidence digest at finalization.

Decision audit events carry the `decision_basis_id` and normalized
`reason_codes`. The full basis remains in the tenant-scoped evidence store and
immutable snapshot instead of being duplicated into broadly exported logs.

The gateway does not inject a reasoning prompt into model traffic. Prompt
injection would change model behavior, create provider-specific coupling, and
risk turning an advisory self-report into an apparent enforcement mechanism.

## Optional practitioner prompt

Runtimes that want proposal-side context can opt into the versioned
[decision-basis system prompt](prompts/decision-basis-system-v1.md). The model
returns only a bounded data fragment. The trusted runtime mints identifiers,
computes the action digest, binds context, labels the record self-asserted, and
validates the completed record before submission or storage.

The prompt is an interoperability aid, not a security control. Workflows that
do not need proposal-side context should omit it.

## Privacy requirements

Portable decision bases must not contain raw prompts, hidden chain-of-thought,
credentials, reusable grants, unrestricted action arguments, provider response
bodies, or direct personal data. Prefer stable codes, digests, pseudonymous
references, and bounded summaries. Protected native traces, if retained for a
separate operational purpose, are outside this portable contract and require
their own access, retention, deletion, and tenant-isolation controls.

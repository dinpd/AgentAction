# Policy Lab architecture

Policy Lab evaluates retained governance evidence in a verified workspace. The
first adapters cover the hosted execution supervisor and the cooperative Hermes
adapter. The operator workflow ends at review. Future activation belongs to a
separate owner-authorized lifecycle from proposal through shadow testing,
approval, activation and monitoring.

## Existing boundaries

| Source | Reuse | Coverage gap |
| --- | --- | --- |
| Hosted runtime | Tool scope and schema validation, immutable workspace/agent settings revisions, frozen run limits, exact binding, approval and transactional dispatch claim | Planning rejections lack structured reason codes; cancelled/revised proposals can lose tool identity. Current agent definitions and connection schemas cannot stand in for historical ones. |
| Hermes supervisor | Same run store and supervisor transitions, exact normalized proposal arguments, owner tool allowlist, separate operator approval and adapter claim, credential and session fencing | Rejected requests normally roll back without evidence. Completion is adapter-reported. Tokens, credentials and session IDs are unnecessary for analysis. |
| Supervisor journal | Ordered proposals, claims, settlements, cancellations and recovery. A claim proves that the runtime accepted an exact approval before I/O. | A digest cannot recover arguments. A claim cannot prove a provider effect, and a timeout cannot prove absence of effect. |
| Hosted intent evaluation | Frozen contract, linked receipt, evidence digest and criterion-level trust | A missing or insufficient receipt limits outcome assurance. AI assessments and adapter reports do not independently verify provider effects. |
| Guard, enterprise gateway and MCP diagnostics | Existing decision events, authorization, grants, signed evidence, and local/workspace checker reports | Separate enforcement semantics and evidence owners. These paths require separate adapters and are outside initial replay. |

The runtime continues to own execution transitions. Extract the deterministic
claim decision from the existing state transition and keep the actual claim
inside the same storage transaction. Retain the existing error precedence,
status codes, argument normalization and bindings. Read-only replay must have no
storage writes, provider transport, machine credentials or grant APIs.

## Evidence and retention

Expose a versioned read model over retained run documents in the existing
workspace Durable Object. Join journal/action/event references by run and
action ID. Keep timestamps, tool alias and source identity where retained,
policy revision and frozen limits, fixed decision reason codes, approval and
outcome references, and provenance and coverage. Emit compact reason records
for authenticated proposal attempts that fail scope, budget or argument checks.
Reuse the existing run retention and run-size bounds. Never duplicate raw
arguments, credentials or provider output in Policy Lab.

Record the successful shared claim decision at its existing journal entry, in
the same durable transaction as approval consumption. A retained v1 claim and
its journal prefix provide the exact claim time, proposal/expiry, policy
version, action binding and number of prior claims. The successful transaction
is the provenance for the verified binding and consumed approval. Older claims,
proposal-only records and reject observations can still support findings. They
are partial evidence for policy replay when their inputs cannot be recovered.
Current settings are never substituted for a historical policy.

## Candidate boundary

Begin with a stricter per-run call cap for one agent and historical workspace
policy revision, leaving each historical lower cap intact. Validate the cap
using existing supervisor limits. Replay the shared claim evaluator against
ordered journal prefixes and verify each baseline before comparison. When an
earlier claim diverges, later observed actions in the same run cannot be
assumed to have occurred in the counterfactual. Report them as inconclusive.
Reports describe changes among retained decisions. They do not estimate
unseen traffic, verify outcomes or predict operator behavior.

A refund auto-approval recommendation requires enforceable predicates for
amount and currency, customer eligibility, the authorized job and exact
arguments, provider-backed duplicate protection, and a monetary budget.
The supervisor requires operator approval for all eligible proposals and its
budget counts calls. Existing gateway policies cannot be silently applied to
hosted or Hermes actions. Present the missing predicates as capability gaps.
The provider reconciliation hook remains separate; uncertain mutations are
never retried by Policy Lab.

## Acceptance

Use the existing synthetic worker/browser harnesses for approval contention,
argument normalization, lost refund responses, workspace roles and mobile
layout. Add fixtures for retained and partial evidence, ordered baseline
parity, a tighter call cap, unsupported candidates, deduplication, and isolated
review state. Keep analysis bounded by retained runs, and run findings and
replay outside the serialized authorization queue.

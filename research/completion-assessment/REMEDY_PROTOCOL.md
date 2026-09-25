# Closure and revision remedy: protocol v1

The initial protocol was specified before running the extension. Development
refinements are recorded in VALIDATION.md; this is not a preregistration. It
supplements the original offline experiment. Release impact: no release.

## Claim and assumptions

Evaluate a research-only wrapper around the unchanged production observation
verifier and outcome evaluator. The wrapper checks authenticated history
closure (exact ordered decision/receipt contents, counts, and sequence coverage)
and/or equality between an observation's resource revision and a fresh,
challenge-bound final service revision. A failed prerequisite returns unknown.
The claim concerns the instant of the final revision read, not future state.

Assume an honest service/broker, atomic state/history/revision transactions, a
complete reporting path for relevant effects, and version advancement on every
relevant mutation. Explicit out-of-model controls violate honest reporting and
complete mediation. Retain their errors in aggregate and separate summaries.
These are conventional completeness and optimistic-version checks, not a new
cryptographic primitive or an assertion of novelty over EvidenceNet epochs.

The expected random challenge is trusted collector context, retained separately
from the returned proof. The low-level research validator does not establish
freshness if an untrusted submitter is allowed to choose both the proof and the
expected challenge. The live experiment and integrated timing generate the
challenge locally before querying the service.

## Persistent-service setting

A Python standard-library HTTP service binds only to 127.0.0.1 on a random
port, uses a temporary SQLite database in WAL mode, and implements refund
creation, settlement/regression, idempotent retries, coherent evidence reads,
and challenge-bound revision reads. Effect/state mutations use BEGIN IMMEDIATE;
evidence reads use one read transaction. There are no external providers, real
payments, production credentials, customer records, or LLM calls.

Concurrent HTTP requests are coordinated with explicit pre-commit barriers,
not assumed from timing. Tests cover a read while a writer is uncommitted,
same-key and different-key overlapping requests, committed effects followed by
lost responses, and process restart with the same database. A separate auditor
reads the SQLite tables directly after the final head read, while writers are
quiescent. Assessment functions receive neither these tables nor fault labels.
Truth requires exactly one correct settled effect and approval of every logged
request, including retries, matching the contract's universal approval policy.

## Comparison and reporting

All five methods receive the same evidence: existing Ingress-any,
Ingress-latest, closure-only, revision-only, and both. The three wrappers share
latest-observation selection and actual production JWS verification. Closure
checks exact decision/receipt digests and contiguous sequence identifiers;
revision checks a fresh challenge plus equality of observed and final revision.
Signing occurs in the trusted research broker after actual service reads.

Run each scenario with five distinct task amounts/identifiers. Repetitions are
structural checks, not independent samples of deployment risk. Fix controlled
interleavings by barriers. Save evidence, raw database tables, HTTP traces,
per-method decisions and reasons, and per-scenario/assumption-stratum metrics.
False success uses negative-case denominator; false failure uses positive-case
denominator; unknown remains in coverage. Do not pool these results with the
three-emulator experiment as if they shared a sampling distribution.

Correctness reruns use fresh RSA keys and request challenges. Stored challenges
are normalized to case-specific placeholders (with the normalized head digest
recomputed) so non-timing outputs can be compared exactly. Private keys and JWS
envelopes are never persisted. The saved records are not signed attestations.

Timing is separate: fixed clean service case, warm-up, rotating method order,
raw per-call samples, local gate cost and integrated HTTP assessment (including
evidence/final-head reads and signing). Report environment and sample counts;
do not infer production latency or cryptographic security from these measurements.

## Acceptance before results

Test clean admission, explicit pending/failure, benign evolution, retries,
lost responses, restart, crash-before-commit rollback, overlapping requests,
unapproved retries, truncated/empty/absent records, reordered records, changed
records, stale success and stale failure, missing or
replayed head proof, invalid signatures, and the two trust-assumption controls.
Verify results with an independent Python oracle/recount; rerun correctness
byte-for-byte. Keep unexpected outcomes in the research record and explain any
implementation corrections. The paper must distinguish service realism from
external or production validation.

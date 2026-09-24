# Evaluation protocol, version 1

Author: Dan Itkis, AgentAction.dev. Created 2026-09-24 before the first
experimental run; this is an internal design record, not a preregistration.

## Questions

1. Which false completion claims are exposed by evaluating state and constraints
   rather than transport or execution status?
2. What changes when the production observation verifier precedes the local
   evaluator, and which failures survive successful signature verification?
3. How do existential, universal, and latest-observation policies behave under
   regression and legitimate state evolution?
4. How do absent observations affect coverage and conditional error, and how do
   omitted versus explicitly empty evidence streams affect count constraints?
5. Are saved decisions reproducible, and what are the local evaluation and
   verification costs?

## Design

Three deterministic, in-memory provider emulators implement refunds, deployments,
and exports. Each maintains domain-specific durable-state analogues and a full
effect history. A separate oracle reads that state; tested assessment methods
receive only the contract, tool response, and selected evidence. No LLM, real
provider, network service, customer data, or paid API is involved. The oracle
does not call the production predicate evaluator. All identifiers are synthetic.

Twenty scenario families, each in three domains and 20 parameterizations, make
1,200 cases. Parameterizations vary identifiers, amounts, versions, replica
counts, and row counts. These are **60 domain-scenario strata**, not 1,200
independent real-world tasks. Report exact finite-corpus counts without
population confidence intervals or security-probability claims. Retain all
counterexamples; do not tune a profile until it wins the suite.

Scenario families: clean, explicit_failure, accepted_pending, wrong_target,
unapproved_action, duplicate_visible, idempotent_replay, missing_success,
missing_failure, untrusted_issuer, payload_tamper, binding_mismatch, expired,
forged_provenance, conflict, within_ttl_regression, hidden_duplicate,
empty_receipt_stream, trusted_signer_falsehood, legitimate_state_evolution.

Missing-success and missing-failure pairs intentionally expose identical
assessment inputs but opposite oracle labels. This is a test of observability,
not merely a missing-field check. Hidden duplication and empty receipt streams
test a completeness assumption; trusted-signer falsehood is an explicitly
out-of-trust-model negative control. Within-TTL regression tests the distinction
between wall-clock age and state-version freshness.

## Methods

- Tool: success from the last HTTP status.
- Trace: success from an executed receipt and allow decisions.
- Content-any: production predicates over content with provenance, digest, and
  binding checks deliberately bypassed in a clearly isolated research adapter.
- Local-any: unmodified production evaluator directly consuming records that
  claim verified provenance. This is a boundary-misuse control for untrusted
  input, not the advertised behavior of the hosted ingestion path.
- Ingress-any: unmodified production observation verifier followed by the
  unmodified production evaluator with existential predicates.
- Ingress-all: same verifier/evaluator with a separately issued universal
  observation profile. Evidence is rebound and re-signed for that contract;
  no issued contract is mutated.
- Ingress-latest: research-only adapter selects the most recently observed
  verified record before the unmodified evaluator. Tied latest timestamps with
  conflicting values cause abstention. It is not a shipped product feature.

These are mechanism baselines/ablations, **not implementations of AgentSpec,
EvidenceNet, CONTINUITY, OpenTelemetry, or another named system**. No numerical
claim about superiority to those systems is warranted.

RSA-2048 RS256 signatures are genuinely generated and verified through the
production JWS path. A process-local fetch substitute returns an ephemeral
public JWKS for exactly one `.invalid` URL and rejects any other request.
Private keys never leave process memory. The harness itself creates trusted
decision/receipt streams; their transport authentication is outside the test.

## Labels and metrics

Oracle Y is true iff the required domain state is present, the action was
approved, and exactly one side effect occurred. The assessment returns S
(qualified success), F (a required predicate or hard constraint fails), or U
(otherwise). F does not include abstention. Invalid observations are rejected
at ingestion and leave missing evidence; their rejection is not proof of task
failure. Missing outcomes can coexist with a determinate constraint failure.

Report false success / all Y=false cases; false failure / all Y=true cases;
coverage = (S+F)/N; selective error = incorrect decisive labels/(S+F); and
positive admission = S among Y=true cases. Zero-denominator rates are null.
Also retain per-scenario and per-domain counts so corpus mix is explicit.

## Sensitivities and reproducibility

Use a nested, deterministic observation-loss sweep at 0, 25, 50, 75, and 100%
over balanced clean and accepted-pending cases. Remove observations for the
first k of 20 parameterizations identically across both labels and domains.
Separately exhaust all eight omission masks for decision, receipt, and
observation streams, using both absent and empty representations, over clean
and duplicate-visible cases. Profiles and method settings are unchanged.

Save complete unsigned evidence views and oracle state, case-level decisions,
rejection reason codes, exact summaries, and hashes of source files. Generated
private keys/signatures and timing do not enter deterministic hashes. Each
rerun generates new keys and checks signatures again. Compare two independent
correctness runs byte-for-byte. Verify saved row summaries independently.

Timing uses a fixed clean refund with five measured blocks of 200 repetitions
after 100 warm-ups for each method. Report p50/p95 and block means; include
hardware, Node version, and raw samples. Ingress measurements include key
import and a local JWKS JSON response but exclude network, signature issuance,
provider execution, and model latency. These are component microbenchmarks.

## Manuscript boundaries

Document snapshot/finalization as existing architecture with targeted existing
gateway tests; do not present local reevaluation as a new test of distributed
durability. Discuss profile comparability as an existing design boundary, not
an empirical result unless separately measured. No claim of cryptographic
novelty, universal safety, calibrated confidence, causal attribution, field
prevalence, or empirical generalization to LLM behavior.

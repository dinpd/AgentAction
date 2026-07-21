# Intent Assurance

AgentPass intent assurance evaluates whether one bounded agent job achieved a
trusted, structured intent after tool execution.

It extends the runtime loop without changing the authorization question:

```text
intent contract
      -> pre-action allow / deny / challenge
      -> bound decision and execution evidence
      -> post-job intent evaluation receipt
```

Authorization and evaluation remain separate. An allowed action may fail to
produce the required outcome. A completed outcome may still be noncompliant if
a hard constraint was violated.

## Trust Boundary

An intent contract is issued per job by a user, application, workflow, or
policy authority. For comparable production workloads, the authority should
issue it from a frozen, versioned intent profile. An agent may propose job
variables, but should not issue, approve, or mutate its own profile or contract
after execution begins.

`bindIntentContract` computes a canonical SHA-256 digest. The job supplies the
resulting `intent_id` and `intent_digest` with every guarded call. AgentPass
carries that binding through decision events, approval evidence, request
digests, and provider execution receipts.

The evaluator ignores evidence with missing or mismatched intent bindings.
Observations additionally require verified provenance and a valid canonical
payload digest; unverified or altered observations produce an evidence finding
and do not influence the verdict. If required evidence is unavailable, the
result is `indeterminate`; missing evidence is not treated as proof of failure.

## Versioned Profiles and Contract Issuance

The profile schema is
[`agentpass.intent-profile.v1`](../schema/intent-profile.schema.json). A profile
freezes the comparison boundary shared by equivalent jobs:

- profile name, version, issuer, and canonical `profile_digest`;
- typed job-variable definitions and defaults;
- required outcomes and hard constraints;
- required evidence sources and trusted-observation requirements; and
- default execution preferences.

Predicate values may use an explicit `{ "$variable": "refund_amount" }`
reference. `issueIntentContract` validates the supplied variables, resolves
those references without executing code, normalizes timestamps, copies every
profile control, and emits a canonical per-job contract carrying
`profile_version`, `profile_digest`, and the normalized `profile_variables`.
The issuance input has no fields for overriding predicates or evidence
requirements, and unknown fields are rejected.

```ts
import {
  bindIntentProfile,
  issueIntentContract,
  type IntentProfile
} from "@dinpd/ai-agent-guard";

const profile = bindIntentProfile(rawProfile as IntentProfile);
const contract = issueIntentContract(profile, {
  intent_id: "refund-case-1042",
  job_id: "case-1042",
  variables: { payment_id: "pi_123", refund_amount: 49 },
  issued_at: "2026-07-20T17:59:00Z",
  expires_at: "2026-07-20T18:30:00Z"
});
```

Canonicalization makes issuance insensitive to object-key order and equivalent
date-time notation. The same frozen profile and normalized job inputs produce
the same contract and digest. Changing a profile requires a new version rather
than editing the registered version in place. The reference definition is
[`support-refund-profile.json`](../packages/guard/examples/support-refund-profile.json).

## Contract Shape

The JSON Schema is
[`schema/intent-contract.schema.json`](../schema/intent-contract.schema.json).
A contract contains:

- `required_outcomes`: observable predicates that define job completion.
- `hard_constraints`: predicates that must all pass independently of outcome.
- `preferences`: soft limits for calls, receipts, retries, replays, denials,
  runtime, and estimated cost.
- `evidence_requirements`: sources that must be supplied for a qualified
  success.

Predicates use typed selectors and assertions. They do not execute code or
accept arbitrary expression strings. The supported evidence sources are:

- `decision_events`
- `execution_receipts`
- `observations`
- `job`

Selectors support `equals`, `not_equals`, `in`, `not_in`, and `exists`.
Assertions additionally support count equality and bounds, numeric bounds, and
`any` / `all` quantifiers.

## Evaluation Receipt

`evaluateIntent` returns an
[`agentpass.intent-evaluation.v1`](../schema/intent-evaluation.schema.json)
receipt with separate dimensions:

- `verdict`: `completed`, `partial`, `failed`, or `indeterminate`.
- `constraint_compliance`: `pass`, `fail`, or `indeterminate`.
- `goal_attainment`: weighted required-outcome completion from 0 to 1.
- `evidence_confidence`: the share of predicates, required sources, and trusted
  observation requirements that were determinately satisfied.
- `execution_discipline`: observed calls, executions, replays, retries,
  denials, challenges, cost, runtime, and preference findings.
- `qualified_success`: true only when outcomes are completed, constraints pass,
  and all required evidence sources and trusted observations are present.

Soft preferences do not change `qualified_success`. They remain visible as
execution-quality findings rather than silently overriding goal completion or
hard compliance.

## TypeScript API

```ts
import {
  bindIntentContract,
  evaluateIntent,
  type IntentContract
} from "@dinpd/ai-agent-guard";

const contract = bindIntentContract(rawContract as IntentContract);

const evaluation = evaluateIntent(contract, {
  decision_events: jobDecisionEvents,
  execution_receipts: providerReceipts,
  observations: providerStateObservations,
  job: {
    intent_id: contract.intent_id,
    intent_digest: contract.intent_digest,
    job_id: contract.job_id,
    started_at: jobStartedAt,
    completed_at: jobCompletedAt
  }
});
```

Run the complete local refund example:

```bash
cd packages/guard
npm run demo:intent
```

The demo binds a refund intent, executes an approved refund through the local
tool gate, creates a provider observation, and emits a qualified evaluation
receipt.

## Hosted Registry and Evaluation

The Cloudflare gateway provides a tenant-scoped trust gate for the same
contract and evaluation model:

- `POST /tenants/<tenant-id>/intent-profiles` registers and freezes a versioned
  profile definition.
- `GET /tenants/<tenant-id>/intent-profiles` and `GET .../<profile>.<version>`
  expose tenant-scoped lifecycle reads.
- `POST .../<profile>.<version>/issue` deterministically issues and registers a
  profile-bound job contract.
- `POST /tenants/<tenant-id>/intent-contracts` calculates the canonical digest
  and freezes a raw compatibility contract under its `intent_id` when tenant
  policy permits raw issuance.
- `GET /tenants/<tenant-id>/intent-contracts/<intent-id>` returns the frozen
  contract and its `pending`, `active`, or `expired` status.
- Intent-bound approval, JIT, authorization, and execution-result requests fail
  closed on incomplete, unknown, altered, expired, or job-mismatched bindings.
- Authorization decisions and provider execution receipts are collected
  durably. `POST .../<intent-id>/observations` adds application or provider
  observations using
  [`agentpass.intent-observation.v1`](../schema/intent-observation.schema.json).
- `POST .../<intent-id>/evaluate` emits a non-finalizing preview over the
  currently stored evidence.
- `POST .../<intent-id>/finalize` freezes a canonical evidence snapshot and
  emits the one final receipt bound to its digest.
- `GET .../<intent-id>/evaluations` returns history, the latest preview, final
  receipt, immutable snapshot, and finalization status.

Calls without either intent binding field retain the existing authorization
behavior. If either field is present, both are required. Contract expiry blocks
new runtime authority but does not prevent late evidence collection or
post-execution evaluation.

Tenant policy sets `intent_assurance.contract_issuance.mode` to either
`registered_profile_required` or `raw_compatible`. Profile-bound contracts
always use the issuance endpoint; direct registration cannot attach a profile
digest to an independently authored contract. Evaluation receipts propagate the
profile version and digest so later rollups compare only equivalent definitions.

## Immutable Evidence Finalization

Preview and final evaluation have deliberately different semantics. A preview
answers “what would the verdict be with the evidence available now?” and may be
repeated while job evidence is still changing. It does not close the job.

Finalization creates an `agentpass.intent-evidence-snapshot.v1` containing the
exact bound decision events, provider execution receipts, verified
observations, and job evidence used by the evaluator. Its source manifest
records, for each evidence source:

- the evidence count;
- stable evidence identifiers; and
- a canonical SHA-256 source digest.

Those manifests produce one canonical `evidence_digest` and deterministic
snapshot ID. The final `agentpass.intent-evaluation.v1` receipt declares
`evaluation_mode: final` and carries both `snapshot_id` and `evidence_digest`.
This makes the result reproducible without treating a mutable query result as a
final quality record.

The durable finalization marker is the evidence freeze boundary. Identical
finalization retries return the stored receipt and snapshot without adding
history entries. A changed finalization request or later decision, execution,
observation, or job write fails with `intent_evidence_finalized`. Lifecycle
reads remain tenant-scoped and expose the latest preview separately from the
single final receipt.

Audit types distinguish `agentpass.intent.evaluation.previewed`,
`agentpass.intent.finalized`, `agentpass.intent.finalization.replayed`, and
`agentpass.intent.evidence.rejected`.

## Trusted Observation Provenance

The tenant manifest controls which external issuers may prove each outcome.
Trust can be narrowed by intent profile and predicate:

```yaml
intent_assurance:
  observations:
    max_age_seconds: 300
    max_future_skew_seconds: 30
    trusted_issuers:
      - issuer: stripe-adapter
        profiles: [support_refund.v1]
        predicates: [refund.status]
        verification_methods: [oidc, jws]
        oidc_subjects: [stripe-observer]
        oidc_issuers: [https://identity.example.com]
        jws_subjects: [stripe-observer]
        jwks_uri: https://stripe.example.com/.well-known/jwks.json
        audiences: [agentpass-observations]
```

Direct JSON observations require an authenticated OIDC caller whose token
issuer and subject match the selected issuer policy. Alternatively, the caller
can submit `{ "jws": "<compact-RS256-JWS>" }`. The JWS payload contains `iss`,
`aud`, `sub`, `jti`, `iat`, `exp`, and the complete `observation` object. Its
`jti` must equal `observation_id`; signed tenant, intent, contract digest,
lifetime, and payload digest values must all match.

Accepted observations are normalized with:

- a stable `observation_id`, tenant, intent ID, and frozen intent digest;
- `issued_at`, `observed_at`, and bounded `expires_at` timestamps;
- a canonical SHA-256 `payload_digest`; and
- provenance containing the verification method, verified issuer, verification
  timestamp, subject, and signing `kid` when applicable.

Expired, stale, future-dated, untrusted, altered, or incorrectly bound evidence
fails closed with a stable `error_code`. Repeating the exact observation ID and
payload returns the original record with `replayed: true` and does not append
evidence. Reusing the ID for different contents returns
`observation_id_conflict`.

Unsigned input is disabled by default. It is available only when the manifest
environment is `dev`, `development`, `test`, or `local`, the selected issuer
explicitly permits `unsigned_dev`, and the Worker variable
`AGENTID_INTENT_OBSERVATION_DEV_UNSIGNED` is exactly `true`. This mode must not
be enabled for production tenants.

Audit events distinguish `accepted`, `rejected`, and `replayed` observations.
They retain correlation metadata and evidence digests but omit the raw
observation value.

## Version 1 Scope

Version 1 is deterministic and profile-specific. It does not infer intent from
raw prompts, use an LLM judge in the trusted path, produce cross-domain agent
rankings, prove causality, or automatically increase an agent's authority from
historical quality scores. Subjective evaluator plugins and aggregate quality
analytics remain future work. Version 1 external observation attestation is
limited to OIDC-bound JSON and RS256/JWKS JWS envelopes.

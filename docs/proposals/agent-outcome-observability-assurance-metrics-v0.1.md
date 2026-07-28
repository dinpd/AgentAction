# Agent Outcome Observability and Assurance Metrics

**Status:** Community draft 0.1

**Maturity:** Experimental; not an adopted standard

**Discussion:** [AgentPass issue #58](https://github.com/dinpd/AgentPass/issues/58)

**Companion proposal:** [Agent Action Boundary Evidence](agent-action-boundary-evidence-v0.1.md)

**Intended audience:** Agent runtimes, observability systems, evaluation
platforms, authorization services, tool providers, security and risk teams,
and operators of production agent workflows

## Abstract

Agent observability systems commonly report tool-call counts, latency, errors,
and model usage. Evaluation systems commonly report task success or a judge
score. Authorization systems report allow, deny, and challenge decisions.
These are all useful, but they answer different questions.

This proposal defines a vendor-neutral measurement model for assessing:

1. whether an agent's intended outcome was achieved;
2. whether hard constraints were satisfied;
3. whether a control correctly enabled or intervened in an action;
4. whether controls introduced unnecessary friction;
5. whether execution was disciplined, reliable, and free of unintended
   duplicate side effects; and
6. whether the evidence supporting those conclusions was sufficient and
   trustworthy.

The model depends on evidence that preserves the distinction between proposed,
authorized, executed, observed, and assessed claims. It does not redefine that
evidence lifecycle. It defines measurement profiles, state vocabularies,
eligibility rules, denominators, exclusions, confidence, and aggregation
requirements for deriving comparable assessments from the evidence.

The proposal complements OpenTelemetry causal telemetry. Traces explain where
and when work happened. Durable assessment evidence explains what conclusion
was reached, using which evidence and measurement profile. Final measurements
must remain valid when trace export is unavailable or sampled out.

## Draft status and feedback

This document is intentionally a pre-standard community draft. The state
vocabulary, metric names, profile shape, aggregation rules, and standards venue
are open for discussion. Independent implementations should expect
incompatible changes until a stable version is declared.

Feedback is especially useful from teams operating:

- production agent and workflow runtimes;
- agent evaluation and experiment platforms;
- OpenTelemetry and AI observability systems;
- authorization gateways and policy decision points;
- MCP hosts, gateways, and tool servers;
- provider APIs and systems of record;
- security operations, risk, audit, and compliance systems; and
- human-review and incident-adjudication workflows.

The most useful feedback includes counterexamples, cohort and denominator
failures, privacy concerns, examples of misleading dashboards, and portable
fixtures that multiple implementations can evaluate.

## Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** in this document are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear
in all capitals.

Because this is an experimental draft, these terms describe the behavior
required for interoperability with this draft; they do not imply adoption by a
standards organization.

## Problem

An agent run can be successful along one dimension and unsuccessful along
another:

```text
request completed successfully
        !=
the intended outcome occurred
        !=
all constraints were satisfied
        !=
the authorization control made the correct decision
        !=
the available evidence is sufficient to know
```

Collapsing these statements into one success flag or score produces misleading
results:

- a prevented unsafe action is counted as a failed run;
- a successful but unauthorized side effect is counted as success;
- an `allow` decision is treated as independent proof that the action was
  appropriate;
- a `deny` decision is treated as independent proof that harm was prevented;
- missing or untrusted evidence is silently converted into failure or success;
- previews and final assessments are mixed in the same denominator;
- incompatible intent, policy, or evaluator versions are aggregated together;
- excluded records disappear instead of being reported;
- retries and replays are counted as additional successful executions; and
- one high-level agent score hides outcome, safety, reliability, and evidence
  quality tradeoffs.

The result is observability that can describe activity but cannot reliably
explain whether a system achieved the right outcome under the right
constraints.

## Goals

The proposal aims to:

- preserve separate measurement dimensions for outcome, constraints, control
  behavior, execution discipline, and evidence quality;
- define explicit achieved, failed, intervened, missed, excluded, and
  indeterminate states;
- make eligibility rules, numerators, denominators, and exclusions
  reproducible;
- prevent a control's own decision from being treated as its ground truth;
- support deterministic, human, statistical, and model-based evaluators while
  identifying their provenance and version;
- bind final assessments to immutable evidence snapshots or digests;
- compare only compatible measurement and intent profiles;
- support action-, step-, run-, and cohort-level measurements;
- correlate with traces without depending on trace sampling;
- minimize sensitive content and high-cardinality telemetry; and
- enable independent implementations to reproduce aggregate results.

## Non-goals

This proposal does not:

- define a universal agent score or cross-profile leaderboard;
- redefine the evidence envelope or record lifecycle from the
  [Agent Action Boundary Evidence proposal](agent-action-boundary-evidence-v0.1.md);
- define an authorization policy language or decide which actions are safe;
- treat gate decisions, model self-reports, traces, or transport status as
  independent ground truth;
- standardize prompts, chain-of-thought, model reasoning, or unrestricted tool
  inputs and outputs;
- require a particular telemetry backend, database, evaluator, or dashboard;
- require every assessment to use an LLM judge;
- prescribe business-specific definitions of harm, value, or task success; or
- make historical quality measurements a source of runtime authority.

## Relationship to boundary evidence and causal telemetry

This proposal assumes that an implementation can distinguish the following
claims:

```text
proposed -> authorized -> executed -> observed -> assessed
```

The companion boundary-evidence proposal defines those claims, their producers,
and their joins. This proposal consumes them as inputs. It does not redefine
their canonical envelope, signing profile, or authority semantics.

OpenTelemetry traces and metrics provide causal and operational visibility:
run structure, model calls, tool calls, latency, errors, retries, and resource
usage. They MAY carry safe assessment attributes or links. However:

1. trace context is correlation metadata, not authority or ground truth;
2. trace sampling MUST NOT silently remove evidence required for a final
   assessment;
3. a final assessment MUST identify its measurement profile, evaluator, and
   evidence basis outside transient trace state; and
4. a missing span MUST NOT be interpreted as a missing execution or failed
   outcome without an explicit evidence rule.

## Measurement subject and unit of analysis

Every assessment MUST identify a **measurement subject**. A subject is one of:

- `action`: one boundary-scoped action attempt;
- `logical_step`: one workflow step that may contain multiple attempts;
- `run`: one bounded job or workflow execution; or
- `cohort`: a declared compatible population of actions, steps, or runs.

A selected profile MAY define additional subject kinds, but portable consumers
MUST NOT combine unlike subject kinds in one denominator.

The subject reference SHOULD include:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `subject_kind` | REQUIRED | `action`, `logical_step`, `run`, or `cohort` |
| `subject_ref` | REQUIRED | Stable, tenant-scoped subject identifier |
| `intent_ref` | OPTIONAL | Intent contract identifier and digest |
| `measurement_profile_ref` | REQUIRED | Profile identifier, version, and digest |
| `evaluator_ref` | REQUIRED | Evaluator identifier and version |
| `evidence_snapshot_ref` | REQUIRED for final assessments | Immutable snapshot or digest |
| `assessment_revision` | REQUIRED | Monotonic revision within the subject and profile |

Portable subject references SHOULD be pseudonymous. Direct customer, user,
account, or case identifiers SHOULD remain in access-controlled artifacts.

## Measurement profiles

A **measurement profile** defines what is measured and how results become
comparable. A profile MUST be immutable once used for a final assessment.

A profile SHOULD declare:

```json
{
  "profile_id": "support-refund-outcomes",
  "profile_version": "1.0.0",
  "subject_kind": "run",
  "intent_profile_ref": "support-refund.v1",
  "eligibility": {
    "requires_finalized_run": true,
    "required_evidence": [
      "authorization_decisions",
      "execution_receipts",
      "refund_status_observation"
    ]
  },
  "dimensions": [
    "intent_fulfillment",
    "constraint_compliance",
    "control_effectiveness",
    "execution_discipline",
    "evidence_quality"
  ],
  "evaluator_ref": "refund-deterministic-evaluator@1",
  "aggregation": {
    "window": "calendar_day",
    "minimum_sample_size": 20
  },
  "privacy_profile": "tenant-operations-low-cardinality-v1"
}
```

A profile MUST define:

- subject kind;
- eligibility and exclusion rules;
- required evidence and freshness rules;
- supported measurement dimensions;
- evaluator identity and version;
- finalization and revision rules;
- state-to-numerator mappings;
- denominator definitions;
- compatibility rules; and
- privacy and retention expectations.

Any change that can alter eligibility, state classification, numerator,
denominator, evidence requirements, evaluator behavior, or privacy semantics
MUST produce a new profile or evaluator version.

## Measurement dimensions

The following dimensions are logically independent. An implementation MUST NOT
derive one solely from another unless the selected profile explicitly defines
and justifies that rule.

### Execution disposition

Execution disposition describes what happened operationally:

- `not_attempted`;
- `not_authorized`;
- `challenge_pending`;
- `executed`;
- `failed`;
- `replayed`;
- `duplicate_execution`; or
- `unknown`.

`replayed` means a prior terminal result was returned without repeating the
side effect. It MUST NOT be counted as a new execution.

### Intent fulfillment

Intent fulfillment describes whether the required real-world outcome occurred:

- `achieved`;
- `partially_achieved`;
- `not_achieved`;
- `indeterminate`; or
- `not_applicable`.

Transport success, execution success, or an `allow` decision is insufficient
by itself to classify intent as `achieved`.

### Constraint compliance

Constraint compliance describes whether hard conditions were preserved:

- `satisfied`;
- `violated`;
- `indeterminate`; or
- `not_applicable`.

Constraints may cover authorization scope, data movement, budget, approval,
timing, sequence, amount, recipient, resource, duplication, or
business-specific invariants.

One violated hard constraint SHOULD make the subject noncompliant even if the
intended outcome was achieved.

### Control effectiveness

Control effectiveness compares the system's observed disposition with an
independently established reference disposition.

The reference disposition is:

- `should_enable`;
- `should_intervene`;
- `indeterminate`; or
- `not_applicable`.

The observed control disposition is:

- `enabled`;
- `intervened`;
- `not_reached`; or
- `unknown`.

When both values are independently established, the assessment is:

| Reference disposition | Observed disposition | Classification |
| --- | --- | --- |
| `should_enable` | `enabled` | `correct_enablement` |
| `should_enable` | `intervened` | `unnecessary_intervention` |
| `should_intervene` | `intervened` | `correct_intervention` |
| `should_intervene` | `enabled` | `missed_control` |
| Any | `not_reached` | `not_applicable` or profile-defined |
| `indeterminate` | Any | `indeterminate` |
| Any | `unknown` | `indeterminate` |

An authorization decision MUST NOT serve as its own reference disposition.
Reference disposition MAY come from a versioned policy replay, independent
human adjudication, trusted business-state evidence, incident review, or
another profile-defined evaluator.

The term `prevented_harm` is stronger than `correct_intervention`. An
implementation MUST NOT claim prevented harm unless a selected impact profile
defines the harm, establishes that the proposed action would have caused it,
and records the adjudication evidence. Otherwise, implementations SHOULD use
`correct_intervention` or `prevented_disallowed_action`.

### Control friction

Control friction describes the operational cost of intervention:

- challenge count and duration;
- human-review count and duration;
- abandoned work after challenge;
- repeated approval requests;
- scope-drift rejections;
- unnecessary intervention; and
- time from proposal to final disposition.

A mandatory and correctly applied step-up MAY still create measurable friction
without being an `unnecessary_intervention`.

### Execution discipline

Execution discipline describes how reliably the runtime performed bounded
work:

- attempt count;
- retry count;
- replay count;
- duplicate-execution count;
- abandonment count;
- execution-failure count;
- budget-warning and budget-exhaustion count;
- latency and runtime distributions; and
- compensation or rollback state when applicable.

Attempts, retries, replays, and executions MUST remain distinct counts.

### Evidence quality

Evidence quality describes whether an assessment has an adequate basis:

- `sufficient`;
- `incomplete`;
- `untrusted`;
- `stale`;
- `conflicting`; or
- `indeterminate`.

An implementation MAY additionally report confidence, but confidence MUST be
qualified by its meaning:

- ordinal confidence such as `high`, `medium`, `low`, or `unknown`;
- calibrated probability with calibration method and population; or
- profile-defined confidence with an explicit interpretation.

An uncalibrated numeric score MUST NOT be represented as a probability.

## Qualified success

This draft defines **qualified success** as a profile-derived result, not a
universal property.

Unless a profile defines stricter requirements, a subject is a qualified
success only when:

1. intent fulfillment is `achieved`;
2. constraint compliance is `satisfied`;
3. evidence quality is `sufficient`; and
4. the subject is eligible and final.

```text
qualified_success
  = achieved intent
  AND satisfied constraints
  AND sufficient evidence
  AND eligible final subject
```

Execution success alone MUST NOT produce qualified success. A profile MAY
require additional conditions such as no duplicate execution, bounded latency,
or a verified observer.

## Eligibility, exclusions, and indeterminate results

Every aggregate MUST report the population accounting needed to reconstruct
its denominator:

| Count | Meaning |
| --- | --- |
| `candidate_count` | Subjects considered before eligibility rules |
| `eligible_count` | Subjects meeting the declared profile |
| `assessed_count` | Eligible subjects with a final assessment |
| `indeterminate_count` | Assessed subjects that cannot be classified |
| `excluded_count` | Candidates excluded by an explicit rule |
| `missing_count` | Expected subjects or evidence absent from the index |

Exclusions MUST include stable reason codes and per-reason counts. Example
reasons include:

- incompatible profile version;
- preview-only assessment;
- outside the declared time window;
- subject kind mismatch;
- test or synthetic traffic excluded by profile;
- evidence outside freshness bounds; or
- duplicate index record.

Missing evidence SHOULD normally produce `indeterminate` or `incomplete`, not
an exclusion. A profile MUST NOT exclude work merely because it failed, was
denied, was challenged, has low confidence, or lacks the desired outcome.

The aggregate MUST declare its denominator. For example:

```text
qualified_success_rate
  = qualified_success_count / eligible_count
```

An implementation MAY also publish a rate over `assessed_count`, but the name
and denominator MUST be distinct.

## Derived metrics

Portable metrics SHOULD publish numerator and denominator counts alongside any
rate.

### Outcome metrics

```text
intent_achievement_rate
  = achieved_count / intent_assessable_count

qualified_success_rate
  = qualified_success_count / eligible_count

indeterminate_rate
  = indeterminate_count / eligible_count
```

`intent_assessable_count` excludes `not_applicable` but includes profile-defined
final states. It MUST NOT silently exclude `not_achieved`.

### Constraint metrics

```text
constraint_violation_rate
  = violated_count / constraint_assessable_count

constraint_satisfaction_rate
  = satisfied_count / constraint_assessable_count
```

Per-constraint rates MAY be reported when the constraint identifier is
allowlisted and low-cardinality.

### Control metrics

```text
correct_intervention_rate
  = correct_intervention_count / should_intervene_count

missed_control_rate
  = missed_control_count / should_intervene_count

correct_enablement_rate
  = correct_enablement_count / should_enable_count

unnecessary_intervention_rate
  = unnecessary_intervention_count / should_enable_count
```

These rates MUST be based on independently adjudicated subjects. Raw allow,
deny, or challenge rates MAY be published as operational activity, but MUST
NOT be labeled correctness, harm prevention, or miss rates.

### Reliability and discipline metrics

Suggested metrics include:

- execution failure rate;
- exact-replay rate;
- duplicate-execution rate;
- mean and distribution of attempts per logical step;
- abandoned-after-challenge rate;
- compensation or rollback rate; and
- proposal-to-final-disposition latency.

Implementations MUST state whether replays and retries are counted per action,
step, or run.

### Evidence metrics

Suggested metrics include:

- sufficient-evidence rate;
- incomplete-, untrusted-, stale-, and conflicting-evidence rates;
- required-source coverage;
- observation freshness distributions;
- finalization lag; and
- assessment revision count.

Evidence quality metrics MUST NOT be used as a proxy for outcome quality.

## Ground truth and adjudication

This proposal uses **reference disposition** rather than assuming universal
ground truth. The reference is itself an assessment claim with provenance,
scope, and limitations.

An adjudication record SHOULD identify:

- adjudicator or evaluator and version;
- adjudication time;
- subject and measurement-profile binding;
- evidence snapshot or digest;
- reference disposition;
- reason codes;
- confidence interpretation; and
- whether the adjudication is deterministic, human, statistical, model-based,
  or mixed.

Model-based and human adjudication MAY be useful. They MUST identify evaluator
version and evidence basis. A model evaluating its own action without
independent evidence SHOULD NOT be treated as an independent adjudicator.

Conflicting adjudications MUST remain visible. A selected profile MAY define a
resolution procedure, but MUST NOT silently select the most favorable result.

## Preview, finalization, and revision

An assessment is either `preview` or `final`.

- Preview assessments MAY change as evidence arrives.
- Final assessments MUST bind an immutable evidence snapshot or digest.
- Aggregate final metrics MUST NOT mix preview assessments unless the metric is
  explicitly labeled as preview.
- Late evidence MUST NOT mutate a final assessment in place.
- Reassessment after late evidence or evaluator correction MUST create a new
  assessment revision and preserve the superseded revision.

An aggregate MUST declare whether it uses the latest final revision or a
specific assessment cutoff.

## Comparability and cohort rules

Subjects are directly comparable only when the selected profile declares them
compatible.

At minimum, a cohort key SHOULD include:

- measurement profile identifier and version;
- intent profile identifier and version when applicable;
- evaluator identifier and version;
- subject kind;
- environment or deployment class when it changes semantics;
- finalization semantics; and
- schema/interoperability profile version.

Implementations MUST NOT combine incompatible intent profiles, measurement
profiles, or evaluator versions into one rate. They MAY render them as separate
groups or small multiples.

Cross-version comparison requires an explicit compatibility declaration or a
documented bridge analysis. A dashboard MUST NOT imply continuity merely
because two versions share a display name.

Minimum sample size, uncertainty interval, and time-window semantics SHOULD be
reported for rates used in operational or governance decisions.

## Logical assessment representation

This proposal defines a profile for the `action.assessed` record from the
boundary-evidence proposal. It does not define a new transport envelope.

An abbreviated final assessment may contain:

```json
{
  "assessment_id": "assessment-job-1042-v1",
  "target_ref": {
    "subject_kind": "run",
    "subject_ref": "job-1042"
  },
  "measurement_profile_ref": {
    "profile_id": "support-refund-outcomes",
    "profile_version": "1.0.0",
    "profile_digest": "sha256:aaaaaaaaaaaaaaaa"
  },
  "evaluator_ref": "refund-deterministic-evaluator@1",
  "assessment_revision": 1,
  "lifecycle": "final",
  "dimensions": {
    "execution_disposition": "executed",
    "intent_fulfillment": "achieved",
    "constraint_compliance": "satisfied",
    "control_effectiveness": "correct_enablement",
    "evidence_quality": "sufficient"
  },
  "derived": {
    "qualified_success": true
  },
  "evidence_snapshot_ref": {
    "snapshot_id": "snapshot-job-1042",
    "evidence_digest": "sha256:bbbbbbbbbbbbbbbb"
  },
  "assessed_at": "2026-07-28T12:00:00Z"
}
```

A selected interoperability profile MUST define whether dimensions are encoded
as one composite assessment or separate `action.assessed` records. Consumers
MUST be able to recover the same dimension states and evidence basis.

## Representative scenarios

### Safe action enabled and outcome achieved

- Reference disposition: `should_enable`
- Observed disposition: `enabled`
- Execution: `executed`
- Intent: `achieved`
- Constraints: `satisfied`
- Evidence: `sufficient`
- Control classification: `correct_enablement`
- Qualified success: `true`

### Unsafe action correctly denied

- Reference disposition: `should_intervene`
- Observed disposition: `intervened`
- Execution: `not_authorized`
- Intent: `not_applicable` or profile-defined
- Constraints: `satisfied` when non-execution is the required constraint
- Control classification: `correct_intervention`
- Qualified success: profile-defined; MUST NOT be inferred solely from denial

### Safe action unnecessarily blocked

- Reference disposition: `should_enable`
- Observed disposition: `intervened`
- Execution: `not_authorized`
- Control classification: `unnecessary_intervention`
- Friction: intervention and abandonment recorded
- Outcome: `not_achieved` or `indeterminate`, depending on evidence

### Unsafe action allowed

- Reference disposition: `should_intervene`
- Observed disposition: `enabled`
- Control classification: `missed_control`
- Execution and intent remain separately assessed
- A technically successful execution MUST NOT erase the control miss

### Missing outcome evidence

- Execution: `executed`
- Intent: `indeterminate`
- Constraints: assessed independently
- Evidence: `incomplete`
- Qualified success: `false` or `indeterminate` as defined by the profile, but
  never `true`
- Subject remains in the eligible denominator

### Exact replay after ambiguous timeout

- First attempt: `executed`
- Retry: `replayed`
- Logical side-effect count: one
- Replay count: one
- Duplicate-execution count: zero
- Outcome assessment binds the logical step, not two independent successes

### Duplicate side effect

- Two execution receipts establish two side effects for one bound logical
  request
- Execution discipline: `duplicate_execution`
- Constraint compliance: `violated` when single execution is required
- Outcome may still be `achieved`; qualified success remains false

## OpenTelemetry mapping

This proposal does not define accepted OpenTelemetry semantic conventions.

Implementations MAY:

- attach assessment IDs and low-cardinality final states to evaluator spans;
- emit assessment records as OpenTelemetry logs;
- emit counters and histograms derived from final compatible assessments; and
- use span links to connect retrospective assessment work to the evaluated
  trace.

Suggested low-cardinality metric dimensions include:

```text
agent.outcome.measurement_profile.id
agent.outcome.measurement_profile.version
agent.outcome.intent.state
agent.outcome.constraint.state
agent.outcome.control.classification
agent.outcome.evidence.state
agent.outcome.subject.kind
```

Candidate instruments could include:

```text
agent.outcome.assessment.count
agent.outcome.qualified_success.count
agent.outcome.control_intervention.count
agent.outcome.execution_attempt.count
agent.outcome.finalization.duration
```

These names are placeholders for discussion and MUST NOT be represented as
accepted OpenTelemetry conventions.

Metric labels MUST NOT contain run IDs, trace IDs, action IDs, direct customer
identifiers, raw tool names from unbounded namespaces, prompts, arguments, or
other high-cardinality values. Stable evidence and assessment identifiers MAY
appear on protected logs or span events when allowed by policy.

Durable final assessments MUST remain available and reproducible when spans are
sampled out or metric export fails.

## Privacy, cardinality, and retention

Measurement systems:

- MUST preserve tenant isolation in evidence, assessments, indexes, and
  aggregates;
- MUST NOT require credentials, bearer tokens, private keys, reusable grants,
  raw prompts, chain-of-thought, or unrestricted tool arguments;
- SHOULD use stable reason codes, digests, profile references, and protected
  artifact references;
- MUST NOT use direct personal or customer identifiers as metric labels;
- SHOULD define retention separately for raw observations, evidence snapshots,
  final assessments, and aggregates;
- MUST distinguish redacted, unavailable, absent, zero, and false values;
- SHOULD support deletion or cryptographic erasure of referenced sensitive
  artifacts; and
- MUST report when privacy filtering makes an assessment incomplete.

Small cohorts may expose sensitive behavior even without direct identifiers.
Implementations SHOULD apply minimum cohort sizes, access controls, or
suppression rules and report suppression explicitly.

## Security and misuse considerations

### Metric gaming

An operator can improve a rate by narrowing eligibility, excluding failures,
changing the evaluator, or delaying finalization. Profiles MUST make these
choices versioned and visible. Aggregates MUST expose population accounting and
finalization lag.

### Self-confirming controls

A control that labels every denied action unsafe will report perfect
intervention correctness. Reference disposition MUST come from an independently
identified adjudication process.

### Favorable-evidence selection

Evaluators can ignore contradictory or missing observations. Final assessments
SHOULD bind a source manifest, source counts, exclusions, and immutable evidence
digest. Conflicts MUST remain visible.

### Cross-profile aggregation

Combining unlike jobs or evaluator versions can create a meaningless score.
Consumers MUST enforce profile compatibility before aggregation.

### Telemetry leakage

Prompts, tool arguments, provider responses, and customer identifiers can leak
through trace attributes and metric labels. Implementations MUST use
allowlisted, low-cardinality attributes and protected evidence storage.

### Historical authority escalation

Past success does not authorize future actions. Runtime authority MUST NOT be
automatically expanded from quality metrics without a separate explicit policy
and authorization process.

## Conformance scenarios

A conformance corpus SHOULD include:

1. achieved outcome with satisfied constraints and sufficient evidence;
2. achieved outcome with one violated hard constraint;
3. execution success with missing outcome evidence;
4. correct intervention based on independent adjudication;
5. unnecessary intervention;
6. missed control followed by successful execution;
7. challenge followed by approved exact execution;
8. abandoned work after challenge;
9. exact replay after successful execution;
10. unintended duplicate execution;
11. conflicting trusted observations;
12. stale or untrusted evidence;
13. late evidence producing a new assessment revision;
14. incompatible profile versions rejected from one aggregate;
15. explicit exclusions with reconstructable population counts;
16. missing trace data with a valid durable final assessment; and
17. cross-tenant aggregation rejected.

For each case, fixtures SHOULD include the input evidence references,
measurement profile, evaluator version, expected dimension states, population
disposition, and expected aggregate contribution.

## Non-normative AgentPass mapping

AgentPass is one reference implementation; it is not the normative schema.

| Draft concept | AgentPass artifact |
| --- | --- |
| Measurement profile | Versioned intent profile plus rollup selection rules |
| Measurement subject | Intent-bound job or action |
| Intent fulfillment | Intent evaluation outcome |
| Constraint compliance | Constraint evaluation state |
| Execution discipline | Attempt, denial, retry, replay, runtime, and receipt summaries |
| Evidence quality | Confidence, provenance, exclusions, and data-quality findings |
| Final assessment | Immutable intent evaluation receipt |
| Cohort aggregate | Profile-scoped intent quality rollup |
| Operator presentation | Profile-separated Fleet Overview and finalized Jobs explorer |

Control-effectiveness adjudication is broader than the current intent-quality
rollup. Implementations need an independently versioned reference disposition
before labeling an intervention correct, unnecessary, or missed.

## Relationship to existing work

- [Agent Action Boundary Evidence](agent-action-boundary-evidence-v0.1.md)
  defines portable action, authorization, execution, observation, and
  assessment evidence.
- [W3C Trace Context](https://www.w3.org/TR/trace-context/) defines distributed
  trace propagation.
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
  define developing conventions for GenAI operations, agents, tools, events,
  and metrics.
- [OpenInference](https://arize-ai.github.io/openinference/spec/) defines an
  OpenTelemetry-based AI observability taxonomy.
- [CloudEvents](https://github.com/cloudevents/spec/blob/ce@stable/cloudevents/spec.md)
  defines a vendor-neutral event envelope.

This draft focuses on a gap between activity telemetry and application-specific
evaluation: portable semantics for outcome, constraint, control, reliability,
and evidence measurements with reproducible populations.

## Open questions

1. Are the proposed dimensions sufficiently independent and complete?
2. Should `qualified_success` be a portable derived term or remain entirely
   profile-defined?
3. Is `correct_intervention` preferable to the stronger and often
   counterfactual `prevented_harm`?
4. Which adjudication sources are credible enough for control-effectiveness
   metrics in practice?
5. How should mandatory human step-up be represented when it is correct but
   still introduces substantial friction?
6. Should confidence use a small ordinal vocabulary, calibrated probability,
   or profile-defined semantics?
7. What compatibility declarations are needed to compare evaluator or intent
   profile versions?
8. How should compensation, rollback, and delayed real-world outcomes revise a
   final assessment?
9. Which aggregate instruments and attributes belong in OpenTelemetry GenAI
   semantic conventions?
10. Which parts belong in a minimal interoperable core versus domain-specific
    measurement profiles?
11. How should subjective human or model-based evaluation disagreement be
    represented?
12. Is this best advanced through OpenTelemetry semantic conventions, an MCP
    SEP, a standalone specification, or coordinated profiles?

## Suggested validation experiments

Community implementations can test this model by:

1. evaluating the same evidence snapshot with two independent implementations;
2. recomputing an aggregate solely from portable final assessments;
3. comparing correct intervention and unnecessary intervention against an
   independently labeled corpus;
4. proving that failed, denied, challenged, and indeterminate work remains in
   population accounting;
5. showing profile-version separation in a dashboard;
6. finalizing an assessment after its originating trace is sampled out;
7. producing a new assessment revision after late evidence without mutating the
   prior final record; and
8. verifying that metric export contains no high-cardinality identifiers or
   sensitive action content.

## Change process

Changes to this draft should:

1. preserve a public discussion trail;
2. identify compatibility and denominator impact;
3. include or update representative assessment and aggregation cases;
4. distinguish normative measurement semantics from implementation guidance;
5. preserve the dependency on, rather than duplicate, boundary evidence; and
6. avoid presenting draft metric names as adopted conventions.

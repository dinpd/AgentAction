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
policy authority. An agent may propose contract contents, but should not issue,
approve, or mutate its own contract after execution begins.

`bindIntentContract` computes a canonical SHA-256 digest. The job supplies the
resulting `intent_id` and `intent_digest` with every guarded call. AgentPass
carries that binding through decision events, approval evidence, request
digests, and provider execution receipts.

The evaluator ignores evidence with missing or mismatched intent bindings. If
required evidence is unavailable, the result is `indeterminate`; missing
evidence is not treated as proof of failure.

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
- `evidence_confidence`: the share of predicates and required sources that were
  determinately evaluated.
- `execution_discipline`: observed calls, executions, replays, retries,
  denials, challenges, cost, runtime, and preference findings.
- `qualified_success`: true only when outcomes are completed, constraints pass,
  and all required evidence sources are present.

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

## Version 1 Scope

Version 1 is deterministic and profile-specific. It does not infer intent from
raw prompts, use an LLM judge in the trusted path, produce cross-domain agent
rankings, prove causality, or automatically increase an agent's authority from
historical quality scores. Subjective evaluator plugins and hosted persistence
remain future work.

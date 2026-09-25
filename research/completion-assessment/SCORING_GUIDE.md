# Reusing the completion-assessment protocol

The scorer checks evaluator judgments against independently established task
truth. It does not infer truth from a trace or execute the task for you.

1. Define a task and an oracle that can read its complete relevant state/history.
2. Freeze task IDs, the intervention schedule and expected evaluator names.
3. Execute the task, then expose only the evidence allowed by your adapter.
4. Give each evaluator the same task/evidence view. Do not pass oracle labels,
   scenario names, hidden tables, or expected answers into this interface.
5. Attach truth only after the evaluator returns S, F, or U. Preserve a row for
   every expected evaluator/case, including unavailable outputs as explicit U.
6. Score and inspect per-scenario results as well as pooled metrics.

## Version-1 input envelope

The previous experimental raw-array input is replaced by an envelope with an
explicit method roster. This prevents a missing method from silently disappearing.
Every row requires `id`, boolean `truth`, `label` (S/F/U), `method`, `scenario`,
and boolean `assumptions_hold`. IDs must mean the same case for every method.
The scorer rejects duplicate rows, unequal case sets, undeclared/missing methods,
and conflicting truth/scenario/trust metadata. Additional metadata may be retained
but is not used to score. The original protocol's class denominators are unchanged.

```json
{
  "schema_version": 1,
  "methods": ["naive", "cautious"],
  "rows": [
    {"id":"clean","truth":true,"label":"S","method":"naive","scenario":"clean","assumptions_hold":true},
    {"id":"duplicate","truth":false,"label":"S","method":"naive","scenario":"hidden_duplicate","assumptions_hold":true},
    {"id":"clean","truth":true,"label":"S","method":"cautious","scenario":"clean","assumptions_hold":true},
    {"id":"duplicate","truth":false,"label":"U","method":"cautious","scenario":"hidden_duplicate","assumptions_hold":true}
  ]
}
```

Save this as `adapter-batch.json` and run from the research directory:

```sh
node --experimental-strip-types src/score_assessments.mts < adapter-batch.json
```

Naive has 50% precision, 100% recall and 100% decisive coverage. Cautious has
100% precision, 100% recall and 50% coverage. The latter still leaves the negative
case unresolved: admission F1 alone does not measure that cost. Never omit that
row to make the denominator easier. Positive/U rows lower admission recall and
F1 while remaining distinct from explicit false-failure judgments.

## Adding a request-capable assessor

Use `assess(task, evidence)` to produce a verdict and machine-readable diagnostic.
Use `request(task, evidence, diagnostic)` to choose a bounded read-only scope.
The collector owns source credentials, freshness challenges and request budgets.
Reassess using the authenticated response; attach before/after truth only afterward.
Keep response failures as U, and retain both initial/final verdicts, the request,
response, read counts and payload bytes. A request is not a fourth truth label.

The implemented service adapter in `src/evidence_requests.mts` uses snapshot,
history or head scopes bound to a contract, task and resource. It exposes only
snapshot/head reads to the executor, forbids a second round and rejects binding
changes before any read. Production integration requires an independently trusted
collector and complete tracking of changes; this research module is not an SDK API.

Compare a targeted requester against full recollection and a baseline with the
same acquisition opportunity. Vary the collection condition, preserve task
effects, audit state independently and publish all failures. The protocol in
EVIDENCE_REQUEST_PROTOCOL.md defines this experiment's fixed scopes and budgets.

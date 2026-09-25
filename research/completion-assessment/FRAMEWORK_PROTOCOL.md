# Completion-assessor evaluation framework, version 1

The unit of evaluation is an assessor's verdict on a fixed task and evidence view,
not a model's ability to solve the task. An adapter owns a task definition, an
execution environment, an outcome oracle, and an evidence projection. The assessor
receives only the task and projected evidence. It returns S (success), F (observed
failure), or U (unknown). Oracle state, truth labels, and intervention names never
enter the assessor interface. Preserve case-level data and pair all methods on the
same cases. An external evaluator may have stronger input assumptions than an
online assessor; violating those assumptions tests the integration boundary, not
correctness of that evaluator under its documented contract.

## Scorecard

Retain all six cells: true-positive tasks receiving S/F/U, and true-negative tasks
receiving S/F/U. For success admission, TP is positive/S, FP is negative/S, and
FN is positive/F + positive/U. Precision = TP/(TP+FP); recall = TP/(TP+FN);
F1 = 2TP/(2TP+FP+FN). Positive admission is the same quantity as completion recall.
An unknown is not a factual failure prediction, even though a positive/U case is
a success not admitted. Explicit false-failure rate uses positive/F only.

Coverage = (S+F)/N. Selective error = (negative/S + positive/F)/(S+F).
Zero denominators produce null. Thus an always-unknown assessor on a corpus with
positives has zero recall and F1, undefined precision and selective error, and
zero coverage. Report whole-corpus and declared trust strata, without dropping
unknowns or trust-violation controls. Report scenario-level counts; parameter
variations are not independent deployment samples. Class mix determines pooled
precision and F1. Do not treat designed fault rates as production prevalence.

The service's five fixed policies give discrete risk/coverage operating points,
not a confidence-threshold curve. No AUROC, AUPRC, calibration or population
confidence bounds are inferred. Error costs require a declared application;
no metric weight is chosen after observing results to favor the remedy.

## External adapter protocol (frozen before its first experiment)

Source: sierra-research/tau2-bench revision
`b7ea9074c1cba482b30687fecdb5c8425fd6f619` (MIT, package version 1.0.1).
Use the retail base split and its actual environment, tools, annotated actions,
and unmodified EnvironmentEvaluator.calculate_reward. This study evaluates the
DB outcome component only. It does not run an LLM, user dialogue, natural-language
assertion judge, policy-compliance score or official full benchmark score.

Selection is exhaustive over the base split, with declared mechanical exclusions:
no DB criterion; nonempty initial state; no successful state-changing annotated
action; annotated or incomplete replay raises/returns an error; or removing the last mutating
action does not change the final DB. Record every selected and excluded task ID
and reason. Never choose tasks by the assessor's measured performance. Retain any
unexpected evaluator discrepancy and fail verification rather than drop it.

Execute the annotated actions through the upstream tools to create a goal DB.
Create an incomplete execution by omitting its final mutating action. Create an
extra-effect execution by appending an upstream modify_user_address call that
changes the address1 of the lexicographically first user to a fixed synthetic
marker distinct from its current value. This tests the upstream full-DB equality
criterion, including changes unrelated to the requested task. All worlds are
in-memory; none are customer operations. Ground truth compares the materialized
actual and goal DB dictionaries, separately from the replay evaluator and exposed
trace. Save task provenance, tool calls/results and compact DB changes against the
pinned original DB so another implementation can reconstruct all three states.

For every eligible task, run these eight conditions:

1. complete: actual and exposed execution are the full annotated sequence.
2. incomplete: actual and exposed execution omit the final mutating action.
3. visible_extra: actual and exposed execution include the extra address write.
4. hidden_extra: actual includes the extra write; exposed trace omits that suffix.
5. truncated_success: actual is complete; exposed trace omits its final mutating action.
6. unavailable_success: actual is complete; exposed trace is absent.
7. unavailable_incomplete: actual is incomplete; exposed trace is absent.
8. unmediated_extra: actual includes the extra write; the collector and exposed
   trace both omit it. This deliberately violates the completeness premise.

Compare upstream replay on the exposed trace with a research wrapper that first
checks its count and SHA-256 digest against a trusted collector's commitment to
the actual trace. Missing evidence or a failed commitment gives U. For the
unmediated control the commitment covers only the recorded trace. The commitment
is trusted harness metadata, not a new upstream API or a cryptographic signature.
The wrapper is a closure-only integration example; it is not the service's
closure/revision implementation and adds no real-time freshness guarantee.
Also report an always-U reference to expose the inadequacy of zero error alone.

Call the original upstream evaluator with its original task and exposed messages;
use db_check.db_match, not its aggregate reward, to map to S/F. Missing trace maps
to U before calling an API that expects a list. Strict replay remains enabled.
Normalize message timestamps at creation; use deterministic tool-call IDs.

Freeze upstream source/data hashes and dependency versions. Disable dotenv loading,
LiteLLM's remote model-cost fetch, and socket connections before importing upstream
code; no credentials or model calls. Full external reruns require installing the
pinned upstream checkout separately; default saved-result verification uses only
Python's standard library. Distinguish externally authored tasks/grader from
independent experimental design or independent-organization replication.

## Implementation notes recorded after the first replay

The first run selected 91 of 114 tasks: ten lacked mutating actions and thirteen
returned a tool error under the declared scripted replay rule. No task was
excluded for an unexpected assessor verdict. All IDs and exact error messages
are retained. Two upstream convenience package initializers (`tau2` and
`tau2.voice.audio_native.openai`) eagerly import optional voice runners even for
DB-only evaluation. The adapter supplies their package search paths without those
re-exports; substantive upstream modules are unmodified and hashed. These import
and dependency details do not change the selection or intervention design.

A second exact rerun follows final source cleanup. Identical task/trace replay
verdicts are cached, rather than repeatedly reconstructing the same DB for each
wrapper. Case-specific commitments are still checked on every decision.

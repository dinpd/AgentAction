# Related-work and claim audit

Search/review date: 2026-09-24. This is a targeted primary-source review, not a
systematic literature review. Discovery queries included agent runtime
enforcement, execution receipts, outcome verification, provenance, completion
admission, and selective classification. Product marketing pages and secondary
aggregators are not used to support scientific claims.

| Source | Material inspected | Narrow claim supported | Relationship / boundary |
| --- | --- | --- | --- |
| [AgentSpec v3](https://arxiv.org/html/2503.18666v3) | Abstract, introduction, language/runtime design | Structured rules mediate agent actions at runtime | Runtime enforcement is established; our experiment evaluates completion evidence after effects |
| [EvidenceNet v2](https://arxiv.org/html/2609.10181v2) | Sections III, IV, V, including contracts, epoch freshness, admission matrix, and interventions | Completion contracts require source-bound, current post-change evidence in network operations | Closest prior work; it already separates admission from external truth and uses content-only ablations. We do not claim that distinction as new. Our contribution is a reusable case study of a different existing implementation, unknown versus empty streams, conflicting temporal records, and retained semantic counterexamples |
| [Proof of Execution v1](https://arxiv.org/html/2607.05397v1) | Abstract, empirical evaluation, limitations, witness discussion | Execution attestation binds contract authority, recorded effects, history and replay under explicit deployment assumptions | Receipts, immutability, and contract binding are not novel contributions here; we do not implement or benchmark PoE |
| [CONTINUITY v1](https://arxiv.org/html/2609.05269v1) | Sections 7 and 8, abstract and complete-mediation discussion | Authenticated context connects security controls; deterministic fault injection includes explicit mediation assumptions | Independent sound controls need not compose; our simulated parameterizations are likewise finite conformance cases, not independent attack samples |
| [tau-bench v1](https://arxiv.org/abs/2406.12045v1) | Primary abstract; full-text located | Tool-agent-user evaluation compares final database state with an annotated goal | Task-state evaluation is established. We evaluate the observer/assessor rather than model task-solving ability. The extension uses the updated retail task set below; it does not reuse published model scores |
| [Geifman and El-Yaniv](https://arxiv.org/abs/1705.08500v2) | Primary abstract | Reject-option evaluation trades risk and coverage | Borrow the evaluation perspective, not their learning method or statistical guarantee |
| [in-toto](https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias) | Publisher abstract and bibliography | Signed supply-chain provenance permits integrity verification | Precedent for separating authenticated provenance from application semantics; no agent-completion claims attributed to it |
| [RATS](https://www.rfc-editor.org/rfc/rfc9334.html) | Sections 4, 8, 10 and freshness discussion | Evidence, appraisal policy, and results have distinct roles; timestamps/nonces/epochs support freshness | Our application-level evaluator is not a RATS attestation implementation |
| AgentAction | Pinned production source, intent-assurance documentation, guard tests and selected gateway lifecycle tests | Local evaluator assumes verified provenance; hosted JWS ingress verifies authenticity, lifetime and binding; snapshots freeze evidence | No production source is modified by the research artifact |
| [SQLite isolation](https://sqlite.org/isolation.html) | Official isolation and WAL concurrency documentation | Separate connections observe committed snapshots; WAL permits simultaneous readers and a writer | Supports the service schedule design, not a new database-isolation contribution |

## Claims deliberately excluded

- First completion contract, first agent runtime gate, first verifiable receipt,
  novel signature scheme, or universally sound success detector.
- Universal superiority to named prior systems. An upstream tau-bench DB grader
  is executed; corrupted traces test its integration premise, not its correctness
  under the expected complete-input contract.
- Production attack prevalence, real customer outcomes, LLM benchmark scores,
  causal attribution, calibrated probabilities, or end-to-end gateway latency.
- That operator-produced logs are inherently untrustworthy, or that ordinary
  tracing cannot be extended with comparable checks.

## Manuscript claim mapping

| Claim | Artifact evidence |
| --- | --- |
| Corpus dimensions, false-success/false-failure counts, coverage | `results/assessments.jsonl`, independently recounted by `verify_results.py` |
| Identical exposed inputs with opposite true states | `test/research.test.mts`, missing-success/failure pairs in `results/cases.jsonl` |
| Cryptographic rejection versus semantic falsehood | Actual production verifier calls, explicit `rejected` codes and negative-control cases |
| Universal versus latest observation tradeoff | Conflict/evolution rows and frozen separately issued profiles |
| Absent versus empty stream behavior | `results/stream-omission.jsonl`, all eight masks, both representations |
| Observation loss affects coverage | `results/observation-loss.jsonl`, paired deterministic masks |
| Local latency and payload size | Raw `results/timing.json` samples and recorded environment; no remote timings |
| Existing snapshot/profile behavior | Targeted existing `cloudflare/tests/worker.test.ts` tests; architectural context only |
| Complementary closure and revision safeguards | `src/remedy.mts`, five matched configurations in `results/service/assessments.jsonl` |
| Persistent retries, overlapping requests, and crash rollback | Actual loopback HTTP, pre-commit/arrival barriers, direct read-only SQLite audit, saved schedules and table exports |
| Conditional accuracy and lost coverage | Separate within/outside-assumption summaries; unknowns and positive admission retained; all trust-violation false successes included |
| Service cost | Prepared-envelope and integrated local HTTP timings; rotated method order; raw samples and source hashes |

The remedy uses conventional authenticated commitments and optimistic revision
validation. EvidenceNet already invalidates evidence through epochs; RATS
already discusses nonce-based freshness. The extension does not claim either
idea as new. Its contribution is the ablated interaction between exact history
closure and temporal validity, including transactional schedules, coverage loss,
and deliberately retained violations of mediation/honesty assumptions. The
service is authored here and is not external benchmark validation.

The framework extension executes externally authored retail tasks and an
unchanged upstream grader. Independent technical review and external reproduction
remain outstanding; external code provenance is not independent experiment
authorship.

## Framework extension (issue #300)

- Standard [precision, recall and F-measures](https://scikit-learn.org/stable/modules/model_evaluation.html#precision-recall-and-f-measures)
  define success-admission quality. They are not proposed as new metrics. Unknown
  positives remain in the recall/F1 denominator.
- The [maintained tau-bench source](https://github.com/sierra-research/tau2-bench/tree/b7ea9074c1cba482b30687fecdb5c8425fd6f619)
  supplies the retail base tasks, state model, tools and EnvironmentEvaluator.
  Inspected the task split, task reward definitions, DB hashing, strict trace
  replay, action mutation annotations and upstream MIT license. The actual
  evaluator replays supplied tool calls into a separate predicted environment;
  this motivates testing its completeness premise at an integration boundary.
- External task selection, exclusions, traces, state deltas and per-case verdicts
  are in `results/external/`. The study measures DB outcomes only. It runs no
  model, user simulator, natural-language assertion judge or official full score.
- The framing emphasizes reusable tests and balanced reporting. It does not claim
  that evidence-based assessment, state oracles, reject-option classification,
  history commitments or revision freshness originated here.

## Evidence-request revision (issue #302)

| Primary source | Material inspected | Relationship |
| --- | --- | --- |
| [Agentic Benchmark Checklist](https://arxiv.org/html/2507.02825v5) | Introduction, taxonomy, outcome-validity checks | Evaluator auditing and task/outcome validity are established; our scope is controlled evidence corruption and collection |
| [BenchJack](https://arxiv.org/html/2605.12673v1) | Abstract, Section 4 taxonomy and audit/patch loop | Adversarial evaluator auditing already tests trust boundaries; our fixed evidence interventions are not a general exploit-discovery system |
| [Tool-calling validity audit](https://arxiv.org/html/2607.02577v1) | Abstract, human-adjudication and false-positive/negative formulation | Directly relevant meta-evaluation work; our oracle is a fixed state criterion rather than expert business-meaning adjudication |
| [EDDI](https://arxiv.org/abs/1809.11142v4) | Primary abstract and publication metadata | Cost-aware acquisition is established; our deterministic diagnostic scopes neither learn nor optimize expected information gain |
| [Test-oracle survey](https://philmcminn.com/publications/barr2015.pdf) | Abstract, introduction and oracle definitions | Separating evidence from state truth connects to specifications, partial oracles and related test executions |

EvidenceNet also recollects observations after one repair round. The new study
is deliberately narrower: read-only additional-evidence requests with fixed
task effects, explicit budgets, equally available collection, and persistent
failure controls. It is not the first information-acquisition or repair method.

External task verdicts share one common eight-condition pattern across all 91
tasks. This is implementation portability, not 728 independent fault mechanisms.
The request experiment likewise reports 124 family/condition strata; its five
parameter variants are repeated conformance checks.

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
| [tau-bench v1](https://arxiv.org/abs/2406.12045v1) | Primary abstract; full-text located | Tool-agent-user evaluation compares final database state with an annotated goal | Task-state evaluation is established. We evaluate the observer/assessor rather than model task-solving ability. No tau-bench tasks or results are reused |
| [Geifman and El-Yaniv](https://arxiv.org/abs/1705.08500v2) | Primary abstract | Reject-option evaluation trades risk and coverage | Borrow the evaluation perspective, not their learning method or statistical guarantee |
| [in-toto](https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias) | Publisher abstract and bibliography | Signed supply-chain provenance permits integrity verification | Precedent for separating authenticated provenance from application semantics; no agent-completion claims attributed to it |
| [RATS](https://www.rfc-editor.org/rfc/rfc9334.html) | Sections 4, 8, 10 and freshness discussion | Evidence, appraisal policy, and results have distinct roles; timestamps/nonces/epochs support freshness | Our application-level evaluator is not a RATS attestation implementation |
| AgentAction | Pinned production source, intent-assurance documentation, guard tests and selected gateway lifecycle tests | Local evaluator assumes verified provenance; hosted JWS ingress verifies authenticity, lifetime and binding; snapshots freeze evidence | No production source is modified by the research artifact |
| [SQLite isolation](https://sqlite.org/isolation.html) | Official isolation and WAL concurrency documentation | Separate connections observe committed snapshots; WAL permits simultaneous readers and a writer | Supports the service schedule design, not a new database-isolation contribution |

## Claims deliberately excluded

- First completion contract, first agent runtime gate, first verifiable receipt,
  novel signature scheme, or universally sound success detector.
- Measured superiority to any named prior system; their implementations were not
  executed in this study.
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

An independent technical review and an evaluation on externally authored tasks
would materially strengthen a later venue submission. This artifact does not
claim either has happened.

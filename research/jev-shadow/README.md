# Jev vs LLMs for authorization decisions

Can a specialized decision model improve the semantic checks in an agent gateway?
We compared Jev 1.13.0, OpenAI GPT-4.1 mini and Groq-hosted GPT-OSS 20B on the
same synthetic approval workflows, using live provider APIs.

An agent might be asked to inspect an invoice, draft a document or send an export.
The check is whether its proposed action matches what the user actually asked
for. Models score **intent clarity, purpose fit and scope fit**. Deterministic
code checks amounts, recipients, permitted fields, tenant boundaries and whether
an approval still covers the exact action. Models cannot override those checks.

## What we learned

In this setup, Jev showed no latency advantage and unnecessarily reviewed some
valid draft/inspection actions. OpenAI matched all reserved scenarios; Groq was
faster but sometimes asked for review where the authored policy expected denial.

| Reserved evaluation: 32 scenarios, twice each | Exact workflows | Unsafe simulated executions | Unnecessary reviews | Legitimate workflows completed |
|---|---:|---:|---:|---:|
| Groq GPT-OSS 20B | 56/64 | 0 | 0 | 28/28 |
| OpenAI GPT-4.1 mini | 64/64 | 0 | 0 | 28/28 |
| Jev 1.13.0 | 61/64 | 0 | 3 | 25/28 |

| Routine load: 5 workflows/sec, 20 seconds per lane | Median workflow | p95 workflow | Exact workflows | Unnecessary reviews |
|---|---:|---:|---:|---:|
| Groq GPT-OSS 20B | 263 ms | 612 ms | 100/100 | 0 |
| OpenAI GPT-4.1 mini | 491 ms | 1,054 ms | 100/100 | 0 |
| Jev 1.13.0 | 822 ms | 1,557 ms | 84/100 | 16 |

The final run completed **528 workflows / 678 API calls**, with no API errors or
drops. Recorded cost was **$0.1733**, excluding diagnostics and preflight calls;
Jev cost is service-reported and LLM cost is estimated from token usage.
Timing includes automated approval retries and local evidence writes, but no
human waiting. This short load test does not establish maximum throughput.

## Read the evidence

- [Findings and interpretation](results/workflow-live-v2-1/FINDINGS.md)
- [Full report](results/workflow-live-v2-1/REPORT.md)
- [Methodology, criteria, workflow and limitations](WORKFLOW-EVALS.md)
- [Exact payloads, questions and authored expectations](results/workflow-live-v2-1/corpus.json)
- [Raw workflows and attempts](results/workflow-live-v2-1/raw.jsonl)
- [Summary](results/workflow-live-v2-1/summary.json), [frozen thresholds](results/workflow-live-v2-1/thresholds.json), [manifest and source hashes](results/workflow-live-v2-1/manifest.json)

All actions, conversations and approvals are synthetic. An execution is a research
ledger event, not a payment, message or export. The actual Worker/DO handles a
synthetic read authorization and audit; the approval ledger is separate research
code. No production gateway behavior changes in this experiment.

Zero unsafe simulated executions is not evidence of a zero production error rate.
One author created the development and reserved sets; they have no independent
human policy review. Reserved cases were inspected while correcting diagnostic
v2, so v2.1 is a corrected development evaluation, not an untouched holdout.
[Original diagnostic evidence](results/workflow-live-v2/REPORT.md) is retained.
Thresholds were selected on development cases before reserved calls; the scores
are not assumed calibrated or equivalent across providers.

Jev was accessed through the **independent jevtypesafeai.com service**, not the
TypeSafe direct endpoint. Results describe that hosted path. OpenAI requested
`gpt-4.1-mini` with returned snapshot `gpt-4.1-mini-2025-04-14` validated; Groq
used `openai/gpt-oss-20b`. The originally proposed Groq 8B model was unavailable
to the supplied key. This is not a measurement of a deployed gateway model.

## Reproduce and inspect

Node 22.14+; no npm dependencies. From `research/jev-shadow`:

```sh
npm test
npm run verify:workflow -- results/workflow-live-v2-1
npm run dashboard:workflow
# Open http://127.0.0.1:8803 — saved results, not a new live run.

# Verify the harness without paid API calls:
npm run workflow -- --fixture --no-load --out runs/workflow-fixture-new
npm run verify:workflow -- runs/workflow-fixture-new
```

For a fresh live run, store `TYPESAFE_API_KEY`, `OPENAI_API_KEY` and `GROQ_API_KEY`
in a protected environment file outside the repository (mode 600). Never paste
keys into reports, commands or recordings. Then:

```sh
node --env-file="$HOME/.config/agentaction/jev.env" --experimental-strip-types \
  src/workflow/run.mjs --out runs/workflow-live-new
npm run verify:workflow -- runs/workflow-live-new
npm run dashboard:workflow -- runs/workflow-live-new 8803
```

The default run is capped at 930 API calls, with no retries. Existing output
directories cannot be overwritten. Verification recounts metrics, replays ledger
transitions, checks gateway audit evidence, recomputes threshold selection and
validates immutable source snapshots. It does not independently certify model
answers, token accounting or the authored policy labels.

Publication removes the local checkout prefix from output-directory metadata.
Raw observations and snapshotted measurement sources are preserved.

## Earlier experiments

Historical artifacts remain labeled with their original tasks and parameters:
[initial Jev run](results/jev-live/REPORT.md),
[short Jev ramp](results/jev-ramp/REPORT.md),
[paired semantic comparison](results/comparison-live/REPORT.md), and
[six-factor approval evaluation](COMPLEX-EVALS.md).
`results/comparison-local` contains scripted fixtures only.
These stages are not directly comparable to the final workflow evaluation.
Use the final workflow commands above for current verification and reproduction.

## Scope and safeguards

Research tracked in [#319](https://github.com/dinpd/AgentAction/issues/319).
No product release or production authorization integration. The side-by-side
video is deferred pending dashboard review.

The harness uses fixed HTTPS endpoints, rejects redirects, bounds concurrency
and deadlines, validates provider schemas, sanitizes errors and persists only
allowlisted provider fields. It sends synthetic payloads only. The GET-only
localhost dashboard has no credential handling or arbitrary-file endpoints.
Tests cover malformed responses, timeouts, fault accounting, action/approval
binding and hard-policy invariants; they do not prove model injection resistance.

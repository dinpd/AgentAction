# Workflow v2.1 findings

The corrected run completed 528 synthetic workflows / 678 live provider calls. No API errors or dropped workflows. Observed cost: $0.1733. This excludes the earlier diagnostic v2 run and preflight requests. No actual downstream actions ran.

## Reserved evaluation: 32 scenarios repeated twice

| Provider | Exact workflows | Unsafe simulated executions | Unnecessary reviews of valid attempts | Legitimate workflows completed |
|---|---:|---:|---:|---:|
| Groq GPT-OSS 20B | 56/64 | 0 | 0 | 28/28 |
| OpenAI GPT-4.1 mini | 64/64 | 0 | 0 | 28/28 |
| Jev 1.13.0 | 61/64 | 0 | 3 | 25/28 |

Jev's three mismatches were reviews of draft/inspection actions (export-draft twice, invoice-draft once). Groq's eight mismatches were challenge outcomes where the rubric expected deny: scope/side-effect/injection violations. Its eight misses did not execute an unsafe action. OpenAI matched this authored set, which does not establish a production zero-error rate.

## Routine load: 5 workflows/sec for 20 seconds per provider

| Provider | Median workflow ms | p95 workflow ms | Exact workflows | Unnecessary reviews |
|---|---:|---:|---:|---:|
| Groq GPT-OSS 20B | 263 | 612 | 100/100 | 0 |
| OpenAI GPT-4.1 mini | 491 | 1054 | 100/100 | 0 |
| Jev 1.13.0 | 822 | 1557 | 84/100 | 16 |

Each lane received the same ordered routine cases, with some two-attempt approval workflows. Timings include all automated steps and evidence writes, but exclude real human waiting: approval responses are scripted. Higher offered-load/capacity claims are not supported by this run.

## What this tells us

The clearer semantic interface and development-selected operating points produce a useful evaluation: Jev still over-escalates preparatory tasks and shows no latency advantage at this independent hosted endpoint. OpenAI matches this corrected synthetic set; Groq is faster but distinguishes some forbidden requests as unclear instead of denying them. Whether challenge instead of deny is operationally acceptable must be decided by policy owners. Raw failure traces make those differences inspectable.

Development selected pass/fail 0.8/0.2 for Jev and 0.9/0.1 for both LLMs, using only refund/support cases. Scores are not claimed calibrated. The invoice/document set was frozen before the first run, but an export-field mismatch and a history-dependent replay oracle defect were discovered from diagnostic v2. Both are corrected here without prompt/threshold-rule changes. Original v2 evidence is preserved. Because those cases were inspected, v2.1 is a corrected development evaluation, not a pristine holdout.

Do not compare the aggregate accuracy directly to v1: inputs, semantic factors, lifecycle rules and cohort composition changed. No independent human oracle review, production traffic distribution or adoption readiness is established. The side-by-side video remains deferred pending dashboard review.

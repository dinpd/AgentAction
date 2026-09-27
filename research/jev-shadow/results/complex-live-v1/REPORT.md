# Complex approval evaluation

Live provider APIs on synthetic authorization scenarios. 2026-09-27T20:03:40.355Z. Complete: true. Corpus: complex-support-v1.

24 authored cases, six factor questions per request, 3 quality repetitions; load 5, 20 offered requests/sec for 6s each, 2 repetitions, concurrency 32 per lane. Throughput includes drain. All providers run concurrently; shared local resources may constrain arrivals. No retries, no output cache, no real tools execute.

| Provider / phase / repeat / offered RPS | Successful RPS | Successful p50 / p95 ms | Errors / drops | Combined exact | Unsafe allows | Unnecessary reviews | Cost / 1k successful |
|---|---:|---|---|---|---:|---:|---:|
| groq / quality / 0 / 3 | 2.98 | 517.31 / 1021.48 | 0 / 0 | 31/72 | 0 | 15 | 0.18 |
| llm / quality / 0 / 3 | 2.95 | 767.79 / 983.55 | 0 / 0 | 69/72 | 3 | 0 | 0.47 |
| jev / quality / 0 / 3 | 2.95 | 755.37 / 876.98 | 0 / 0 | 30/72 | 0 | 15 | 0.56 |
| jev / load / 0 / 5 | 4.58 | 768.34 / 1176.11 | 0 / 0 | 10/30 | 0 | 9 | 0.56 |
| llm / load / 0 / 5 | 4.57 | 735.77 / 903.16 | 0 / 0 | 29/30 | 1 | 0 | 0.47 |
| groq / load / 0 / 5 | 4.37 | 536.85 / 1128.83 | 0 / 0 | 10/30 | 0 | 9 | 0.17 |
| jev / load / 0 / 20 | 17.91 | 803.36 / 1017.04 | 0 / 0 | 50/120 | 0 | 25 | 0.56 |
| groq / load / 0 / 20 | 17.72 | 583.40 / 981.70 | 0 / 0 | 50/120 | 1 | 25 | 0.17 |
| llm / load / 0 / 20 | 8.45 | 786.93 / 1020.88 | 0 / 0 | 115/120 | 5 | 0 | 0.47 |
| jev / load / 1 / 5 | 4.57 | 757.18 / 902.98 | 0 / 0 | 10/30 | 0 | 9 | 0.56 |
| groq / load / 1 / 5 | 4.50 | 516.49 / 963.58 | 0 / 0 | 10/30 | 0 | 9 | 0.17 |
| llm / load / 1 / 5 | 2.15 | 739.96 / 1201.28 | 0 / 0 | 29/30 | 1 | 0 | 0.47 |
| groq / load / 1 / 20 | 17.94 | 612.92 / 992.98 | 0 / 0 | 50/120 | 0 | 25 | 0.16 |
| jev / load / 1 / 20 | 17.70 | 816.94 / 927.77 | 0 / 0 | 50/120 | 0 | 25 | 0.56 |
| llm / load / 1 / 20 | 17.37 | 772.98 / 1082.82 | 0 / 0 | 116/120 | 4 | 0 | 0.47 |

## Evals and interpretation

summary.json includes separate model-advice and combined-policy confusion matrices, macro-F1, per-factor accuracy and Brier diagnostics, unnecessary reviews, case consistency, paired-scenario correctness and failure IDs. Brier scores on 24 authored cases are descriptive, not calibration evidence. Repeats are not independent cases. No thresholds are tuned to these results. The oracle is authored policy logic, not an independent human-reviewed dataset. Treat these as development evals, not a held-out production test.

The real local gateway checks the declared research agent/tool and writes evidence. Refund amounts, approval validity, tenant binding and duplicate prevention are separate **research controls**, not implemented production capabilities. context.verified is synthetic input, not cryptographic verification. Counterfactual composition keeps gateway/research deny or challenge authoritative. Actual gateway authorization is unchanged.

Providers: Jev jev-1.13.0 through independent jevtypesafeai.com; OpenAI requests gpt-4.1-mini and validates gpt-4.1-mini-2025-04-14; Groq openai/gpt-oss-20b replaces inaccessible Llama 8B. Jev uses Noul; LLMs return strict JSON numeric estimates. OpenAI cap 256 output tokens; Groq cap 1536 including low-effort reasoning, whose tokens/cost/latency remain included. Provider wrapper differences and tokenization are unavoidable and disclosed. Models do not receive labels/rationales.

Costs: Jev service-reported; OpenAI estimated input/cached/output $0.40/$0.10/$1.60 per million tokens; Groq $0.075/$0.037/$0.30. Missing cost remains unknown. No reseller-to-direct extrapolation.

Raw rows, source snapshots, frozen corpus, question hash, request byte lengths, gateway journal and model usage accompany this report. The local adapter includes actual Worker/DO handlers and fsync but is not Cloudflare hosting or maximum provider capacity. Video remains paused for user dashboard review.

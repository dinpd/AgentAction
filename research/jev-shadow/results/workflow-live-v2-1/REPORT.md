# Workflow approval benchmark workflow-v2.1

Live APIs, synthetic workflows. 2026-09-27T21:34:25.385Z. Complete: true.

Development: 12 refund/support cases. Reserved evaluation: 32 invoice/document cases × two repetitions. Same author generated both splits; this is not independently reviewed production evidence. Threshold selection is frozen after development and before any reserved-case provider call. Candidate ranking: minimize unsafe semantic allows, then unnecessary reviews, then mismatches, ties prefer stricter. No model prompt/threshold tuning against reserved results. This v2.1 rerun corrects an export-field corpus bug and history-dependent replay oracle after inspecting v2; these reserved cases are no longer untouched. Original v2 diagnostic evidence is retained.

| Lane / phase | Workflows | API calls | Successful workflows/s | Workflow p50 / p95 ms | Exact workflows | Unsafe simulated executions | Unnecessary reviews | Cost USD |
|---|---:|---:|---:|---|---|---:|---:|---:|
| groq / development | 12 | 14 | 2.00 | 314 / 635 | 10/12 | 0 | 0 | 0.00102 |
| llm / development | 12 | 14 | 1.87 | 531 / 1044 | 12/12 | 0 | 0 | 0.00415 |
| jev / development | 12 | 14 | 1.72 | 853 / 1609 | 2/12 | 0 | 6 | 0.00545 |
| groq / holdout | 64 | 96 | 1.99 | 386 / 806 | 56/64 | 0 | 0 | 0.00665 |
| llm / holdout | 64 | 96 | 1.97 | 564 / 1400 | 64/64 | 0 | 0 | 0.02891 |
| jev / holdout | 64 | 96 | 1.92 | 801 / 2245 | 61/64 | 0 | 3 | 0.03811 |
| groq / load | 100 | 116 | 4.99 | 263 / 612 | 100/100 | 0 | 0 | 0.00766 |
| llm / load | 100 | 116 | 4.89 | 491 / 1054 | 100/100 | 0 | 0 | 0.03504 |
| jev / load | 100 | 116 | 4.86 | 822 / 1557 | 84/100 | 0 | 16 | 0.04629 |

## Interpretation

Routine and adversarial cohorts have separate summaries; their authored proportions do not represent production traffic. Workflow latency measures automated steps only: scripted human approval takes no real human time. An allow logs a simulated execution; no downstream API executes. The real gateway processes a synthetic read request and persists evidence; the research ledger separately models refund/document approvals with HMAC, exact-action binding, expiry, revocation and idempotency. These are not shipped gateway features or production identity verification. Gate decisions are composed before simulated execution and never overridden by model advice.

Three model factors: intent clarity, purpose fit, scope fit. Exact recipients/fields/amounts/tenant/approval checks remain deterministic. Models receive explicit user conversations, untrusted tool history and proposed actions, never labels/rationales. Clear-but-forbidden requests stay clear; clarification is not a safety confidence score. Scores are not assumed calibrated. Source/corpus snapshots and hashes accompany raw workflows, attempt evidence and the pre-holdout threshold selection.

Providers remain Jev 1.13.0 via the independent playground; OpenAI gpt-4.1-mini alias with pinned returned gpt-4.1-mini-2025-04-14; Groq openai/gpt-oss-20b, low reasoning (Llama 8B inaccessible). Strict JSON LLM caps: OpenAI 160, Groq 1024 including reasoning. Cost: Jev service-reported; LLM public token-rate estimates including reasoning. All provider timeouts are 15s, redirects rejected, no retries. Live run cap 2,000 calls. Shared local CPU/disk/network and fsync affect timing; this is not deployed Cloudflare throughput.

See FINDINGS.md, thresholds.json, corpus.json, raw.jsonl and summary.json. Video remains paused for user review.

# Workflow approval benchmark v2

Live APIs, synthetic workflows. 2026-09-27T21:31:07.028Z. Complete: true.

Development: 12 refund/support cases. Reserved evaluation: 32 invoice/document cases × two repetitions. Same author generated both splits; this is not independently reviewed production evidence. Threshold selection is frozen after development and before any reserved-case provider call. Candidate ranking: minimize unsafe semantic allows, then unnecessary reviews, then mismatches, ties prefer stricter. No post-holdout tuning.

| Lane / phase | Workflows | API calls | Successful workflows/s | Workflow p50 / p95 ms | Exact workflows | Unsafe simulated executions | Unnecessary reviews | Cost USD |
|---|---:|---:|---:|---|---|---:|---:|---:|
| groq / development | 12 | 14 | 1.94 | 348 / 677 | 10/12 | 0 | 0 | 0.00123 |
| llm / development | 12 | 14 | 1.71 | 746 / 1520 | 12/12 | 0 | 0 | 0.00415 |
| jev / development | 12 | 14 | 1.68 | 863 / 1620 | 2/12 | 0 | 6 | 0.00545 |
| groq / holdout | 64 | 96 | 1.97 | 415 / 928 | 50/64 | 1 | 0 | 0.00749 |
| llm / holdout | 64 | 96 | 1.97 | 586 / 1393 | 50/64 | 0 | 0 | 0.02889 |
| jev / holdout | 64 | 96 | 1.93 | 813 / 2136 | 48/64 | 0 | 16 | 0.03809 |
| groq / load | 100 | 116 | 4.99 | 291 / 801 | 90/100 | 0 | 0 | 0.00830 |
| llm / load | 100 | 116 | 4.91 | 515 / 1106 | 68/100 | 0 | 0 | 0.03502 |
| jev / load | 100 | 116 | 4.86 | 765 / 1569 | 55/100 | 0 | 45 | 0.04625 |

## Interpretation

Routine and adversarial cohorts have separate summaries; their authored proportions do not represent production traffic. Workflow latency measures automated steps only: scripted human approval takes no real human time. An allow logs a simulated execution; no downstream API executes. The real gateway processes a synthetic read request and persists evidence; the research ledger separately models refund/document approvals with HMAC, exact-action binding, expiry, revocation and idempotency. These are not shipped gateway features or production identity verification. Gate decisions are composed before simulated execution and never overridden by model advice.

Three model factors: intent clarity, purpose fit, scope fit. Exact recipients/fields/amounts/tenant/approval checks remain deterministic. Models receive explicit user conversations, untrusted tool history and proposed actions, never labels/rationales. Clear-but-forbidden requests stay clear; clarification is not a safety confidence score. Scores are not assumed calibrated. Source/corpus snapshots and hashes accompany raw workflows, attempt evidence and the pre-holdout threshold selection.

Providers remain Jev 1.13.0 via the independent playground; OpenAI gpt-4.1-mini alias with pinned returned gpt-4.1-mini-2025-04-14; Groq openai/gpt-oss-20b, low reasoning (Llama 8B inaccessible). Strict JSON LLM caps: OpenAI 160, Groq 1024 including reasoning. Cost: Jev service-reported; LLM public token-rate estimates including reasoning. All provider timeouts are 15s, redirects rejected, no retries. Live run cap 2,000 calls. Shared local CPU/disk/network and fsync affect timing; this is not deployed Cloudflare throughput.

See FINDINGS.md, thresholds.json, corpus.json, raw.jsonl and summary.json. Video remains paused for user review.

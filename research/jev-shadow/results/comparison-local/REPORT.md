# Jev / LLM matched semantic checks

SCRIPTED FIXTURES ONLY — not model performance. Run 2026-09-27T19:44:10.957Z. Status: complete.

All selected lanes (groq, llm, jev) run the same gateway, synthetic actions, two question criteria, provisional thresholds, offered load, concurrency (16 per lane), and deadline (10000 ms). Providers: Jev jev-1.13.0 at https://jevtypesafeai.com/api/v1/decide; OpenAI gpt-4.1-mini-2025-04-14; Groq llama-3.1-8b-instant. OpenAI uses strict structured outputs; Groq 8B supports JSON object mode with local schema validation. Both LLMs use temperature 0, 100 maximum output tokens, no reasoning step. The Groq model is a candidate, not a verified deployed AgentAction baseline; no Groq reference was found in this checkout. The LLM's numbers are self-reported estimates, not evidence of calibrated probabilities.

| Lane | Phase / offered RPS | Successful RPS | p50 / p95 / p99 ms | Errors / drops | Unsafe counterfactual allows | Escalations | Estimated $ / 1k provider requests |
|---|---|---:|---|---|---:|---:|---:|
| groq | quality / sequential | 17.79 | 49.85 / 62.05 / 62.05 | 1 / 0 | 0 | 4 | n/a |
| llm | quality / sequential | 17.90 | 50.52 / 65.19 / 65.19 | 1 / 0 | 0 | 4 | n/a |
| jev | quality / sequential | 17.74 | 50.45 / 77.13 / 77.13 | 1 / 0 | 0 | 4 | n/a |
| groq | load / 1 | 1.00 | 44.61 / 45.06 / 45.06 | 0 / 0 | 0 | 0 | n/a |
| llm | load / 1 | 1.00 | 37.52 / 38.56 / 38.56 | 0 / 0 | 0 | 0 | n/a |
| jev | load / 1 | 1.00 | 32.47 / 33.41 / 33.41 | 0 / 0 | 0 | 0 | n/a |
| groq | load / 5 | 4.33 | 37.48 / 43.65 / 43.65 | 2 / 0 | 0 | 5 | n/a |
| jev | load / 5 | 4.33 | 39.15 / 45.48 / 45.48 | 2 / 0 | 0 | 5 | n/a |
| llm | load / 5 | 4.32 | 32.32 / 43.25 / 43.25 | 2 / 0 | 0 | 5 | n/a |
| llm | load / 20 | 17.34 | 34.65 / 42.18 / 50.41 | 8 / 0 | 0 | 20 | n/a |
| groq | load / 20 | 17.31 | 34.14 / 41.47 / 44.87 | 8 / 0 | 0 | 20 | n/a |
| jev | load / 20 | 17.30 | 34.52 / 41.64 / 44.91 | 8 / 0 | 0 | 20 | n/a |

## Interpretation and sharing

No improvement is presumed. Compare quality before latency/cost; do not headline a speed ratio when it comes from errors, excess abstention, unequal coverage or account quotas. A shareable screen capture must retain model IDs, workload, errors, quality and the local-hosting qualifier. No production adoption claim is established by these 12 authored cases.

## Reproducibility and limits

- Lanes run concurrently from the same client and receive the same ordered synthetic corpus. This controls test time but shares local CPU, network and disk; it is not isolated provider capacity. The quality phase is sequential per lane; load phases have matched open-loop arrival schedules.
- Cold schema/provider setup may appear in the quality phase. No retries or response cache. Provider-side token caching, when reported, is included in usage and cost. LLM prices per million tokens: input $0.40, cached input $0.10, output $1.60. TypeSafe-direct input $0.042, output $0. For the independent Jev playground, use the service-reported cost_usd instead; never apply direct pricing. Groq 8B cost is unavailable unless a contractual rate is supplied (current public docs say Contact Sales). Unknown fault usage/cost remains explicit.
- Actual gateway decisions never change. Counterfactual decisions enforce the hard gateway outcome before applying semantic advice. Audit writes, local fsync and explicit research bases are in the measured path. No real tool executes.
- Node runs the real Worker/DO handlers with local storage adapters. This is not deployed Cloudflare throughput, provider execution, a hosted intent snapshot or a signed provider receipt.
- The load generator has no hidden queue: overload drops are counted. Throughput denominator includes the full offered interval plus drain. Live dashboard updates add client overhead outside request latency; schedule lag exposes this.
- Twelve hand-authored cases and repeats are not independent samples. Thresholds were fixed before testing; no tuning on this evaluation. A larger held-out dataset, separate calibration set, repeated longer tests, and regional/payload-size variation are required before adoption.
- A bounded ramp may end before saturation. If throttled, describe the account quota limit instead of claiming model capacity.

See raw.jsonl, gateway-journal.jsonl, manifest.json and summary.json. Source hashes include all provider clients. verify.mjs recounts the metrics and checks gateway evidence. README.md contains reproduction and capture instructions.

Sources: [TypeSafe API](https://docs.typesafe.ai/api), [independent Jev service](https://www.jevtypesafeai.com/typesafe/docs), [Groq models](https://console.groq.com/docs/models), [TypeSafe limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [TypeSafe pricing](https://typesafe.ai/), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Accessed 2026-09-27.

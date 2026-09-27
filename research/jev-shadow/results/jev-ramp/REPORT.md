# Jev / LLM matched semantic checks

Live API measurements. Run 2026-09-27T19:42:15.934Z. Status: complete.

All selected lanes (jev) run the same gateway, synthetic actions, two question criteria, provisional thresholds, offered load, concurrency (64 per lane), and deadline (10000 ms). Providers: Jev jev-1.13.0 at https://jevtypesafeai.com/api/v1/decide; OpenAI gpt-4.1-mini-2025-04-14; Groq llama-3.1-8b-instant. OpenAI uses strict structured outputs; Groq 8B supports JSON object mode with local schema validation. Both LLMs use temperature 0, 100 maximum output tokens, no reasoning step. The Groq model is a candidate, not a verified deployed AgentAction baseline; no Groq reference was found in this checkout. The LLM's numbers are self-reported estimates, not evidence of calibrated probabilities.

| Lane | Phase / offered RPS | Successful RPS | p50 / p95 / p99 ms | Errors / drops | Unsafe counterfactual allows | Escalations | Estimated $ / 1k provider requests |
|---|---|---:|---|---|---:|---:|---:|
| jev | quality / sequential | 1.36 | 706.45 / 861.57 / 861.57 | 0 / 0 | 0 | 4 | 0.20 |
| jev | load / 20 | 16.36 | 734.52 / 834.91 / 863.83 | 0 / 0 | 0 | 20 | 0.20 |
| jev | load / 40 | 31.25 | 817.33 / 1224.17 / 1311.68 | 0 / 0 | 0 | 40 | 0.20 |
| jev | load / 80 | 51.02 | 838.63 / 974.32 / 1041.93 | 0 / 0 | 0 | 80 | 0.20 |

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

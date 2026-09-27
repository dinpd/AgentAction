# Jev / LLM matched semantic checks

Live API measurements. Run 2026-09-27T19:52:52.540Z. Status: complete.

All selected lanes (groq, llm, jev) run the same gateway, synthetic actions, two question criteria, provisional thresholds, offered load, concurrency (16 per lane), and deadline (10000 ms). Providers: Jev jev-1.13.0 at https://jevtypesafeai.com/api/v1/decide; OpenAI gpt-4.1-mini-2025-04-14; Groq openai/gpt-oss-20b. Both LLMs use strict structured outputs and temperature 0. OpenAI requests the accessible gpt-4.1-mini alias and validates the returned pinned snapshot, with 100 maximum output tokens. Groq GPT-OSS 20B replaces the inaccessible Llama 8B; it uses low reasoning effort and a 1,024-token completion cap including reasoning. Reasoning text is excluded from responses but its tokens, cost and latency remain counted. The Groq model is a candidate, not a verified deployed AgentAction baseline; no Groq reference was found in this checkout. The LLM's numbers are self-reported estimates, not evidence of calibrated probabilities.

| Lane | Phase / offered RPS | Successful RPS | p50 / p95 / p99 ms | Errors / drops | Unsafe counterfactual allows | Escalations | Estimated $ / 1k provider requests |
|---|---|---:|---|---|---:|---:|---:|
| groq | quality / sequential | 4.49 | 197.91 / 362.79 / 362.79 | 0 / 0 | 0 | 3 | 0.05 |
| jev | quality / sequential | 1.32 | 731.02 / 929.84 / 929.84 | 0 / 0 | 0 | 4 | 0.20 |
| llm | quality / sequential | 1.30 | 670.69 / 1741.36 / 1741.36 | 0 / 0 | 0 | 3 | 0.14 |
| groq | load / 1 | 1.00 | 260.35 / 306.88 / 306.88 | 0 / 0 | 0 | 0 | 0.06 |
| jev | load / 1 | 1.00 | 740.79 / 803.43 / 803.43 | 0 / 0 | 0 | 1 | 0.20 |
| llm | load / 1 | 0.92 | 1236.20 / 1238.41 / 1238.41 | 0 / 0 | 0 | 0 | 0.14 |
| groq | load / 5 | 4.95 | 243.57 / 369.78 / 369.78 | 0 / 0 | 0 | 3 | 0.05 |
| llm | load / 5 | 4.30 | 688.74 / 1136.26 / 1136.26 | 0 / 0 | 0 | 3 | 0.14 |
| jev | load / 5 | 4.25 | 780.87 / 852.42 / 852.42 | 0 / 0 | 0 | 5 | 0.20 |
| groq | load / 20 | 19.01 | 256.53 / 363.78 / 442.59 | 0 / 0 | 0 | 15 | 0.05 |
| llm | load / 20 | 16.69 | 687.88 / 849.50 / 860.53 | 0 / 1 | 0 | 15 | 0.14 |
| jev | load / 20 | 14.65 | 816.71 / 965.44 / 1019.93 | 0 / 6 | 0 | 19 | 0.20 |

## Payload and decision criteria

See [criteria and payload](../../CRITERIA.md) and the dashboard case inspector for exact synthetic state, question instructions, gateway events, measured probabilities and policy precedence. The model evaluates two semantic questions; deterministic identity, tool and approval checks remain authoritative.

## Interpretation and sharing

No improvement is presumed. Compare quality before latency/cost; do not headline a speed ratio when it comes from errors, excess abstention, unequal coverage or account quotas. A shareable screen capture must retain model IDs, workload, errors, quality and the local-hosting qualifier. No production adoption claim is established by these 12 authored cases.

## Reproducibility and limits

- Lanes run concurrently from the same client and receive the same ordered synthetic corpus. This controls test time but shares local CPU, network and disk; it is not isolated provider capacity. The quality phase is sequential per lane; load phases have matched open-loop arrival schedules.
- Cold schema/provider setup may appear in the quality phase. No retries or response cache. Provider-side token caching, when reported, is included in usage and cost. LLM prices per million tokens: input $0.40, cached input $0.10, output $1.60. TypeSafe-direct input $0.042, output $0. For the independent Jev playground, use the service-reported cost_usd instead; never apply direct pricing. Groq GPT-OSS 20B estimated rates per million tokens: input $0.075, cached input $0.037, output $0.30. Unknown fault usage/cost remains explicit.
- Actual gateway decisions never change. Counterfactual decisions enforce the hard gateway outcome before applying semantic advice. Audit writes, local fsync and explicit research bases are in the measured path. No real tool executes.
- Node runs the real Worker/DO handlers with local storage adapters. This is not deployed Cloudflare throughput, provider execution, a hosted intent snapshot or a signed provider receipt.
- The load generator has no hidden queue: overload drops are counted. Throughput denominator includes the full offered interval plus drain. Live dashboard updates add client overhead outside request latency; schedule lag exposes this.
- Twelve hand-authored cases and repeats are not independent samples. Thresholds were fixed before testing; no tuning on this evaluation. A larger held-out dataset, separate calibration set, repeated longer tests, and regional/payload-size variation are required before adoption.
- A bounded ramp may end before saturation. If throttled, describe the account quota limit instead of claiming model capacity.

See raw.jsonl, gateway-journal.jsonl, manifest.json and summary.json. Source hashes include all provider clients. verify.mjs recounts the metrics and checks gateway evidence. README.md contains reproduction and capture instructions.

Sources: [TypeSafe API](https://docs.typesafe.ai/api), [independent Jev service](https://www.jevtypesafeai.com/typesafe/docs), [Groq models](https://console.groq.com/docs/models), [TypeSafe limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [TypeSafe pricing](https://typesafe.ai/), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Accessed 2026-09-27.

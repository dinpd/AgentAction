import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { config } from "./run.mjs";
import { cases, questions, thresholds } from "./cases.mjs";
import { askLive, askFixture, recommendation, counterfactual, model, jevEndpoints } from "./provider.mjs";
import { askLlm, llmModel, llmPrices, llmPrompt, groqModel, profiles } from "./llm.mjs";
import { createGateway } from "./gateway.mjs";
import { loadStage, summarize } from "./metrics.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = value => createHash("sha256").update(value).digest("hex");
export function comparisonReport(data) {
  const fmt = value => value == null ? "n/a" : value.toFixed(2);
  return `# Jev / LLM matched semantic checks\n\n${data.provider === "live" ? "Live API measurements" : "SCRIPTED FIXTURES ONLY — not model performance"}. Run ${data.created_at}. Status: ${data.complete ? "complete" : "partial; comparison is not final"}.\n\nAll selected lanes (${data.engines.join(", ")}) run the same gateway, synthetic actions, two question criteria, provisional thresholds, offered load, concurrency (${data.config.concurrency} per lane), and deadline (${data.config.timeoutMs} ms). Providers: Jev ${model} at ${data.endpoints.jev}; OpenAI ${llmModel}; Groq ${groqModel}. Both LLMs use strict structured outputs and temperature 0. OpenAI requests the accessible gpt-4.1-mini alias and validates the returned pinned snapshot, with 100 maximum output tokens. Groq GPT-OSS 20B replaces the inaccessible Llama 8B; it uses low reasoning effort and a 1,024-token completion cap including reasoning. Reasoning text is excluded from responses but its tokens, cost and latency remain counted. The Groq model is a candidate, not a verified deployed AgentAction baseline; no Groq reference was found in this checkout. The LLM's numbers are self-reported estimates, not evidence of calibrated probabilities.\n\n| Lane | Phase / offered RPS | Successful RPS | p50 / p95 / p99 ms | Errors / drops | Unsafe counterfactual allows | Escalations | Estimated $ / 1k provider requests |\n|---|---|---:|---|---|---:|---:|---:|\n${data.stages.map(stage => { const s = stage.summary; return `| ${stage.mode} | ${stage.phase} / ${stage.rate ?? "sequential"} | ${fmt(s.successful_rps)} | ${fmt(s.latency_ms.p50)} / ${fmt(s.latency_ms.p95)} / ${fmt(s.latency_ms.p99)} | ${Object.values(s.errors).reduce((a,b)=>a+b,0)} / ${s.dropped} | ${s.quality.unsafe_allows} | ${s.quality.escalations} | ${fmt(s.observed_cost_per_1000_provider_requests_usd)} |`; }).join("\n")}\n\n## Payload and decision criteria\n\nSee [criteria and payload](../../CRITERIA.md) and the dashboard case inspector for exact synthetic state, question instructions, gateway events, measured probabilities and policy precedence. The model evaluates two semantic questions; deterministic identity, tool and approval checks remain authoritative.\n\n## Interpretation and sharing\n\nNo improvement is presumed. Compare quality before latency/cost; do not headline a speed ratio when it comes from errors, excess abstention, unequal coverage or account quotas. A shareable screen capture must retain model IDs, workload, errors, quality and the local-hosting qualifier. No production adoption claim is established by these 12 authored cases.\n\n## Reproducibility and limits\n\n- Lanes run concurrently from the same client and receive the same ordered synthetic corpus. This controls test time but shares local CPU, network and disk; it is not isolated provider capacity. The quality phase is sequential per lane; load phases have matched open-loop arrival schedules.\n- Cold schema/provider setup may appear in the quality phase. No retries or response cache. Provider-side token caching, when reported, is included in usage and cost. LLM prices per million tokens: input $0.40, cached input $0.10, output $1.60. TypeSafe-direct input $0.042, output $0. For the independent Jev playground, use the service-reported cost_usd instead; never apply direct pricing. Groq GPT-OSS 20B estimated rates per million tokens: input $0.075, cached input $0.037, output $0.30. Unknown fault usage/cost remains explicit.\n- Actual gateway decisions never change. Counterfactual decisions enforce the hard gateway outcome before applying semantic advice. Audit writes, local fsync and explicit research bases are in the measured path. No real tool executes.\n- Node runs the real Worker/DO handlers with local storage adapters. This is not deployed Cloudflare throughput, provider execution, a hosted intent snapshot or a signed provider receipt.\n- The load generator has no hidden queue: overload drops are counted. Throughput denominator includes the full offered interval plus drain. Live dashboard updates add client overhead outside request latency; schedule lag exposes this.\n- Twelve hand-authored cases and repeats are not independent samples. Thresholds were fixed before testing; no tuning on this evaluation. A larger held-out dataset, separate calibration set, repeated longer tests, and regional/payload-size variation are required before adoption.\n- A bounded ramp may end before saturation. If throttled, describe the account quota limit instead of claiming model capacity.\n\nSee raw.jsonl, gateway-journal.jsonl, manifest.json and summary.json. Source hashes include all provider clients. verify.mjs recounts the metrics and checks gateway evidence. README.md contains reproduction and capture instructions.\n\nSources: [TypeSafe API](https://docs.typesafe.ai/api), [independent Jev service](https://www.jevtypesafeai.com/typesafe/docs), [Groq models](https://console.groq.com/docs/models), [TypeSafe limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [TypeSafe pricing](https://typesafe.ai/), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Accessed 2026-09-27.\n`;
}

export async function compare(options) {
  const keys = { jev: process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY, llm: process.env.OPENAI_API_KEY, groq: process.env.GROQ_API_KEY };
  const missing = options.engines.filter(engine => !keys[engine]);
  if (options.provider === "live" && missing.length) throw new Error(`Missing credentials for ${missing.join(", ")}; no fixture substitution.`);
  mkdirSync(options.out, { recursive: true });
  for (const name of ["raw.jsonl", "gateway-journal.jsonl"]) writeFileSync(resolve(options.out, name), "", { flag: "wx" });
  const sourcePaths = ["src/cases.mjs", "src/provider.mjs", "src/llm.mjs", "src/compare.mjs", "src/gateway.mjs", "src/metrics.mjs", "../../cloudflare/src/worker.ts", "../../cloudflare/src/decision-basis.ts", "../../cloudflare/src/intent-observation.ts", "../../packages/guard/src/intent.ts"];
  const data = {
    schema_version: 1, comparison: true, complete: false, created_at: new Date().toISOString(), provider: options.provider,
    model, llm_model: llmModel, groq_model: groqModel, engines: options.engines,
    endpoints: { jev: jevEndpoints[options.jevService], llm: profiles.llm.endpoint, groq: profiles.groq.endpoint },
    llm_prices: llmPrices, config: options, thresholds,
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    corpus_sha256: hash(JSON.stringify(cases)), questions_sha256: hash(JSON.stringify(questions)), llm_prompt_sha256: hash(llmPrompt),
    source_hashes: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(resolve(root, path)))])),
    environment: { node: process.version, os: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model }, stages: [],
  };
  const save = () => {
    writeFileSync(resolve(options.out, "summary.json"), JSON.stringify(data, null, 2) + "\n");
    writeFileSync(resolve(options.out, "REPORT.md"), comparisonReport(data));
  };
  writeFileSync(resolve(options.out, "manifest.json"), JSON.stringify(data, null, 2) + "\n");
  save();
  const progress = {};
  const gateways = Object.fromEntries(options.engines.map(engine => [engine, createGateway(resolve(options.out, "gateway-journal.jsonl"))]));
  let sequence = 0;
  for (const stage of [{ phase: "quality", rate: null }, ...options.rates.map(rate => ({ phase: "load", rate }))]) {
    const outcomes = await Promise.all(options.engines.map(async engine => {
      const stageId = `${engine}-${stage.phase}-${stage.rate ?? 0}`;
      const started = performance.now();
      const observed = [];
      const operation = async index => {
        const c = cases[index % cases.length];
        const id = `${engine}-${++sequence}`;
        const before = performance.now();
        let row = { id, case_id: c.id, truth: c.truth, expected_gateway: c.expected_gateway };
        try {
          const boundary = await gateways[engine](c.event, id);
          const provider = options.provider === "fixture" ? await askFixture(c.fixture, index) : engine === "jev"
            ? await askLive(c.state, { key: keys.jev, timeoutMs: options.timeoutMs, service: options.jevService })
            : await askLlm(c.state, { key: keys[engine], timeoutMs: options.timeoutMs, engine });
          const advisory = recommendation(provider);
          row = { ...row, provider, advisory, gateway_decision: boundary.decision, actual_decision: boundary.decision,
            counterfactual: counterfactual(boundary.decision, advisory), basis_id: boundary.basis.basis_id, findings: boundary.findings };
          if (boundary.decision !== c.expected_gateway) throw new Error("gateway_fixture_mismatch");
          appendFileSync(resolve(options.out, "gateway-journal.jsonl"), JSON.stringify({ operation: "shadow_advice", id, basis_id: row.basis_id, advisory, actual_decision: row.actual_decision, counterfactual: row.counterfactual, provider }) + "\n", { flush: true });
        } catch { row.error = "harness_error"; }
        row.latency_ms = performance.now() - before;
        observed.push(row);
        progress[engine] = { id: stageId, mode: engine, ...stage, summary: summarize(observed, performance.now() - started) };
        writeFileSync(resolve(options.out, "progress.json"), JSON.stringify({ updated_at: new Date().toISOString(), stages: Object.values(progress) }));
        return row;
      };
      let result;
      if (stage.phase === "quality") {
        const rows = [];
        for (let index = 0; index < cases.length; index++) rows.push({ ...await operation(index), index, schedule_lag_ms: 0 });
        result = { rows, elapsed_ms: performance.now() - started };
      } else result = await loadStage({ count: Math.ceil(stage.rate * options.seconds), rate: stage.rate, concurrency: options.concurrency, operation });
      for (const row of result.rows) appendFileSync(resolve(options.out, "raw.jsonl"), JSON.stringify({ stage: stageId, mode: engine, ...row }) + "\n");
      const summary = summarize(result.rows, result.elapsed_ms);
      data.stages.push({ id: stageId, mode: engine, ...stage, summary });
      save();
      console.log(JSON.stringify({ stage: stageId, successful_rps: summary.successful_rps, p95_ms: summary.latency_ms.p95, errors: summary.errors, unsafe: summary.quality.unsafe_allows }));
      return result.rows;
    }));
    const allRows = outcomes.flat();
    if (allRows.some(row => row.error)) throw new Error("Harness acceptance failed; partial evidence preserved.");
    if (options.provider === "live" && (allRows.some(row => ["http_401", "http_403", "http_429"].includes(row.provider?.status)) || outcomes.some(rows => !rows.some(row => row.provider?.status === "ok")))) throw new Error("Comparison stopped on authentication, throttling, or a failed lane; partial evidence preserved.");
  }
  data.complete = true;
  save();
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await compare(config(["--mode", "all", "--provider", "live", "--timeout-ms", "10000", ...process.argv.slice(2)])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

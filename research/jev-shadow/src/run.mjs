import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { parseArgs } from "node:util";
import { cases, questions, thresholds } from "./cases.mjs";
import { askLive, askFixture, recommendation, counterfactual, endpoint, model, jevEndpoints } from "./provider.mjs";
import { createGateway } from "./gateway.mjs";
import { loadStage, summarize } from "./metrics.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = text => createHash("sha256").update(text).digest("hex");
export function config(args) {
  const { values } = parseArgs({ args, options: Object.fromEntries(["mode", "provider", "rates", "seconds", "concurrency", "timeout-ms", "out", "jev-service", "engines"].map(key => [key, { type: "string" }])) });
  const result = {
    mode: values.mode ?? "baseline", provider: values.provider ?? "none",
    jevService: values["jev-service"] ?? "typesafe", engines: (values.engines ?? "llm,jev").split(","),
    rates: (values.rates ?? "1,5,20").split(",").map(Number), seconds: Number(values.seconds ?? 3),
    concurrency: Number(values.concurrency ?? 16), timeoutMs: Number(values["timeout-ms"] ?? 2000),
    out: resolve(values.out ?? `${root}/runs/${new Date().toISOString().replaceAll(":", "-")}`),
  };
  if (!["baseline", "jev", "shadow", "all"].includes(result.mode) || !["none", "live", "fixture"].includes(result.provider)) throw new Error("invalid mode/provider");
  if (!["typesafe", "playground"].includes(result.jevService)) throw new Error("invalid Jev service");
  if (new Set(result.engines).size !== result.engines.length || !result.engines.length || result.engines.some(e => !["llm", "jev", "groq"].includes(e))) throw new Error("invalid engines");
  if (result.mode !== "baseline" && result.provider === "none") throw new Error("choose --provider live or fixture");
  if (!result.rates.length || result.rates.some(rate => !Number.isFinite(rate) || rate < 1 || rate > 1000)) throw new Error("rates must be 1..1000");
  for (const [key, min, max] of [["seconds", 1, 60], ["concurrency", 1, 64], ["timeoutMs", 10, 10000]]) {
    if (!Number.isInteger(result[key]) || result[key] < min || result[key] > max) throw new Error(`invalid ${key}`);
  }
  const perMode = cases.length + result.rates.reduce((n, rate) => n + Math.ceil(rate * result.seconds), 0);
  if (perMode * (result.mode === "all" ? 3 : 1) > 10000) throw new Error("run cap is 10000 requests");
  if (result.provider === "live" && result.mode !== "baseline" && perMode * Math.max(result.mode === "all" ? 2 : 1, result.engines.length) > 2000) throw new Error("live cap is 2000 API requests");
  return result;
}

export function report(data) {
  const live = data.stages.some(stage => stage.mode !== "baseline" && data.provider === "live");
  const fmt = value => value === null ? "n/a" : value.toFixed(2);
  return `# Jev shadow decisioning experiment\n\n${live ? "LIVE API RUN; local gateway storage adapter." : "NO LIVE JEV MEASUREMENT. Local gateway and/or scripted fault fixtures only."}\n\nRun: ${data.created_at}\n\nModel: ${data.model}. Endpoint: ${data.endpoint}. Source revision: ${data.revision}. Corpus: ${data.corpus_sha256}.\n\n| Mode | Phase / offered RPS | Completed RPS | Successful RPS | p50 / p95 / p99 ms | Errors | Drops | Unsafe counterfactual allows | Escalations |\n|---|---|---:|---:|---|---:|---:|---:|---:|\n${data.stages.map(stage => {
    const s = stage.summary;
    return `| ${stage.mode} | ${stage.phase} / ${stage.rate ?? "sequential"} | ${fmt(s.completed_rps)} | ${fmt(s.successful_rps)} | ${fmt(s.latency_ms.p50)} / ${fmt(s.latency_ms.p95)} / ${fmt(s.latency_ms.p99)} | ${Object.values(s.errors).reduce((a,b)=>a+b,0)} | ${s.dropped} | ${s.quality.unsafe_allows} | ${s.quality.escalations} |`;
  }).join("\n")}\n\n## Interpretation\n\n${live ? "This bounded synthetic run is an initial observation, not proof of safety or maximum provider capacity. Inspect model errors and individual cases before expanding the experiment." : "Jev adoption and live throughput acceptance remain pending a TypeSafe credential. Scripted responses test harness plumbing only; their accuracy, latency and cost are not model results."}\n\nThe gateway's actual authorization result is unchanged in shadow mode. Counterfactual decisions combine hard gateway constraints with the advisory result; Jev-only results have no hard gateway checks. Baseline semantic mismatches are expected because this policy has no semantic classifier. Nothing executes downstream.\n\n## Method and limits\n\n- ${cases.length} hand-authored synthetic cases. Repeated cases are correlated, not independent safety evidence. No threshold fitting was performed. Provisional thresholds are frozen in the manifest; a larger held-out corpus and separate calibration split are needed before adoption.\n- Two questions per provider request. Requests/sec and questions/sec are distinct. No retries or response cache. Fixed model ID; mismatched IDs fail validation.\n- Open-loop arrivals with at most ${data.config.concurrency} concurrent operations. Overload is dropped and counted, never queued invisibly. Full offered interval plus drain is the throughput denominator. Latency excludes load-generator result-file writes but includes gateway audit and research-basis journal fsync. Schedule lag is in summary.json.\n- Actual Worker/DO handlers run in Node with a local map plus fsync journal, not deployed Cloudflare infrastructure. No HTTP ingress/network/TLS, real DO transaction scheduling, provider execution, JIT lifecycle, intent-registry snapshot, or signed provider receipt is benchmarked. Research bases are explicitly produced by the harness through the gateway builder.\n- Baseline, Jev-only, and shadow modes use the same ordered corpus. Shadow waits for model advice to measure prospective blocking overhead, but never changes actual authorization. Synthetic state only is sent to TypeSafe.\n- TypeSafe-direct usage cost uses $0.042/million input tokens and $0 output. The independent playground instead uses its reported cost_usd and never direct pricing. This is an estimate, not a bill; failed requests with unknown usage are counted separately. Fixture cost is unavailable, never presented as free Jev inference.\n- A three-stage short ramp cannot establish saturation or a production SLO. Repeat longer independent runs, vary payload size and regions, and increase offered load within account quotas before making capacity claims.\n\n## Reproduce and audit\n\nSee README.md for commands. manifest.json includes runtime/configuration and source hashes. raw.jsonl contains sanitized per-request results. gateway-journal.jsonl contains real local audit writes and explicit research bases. summary.json and this report are derived from the raw rows.\n\nSources accessed 2026-09-27: [API](https://docs.typesafe.ai/api), [model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [pricing](https://typesafe.ai/).\n`;
}

export async function run(options) {
  const key = process.env.TYPESAFE_API_KEY;
  if (options.provider === "live" && options.mode !== "baseline" && !key) throw new Error("Live run blocked: configure TYPESAFE_API_KEY securely; no fixture substitution is permitted.");
  mkdirSync(options.out, { recursive: true });
  // Refuse overwriting an earlier experiment.
  const raw = resolve(options.out, "raw.jsonl");
  writeFileSync(raw, "", { flag: "wx" });
  const journal = resolve(options.out, "gateway-journal.jsonl");
  writeFileSync(journal, "", { flag: "wx" });
  const authorize = createGateway(journal);
  const sourcePaths = ["src/cases.mjs", "src/provider.mjs", "src/gateway.mjs", "src/metrics.mjs", "src/run.mjs", "../../cloudflare/src/worker.ts", "../../cloudflare/src/decision-basis.ts", "../../cloudflare/src/intent-observation.ts", "../../packages/guard/src/intent.ts"];
  const data = {
    schema_version: 1, complete: false, created_at: new Date().toISOString(), provider: options.provider, model,
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    source_hashes: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(resolve(root, path)))])),
    corpus_sha256: hash(JSON.stringify(cases)), questions_sha256: hash(JSON.stringify(questions)), thresholds,
    endpoint: jevEndpoints[options.jevService], config: options, environment: { node: process.version, os: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, cpu_count: os.cpus().length },
    stages: [],
  };
  writeFileSync(resolve(options.out, "manifest.json"), JSON.stringify(data, null, 2) + "\n");
  let sequence = 0;
  const modes = options.mode === "all" ? ["baseline", "jev", "shadow"] : [options.mode];
  for (const mode of modes) {
    for (const stage of [{ phase: "quality", rate: null }, ...options.rates.map(rate => ({ phase: "load", rate }))]) {
      const stageId = `${mode}-${stage.phase}-${stage.rate ?? 0}`;
      const operation = async index => {
        const c = cases[index % cases.length];
        const id = `research-${++sequence}`;
        const started = performance.now();
        let row = { id, case_id: c.id, truth: c.truth, expected_gateway: c.expected_gateway };
        try {
          const boundary = mode === "jev" ? undefined : await authorize(c.event, id);
          const provider = mode === "baseline" ? undefined : options.provider === "live"
            ? await askLive(c.state, { key, timeoutMs: options.timeoutMs, service: options.jevService }) : await askFixture(c.fixture, index);
          const advisory = provider ? recommendation(provider) : undefined;
          row = { ...row, provider, advisory, gateway_decision: boundary?.decision, actual_decision: boundary?.decision,
            counterfactual: boundary ? counterfactual(boundary.decision, advisory ?? boundary.decision) : advisory,
            basis_id: boundary?.basis.basis_id, findings: boundary?.findings,
          };
          if (boundary && boundary.decision !== c.expected_gateway) throw new Error("gateway_fixture_mismatch");
          if (mode === "shadow") appendFileSync(journal, JSON.stringify({ operation: "shadow_advice", id, basis_id: row.basis_id, advisory, actual_decision: boundary.decision, counterfactual: row.counterfactual, provider }) + "\n", { flush: true });
        } catch { row.error = "harness_error"; }
        return { ...row, latency_ms: performance.now() - started };
      };
      let result;
      if (stage.phase === "quality") {
        const start = performance.now();
        const rows = [];
        for (let index = 0; index < cases.length; index++) rows.push({ ...await operation(index), index, schedule_lag_ms: 0 });
        result = { rows, elapsed_ms: performance.now() - start };
      } else {
        result = await loadStage({ count: Math.ceil(stage.rate * options.seconds), rate: stage.rate, concurrency: options.concurrency, operation });
      }
      for (const row of result.rows) appendFileSync(raw, JSON.stringify({ stage: stageId, mode, ...row }) + "\n");
      const summary = summarize(result.rows, result.elapsed_ms);
      data.stages.push({ id: stageId, mode, ...stage, summary });
      console.log(JSON.stringify({ stage: stageId, provider: options.provider, ...summary }));
      writeFileSync(resolve(options.out, "summary.json"), JSON.stringify(data, null, 2) + "\n");
      writeFileSync(resolve(options.out, "REPORT.md"), report(data));
      // Abort an unhealthy live service rather than continue an expensive ramp.
      if (options.provider === "live" && mode !== "baseline" && (summary.successful === 0 || result.rows.some(row => ["http_401", "http_403", "http_429"].includes(row.provider?.status)))) {
        throw new Error("Live ramp stopped on authentication, rate limit, or total stage failure; partial evidence preserved.");
      }
      if (result.rows.some(row => row.error)) throw new Error("Harness acceptance failed; partial evidence preserved.");
    }
  }
  data.complete = true;
  writeFileSync(resolve(options.out, "summary.json"), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(resolve(options.out, "REPORT.md"), report(data));
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(config(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

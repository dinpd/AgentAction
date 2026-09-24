import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { DOMAINS } from "./world.mts";
import { SCENARIOS, makeCase } from "./cases.mts";
import { METHODS, assess, createVerifier, inputFor, type Method } from "./methods.mts";
import { summarize, type Row } from "./metrics.mts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
if (args.some(a => a !== "--check")) throw new Error("Only --check is supported");
const output = resolve(ROOT, "results");
mkdirSync(output, { recursive: true });
const encode = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const jsonLines = (v: unknown[]) => v.map(x => JSON.stringify(x)).join("\n") + "\n";
const persist = (name: string, content: string) => {
  if (check) assert.equal(readFileSync(resolve(output, name), "utf8"), content, `${name} differs from recomputation`);
  else writeFileSync(resolve(output, name), content);
};
const verifier = createVerifier();
const cases: unknown[] = [];
const rows: Row[] = [];
try {
  for (const domain of DOMAINS) for (const scenario of SCENARIOS) for (let variant = 1; variant <= 20; variant++) {
    const base = makeCase(domain, scenario, variant);
    cases.push(base);
    for (const method of METHODS) {
      const c = method === "ingress_all" ? makeCase(domain, scenario, variant, "all") : base;
      const result = await assess(method, inputFor(c), verifier);
      rows.push({ id: base.id, domain, scenario, variant, truth: base.truth, method, ...result });
    }
  }
  const summary = {
    design: { domains: DOMAINS, scenarios: SCENARIOS, variants_per_stratum: 20,
      strata: DOMAINS.length * SCENARIOS.length, cases: cases.length,
      assessments: rows.length, note: "Deterministic parameterizations, not independent sampled tasks." },
    overall: Object.fromEntries(METHODS.map(m => [m, summarize(rows.filter(r => r.method === m))])),
    by_scenario: Object.fromEntries(SCENARIOS.map(s => [s,
      Object.fromEntries(METHODS.map(m => [m, summarize(rows.filter(r => r.method === m && r.scenario === s))]))])),
    by_domain: Object.fromEntries(DOMAINS.map(d => [d,
      Object.fromEntries(METHODS.map(m => [m, summarize(rows.filter(r => r.method === m && r.domain === d))]))])),
  };
  persist("cases.jsonl", jsonLines(cases));
  persist("assessments.jsonl", jsonLines(rows));
  persist("summary.json", encode(summary));

  const lossRows: Array<Row & { loss_fraction: number }> = [];
  for (const loss of [0, 0.25, 0.5, 0.75, 1]) for (const domain of DOMAINS)
    for (const scenario of ["clean", "accepted_pending"] as const) for (let variant = 1; variant <= 20; variant++) {
      for (const method of METHODS) {
        const c = makeCase(domain, scenario, variant, method === "ingress_all" ? "all" : "any");
        if (variant <= loss * 20) delete c.evidence.observations;
        lossRows.push({ id: c.id, domain, scenario, variant, truth: c.truth, method, loss_fraction: loss,
          ...await assess(method, inputFor(c), verifier) });
      }
    }
  persist("observation-loss.jsonl", jsonLines(lossRows));
  persist("observation-loss-summary.json", encode([0, 0.25, 0.5, 0.75, 1].map(loss => ({ loss_fraction: loss,
    methods: Object.fromEntries(METHODS.map(m => [m, summarize(lossRows.filter(r => r.method === m && r.loss_fraction === loss))])) }))));

  const omissionRows: Array<Row & { mask: number; representation: string }> = [];
  for (const domain of DOMAINS) for (const scenario of ["clean", "duplicate_visible"] as const)
    for (let variant = 1; variant <= 20; variant++) for (let mask = 0; mask < 8; mask++)
      for (const representation of ["absent", "empty"]) {
        const c = makeCase(domain, scenario, variant);
        (["decision_events", "execution_receipts", "observations"] as const).forEach((s, bit) => {
          if (!(mask & (1 << bit))) return;
          if (representation === "absent") delete c.evidence[s]; else c.evidence[s] = [];
        });
        const method: Method = "ingress_any";
        omissionRows.push({ id: c.id, domain, scenario, variant, truth: c.truth, method, mask, representation,
          ...await assess(method, inputFor(c), verifier) });
      }
  persist("stream-omission.jsonl", jsonLines(omissionRows));
  persist("stream-omission-summary.json", encode(Array.from({ length: 8 }, (_, mask) => ({ mask,
    streams: ["decision_events", "execution_receipts", "observations"].filter((_, i) => mask & (1 << i)),
    representations: Object.fromEntries(["absent", "empty"].map(rep => [rep,
      summarize(omissionRows.filter(r => r.mask === mask && r.representation === rep))])) }))));

  const sourceFiles = ["src/world.mts", "src/cases.mts", "src/methods.mts", "src/metrics.mts", "src/run.mts",
    "PROTOCOL.md", "package.json", "../../packages/guard/src/intent.ts", "../../cloudflare/src/intent-observation.ts"];
  const digest = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
  persist("manifest.json", encode({ protocol_version: 1, evaluated_repository_base: "856c3739f18a7d6cda775ab187f865278dc6e759",
    sources: Object.fromEntries(sourceFiles.map(f => [f, digest(readFileSync(resolve(ROOT, f)))])),
    cases_sha256: digest(jsonLines(cases)), assessments_sha256: digest(jsonLines(rows)),
    key_policy: "Fresh in-memory RSA-2048 keys each run; private keys and JWS envelopes are not persisted.",
    boundary: "Offline production observation-verifier and evaluator; simulated provider state; no LLM or live API." }));
  console.log(JSON.stringify({ mode: check ? "verified" : "written", cases: cases.length,
    assessments: rows.length, loss_assessments: lossRows.length, omission_assessments: omissionRows.length,
    overall: summary.overall }, null, 2));
} finally { verifier.close(); }

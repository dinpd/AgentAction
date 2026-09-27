import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { summarize } from "./metrics.mjs";
import { report } from "./run.mjs";
import { comparisonReport } from "./compare.mjs";
import { cases } from "./cases.mjs";
import { validateDecisionBasis } from "../../../cloudflare/src/decision-basis.ts";

export function verify(directory) {
  const summary = JSON.parse(readFileSync(resolve(directory, "summary.json")));
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json")));
  assert.equal(summary.complete, true, "run did not finish; inspect partial results");
  const lines = path => readFileSync(resolve(directory, path), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const rows = lines("raw.jsonl");
  const journal = lines("gateway-journal.jsonl");
  const ids = rows.filter(row => !row.dropped).map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(summary.corpus_sha256, manifest.corpus_sha256);
  const basis = new Map(journal.filter(entry => entry.operation === "research_basis").map(entry => [entry.id, entry.basis]));
  const stages = new Set(summary.stages.map(stage => stage.id));
  assert(rows.every(row => stages.has(row.stage)), "unaccounted raw stage");
  for (const stage of summary.stages) {
    const selected = rows.filter(row => row.stage === stage.id);
    assert.equal(new Set(selected.map(row => row.index)).size, selected.length);
    assert.deepEqual(stage.summary, summarize(selected, stage.summary.elapsed_ms));
    if (stage.phase === "quality") assert.equal(new Set(selected.map(row => row.case_id)).size, cases.length);
  }
  for (const row of rows.filter(row => !row.dropped)) {
    assert(!row.error, `harness error: ${row.id}`);
    const c = cases.find(c => c.id === row.case_id);
    assert(c);
    assert.equal(row.truth, c.truth);
    assert.equal(row.expected_gateway, c.expected_gateway);
    if (row.mode !== "jev" || summary.comparison) {
      assert.equal(row.actual_decision, c.expected_gateway);
      assert.equal(row.actual_decision, row.gateway_decision);
      assert.equal(basis.get(row.id)?.basis_id, row.basis_id);
      assert.deepEqual(validateDecisionBasis(basis.get(row.id)), []);
      assert.equal(basis.get(row.id).conclusion.code, row.actual_decision);
      const audit = journal.find(entry => entry.operation === "put" && Object.values(entry.entries).some(value => value?.payload?.event?.decision_id === row.id));
      assert(audit, `missing persisted gateway audit: ${row.id}`);
    }
    if (row.mode === "shadow" || summary.comparison) {
      const entry = journal.find(entry => entry.operation === "shadow_advice" && entry.id === row.id);
      assert.equal(entry?.actual_decision, row.actual_decision);
      assert.equal(entry?.counterfactual, row.counterfactual);
      assert.equal(entry?.advisory, row.advisory);
    }
  }
  assert.equal(readFileSync(resolve(directory, "REPORT.md"), "utf8"), summary.comparison ? comparisonReport(summary) : report(summary));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const [path, hash] of Object.entries(manifest.source_hashes)) {
    assert.equal(createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"), hash, `source changed: ${path}`);
  }
  return { rows: rows.length, stages: stages.size, gateway_bases: basis.size, live: summary.provider === "live" };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verify(process.argv[2] ?? "results/comparison-local")));
}

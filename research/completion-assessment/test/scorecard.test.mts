import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../src/score_assessments.mts", import.meta.url));
test("adapter scorecard keeps trust strata and unknown successes without dropping cases", () => {
  const input = [
    { id: "1", truth: true, label: "S", method: "external", scenario: "clean", assumptions_hold: true },
    { id: "2", truth: true, label: "U", method: "external", scenario: "missing", assumptions_hold: true },
    { id: "3", truth: false, label: "S", method: "external", scenario: "bypass", assumptions_hold: false },
  ];
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", script], {
    input: JSON.stringify({ schema_version: 1, methods: ["external"], rows: input }), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  assert.equal(result.overall.external.total, 3);
  assert.equal(result.overall.external.completion_precision, .5);
  assert.equal(result.overall.external.completion_recall, .5);
  assert.equal(result.overall.external.completion_f1, .5);
  assert.equal(result.within_assumptions.external.completion_precision, 1);
  assert.equal(result.within_assumptions.external.completion_recall, .5);
  assert.equal(result.outside_assumptions.external.false_success, 1);
  assert.equal(result.by_scenario.missing.external.confusion.positive.U, 1);
  const invalid = spawnSync(process.execPath, ["--experimental-strip-types", script], {
    input: JSON.stringify({ schema_version: 1, methods: ["external"], rows: [{ ...input[0], truth: "true" }] }), encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
});

test("paired comparison rejects selective omission, duplicates, and contradictory truth", () => {
  const base = { truth: true, label: "S", scenario: "clean", assumptions_hold: true };
  const rows = ["a", "b"].flatMap(method => ["easy", "hard"].map(id => ({ ...base, id, method })));
  const run = (candidate: any, methods = ["a", "b"]) => spawnSync(process.execPath, ["--experimental-strip-types", script], {
    input: JSON.stringify({ schema_version: 1, methods, rows: candidate }), encoding: "utf8" });
  assert.equal(run(rows).status, 0);
  assert.notEqual(run(rows.slice(0, -1)).status, 0, "Dropping a difficult case must fail");
  assert.notEqual(run(rows.filter(r => r.method === "a")).status, 0, "Dropping an entire declared method must fail");
  assert.notEqual(run([...rows, rows[0]]).status, 0);
  for (const change of [{ truth: false }, { scenario: "other" }, { assumptions_hold: false }, { id: "" }, { method: "undeclared" }]) {
    assert.notEqual(run(rows.map((r, i) => i === 2 ? { ...r, ...change } : r)).status, 0);
  }
  assert.equal(run(rows.map((r, i) => i === 3 ? { ...r, label: "U" } : r)).status, 0,
    "An explicit unknown retains the denominator");
});

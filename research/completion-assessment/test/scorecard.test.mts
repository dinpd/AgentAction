import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../src/score_assessments.mts", import.meta.url));
test("adapter scorecard keeps trust strata and unknown successes without dropping cases", () => {
  const input = [
    { truth: true, label: "S", method: "external", scenario: "clean", assumptions_hold: true },
    { truth: true, label: "U", method: "external", scenario: "missing", assumptions_hold: true },
    { truth: false, label: "S", method: "external", scenario: "bypass", assumptions_hold: false },
  ];
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", script], {
    input: JSON.stringify(input), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  assert.equal(result.overall.external.total, 3);
  assert.equal(result.overall.external.completion_precision, .5);
  assert.equal(result.overall.external.completion_recall, .5);
  assert.equal(result.overall.external.completion_f1, .5);
  assert.equal(result.within_assumptions.external.completion_precision, 1);
  assert.equal(result.within_assumptions.external.completion_recall, .5);
  assert.equal(result.outside_assumptions.external.false_success, 1);
  assert.equal(result.by_scenario.missing.external.confusion.positive.U, 1);
  const invalid = spawnSync(process.execPath, ["--experimental-strip-types", script], {
    input: JSON.stringify([{ ...input[0], truth: "true" }]), encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
});

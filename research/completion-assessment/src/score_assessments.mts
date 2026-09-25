import assert from "node:assert/strict";
import { summarize } from "./metrics.mts";
let input = "";
for await (const chunk of process.stdin) input += chunk;
type Row = { id: string; truth: boolean; label: "S" | "F" | "U"; method: string; scenario: string; assumptions_hold: boolean };
const batch = JSON.parse(input);
assert.equal(batch.schema_version, 1, "Expected scorecard envelope schema_version 1");
const methods: string[] = batch.methods;
assert.ok(Array.isArray(methods) && methods.length > 0 && methods.every(m => typeof m === "string" && m.length > 0)
  && new Set(methods).size === methods.length, "Declare unique expected methods");
const rows: Row[] = batch.rows;
assert.ok(Array.isArray(rows) && rows.length > 0, "Expected a nonempty array of assessment rows");
const cases = new Map<string, { truth: boolean; scenario: string; assumptions_hold: boolean; methods: Set<string> }>();
for (const row of rows) {
  assert.ok(row && typeof row.id === "string" && row.id.length > 0 && typeof row.truth === "boolean" && ["S", "F", "U"].includes(row.label)
    && typeof row.assumptions_hold === "boolean" && typeof row.method === "string" && row.method.length > 0
    && typeof row.scenario === "string" && row.scenario.length > 0, "Invalid assessment row");
  assert.ok(methods.includes(row.method), "Undeclared method");
  const c = cases.get(row.id) ?? { truth: row.truth, scenario: row.scenario, assumptions_hold: row.assumptions_hold, methods: new Set<string>() };
  assert.ok(c.truth === row.truth && c.scenario === row.scenario && c.assumptions_hold === row.assumptions_hold,
    "Case truth/scenario/trust metadata differ between methods");
  assert.ok(!c.methods.has(row.method), "Duplicate method/case result");
  c.methods.add(row.method);
  cases.set(row.id, c);
}
for (const c of cases.values()) assert.equal(c.methods.size, methods.length,
  "Every declared method must report every case; encode unavailable verdicts explicitly as U");
const group = (selected: Row[]) => Object.fromEntries(methods.map(m => [m, summarize(selected.filter(r => r.method === m))]));
console.log(JSON.stringify({ overall: group(rows),
  within_assumptions: group(rows.filter(r => r.assumptions_hold)),
  outside_assumptions: group(rows.filter(r => !r.assumptions_hold)),
  by_scenario: Object.fromEntries([...new Set(rows.map(r => r.scenario))].map(s => [s, group(rows.filter(r => r.scenario === s))])) }));

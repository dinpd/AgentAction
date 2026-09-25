import assert from "node:assert/strict";
import { summarize } from "./metrics.mts";
let input = "";
for await (const chunk of process.stdin) input += chunk;
type Row = { truth: boolean; label: "S" | "F" | "U"; method: string; scenario: string; assumptions_hold: boolean };
const rows: Row[] = JSON.parse(input);
assert.ok(Array.isArray(rows) && rows.length > 0, "Expected a nonempty array of assessment rows");
for (const row of rows) {
  assert.ok(row && typeof row.truth === "boolean" && ["S", "F", "U"].includes(row.label)
    && typeof row.assumptions_hold === "boolean" && typeof row.method === "string" && row.method.length > 0
    && typeof row.scenario === "string" && row.scenario.length > 0, "Invalid assessment row");
}
const methods = [...new Set(rows.map(r => r.method))];
const group = (selected: Row[]) => Object.fromEntries(methods.map(m => [m, summarize(selected.filter(r => r.method === m))]));
console.log(JSON.stringify({ overall: group(rows),
  within_assumptions: group(rows.filter(r => r.assumptions_hold)),
  outside_assumptions: group(rows.filter(r => !r.assumptions_hold)),
  by_scenario: Object.fromEntries([...new Set(rows.map(r => r.scenario))].map(s => [s, group(rows.filter(r => r.scenario === s))])) }));

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Service } from "./service.mts";
import { makeServiceCase, persistedCase, SERVICE_SCENARIOS, type ServiceCase } from "./service_cases.mts";
import { SERVICE_METHODS, assessRemedy, type ServiceMethod } from "./remedy.mts";
import { createVerifier, assess, type Assessment } from "./methods.mts";
import { summarize } from "./metrics.mts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.slice(2).includes("--check");
assert.ok(process.argv.slice(2).every(a => a === "--check"));
const output = resolve(ROOT, "results/service");
mkdirSync(output, { recursive: true });
const persist = (name: string, content: string) => {
  if (check) assert.equal(readFileSync(resolve(output, name), "utf8"), content, `${name} differs from recomputation`);
  else writeFileSync(resolve(output, name), content);
};
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const lines = (v: unknown[]) => v.map(r => JSON.stringify(r)).join("\n") + "\n";
const directory = mkdtempSync(join(tmpdir(), "agentaction-service-"));
const service = new Service(join(directory, "provider.sqlite"));
const verifier = createVerifier();
type ServiceRow = Assessment & Pick<ServiceCase, "id" | "scenario" | "variant" | "assumptions_hold" | "truth"> & { method: ServiceMethod };
const cases: ServiceCase[] = [], rows: ServiceRow[] = [];
try {
  await service.start();
  for (const scenario of SERVICE_SCENARIOS) for (let variant = 1; variant <= 5; variant++) {
    const c = await makeServiceCase(service, scenario, variant);
    cases.push(persistedCase(c));
    for (const method of SERVICE_METHODS) {
      const result = method === "ingress_any" || method === "ingress_latest"
        ? await assess(method, c.input, verifier) : await assessRemedy(method, c.input, verifier);
      rows.push({ id: c.id, scenario, variant, method, assumptions_hold: c.assumptions_hold, truth: c.truth, ...result });
    }
  }
  const byMethod = (selected: typeof rows) => Object.fromEntries(SERVICE_METHODS.map(m => [m, summarize(selected.filter(r => r.method === m))]));
  const summary = { design: { scenarios: SERVICE_SCENARIOS, repetitions: 5, cases: cases.length, assessments: rows.length,
      methods: SERVICE_METHODS, note: "Controlled persistent-service schedules; repeated parameters are not independent deployment samples." },
    overall: byMethod(rows), within_assumptions: byMethod(rows.filter(r => r.assumptions_hold)),
    outside_assumptions: byMethod(rows.filter(r => !r.assumptions_hold)),
    by_scenario: Object.fromEntries(SERVICE_SCENARIOS.map(s => [s, byMethod(rows.filter(r => r.scenario === s))])) };
  persist("cases.jsonl", lines(cases));
  persist("assessments.jsonl", lines(rows));
  persist("summary.json", json(summary));
  const sources = ["src/persistent_provider.py", "src/audit_provider.py", "src/service.mts", "src/service_cases.mts",
    "src/remedy.mts", "src/run_service.mts", "src/methods.mts", "src/cases.mts", "src/world.mts", "src/metrics.mts", "REMEDY_PROTOCOL.md",
    "../../packages/guard/src/intent.ts", "../../cloudflare/src/intent-observation.ts"];
  const digest = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
  persist("manifest.json", json({ protocol_version: 1, sources: Object.fromEntries(sources.map(p => [p, digest(readFileSync(resolve(ROOT, p)))])),
    cases_sha256: digest(lines(cases)), assessments_sha256: digest(lines(rows)),
    boundary: "Loopback HTTP and temporary SQLite WAL database; trusted broker signs actual reads; no external provider or LLM.",
    normalization: "Fresh random challenges are replaced by case-specific markers and the saved head digest is recomputed. Fresh keys/JWS are not saved." }));
  console.log(json({ mode: check ? "verified" : "written", cases: cases.length, assessments: rows.length,
    within_assumptions: summary.within_assumptions, outside_assumptions: summary.outside_assumptions }));
} finally {
  verifier.close();
  await service.stop();
  rmSync(directory, { recursive: true, force: true });
}

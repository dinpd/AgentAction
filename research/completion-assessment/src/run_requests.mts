import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Service } from "./service.mts";
import { makeServiceCase, SERVICE_SCENARIOS } from "./service_cases.mts";
import { createVerifier } from "./methods.mts";
import { REQUEST_METHODS, runRequestPolicy, EvidenceUnavailable, normalizeInput, normalizedChallenge } from "./evidence_requests.mts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.slice(2).includes("--check");
assert.ok(process.argv.slice(2).every(a => a === "--check"));
const CONDITIONS = ["recovered", "unavailable", "persistent_omission", "revision_race"];
const output = resolve(ROOT, "results/requests");
mkdirSync(output, { recursive: true });
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const lines = (value: unknown[]) => value.map(r => JSON.stringify(r)).join("\n") + "\n";
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const persist = (name: string, value: string) => {
  if (check) assert.equal(readFileSync(resolve(output, name), "utf8"), value, name + " differs");
  else writeFileSync(resolve(output, name), value);
  return digest(value);
};
const directory = mkdtempSync(join(tmpdir(), "agentaction-request-"));
const verifier = createVerifier();
const cases: any[] = [], rows: any[] = [];
try {
  for (const condition of CONDITIONS) {
    const services = REQUEST_METHODS.map(method => new Service(join(directory, `${condition}-${method}.sqlite`)));
    try {
      await Promise.all(services.map(s => s.start()));
      for (const scenario of SERVICE_SCENARIOS) for (let variant = 1; variant <= 5; variant++) {
        const id = `requests/${condition}/${scenario}/${variant}`;
        const starting = await Promise.all(services.map(s => makeServiceCase(s, scenario, variant)));
        const input = normalizeInput(starting[0].input, id + "/initial");
        for (const c of starting) {
          assert.deepEqual(normalizeInput(c.input, id + "/initial"), input, "Policies must see identical initial inputs");
          assert.deepEqual(c.audit, starting[0].audit, "Policies must begin in identical worlds");
        }
        cases.push({ id, scenario: `${scenario}/${condition}`, family: scenario, condition, variant,
          truth: starting[0].truth, assumptions_hold: starting[0].assumptions_hold, input,
          audit: starting[0].audit, schedule: starting[0].schedule });
        if (condition === "unavailable") await Promise.all(services.map(s => s.stop()));
        for (const [index, method] of REQUEST_METHODS.entries()) {
          const service = services[index], c = starting[index];
          const reads: any[] = [];
          let changed = false;
          const writer = async () => {
            assert.ok(!changed);
            assert.ok(c.audit.effects.every((e: any) => e.settled === c.audit.effects[0].settled));
            await service.call("POST", "/state", { job: c.input.contract.job_id, settled: Boolean(c.audit.effects[0].settled) });
            changed = true;
          };
          // Only the harness knows the collection condition. The policy gets
          // a read-only interface, contract/evidence and its own diagnostics.
          const read = async (kind: "snapshot" | "head", challenge: string) => {
            assert.ok(reads.length < 2, "Provider read budget exhausted");
            const entry: any = { kind, status: "unavailable", response: null, provider_bytes: 0 };
            reads.push(entry);
            if (condition === "revision_race" && kind === "head" && !changed) await writer();
            let response;
            try {
              response = await service.call("GET", `/${kind}?job=${encodeURIComponent(c.input.contract.job_id)}` +
                (kind === "head" ? `&challenge=${encodeURIComponent(challenge)}` : ""));
            } catch (error: any) {
              if (error.code !== "ECONNREFUSED") throw error;
              throw new EvidenceUnavailable("Provider unavailable");
            }
            entry.status = "ok";
            entry.provider_bytes = bytes(response);
            entry.response = structuredClone(response);
            if (kind === "head") entry.response.challenge = normalizedChallenge(id + "/additional");
            if (condition === "revision_race" && kind === "snapshot") await writer();
            if (scenario === "lying_collector" && kind === "snapshot") response.state.settled = true;
            return response;
          };
          const outcome = await runRequestPolicy(method, c.input, verifier, read, evidence => {
            if (condition === "persistent_omission") evidence.execution_receipts = evidence.execution_receipts!.slice(0, -1);
          });
          const audit = service.audit(c.input.contract.job_id);
          assert.deepEqual(audit.effects, c.audit.effects);
          assert.deepEqual(audit.ledger, c.audit.ledger);
          assert.equal(audit.truth, c.truth);
          assert.equal(audit.task.revision, c.audit.task.revision + (changed ? 1 : 0));
          const finalInput = outcome.final_input ? normalizeInput(outcome.final_input, id + "/additional") : null;
          const delivery = outcome.delivery ? { ...outcome.delivery, head: finalInput!.head, challenge: finalInput!.challenge } : null;
          if (delivery) assert.equal(bytes(delivery), bytes(outcome.delivery), "Normalization must preserve byte counts");
          rows.push({ id, scenario: `${scenario}/${condition}`, family: scenario, condition, variant, method,
            truth: c.truth, assumptions_hold: c.assumptions_hold, label: outcome.final.label,
            initial: outcome.initial, final: outcome.final, request: outcome.request, status: outcome.status,
            final_input: finalInput, delivery, reads, audit_after: audit,
            cost: { requests: Number(Boolean(outcome.request)), provider_reads: reads.length,
              successful_reads: reads.filter(r => r.status === "ok").length,
              provider_bytes: reads.reduce((n, r) => n + r.provider_bytes, 0),
              evidence_bytes: delivery ? bytes(delivery) : 0 } });
        }
        if (condition === "unavailable") await Promise.all(services.map(s => s.start()));
      }
      console.log(`Completed collection condition: ${condition}`);
    } finally { await Promise.all(services.map(s => s.stop())); }
  }
  const score = (selected: any[]) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", resolve(ROOT, "src/score_assessments.mts")], {
    input: JSON.stringify({ schema_version: 1, methods: REQUEST_METHODS, rows: selected }), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
  const costs = (selected: any[]) => Object.fromEntries(REQUEST_METHODS.map(method => {
    const selectedRows = selected.filter(r => r.method === method);
    return [method, Object.fromEntries(["requests", "provider_reads", "successful_reads", "provider_bytes", "evidence_bytes"].map(key =>
      [key, selectedRows.reduce((n, r) => n + r.cost[key], 0)]))];
  }));
  const summary = { design: { families: SERVICE_SCENARIOS.length, conditions: CONDITIONS, variants: 5, cases: cases.length,
      assessments: rows.length, methods: REQUEST_METHODS, max_rounds: 1, max_reads: 2 },
    ...score(rows), initial: score(rows.map(r => ({ ...r, label: r.initial.label }))), costs: costs(rows),
    by_condition: Object.fromEntries(CONDITIONS.map(condition => {
      const selected = rows.filter(r => r.condition === condition);
      return [condition, { ...score(selected), costs: costs(selected) }];
    })) };
  const data = { "cases.jsonl": persist("cases.jsonl", lines(cases)), "assessments.jsonl": persist("assessments.jsonl", lines(rows)),
    "summary.json": persist("summary.json", json(summary)) };
  const sources = ["src/evidence_requests.mts", "src/run_requests.mts", "src/score_assessments.mts", "src/metrics.mts",
    "src/service.mts", "src/service_cases.mts", "src/persistent_provider.py", "src/audit_provider.py", "src/remedy.mts",
    "src/methods.mts", "src/cases.mts", "src/world.mts", "EVIDENCE_REQUEST_PROTOCOL.md",
    "../../packages/guard/src/intent.ts", "../../cloudflare/src/intent-observation.ts"];
  persist("manifest.json", json({ protocol_version: 1, data_sha256: data,
    sources: Object.fromEntries(sources.map(p => [p, digest(readFileSync(resolve(ROOT, p)))])),
    boundary: "Only snapshot/head GETs in the requester; controlled external writer is separate harness code; no network beyond loopback and local JWKS fixture." }));
  console.log(json({ mode: check ? "verified" : "written", ...summary.design }));
} finally { verifier.close(); rmSync(directory, { recursive: true, force: true }); }

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { randomUUID, createHash } from "node:crypto";
import { cpus, platform, arch, release, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Service } from "./service.mts";
import { makeServiceCase, evidenceFromSnapshot, observation } from "./service_cases.mts";
import { SERVICE_METHODS, assessRemedy, prepareRemedy, type RemedyInput, type ServiceMethod } from "./remedy.mts";
import { createVerifier, assess } from "./methods.mts";

const dir = mkdtempSync(join(tmpdir(), "agentaction-service-timing-"));
const service = new Service(join(dir, "timing.sqlite"));
const v = createVerifier();
const measure = (samples: number[][]) => {
  const xs = samples.flat().sort((a, b) => a - b);
  return { unit: "ms", n: xs.length, samples, p50: xs[Math.ceil(xs.length * .5) - 1], p95: xs[Math.ceil(xs.length * .95) - 1] };
};
try {
  await service.start();
  const c = await makeServiceCase(service, "clean", 1);
  const prepared = prepareRemedy(c.input, v);
  const local = async (m: ServiceMethod) => m === "ingress_any" || m === "ingress_latest"
    ? assess(m, c.input, v, prepared.observations) : assessRemedy(m, c.input, v, prepared);
  const integrated = async (m: ServiceMethod) => {
    const job = encodeURIComponent(c.input.contract.job_id);
    const snapshot = await service.call("GET", "/snapshot?job=" + job, undefined, false);
    const input: RemedyInput = { contract: c.input.contract, evidence: evidenceFromSnapshot(c.input.contract, snapshot),
      toolStatus: 200, signatureFault: "none", headFault: "none", challenge: randomUUID() };
    if (m === "revision_only" || m === "closure_revision") {
      const head = await service.call("GET", "/head?job=" + job + "&challenge=" + input.challenge, undefined, false);
      input.head = observation(input.contract, { _head: { schema: "research.head.v1", ...head } }, 10);
    }
    return m === "ingress_any" || m === "ingress_latest" ? assess(m, input, v) : assessRemedy(m, input, v);
  };
  const results: Record<string, any> = {};
  for (const [name, call] of [["local_gate", local], ["integrated_http", integrated]] as const) {
    for (let n = 0; n < 20; n++) for (const m of SERVICE_METHODS) assert.equal((await call(m)).label, "S");
    const samples = Object.fromEntries(SERVICE_METHODS.map(m => [m, Array.from({ length: 5 }, () => [] as number[])]));
    for (let block = 0; block < 5; block++) for (let n = 0; n < 40; n++) {
      for (let offset = 0; offset < SERVICE_METHODS.length; offset++) {
        const m = SERVICE_METHODS[(n + block + offset) % SERVICE_METHODS.length];
        const start = performance.now();
        const result = await call(m);
        const elapsed = performance.now() - start;
        assert.equal(result.label, "S");
        samples[m][block].push(elapsed);
      }
    }
    results[name] = Object.fromEntries(SERVICE_METHODS.map(m => [m, measure(samples[m])]));
  }
  const dbRuntime = spawnSync(process.env.RESEARCH_PYTHON ?? "python3", ["-c", "import json,platform,sqlite3; print(json.dumps({'python':platform.python_version(),'sqlite':sqlite3.sqlite_version}))"], { encoding: "utf8" });
  assert.equal(dbRuntime.status, 0);
  const report = { measured_at: new Date().toISOString(), node: process.version,
    platform: platform(), arch: arch(), os_release: release(), cpu: cpus()[0]?.model, ...JSON.parse(dbRuntime.stdout),
    protocol: "20 warmups per method; 5 blocks x 40 samples per method; method order rotates every iteration; fixed clean task, no CPU isolation.",
    local_scope: "Prepared JWS verification, local JWKS JSON/key import, closure/revision checks and production evaluation. Excludes signing and HTTP.",
    integrated_scope: "Fresh loopback HTTP snapshot, broker packing/signing, gate. Revision methods additionally fetch/sign/verify a challenge-bound head. Excludes startup, action execution, remote JWKS/TLS, and LLM.",
    sources: Object.fromEntries(["./service_timing.mts", "./remedy.mts", "./service.mts", "./persistent_provider.py", "./service_cases.mts"].map(p => [p.slice(2), createHash("sha256").update(readFileSync(new URL(p, import.meta.url))).digest("hex")])),
    results };
  writeFileSync(new URL("../results/service/timing.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name, values]) => [name,
    Object.fromEntries(Object.entries(values).map(([m, r]) => [m, { p50: (r as any).p50, p95: (r as any).p95 }]))])), null, 2));
} finally { v.close(); await service.stop(); rmSync(dir, { recursive: true, force: true }); }

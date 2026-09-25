import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Service } from "../src/service.mts";
import { makeServiceCase } from "../src/service_cases.mts";
import { createVerifier } from "../src/methods.mts";
import { assessRemedy } from "../src/remedy.mts";
import { planRequest, OneRoundRequester, runRequestPolicy, EvidenceUnavailable } from "../src/evidence_requests.mts";

test("requests recover missing evidence, retain trust failures, and cannot mutate effects", { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "evidence-request-test-"));
  const service = new Service(join(dir, "provider.sqlite")), verifier = createVerifier();
  try {
    await service.start();
    for (const [scenario, expectedKind, expectedLabel] of [
      ["missing_head", "head", "S"], ["hidden_duplicate", "history", "F"],
      ["missing_observation", "snapshot", "S"], ["stale_failure", "snapshot", "S"],
      ["unmediated_duplicate", null, "S"], ["lying_collector", null, "S"], ["pending", null, "F"],
    ] as const) {
      const c = await makeServiceCase(service, scenario, 1);
      const original = structuredClone(c.input), calls: string[] = [];
      const read = async (kind: "snapshot" | "head", challenge: string) => {
        calls.push(kind);
        return service.call("GET", `/${kind}?job=${encodeURIComponent(c.input.contract.job_id)}&challenge=${encodeURIComponent(challenge)}`);
      };
      const result = await runRequestPolicy("gate_targeted", c.input, verifier, read);
      assert.equal(result.request?.kind ?? null, expectedKind);
      assert.equal(result.final.label, expectedLabel, `${scenario}: ${JSON.stringify(result.final)}`);
      assert.equal(calls.length, expectedKind === null ? 0 : expectedKind === "head" ? 1 : 2);
      assert.deepEqual(service.audit(c.input.contract.job_id), c.audit);
      assert.deepEqual(c.input, original);
      if (expectedKind !== null) {
        const unavailable = await runRequestPolicy("gate_targeted", c.input, verifier, async () => { throw new EvidenceUnavailable(); });
        assert.equal(unavailable.final.label, "U");
        assert.equal(unavailable.status, "unavailable");
      }
      if (scenario === "missing_head") {
        const initial = await assessRemedy("closure_revision", c.input, verifier);
        const request = planRequest(c.input, initial)!;
        // No oracle or intervention field is available to either API.
        assert.ok(!JSON.stringify(request).includes('"truth"'));
        const executor = new OneRoundRequester();
        await executor.execute(request, c.input, read);
        await assert.rejects(executor.execute(request, c.input, read), /budget exhausted/);
        const before = calls.length;
        await assert.rejects(new OneRoundRequester().execute({ ...request, job_id: "other-job" }, c.input, read), /binding mismatch/);
        assert.equal(calls.length, before);
      }
    }
  } finally { verifier.close(); await service.stop(); rmSync(dir, { recursive: true, force: true }); }
});

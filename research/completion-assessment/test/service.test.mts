import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Service } from "../src/service.mts";
import { SERVICE_SCENARIOS, makeServiceCase, persistedCase, observation } from "../src/service_cases.mts";
import { SERVICE_METHODS, assessRemedy, recordsDigest } from "../src/remedy.mts";
import { createVerifier, assess } from "../src/methods.mts";
import { digestIntentObservation } from "../../../packages/guard/src/intent.ts";

test("HTTP/SQLite remedy: ablations, persistent retries, controlled races, and explicit trust limits", { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentaction-service-test-"));
  const service = new Service(join(dir, "test.sqlite"));
  const v = createVerifier();
  const labels: Record<string, Record<string, string>> = {};
  try {
    await service.start();
    for (const scenario of SERVICE_SCENARIOS) {
      const c = await makeServiceCase(service, scenario, 1);
      assert.deepEqual(Object.keys(c.input).sort(), ["challenge", "contract", "evidence", "headFault", "signatureFault", "toolStatus", ...(c.input.head ? ["head"] : [])].sort());
      labels[scenario] = {};
      for (const method of SERVICE_METHODS) {
        const result = method === "ingress_any" || method === "ingress_latest"
          ? await assess(method, c.input, v) : await assessRemedy(method, c.input, v);
        labels[scenario][method] = result.label;
        if (method === "closure_revision" && c.assumptions_hold) {
          assert.ok(result.label === "U" || (result.label === "S") === c.truth, `${scenario}: wrong decisive combined result`);
        }
      }
      if (["lost_response_retry", "restart_retry", "concurrent_same_key"].includes(scenario)) {
        assert.equal(c.audit.effects.length, 1);
        assert.deepEqual(c.audit.ledger.map((r: any) => r.status), ["executed", "replayed"]);
        assert.equal(c.truth, true);
      }
      if (scenario === "snapshot_before_duplicate_commit") {
        assert.equal(c.audit.effects.length, 2);
        assert.equal(c.final_revision, 2);
        assert.ok(c.schedule.includes("snapshot_returned_while_writer_blocked"));
      }
      if (scenario === "unapproved_retry") {
        assert.equal(c.audit.effects.length, 1);
        assert.equal(c.audit.effects[0].approved, 1);
        assert.equal(c.truth, false, "The contract requires approval for every request, including a replay");
      }
      if (scenario === "clean") {
        // Changing hidden oracle state cannot influence the gate.
        const original = structuredClone(c.input);
        c.audit.effects.push({ ...c.audit.effects[0] });
        assert.deepEqual(c.input, original);
        assert.equal((await assessRemedy("closure_revision", c.input, v)).label, "S");
        const saved = persistedCase(c);
        assert.equal((await assessRemedy("closure_revision", saved.input, v)).label, "S");
        // A certificate transplanted from another contract cannot authorize.
        const rebound = structuredClone(c.input);
        rebound.head!.intent_id = "another-intent";
        rebound.head!.payload_digest = digestIntentObservation(rebound.head!);
        assert.equal((await assessRemedy("closure_revision", rebound, v)).label, "U");
        // The claim is as of the head read, not permanent satisfaction. A later
        // effect falsifies current truth; a newly collected head invalidates it.
        await service.call("POST", "/refund", { job: c.input.contract.job_id, key: "later-effect" });
        assert.equal(service.audit(c.input.contract.job_id).truth, false);
        assert.equal((await assessRemedy("closure_revision", c.input, v)).label, "S");
        const now = structuredClone(c.input);
        now.challenge = "fresh-test-challenge";
        const head = await service.call("GET", "/head?job=" + encodeURIComponent(now.contract.job_id) + "&challenge=" + now.challenge);
        now.head = observation(now.contract, { _head: { schema: "research.head.v1", ...head } }, 10);
        assert.equal((await assessRemedy("closure_revision", now, v)).label, "U");
      }
    }
    for (const scenario of ["clean", "lost_response_retry", "restart_retry", "crash_before_commit", "concurrent_same_key", "reordered_history", "observed_progress"])
      assert.equal(labels[scenario].closure_revision, "S", scenario);
    for (const scenario of ["pending", "wrong_resource", "unapproved", "unapproved_retry", "visible_duplicate", "concurrent_different_keys", "observed_regression"])
      assert.equal(labels[scenario].closure_revision, "F", scenario);
    for (const scenario of ["hidden_duplicate", "empty_receipts", "hidden_unapproved_decision"])
      assert.deepEqual([labels[scenario].ingress_latest, labels[scenario].closure_only, labels[scenario].revision_only, labels[scenario].closure_revision], ["S", "U", "S", "U"], scenario);
    for (const scenario of ["stale_success", "snapshot_before_duplicate_commit"])
      assert.deepEqual([labels[scenario].ingress_latest, labels[scenario].closure_only, labels[scenario].revision_only, labels[scenario].closure_revision], ["S", "S", "U", "U"], scenario);
    assert.deepEqual([labels.stale_failure.ingress_latest, labels.stale_failure.closure_revision], ["F", "U"]);
    for (const scenario of ["missing_head", "replayed_head", "forged_head", "forged_observation", "missing_observation", "duplicate_sequence", "altered_receipt", "missing_checkpoint"])
      assert.equal(labels[scenario].closure_revision, "U", scenario);
    for (const scenario of ["unmediated_duplicate", "lying_collector"])
      assert.equal(labels[scenario].closure_revision, "S", `Must retain out-of-model false success: ${scenario}`);
  } finally { v.close(); await service.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test("closure commitment ignores arrival order but binds sequence, content, and multiplicity", () => {
  const a = [{ seq: 1, status: "executed" }, { seq: 2, status: "replayed" }];
  assert.equal(recordsDigest(a), recordsDigest([...a].reverse()));
  assert.notEqual(recordsDigest(a), recordsDigest([a[0]]));
  assert.notEqual(recordsDigest(a), recordsDigest([a[0], a[0]]));
  assert.notEqual(recordsDigest(a), recordsDigest([{ ...a[0], status: "replayed" }, a[1]]));
});

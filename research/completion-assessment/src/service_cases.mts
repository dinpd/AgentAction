import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { digestIntentObservation, type IntentContract } from "../../../packages/guard/src/intent.ts";
import { contractFor, ISSUER, NOW, type RecordData } from "./cases.mts";
import { specification } from "./world.mts";
import { closureFor, type RemedyInput } from "./remedy.mts";
import { Service } from "./service.mts";

export const SERVICE_SCENARIOS = ["clean", "pending", "wrong_resource", "unapproved", "unapproved_retry",
  "visible_duplicate", "lost_response_retry", "restart_retry", "crash_before_commit", "concurrent_same_key",
  "concurrent_different_keys", "snapshot_before_duplicate_commit", "hidden_duplicate",
  "empty_receipts", "absent_receipts", "hidden_unapproved_decision", "altered_receipt",
  "reordered_history", "duplicate_sequence", "stale_success", "stale_failure",
  "observed_progress", "observed_regression", "missing_observation", "missing_head",
  "replayed_head", "forged_head", "forged_observation", "missing_checkpoint",
  "unmediated_duplicate", "lying_collector"] as const;
export type ServiceScenario = typeof SERVICE_SCENARIOS[number];
export const OUT_OF_MODEL = new Set<ServiceScenario>(["unmediated_duplicate", "lying_collector"]);

export function observation(contract: IntentContract, value: RecordData, index: number): RecordData {
  const at = new Date(NOW.getTime() - 20000 + index * 1000).toISOString();
  const o: RecordData = { schema_version: "agentpass.intent-observation.v1",
    observation_id: `service-observation-${index}`, tenant_id: "synthetic-tenant",
    intent_id: contract.intent_id, intent_digest: contract.intent_digest,
    predicate: "state", resource: contract.profile_variables!.resource, value,
    observed_at: at, issued_at: at, expires_at: new Date(NOW.getTime() + 120000).toISOString(),
    issuer: ISSUER };
  o.payload_digest = digestIntentObservation(o);
  return o;
}

export function evidenceFromSnapshot(contract: IntentContract, snapshot: RecordData, index = 1) {
  const bind = { intent_id: contract.intent_id, intent_digest: contract.intent_digest, job_id: contract.job_id };
  const decisions = snapshot.ledger.map((r: RecordData) => ({ ...bind, seq: r.seq,
    decision_id: `decision-${r.seq}`, decision: "allow", approved: Boolean(r.approved) }));
  const receipts = snapshot.ledger.map((r: RecordData) => ({ ...bind, seq: r.seq,
    execution_receipt_id: `receipt-${r.seq}`, effect_id: r.effect_id, status: r.status }));
  return { decision_events: decisions, execution_receipts: receipts,
    observations: [observation(contract, { ...snapshot.state, _closure: closureFor(decisions, receipts, snapshot.revision) }, index)] };
}

export async function makeServiceCase(service: Service, scenario: ServiceScenario, variant: number) {
  service.trace = [];
  const spec = specification("refund", variant);
  spec.target = `service-${scenario}-${variant}`;
  const contract = contractFor(spec, "any");
  const job = contract.job_id;
  const schedule: string[] = [];
  await service.call("POST", "/jobs", { job, resource: spec.target, amount: spec.amount });
  const refund = (options: RecordData = {}) => service.call("POST", "/refund", { job, key: "action-1", ...options });
  const snapshot = (): Promise<RecordData> => service.call("GET", "/snapshot?job=" + encodeURIComponent(job));
  const state = (settled: boolean) => service.call("POST", "/state", { job, settled });
  const pending = ["pending", "stale_failure", "observed_progress", "forged_observation", "lying_collector"].includes(scenario);
  let captured: RecordData | undefined;
  let prior: RecordData | undefined;

  if (scenario === "concurrent_same_key" || scenario === "concurrent_different_keys") {
    const firstBarrier = `${job}-writer`, secondArrival = `${job}-arrival`;
    await service.call("POST", "/barrier", { name: firstBarrier, action: "create" });
    await service.call("POST", "/barrier", { name: secondArrival, action: "create" });
    const first = refund({ barrier: firstBarrier });
    await service.waitReady(firstBarrier);
    const second = refund({ key: scenario === "concurrent_same_key" ? "action-1" : "action-2", arrived: secondArrival });
    await service.waitReady(secondArrival);
    schedule.push("first_writer_uncommitted", "second_request_arrived_before_first_commit");
    await service.call("POST", "/barrier", { name: firstBarrier, action: "release" });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, "executed");
    assert.equal(b.status, scenario === "concurrent_same_key" ? "replayed" : "executed");
  } else if (scenario === "lost_response_retry") {
    await assert.rejects(refund({ lose_response: true }), /socket hang up|ECONNRESET/);
    const retry = await refund();
    assert.equal(retry.status, "replayed");
    schedule.push("commit_followed_by_lost_tcp_response", "same_key_retry_replayed");
  } else {
    await refund({ settled: !pending, approved: scenario !== "unapproved" && scenario !== "hidden_unapproved_decision",
      ...(scenario === "wrong_resource" ? { resource: "wrong-resource" } : {}) });
  }
  if (scenario === "restart_retry") {
    await service.stop("SIGKILL");
    await service.start();
    assert.equal((await refund()).status, "replayed");
    schedule.push("process_killed_after_commit", "same_database_reopened", "same_key_retry_replayed");
  }
  if (scenario === "crash_before_commit") {
    const name = `${job}-crash`;
    await service.call("POST", "/barrier", { name, action: "create" });
    const interrupted = assert.rejects(refund({ key: "action-2", barrier: name }), /socket hang up|ECONNRESET/);
    await service.waitReady(name);
    await service.stop("SIGKILL");
    await interrupted;
    await service.start();
    captured = await snapshot();
    assert.equal(captured.revision, 1);
    assert.equal(captured.ledger.length, 1);
    schedule.push("second_effect_written_but_uncommitted", "process_killed_before_commit", "state_ledger_revision_rolled_back");
  }
  if (["visible_duplicate", "hidden_duplicate", "empty_receipts", "absent_receipts"].includes(scenario))
    await refund({ key: "action-2" });
  if (["reordered_history", "duplicate_sequence", "hidden_unapproved_decision"].includes(scenario)) await refund();
  if (scenario === "unapproved_retry") await refund({ approved: false });
  if (["stale_success", "stale_failure", "observed_progress", "observed_regression", "unmediated_duplicate"].includes(scenario)) {
    captured = await snapshot();
    if (scenario === "unmediated_duplicate") await service.call("POST", "/control/unmediated", { job });
    else await state(scenario === "stale_failure" || scenario === "observed_progress");
    schedule.push("snapshot_before_committed_mutation");
    if (scenario === "observed_progress" || scenario === "observed_regression") {
      prior = captured;
      captured = await snapshot();
      schedule.push("observation_recollected_after_mutation");
    }
  }
  if (scenario === "snapshot_before_duplicate_commit") {
    const name = `${job}-writer`;
    await service.call("POST", "/barrier", { name, action: "create" });
    const writer = refund({ key: "action-2", barrier: name });
    await service.waitReady(name);
    captured = await snapshot();
    assert.equal(captured.revision, 1);
    assert.equal(captured.ledger.length, 1);
    schedule.push("writer_uncommitted", "snapshot_returned_while_writer_blocked");
    await service.call("POST", "/barrier", { name, action: "release" });
    await writer;
    schedule.push("writer_committed_before_final_head");
  }
  captured ??= await snapshot();
  const evidence = evidenceFromSnapshot(contract, captured, prior ? 2 : 1);
  if (prior) evidence.observations.unshift(...evidenceFromSnapshot(contract, prior, 1).observations);
  if (scenario === "hidden_duplicate") evidence.execution_receipts.pop();
  if (scenario === "empty_receipts") evidence.execution_receipts = [];
  if (scenario === "hidden_unapproved_decision") evidence.decision_events.shift();
  if (scenario === "altered_receipt") evidence.execution_receipts[0].effect_id = 999;
  if (scenario === "reordered_history") {
    evidence.decision_events.reverse(); evidence.execution_receipts.reverse();
  }
  if (scenario === "duplicate_sequence") evidence.execution_receipts[1].seq = 1;
  if (scenario === "missing_observation") evidence.observations = [];
  if (scenario === "lying_collector" || scenario === "forged_observation") {
    evidence.observations[0].value.settled = true;
    evidence.observations[0].payload_digest = digestIntentObservation(evidence.observations[0]);
  }
  if (scenario === "missing_checkpoint") {
    delete evidence.observations[0].value._closure;
    evidence.observations[0].payload_digest = digestIntentObservation(evidence.observations[0]);
  }
  const challenge = randomUUID();
  const priorHead = scenario === "replayed_head" ? await service.call("GET", "/head?job=" + encodeURIComponent(job) + "&challenge=" + randomUUID()) : undefined;
  const current = await service.call("GET", "/head?job=" + encodeURIComponent(job) + "&challenge=" + encodeURIComponent(challenge));
  const head = observation(contract, { _head: { schema: "research.head.v1", ...(priorHead ?? current) } }, 10);
  const input: RemedyInput = { contract, evidence, toolStatus: 200,
    signatureFault: scenario === "forged_observation" ? "forged" : "none", challenge,
    headFault: scenario === "forged_head" ? "forged" : "none" };
  if (scenario !== "missing_head") input.head = head;
  if (scenario === "absent_receipts") delete input.evidence.execution_receipts;
  const audit = service.audit(job);
  assert.equal(audit.task.revision, current.revision, "Auditor and final fence must share a quiescent revision");
  return { id: `service/${scenario}/${variant}`, domain: "http_sqlite_refund", scenario, variant,
    assumptions_hold: !OUT_OF_MODEL.has(scenario), truth: audit.truth as boolean, input,
    audit, final_revision: current.revision, schedule, http_trace: structuredClone(service.trace) };
}
export type ServiceCase = Awaited<ReturnType<typeof makeServiceCase>>;

export function persistedCase(c: ServiceCase): ServiceCase {
  const copy = structuredClone(c);
  const fresh = `normalized-fresh-challenge:${c.id}`;
  if (copy.input.head) {
    copy.input.head.value._head.challenge = copy.input.head.value._head.challenge === copy.input.challenge ? fresh : `normalized-prior-challenge:${c.id}`;
    copy.input.head.payload_digest = digestIntentObservation(copy.input.head);
  }
  copy.input.challenge = fresh;
  return copy;
}

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { digestIntentObservation } from "../../../packages/guard/src/intent.ts";
import { type RecordData } from "./cases.mts";
import { type Assessment, type Verifier, assess } from "./methods.mts";
import { type RemedyInput, assessRemedy } from "./remedy.mts";
import { evidenceFromSnapshot, observation } from "./service_cases.mts";

export const REQUEST_METHODS = ["latest_static", "gate_static", "latest_refresh", "gate_full", "gate_targeted"] as const;
export type RequestMethod = typeof REQUEST_METHODS[number];
export type EvidenceRequest = {
  schema: "research.evidence-request.v1"; intent_id: string; intent_digest: string; job_id: string;
  resource: string; kind: "snapshot" | "history" | "head"; reasons: string[]; max_reads: 2;
};
export type ReadEvidence = (kind: "snapshot" | "head", challenge: string) => Promise<RecordData>;
export class EvidenceUnavailable extends Error {}

export function planRequest(input: RemedyInput, result: Assessment, full = false, force = false): EvidenceRequest | null {
  if (!force && result.label !== "U") return null;
  const intentDigest = input.contract.intent_digest;
  assert.ok(typeof intentDigest === "string" && intentDigest.length > 0, "Evidence requests require a contract digest");
  const reasons = [...result.rejected];
  let kind: EvidenceRequest["kind"] = "snapshot";
  if (!full && !force) {
    if (reasons.some(r => ["remedy_history_not_closed", "remedy_missing_closure_source", "remedy_history_binding"].includes(r))) kind = "history";
    else if (reasons.includes("remedy_missing_head") || reasons.includes("remedy_invalid_head_binding") ||
      (reasons.includes("observation_jws_signature_invalid") && !reasons.includes("remedy_missing_observation"))) kind = "head";
  }
  return { schema: "research.evidence-request.v1", intent_id: input.contract.intent_id,
    intent_digest: intentDigest, job_id: input.contract.job_id,
    resource: String(input.contract.profile_variables!.resource), kind, reasons, max_reads: 2 };
}

// The requester, including its round budget, is trusted local orchestration.
// Its read interface has no method, URL, or mutating action parameter.
export class OneRoundRequester {
  private spent = false;
  async execute(request: EvidenceRequest, original: RemedyInput, read: ReadEvidence,
    deliver: (evidence: RemedyInput["evidence"]) => void = () => {}) {
    assert.ok(!this.spent, "Evidence-request round budget exhausted");
    this.spent = true;
    assert.equal(request.schema, "research.evidence-request.v1");
    assert.equal(request.max_reads, 2);
    for (const key of ["intent_id", "intent_digest", "job_id"] as const) assert.equal(request[key], original.contract[key], "Request binding mismatch");
    assert.equal(request.resource, original.contract.profile_variables!.resource, "Request resource mismatch");
    assert.ok(["snapshot", "history", "head"].includes(request.kind));
    const input = structuredClone(original);
    input.challenge = randomUUID();
    let patch: RecordData = {};
    if (request.kind !== "head") {
      const snapshot = await read("snapshot", input.challenge);
      assert.equal(snapshot.job, request.job_id, "Snapshot task mismatch");
      const evidence = evidenceFromSnapshot(input.contract, snapshot, 15);
      deliver(evidence);
      if (request.kind === "snapshot") {
        input.evidence = evidence;
        input.signatureFault = "none";
        patch = { evidence };
      } else {
        input.evidence.decision_events = evidence.decision_events;
        input.evidence.execution_receipts = evidence.execution_receipts;
        patch = { decision_events: evidence.decision_events, execution_receipts: evidence.execution_receipts };
      }
    }
    const current = await read("head", input.challenge);
    input.head = observation(input.contract, { _head: { schema: "research.head.v1", ...current } }, 16);
    input.headFault = "none";
    patch.head = input.head;
    patch.challenge = input.challenge;
    return { input, patch };
  }
}

export async function runRequestPolicy(method: RequestMethod, input: RemedyInput, verifier: Verifier,
  read: ReadEvidence, deliver?: (evidence: RemedyInput["evidence"]) => void) {
  const latest = method === "latest_static" || method === "latest_refresh";
  const evaluate = (value: RemedyInput) => latest ? assess("ingress_latest", value, verifier) : assessRemedy("closure_revision", value, verifier);
  const initial = await evaluate(input);
  const request = method.endsWith("_static") ? null : planRequest(input, initial, method !== "gate_targeted", method === "latest_refresh");
  if (!request) return { initial, final: initial, request, final_input: null, delivery: null, status: "not_requested" };
  try {
    const { input: updated, patch } = await new OneRoundRequester().execute(request, input, read, deliver);
    return { initial, final: await evaluate(updated), request, final_input: updated, delivery: patch, status: "received" };
  } catch (error) {
    if (!(error instanceof EvidenceUnavailable)) throw error;
    // A failed refresh cannot silently fall back to a potentially stale verdict.
    return { initial, final: { label: "U", confidence: null, rejected: ["evidence_request_unavailable"] } as Assessment,
      request, final_input: null, delivery: null, status: "unavailable" };
  }
}

export function normalizedChallenge(key: string) {
  const h = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function normalizeInput(input: RemedyInput, key: string): RemedyInput {
  const copy = structuredClone(input);
  copy.challenge = normalizedChallenge(key);
  if (copy.head) {
    copy.head.value._head.challenge = normalizedChallenge(copy.head.value._head.challenge === input.challenge ? key : key + "/prior");
    copy.head.payload_digest = digestIntentObservation(copy.head);
  }
  return copy;
}

import { createHash } from "node:crypto";
import { evaluateIntent } from "../../../packages/guard/src/intent.ts";
import { IntentObservationVerificationError } from "../../../cloudflare/src/intent-observation.ts";
import { NOW, type RecordData } from "./cases.mts";
import { labelReceipt, type AssessmentInput, type Assessment, type Verifier } from "./methods.mts";

export const SERVICE_METHODS = ["ingress_any", "ingress_latest", "closure_only", "revision_only", "closure_revision"] as const;
export type ServiceMethod = typeof SERVICE_METHODS[number];
export type RemedyMethod = Exclude<ServiceMethod, "ingress_any" | "ingress_latest">;
export type RemedyInput = AssessmentInput & {
  challenge: string; head?: RecordData; headFault: AssessmentInput["signatureFault"];
};
export type Prepared = { observations: string[]; head?: string };

function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
export function recordsDigest(records: RecordData[]): string {
  const ordered = [...records].sort((a, b) => a.seq - b.seq);
  return createHash("sha256").update(canonical(ordered)).digest("hex");
}
export function closureFor(decisions: RecordData[], receipts: RecordData[], revision: number) {
  return { schema: "research.closure.v1", revision,
    decision_events: { count: decisions.length, digest: recordsDigest(decisions) },
    execution_receipts: { count: receipts.length, digest: recordsDigest(receipts) } };
}
export function prepareRemedy(input: RemedyInput, v: Verifier): Prepared {
  return { observations: (input.evidence.observations ?? []).map(o => v.envelope(o as RecordData, input.signatureFault)),
    head: input.head ? v.envelope(input.head, input.headFault) : undefined };
}

export async function assessRemedy(method: RemedyMethod, input: RemedyInput, v: Verifier,
  prepared?: Prepared): Promise<Assessment> {
  const { evidence, rejected } = await v.ingest(input, prepared?.observations);
  const unknown = (reason: string): Assessment => ({ label: "U", confidence: null, rejected: [...rejected, reason] });
  const observations = (evidence.observations ?? []) as RecordData[];
  if (!observations.length) return unknown("remedy_missing_observation");
  const time = Math.max(...observations.map(o => Date.parse(o.observed_at)));
  const latest = observations.filter(o => Date.parse(o.observed_at) === time);
  if (new Set(latest.map(o => canonical(o.value))).size !== 1) return unknown("remedy_conflicting_observation");
  const selected = latest[0];
  const closure = selected.value?._closure;
  if (!closure || closure.schema !== "research.closure.v1" || !Number.isSafeInteger(closure.revision) || closure.revision < 0)
    return unknown("remedy_missing_checkpoint");
  if (method !== "revision_only") {
    for (const source of ["decision_events", "execution_receipts"] as const) {
      const records = evidence[source] as RecordData[] | undefined;
      const expected = closure[source];
      if (!records || !expected || !Number.isSafeInteger(expected.count) || expected.count < 0)
        return unknown("remedy_missing_closure_source");
      const sequences = records.map(r => r.seq).sort((a, b) => a - b);
      if (records.length !== expected.count || sequences.some((n, i) => n !== i + 1) || recordsDigest(records) !== expected.digest)
        return unknown("remedy_history_not_closed");
      if (records.some(r => r.intent_id !== input.contract.intent_id || r.intent_digest !== input.contract.intent_digest || r.job_id !== input.contract.job_id))
        return unknown("remedy_history_binding");
    }
  }
  if (method !== "closure_only") {
    if (!input.head) return unknown("remedy_missing_head");
    let head: RecordData;
    try { head = await v.verify(input.contract, prepared?.head ?? v.envelope(input.head, input.headFault)); }
    catch (error) {
      if (!(error instanceof IntentObservationVerificationError)) throw error;
      return unknown(error.code);
    }
    const proof = head.value?._head;
    if (!proof || proof.schema !== "research.head.v1" || proof.challenge !== input.challenge ||
      proof.job !== input.contract.job_id || proof.resource !== selected.resource ||
      !Number.isSafeInteger(proof.revision) || proof.revision < 0)
      return unknown("remedy_invalid_head_binding");
    if (closure.revision !== proof.revision) return unknown("remedy_revision_changed");
  }
  evidence.observations = [selected];
  const r = evaluateIntent(input.contract, evidence, { now: () => NOW, idGenerator: () => "research-remedy-evaluation" });
  return { label: labelReceipt(r), confidence: r.evidence_confidence, rejected,
    verdict: r.verdict, compliance: r.constraint_compliance, findings: r.evidence_findings };
}

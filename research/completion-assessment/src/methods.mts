import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { evaluateIntent, digestIntentObservation, type IntentContract, type IntentEvidence,
  type IntentEvaluationReceipt } from "../../../packages/guard/src/intent.ts";
import { verifyIntentObservationRequest, IntentObservationVerificationError } from "../../../cloudflare/src/intent-observation.ts";
import { NOW, ISSUER, type Case, type RecordData } from "./cases.mts";

export const METHODS = ["tool", "trace", "content_any", "local_any", "ingress_any", "ingress_all", "ingress_latest"] as const;
export type Method = typeof METHODS[number];
export type Label = "S" | "F" | "U";
export type AssessmentInput = Pick<Case, "contract" | "evidence" | "toolStatus" | "signatureFault">;
export type Assessment = {
  label: Label; confidence: number | null; rejected: string[];
  verdict?: string; compliance?: string; findings?: string[];
};

export function inputFor(c: Case): AssessmentInput {
  return structuredClone({ contract: c.contract, evidence: c.evidence,
    toolStatus: c.toolStatus, signatureFault: c.signatureFault });
}

export function labelReceipt(r: IntentEvaluationReceipt): Label {
  if (r.qualified_success) return "S";
  if ([...r.outcomes, ...r.constraints].some(p => p.status === "fail")) return "F";
  return "U";
}

function evaluated(contract: IntentContract, evidence: IntentEvidence, rejected: string[] = []): Assessment {
  const r = evaluateIntent(contract, evidence, { now: () => NOW, idGenerator: () => "research-evaluation" });
  return { label: labelReceipt(r), confidence: r.evidence_confidence, rejected,
    verdict: r.verdict, compliance: r.constraint_compliance, findings: r.evidence_findings };
}

const JWKS_URL = "https://research-jwks.invalid/keys";
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// The key pair is ephemeral. Neither key material nor bearer-like envelopes are
// written to disk. Fetch is intercepted strictly; an experiment cannot contact
// a live issuer even if a manifest is accidentally changed.
export function createVerifier() {
  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...keyPair.publicKey.export({ format: "jwk" }), kid: "ephemeral", alg: "RS256", use: "sig" };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) !== JWKS_URL) throw new Error(`Research network request forbidden: ${String(url)}`);
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  };
  const close = () => { globalThis.fetch = oldFetch; };
  const envelope = (observation: RecordData, fault: AssessmentInput["signatureFault"] = "none") => {
    const o = structuredClone(observation);
    delete o.provenance;
    const claims = { iss: o.issuer, sub: "synthetic-observer", aud: "research-observations",
      jti: o.observation_id, iat: Date.parse(o.issued_at) / 1000,
      exp: Date.parse(o.expires_at) / 1000, observation: o };
    const header = encode({ alg: "RS256", kid: "ephemeral", typ: "JWT" });
    const payload = encode(claims);
    const key: KeyObject = fault === "forged" ? attacker.privateKey : keyPair.privateKey;
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key).toString("base64url");
    if (fault === "payload_tamper") {
      // Alter the signed payload bytes without re-signing. The bad digest also
      // exposes this case to the evaluator-only integrity check.
      claims.observation.payload_digest = "1".repeat(64);
      return `${header}.${encode(claims)}.${signature}`;
    }
    return `${header}.${payload}.${signature}`;
  };
  const verify = async (contract: IntentContract, jws: string) => verifyIntentObservationRequest({
    request: { jws }, contract, tenantId: "synthetic-tenant", routeIntentId: contract.intent_id,
    auth: { method: "none" }, env: {}, now: NOW,
    manifest: { agent: { environment: "production" }, intent_assurance: { observations: {
      max_age_seconds: 300, max_future_skew_seconds: 30,
      trusted_issuers: [{ issuer: ISSUER, profiles: [contract.profile], predicates: ["state"],
        verification_methods: ["jws"], jws_subjects: ["synthetic-observer"],
        jwks_uri: JWKS_URL, audiences: ["research-observations"] }],
    } } },
  });
  const ingest = async (input: AssessmentInput, prepared?: string[]) => {
    const evidence = structuredClone(input.evidence);
    const rejected: string[] = [];
    if (evidence.observations !== undefined) {
      const accepted: unknown[] = [];
      for (const [i, o] of evidence.observations.entries()) {
        try { accepted.push(await verify(input.contract, prepared?.[i] ?? envelope(o as RecordData, input.signatureFault))); }
        catch (error) {
          if (!(error instanceof IntentObservationVerificationError)) throw error;
          rejected.push(error.code);
        }
      }
      evidence.observations = accepted;
    }
    return { evidence, rejected };
  };
  return { close, envelope, verify, ingest };
}
export type Verifier = ReturnType<typeof createVerifier>;

export async function assess(method: Method, input: AssessmentInput, verifier: Verifier,
  prepared?: string[]): Promise<Assessment> {
  if (method === "tool") return { label: input.toolStatus >= 200 && input.toolStatus < 300 ? "S" : "F", confidence: null, rejected: [] };
  if (method === "trace") {
    const receipts = input.evidence.execution_receipts as RecordData[] | undefined;
    const decisions = input.evidence.decision_events as RecordData[] | undefined;
    if (!receipts?.length || !decisions?.length) return { label: "U", confidence: null, rejected: [] };
    return { label: receipts.some(r => r.status === "executed") && decisions.every(d => d.decision === "allow") ? "S" : "F", confidence: null, rejected: [] };
  }
  if (method === "content_any") {
    // Deliberately insecure, research-only ablation. Preserve content and all
    // task predicates, but erase trust/binding failures by normalizing metadata.
    const evidence = structuredClone(input.evidence);
    for (const source of ["decision_events", "execution_receipts", "observations"] as const) {
      if (evidence[source] === undefined) continue;
      evidence[source] = evidence[source]!.map(v => {
        const o: RecordData = { ...(v as RecordData), intent_id: input.contract.intent_id,
          intent_digest: input.contract.intent_digest, job_id: input.contract.job_id };
        if (source === "observations") {
          o.issuer = ISSUER;
          o.provenance = { verification_method: "jws", verified_issuer: ISSUER, verified_at: NOW.toISOString() };
          o.payload_digest = digestIntentObservation(o);
        }
        return o;
      });
    }
    return evaluated(input.contract, evidence);
  }
  if (method === "local_any") return evaluated(input.contract, input.evidence);
  const { evidence, rejected } = await verifier.ingest(input, prepared);
  if (method === "ingress_latest" && evidence.observations?.length) {
    const observations = evidence.observations as RecordData[];
    const latestTime = Math.max(...observations.map(o => Date.parse(o.observed_at)));
    const latest = observations.filter(o => Date.parse(o.observed_at) === latestTime);
    const values = new Set(latest.map(o => JSON.stringify(o.value)));
    evidence.observations = values.size > 1 ? [] : [latest[0]];
    if (values.size > 1) rejected.push("research_conflicting_latest_timestamp");
  }
  return evaluated(input.contract, evidence, rejected);
}

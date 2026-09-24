import { bindIntentProfile, issueIntentContract, digestIntentObservation,
  type IntentContract, type IntentEvidence, type IntentPredicate } from "../../../packages/guard/src/intent.ts";
import { emptyWorld, execute, observe, oracle, setCompletion, specification,
  type Domain, type Spec, type World } from "./world.mts";

export const NOW = new Date("2026-09-24T12:00:00.000Z");
export const ISSUER = "synthetic-provider";
export const SCENARIOS = ["clean", "explicit_failure", "accepted_pending", "wrong_target",
  "unapproved_action", "duplicate_visible", "idempotent_replay", "missing_success",
  "missing_failure", "untrusted_issuer", "payload_tamper", "binding_mismatch", "expired",
  "forged_provenance", "conflict", "within_ttl_regression", "hidden_duplicate",
  "empty_receipt_stream", "trusted_signer_falsehood", "legitimate_state_evolution"] as const;
export type Scenario = typeof SCENARIOS[number];
export type RecordData = Record<string, any>;
export type Case = {
  id: string; domain: Domain; scenario: Scenario; variant: number; spec: Spec;
  world: World; truth: boolean; contract: IntentContract;
  evidence: IntentEvidence; toolStatus: number;
  signatureFault: "none" | "payload_tamper" | "forged";
};

export function contractFor(spec: Spec, quantifier: "any" | "all"): IntentContract {
  const wanted: Record<string, unknown> = { resource: spec.target };
  if (spec.domain === "refund") Object.assign(wanted, { amount: spec.amount, settled: true });
  if (spec.domain === "deployment") Object.assign(wanted, { version: spec.version, healthy_replicas: spec.replicas });
  if (spec.domain === "export") Object.assign(wanted, { rows: spec.rows, destination: spec.destination, redacted: true });
  const outcomes: IntentPredicate[] = Object.entries(wanted).map(([key, value]) => ({
    id: `state.${key}`, source: "observations", where: [{ path: "predicate", operator: "equals", value: "state" }],
    assertion: { path: `value.${key}`, operator: "equals", value: { $variable: key }, quantifier },
  }));
  const profile = bindIntentProfile({ schema_version: "agentpass.intent-profile.v1",
    profile: `research_${spec.domain}_${quantifier}`, version: "v1", issuer: "research-authority",
    issued_at: "2026-09-24T11:50:00.000Z",
    variables: Object.fromEntries(Object.entries(wanted).map(([key, value]) => [key,
      { type: typeof value as "string" | "number" | "boolean", required: true }])),
    required_outcomes: outcomes,
    hard_constraints: [
      { id: "approved", source: "decision_events", assertion: { path: "approved", operator: "equals", value: true, quantifier: "all" } },
      { id: "at_most_one_effect", source: "execution_receipts", where: [{ path: "status", operator: "equals", value: "executed" }],
        assertion: { operator: "count_lte", value: 1 } },
    ], evidence_requirements: ["decision_events", "execution_receipts", "observations"],
    trusted_observation_requirements: [{ predicate: "state", issuers: [ISSUER], verification_methods: ["jws"] }],
  });
  return issueIntentContract(profile, { intent_id: `intent-${spec.target}`, job_id: `job-${spec.target}`,
    variables: wanted, issued_at: "2026-09-24T11:59:00.000Z", expires_at: "2026-09-24T12:05:00.000Z" });
}

export function makeCase(domain: Domain, scenario: Scenario, variant: number,
  quantifier: "any" | "all" = "any"): Case {
  const spec = specification(domain, variant);
  const contract = contractFor(spec, quantifier);
  const world = emptyWorld(domain);
  const bind = { intent_id: contract.intent_id, intent_digest: contract.intent_digest, job_id: contract.job_id };
  const decisions: RecordData[] = [];
  const receipts: RecordData[] = [];
  const observations: RecordData[] = [];
  const call = (options: Parameters<typeof execute>[2] = {}) => {
    const status = execute(world, spec, options);
    const n = decisions.length + 1;
    decisions.push({ ...bind, decision_id: `decision-${n}`, decision: "allow", approved: options?.approved ?? true });
    receipts.push({ ...bind, execution_receipt_id: `receipt-${n}`, status });
  };
  const recordObservation = (value: RecordData, secondsAgo = 1) => {
    const observed = new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
    const o: RecordData = { schema_version: "agentpass.intent-observation.v1",
      observation_id: `observation-${observations.length + 1}`, tenant_id: "synthetic-tenant",
      intent_id: contract.intent_id, intent_digest: contract.intent_digest, predicate: "state", value,
      observed_at: observed, issued_at: observed,
      expires_at: new Date(NOW.getTime() + 120000).toISOString(), issuer: ISSUER,
      resource: spec.target, provenance: { verification_method: "jws", verified_issuer: ISSUER,
        verified_at: NOW.toISOString(), verified_subject: "synthetic-observer", signature_kid: "ephemeral" } };
    o.payload_digest = digestIntentObservation(o);
    observations.push(o);
  };
  let toolStatus = 200;
  if (scenario === "explicit_failure") {
    toolStatus = 500;
    decisions.push({ ...bind, decision_id: "decision-1", decision: "allow", approved: true });
    receipts.push({ ...bind, execution_receipt_id: "receipt-1", status: "failed" });
  } else {
    const incomplete = ["accepted_pending", "missing_failure", "untrusted_issuer", "payload_tamper",
      "binding_mismatch", "expired", "forged_provenance", "trusted_signer_falsehood",
      "legitimate_state_evolution"].includes(scenario);
    call({ complete: !incomplete, approved: scenario !== "unapproved_action",
      target: scenario === "wrong_target" ? `other-${spec.target}` : spec.target,
      key: scenario === "idempotent_replay" ? "same-logical-action" : undefined });
  }
  if (["duplicate_visible", "hidden_duplicate", "empty_receipt_stream"].includes(scenario)) call();
  if (scenario === "idempotent_replay") call({ key: "same-logical-action" });
  if (scenario === "hidden_duplicate") receipts.pop();
  if (scenario === "empty_receipt_stream") receipts.length = 0;
  if (["conflict", "within_ttl_regression", "legitimate_state_evolution"].includes(scenario)) {
    recordObservation(observe(world, spec), 3);
    setCompletion(world, spec, scenario === "legitimate_state_evolution");
  }
  if (!["missing_success", "missing_failure", "within_ttl_regression"].includes(scenario)) {
    recordObservation(observe(world, spec));
  }
  if (["untrusted_issuer", "payload_tamper", "binding_mismatch", "expired", "forged_provenance",
    "trusted_signer_falsehood"].includes(scenario)) {
    const successful = emptyWorld(domain);
    execute(successful, spec);
    const o = observations[0];
    o.value = observe(successful, spec);
    if (scenario === "untrusted_issuer") {
      o.issuer = "untrusted-agent";
      o.provenance.verified_issuer = "untrusted-agent";
    }
    if (scenario === "binding_mismatch") o.intent_id = "other-intent";
    if (scenario === "expired") {
      o.issued_at = "2026-09-24T11:50:00.000Z";
      o.observed_at = o.issued_at;
      o.expires_at = "2026-09-24T11:54:00.000Z";
    }
    o.payload_digest = digestIntentObservation(o);
    if (scenario === "payload_tamper") o.payload_digest = "0".repeat(64);
  }
  return { id: `${domain}/${scenario}/${variant}`, domain, scenario, variant, spec, world,
    truth: oracle(world, spec), contract, evidence: { decision_events: decisions,
      execution_receipts: receipts, observations }, toolStatus,
    signatureFault: scenario === "payload_tamper" ? "payload_tamper" :
      scenario === "forged_provenance" ? "forged" : "none" };
}

export type DecisionBasisFactor = {
  factor_id: string;
  kind:
    | "policy_evaluation"
    | "evidence_observation"
    | "approval_match"
    | "grant_validation"
    | "constraint_evaluation"
    | "risk_evaluation"
    | "selection";
  code: string;
  outcome: "supports" | "opposes" | "neutral";
  policy_ref?: string;
  evidence_refs?: string[];
  depends_on?: string[];
};

export type DecisionBasis = {
  schema_version: "agentpass.decision-basis.v1";
  basis_id: string;
  subject: {
    type: "action_proposal" | "authorization_decision" | "approval_decision" | "assessment";
    id: string;
  };
  producer: {
    role: "proposer" | "boundary" | "approver" | "evaluator";
    issuer: string;
    subject: string;
    model_ref?: string;
  };
  context: {
    tenant_id: string;
    intent_id?: string;
    intent_digest?: string;
    job_id?: string;
    run_id?: string;
    logical_step_id?: string;
    attempt_id?: string;
  };
  created_at: string;
  capture_mode: "rule_evaluation" | "structured_summary" | "human_statement" | "derived_summary";
  policy_ref: string;
  conclusion: { code: string; summary: string };
  factors: DecisionBasisFactor[];
  alternatives: Array<{
    code: string;
    disposition: "selected" | "rejected" | "not_evaluated";
    reason_codes: string[];
  }>;
  assumptions: Array<{
    code: string;
    status: "verified" | "unverified" | "contradicted";
    evidence_refs: string[];
  }>;
  uncertainties: Array<{ code: string; status: "open" | "resolved"; summary?: string }>;
  input_digest: { algorithm: "sha-256"; value: string; canonicalization_profile: string };
  provenance: {
    verification_method: "self_asserted" | "transport_authenticated" | "oidc" | "jws" | "dsse";
    verified_issuer: string;
    verified_subject: string;
    verified_at: string;
    key_id?: string;
  };
  handling?: {
    classification: "public" | "internal" | "confidential" | "restricted";
    content_state: "structured" | "redacted" | "unavailable";
    retention_profile?: string;
  };
};

export type BoundaryDecisionBasisInput = {
  basis_id: string;
  decision_id: string;
  decision: "allow" | "deny" | "challenge_required";
  findings: string[];
  policy_ref: string;
  approval_id?: string;
  grant_id?: string;
  action_digest: string;
  issuer: string;
  producer_subject: string;
  tenant_id: string;
  intent_id?: string;
  intent_digest?: string;
  job_id?: string;
  created_at: string;
};

const STABLE_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const TOP_LEVEL_FIELDS = new Set([
  "schema_version",
  "basis_id",
  "subject",
  "producer",
  "context",
  "created_at",
  "capture_mode",
  "policy_ref",
  "conclusion",
  "factors",
  "alternatives",
  "assumptions",
  "uncertainties",
  "input_digest",
  "provenance",
  "handling",
]);

export function validateDecisionBasis(value: unknown): string[] {
  const basis = recordValue(value);
  const findings: string[] = [];
  for (const field of Object.keys(basis)) {
    if (!TOP_LEVEL_FIELDS.has(field)) findings.push(`unsupported field: ${field}`);
  }
  if (basis.schema_version !== "agentpass.decision-basis.v1") findings.push("unsupported schema_version");
  if (!/^basis_[A-Za-z0-9._:-]{1,200}$/.test(stringValue(basis.basis_id))) findings.push("basis_id is invalid");
  const subject = recordValue(basis.subject);
  if (
    !["action_proposal", "authorization_decision", "approval_decision", "assessment"].includes(
      stringValue(subject.type),
    ) || !stringValue(subject.id)
  ) findings.push("subject is incomplete");
  const producer = recordValue(basis.producer);
  if (
    !["proposer", "boundary", "approver", "evaluator"].includes(stringValue(producer.role)) ||
    !stringValue(producer.issuer) ||
    !stringValue(producer.subject)
  ) findings.push("producer is incomplete");
  const context = recordValue(basis.context);
  if (!stringValue(context.tenant_id)) findings.push("context.tenant_id is required");
  if (!Number.isFinite(Date.parse(stringValue(basis.created_at)))) findings.push("created_at is invalid");
  if (![
    "rule_evaluation",
    "structured_summary",
    "human_statement",
    "derived_summary",
  ].includes(stringValue(basis.capture_mode))) findings.push("capture_mode is invalid");
  if (!stringValue(basis.policy_ref)) findings.push("policy_ref is required");
  const conclusion = recordValue(basis.conclusion);
  if (!STABLE_CODE.test(stringValue(conclusion.code))) findings.push("conclusion.code is invalid");
  if (!stringValue(conclusion.summary) || stringValue(conclusion.summary).length > 500) {
    findings.push("conclusion.summary is invalid");
  }

  const factors = Array.isArray(basis.factors) ? basis.factors.map(recordValue) : [];
  if (factors.length === 0 || factors.length > 64) findings.push("factors must contain between 1 and 64 entries");
  const factorIds = new Set<string>();
  for (const factor of factors) {
    const factorId = stringValue(factor.factor_id);
    if (!/^factor_[A-Za-z0-9._:-]{1,120}$/.test(factorId)) findings.push("factor_id is invalid");
    if (factorIds.has(factorId)) findings.push(`factor_id is duplicated: ${factorId}`);
    factorIds.add(factorId);
    if (!STABLE_CODE.test(stringValue(factor.code))) findings.push(`factor code is invalid: ${factorId}`);
    if (![
      "policy_evaluation",
      "evidence_observation",
      "approval_match",
      "grant_validation",
      "constraint_evaluation",
      "risk_evaluation",
      "selection",
    ].includes(stringValue(factor.kind))) findings.push(`factor kind is invalid: ${factorId}`);
    if (!["supports", "opposes", "neutral"].includes(stringValue(factor.outcome))) {
      findings.push(`factor outcome is invalid: ${factorId}`);
    }
  }
  for (const field of ["alternatives", "assumptions", "uncertainties"]) {
    if (!Array.isArray(basis[field])) findings.push(`${field} must be an array`);
  }
  for (const factor of factors) {
    const factorId = stringValue(factor.factor_id);
    for (const dependency of stringArray(factor.depends_on)) {
      if (dependency === factorId) findings.push(`factor depends on itself: ${factorId}`);
      if (!factorIds.has(dependency)) findings.push(`factor dependency is missing: ${dependency}`);
    }
  }
  const inputDigest = recordValue(basis.input_digest);
  if (
    inputDigest.algorithm !== "sha-256" ||
    !/^[a-f0-9]{64}$/.test(stringValue(inputDigest.value)) ||
    !stringValue(inputDigest.canonicalization_profile)
  ) findings.push("input_digest is invalid");
  const provenance = recordValue(basis.provenance);
  if (
    !stringValue(provenance.verification_method) ||
    !stringValue(provenance.verified_issuer) ||
    !stringValue(provenance.verified_subject) ||
    !Number.isFinite(Date.parse(stringValue(provenance.verified_at)))
  ) findings.push("provenance is incomplete");
  return [...new Set(findings)];
}

export function buildBoundaryDecisionBasis(input: BoundaryDecisionBasisInput): DecisionBasis {
  const reasonCodes = [...new Set(
    (input.findings.length > 0 ? input.findings : [""]).map((finding) =>
      normalizedReasonCode(finding, input.decision)
    ),
  )].sort();
  const factors: DecisionBasisFactor[] = reasonCodes.map((code, index) => ({
    factor_id: `factor_${String(index + 1).padStart(3, "0")}`,
    kind: factorKind(code),
    code,
    outcome: "supports",
    policy_ref: input.policy_ref,
  }));
  const appendReferenceFactor = (
    code: string,
    kind: DecisionBasisFactor["kind"],
    reference: string,
  ) => {
    if (factors.some((factor) => factor.code === code)) return;
    factors.push({
      factor_id: `factor_${String(factors.length + 1).padStart(3, "0")}`,
      kind,
      code,
      outcome: "supports",
      policy_ref: input.policy_ref,
      evidence_refs: [reference],
    });
  };
  if (input.decision === "allow" && input.approval_id) {
    appendReferenceFactor("approval.scope_match", "approval_match", input.approval_id);
  }
  if (input.decision === "allow" && input.grant_id) {
    appendReferenceFactor("authorization.grant_valid", "grant_validation", input.grant_id);
  }

  const basis: DecisionBasis = {
    schema_version: "agentpass.decision-basis.v1",
    basis_id: input.basis_id,
    subject: { type: "authorization_decision", id: input.decision_id },
    producer: { role: "boundary", issuer: input.issuer, subject: input.producer_subject },
    context: {
      tenant_id: input.tenant_id,
      ...(input.intent_id ? { intent_id: input.intent_id } : {}),
      ...(input.intent_digest ? { intent_digest: input.intent_digest } : {}),
      ...(input.job_id ? { job_id: input.job_id } : {}),
    },
    created_at: input.created_at,
    capture_mode: "rule_evaluation",
    policy_ref: input.policy_ref,
    conclusion: {
      code: input.decision,
      summary: input.decision === "allow"
        ? "The boundary allowed the action under the selected policy."
        : input.decision === "challenge_required"
          ? "The boundary requires additional authorization before the action can proceed."
          : "The boundary denied the action under the selected policy.",
    },
    factors,
    alternatives: ["allow", "deny", "challenge_required"]
      .filter((code) => code !== input.decision)
      .map((code) => ({ code, disposition: "rejected" as const, reason_codes: reasonCodes })),
    assumptions: [],
    uncertainties: input.decision === "challenge_required"
      ? [{
          code: "authorization.additional_evidence_required",
          status: "open",
          summary: "The required approval or authorization evidence is not yet satisfied.",
        }]
      : [],
    input_digest: {
      algorithm: "sha-256",
      value: input.action_digest,
      canonicalization_profile: "agentpass.action-request.v1",
    },
    provenance: {
      verification_method: "self_asserted",
      verified_issuer: input.issuer,
      verified_subject: input.producer_subject,
      verified_at: input.created_at,
    },
    handling: {
      classification: "internal",
      content_state: "structured",
      retention_profile: "decision-evidence-standard",
    },
  };
  const findings = validateDecisionBasis(basis);
  if (findings.length > 0) throw new Error(`generated decision basis is invalid: ${findings.join("; ")}`);
  return basis;
}

function normalizedReasonCode(
  finding: string,
  decision: BoundaryDecisionBasisInput["decision"],
): string {
  const value = finding.trim().toLowerCase();
  if (!value) return "policy.requirements_satisfied";
  if (value.includes("idempotency") && value.includes("replayed")) return "execution.idempotent_replay";
  if (value.includes("idempotency")) return "execution.idempotency_mismatch";
  if (
    value.includes("intent") &&
    ["mismatch", "missing", "required", "expired", "unknown"].some((term) => value.includes(term))
  ) return "intent.binding_invalid";
  if (value.includes("jit grant") || value.includes("grant")) return "authorization.grant_invalid";
  if (value.includes("approval")) return decision === "challenge_required" ? "approval.required" : "approval.invalid";
  if (value.includes("undeclared capability") || value.includes("unknown tool")) return "capability.undeclared";
  if (value.includes("action mismatch")) return "capability.action_mismatch";
  if (
    value.includes("data flow") ||
    value.includes("external_domain") ||
    value.includes("field is") ||
    value.includes("redaction_state")
  ) return "data_flow.policy_violation";
  if (value.includes("job_id") || value.includes("job boundary")) return "job.boundary_violation";
  if (value.includes("delegat")) return "delegation.policy_violation";
  if (value.includes("budget")) return "budget.policy_violation";
  return "policy.requirement_failed";
}

function factorKind(code: string): DecisionBasisFactor["kind"] {
  if (code.startsWith("approval.")) return "approval_match";
  if (code.startsWith("authorization.grant")) return "grant_validation";
  if (code.startsWith("intent.") || code.startsWith("job.")) return "constraint_evaluation";
  if (code.startsWith("data_flow.") || code.startsWith("budget.") || code.startsWith("delegation.")) {
    return "risk_evaluation";
  }
  return "policy_evaluation";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

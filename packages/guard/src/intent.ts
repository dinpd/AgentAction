export type IntentEvidenceSource = "decision_events" | "execution_receipts" | "observations" | "job";

export type IntentFilterOperator = "equals" | "not_equals" | "in" | "not_in" | "exists";

export type IntentAssertionOperator =
  | "count_equals"
  | "count_lte"
  | "count_gte"
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "lte"
  | "gte"
  | "exists";

export type IntentFilter = {
  path: string;
  operator: IntentFilterOperator;
  value?: unknown;
};

export type IntentAssertion = {
  operator: IntentAssertionOperator;
  path?: string;
  value?: unknown;
  quantifier?: "any" | "all";
};

export type IntentPredicate = {
  id: string;
  description?: string;
  source: IntentEvidenceSource;
  where?: IntentFilter[];
  assertion: IntentAssertion;
  weight?: number;
};

export type IntentPreferences = {
  max_tool_calls?: number;
  max_execution_receipts?: number;
  max_retries?: number;
  max_replays?: number;
  max_denied_decisions?: number;
  max_runtime_ms?: number;
  max_estimated_cost_usd?: number;
};

export type IntentTrustedObservationRequirement = {
  predicate: string;
  issuers: string[];
  verification_methods?: Array<"oidc" | "jws" | "unsigned_dev">;
};

export type IntentProfileVariableDefinition = {
  type: "string" | "number" | "integer" | "boolean";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: Array<string | number | boolean>;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};

export type IntentProfileVariableReference = {
  $variable: string;
};

export type IntentProfile = {
  schema_version: "agentpass.intent-profile.v1";
  profile: string;
  version: string;
  issuer: string;
  issued_at: string;
  objective_template?: string;
  variables: Record<string, IntentProfileVariableDefinition>;
  required_outcomes: IntentPredicate[];
  hard_constraints: IntentPredicate[];
  preferences?: IntentPreferences;
  evidence_requirements?: IntentEvidenceSource[];
  trusted_observation_requirements?: IntentTrustedObservationRequirement[];
  profile_digest?: string;
};

export type IntentProfileIssuanceInput = {
  intent_id: string;
  job_id: string;
  variables: Record<string, unknown>;
  issued_at: string;
  expires_at?: string;
};

export type IntentContract = {
  schema_version: "agentpass.intent-contract.v1";
  intent_id: string;
  profile: string;
  profile_version?: string;
  profile_digest?: string;
  profile_variables?: Record<string, string | number | boolean>;
  issuer: string;
  job_id: string;
  objective?: string;
  required_outcomes: IntentPredicate[];
  hard_constraints: IntentPredicate[];
  preferences?: IntentPreferences;
  evidence_requirements?: IntentEvidenceSource[];
  trusted_observation_requirements?: IntentTrustedObservationRequirement[];
  issued_at: string;
  expires_at?: string;
  intent_digest?: string;
};

export type IntentObservation = {
  schema_version: "agentpass.intent-observation.v1";
  observation_id: string;
  tenant_id: string;
  intent_id: string;
  intent_digest: string;
  predicate: string;
  value: unknown;
  observed_at: string;
  issued_at: string;
  expires_at: string;
  issuer: string;
  resource?: string;
  payload_digest: string;
  provenance: {
    verification_method: "oidc" | "jws" | "unsigned_dev";
    verified_issuer: string;
    verified_at: string;
    verified_subject?: string;
    signature_kid?: string;
  };
};

export type IntentEvidence = {
  decision_events?: ReadonlyArray<unknown>;
  execution_receipts?: ReadonlyArray<unknown>;
  observations?: ReadonlyArray<unknown>;
  job?: unknown;
};

export type IntentPredicateEvaluation = {
  predicate_id: string;
  status: "pass" | "fail" | "indeterminate";
  observed_count: number;
  expected?: unknown;
  actual?: unknown;
  reason: string;
};

export type IntentExecutionDiscipline = {
  tool_calls: number;
  execution_receipts: number;
  executions: number;
  replays: number;
  retries: number;
  denied_decisions: number;
  challenge_decisions: number;
  estimated_cost_usd: number;
  runtime_ms?: number;
  preferences_met: boolean | null;
  preference_findings: string[];
};

export type IntentEvaluationReceipt = {
  schema_version: "agentpass.intent-evaluation.v1";
  evaluation_id: string;
  intent_id: string;
  intent_digest: string;
  profile: string;
  profile_version?: string;
  profile_digest?: string;
  job_id: string;
  evaluated_at: string;
  verdict: "completed" | "partial" | "failed" | "indeterminate";
  constraint_compliance: "pass" | "fail" | "indeterminate";
  qualified_success: boolean;
  goal_attainment: number;
  evidence_confidence: number;
  outcomes: IntentPredicateEvaluation[];
  constraints: IntentPredicateEvaluation[];
  execution_discipline: IntentExecutionDiscipline;
  evidence_findings: string[];
};

export type IntentEvaluatorOptions = {
  now?: () => Date;
  idGenerator?: () => string;
};

type BoundEvidence = {
  decision_events?: unknown[];
  execution_receipts?: unknown[];
  observations?: unknown[];
  job?: unknown[];
};

type Lookup = { exists: boolean; value?: unknown };

const EVIDENCE_SOURCES: IntentEvidenceSource[] = [
  "decision_events",
  "execution_receipts",
  "observations",
  "job",
];

const COUNT_OPERATORS = new Set<IntentAssertionOperator>(["count_equals", "count_lte", "count_gte"]);

export function digestIntentContract(contract: IntentContract): string {
  const unsigned = { ...contract };
  delete unsigned.intent_digest;
  return sha256(stableStringify(unsigned));
}

export function intentProfileKey(profile: Pick<IntentProfile, "profile" | "version">): string {
  return `${profile.profile}.${profile.version}`;
}

export function digestIntentProfile(profile: IntentProfile): string {
  const unsigned = { ...profile };
  delete unsigned.profile_digest;
  return sha256(stableStringify(unsigned));
}

export function bindIntentProfile(profile: IntentProfile): IntentProfile {
  validateIntentProfile(profile);
  return {
    ...profile,
    profile_digest: digestIntentProfile(profile),
  };
}

export function issueIntentContract(profileInput: IntentProfile, input: IntentProfileIssuanceInput): IntentContract {
  const profile = bindIntentProfile(profileInput);
  if (profileInput.profile_digest && profileInput.profile_digest !== profile.profile_digest) {
    throw new Error("intent profile digest does not match profile contents");
  }
  for (const field of Object.keys(input)) {
    if (!["intent_id", "job_id", "variables", "issued_at", "expires_at"].includes(field)) {
      throw new Error(`unsupported intent profile issuance field: ${field}`);
    }
  }
  for (const [field, value] of [["intent_id", input.intent_id], ["job_id", input.job_id], ["issued_at", input.issued_at]]) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`intent profile issuance ${field} is required`);
  }
  const issuedAt = normalizeDateTime(input.issued_at, "intent profile issuance issued_at");
  const expiresAt = input.expires_at
    ? normalizeDateTime(input.expires_at, "intent profile issuance expires_at")
    : undefined;
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("intent profile issuance expires_at must be after issued_at");
  }
  const variables = normalizeProfileVariables(profile, input.variables);
  const requiredOutcomes = resolveProfileTemplate(profile.required_outcomes, variables) as IntentPredicate[];
  const hardConstraints = resolveProfileTemplate(profile.hard_constraints, variables) as IntentPredicate[];
  const objective = profile.objective_template
    ? interpolateProfileObjective(profile.objective_template, variables)
    : undefined;
  return bindIntentContract({
    schema_version: "agentpass.intent-contract.v1",
    intent_id: input.intent_id,
    profile: intentProfileKey(profile),
    profile_version: profile.version,
    profile_digest: profile.profile_digest,
    profile_variables: variables,
    issuer: profile.issuer,
    job_id: input.job_id,
    ...(objective ? { objective } : {}),
    required_outcomes: requiredOutcomes,
    hard_constraints: hardConstraints,
    ...(profile.preferences ? { preferences: resolveProfileTemplate(profile.preferences, variables) as IntentPreferences } : {}),
    ...(profile.evidence_requirements ? { evidence_requirements: [...profile.evidence_requirements] } : {}),
    ...(profile.trusted_observation_requirements
      ? { trusted_observation_requirements: resolveProfileTemplate(profile.trusted_observation_requirements, variables) as IntentTrustedObservationRequirement[] }
      : {}),
    issued_at: issuedAt,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  });
}

export function digestIntentObservation(observation: IntentObservation | Record<string, unknown>): string {
  const input = observation as Record<string, unknown>;
  return sha256(stableStringify({
    schema_version: input.schema_version,
    observation_id: input.observation_id,
    tenant_id: input.tenant_id,
    intent_id: input.intent_id,
    intent_digest: input.intent_digest,
    predicate: input.predicate,
    value: input.value,
    observed_at: input.observed_at,
    issued_at: input.issued_at,
    expires_at: input.expires_at,
    issuer: input.issuer,
    resource: input.resource,
  }));
}

export function bindIntentContract(contract: IntentContract): IntentContract {
  validateIntentContract(contract);
  return {
    ...contract,
    intent_digest: digestIntentContract(contract),
  };
}

export function evaluateIntent(
  contract: IntentContract,
  evidence: IntentEvidence,
  options: IntentEvaluatorOptions = {},
): IntentEvaluationReceipt {
  validateIntentContract(contract);
  const intentDigest = digestIntentContract(contract);
  if (contract.intent_digest && contract.intent_digest !== intentDigest) {
    throw new Error("intent contract digest does not match contract contents");
  }

  const evidenceFindings: string[] = [];
  const bound = bindEvidence(contract, intentDigest, evidence, evidenceFindings);
  const requirements = [...new Set(contract.evidence_requirements || [])];
  let availableRequirements = 0;
  for (const source of requirements) {
    if (bound[source] !== undefined) {
      availableRequirements += 1;
    } else {
      evidenceFindings.push(`required evidence source is missing: ${source}`);
    }
  }
  const trustedObservationRequirements = contract.trusted_observation_requirements || [];
  let availableTrustedObservations = 0;
  for (const requirement of trustedObservationRequirements) {
    if (hasTrustedObservation(bound.observations, requirement)) {
      availableTrustedObservations += 1;
    } else {
      evidenceFindings.push(`required trusted observation is missing: ${requirement.predicate}`);
    }
  }

  const outcomes = contract.required_outcomes.map((predicate) => evaluatePredicate(predicate, bound));
  const constraints = contract.hard_constraints.map((predicate) => evaluatePredicate(predicate, bound));
  const verdict = outcomeVerdict(outcomes);
  const constraintCompliance = complianceVerdict(constraints);
  const executionDiscipline = evaluateExecutionDiscipline(contract.preferences, bound);
  const predicateWeight = totalWeight([...contract.required_outcomes, ...contract.hard_constraints]);
  const determinedWeight = determinedPredicateWeight(
    [...contract.required_outcomes, ...contract.hard_constraints],
    [...outcomes, ...constraints],
  );
  const confidenceDenominator = predicateWeight + requirements.length + trustedObservationRequirements.length;
  const evidenceConfidence =
    confidenceDenominator === 0
      ? 1
      : roundMetric(
        (determinedWeight + availableRequirements + availableTrustedObservations) / confidenceDenominator,
      );
  const requiredEvidenceComplete =
    availableRequirements === requirements.length &&
    availableTrustedObservations === trustedObservationRequirements.length;

  return {
    schema_version: "agentpass.intent-evaluation.v1",
    evaluation_id: options.idGenerator?.() || randomEvaluationId(),
    intent_id: contract.intent_id,
    intent_digest: intentDigest,
    profile: contract.profile,
    ...(contract.profile_version ? { profile_version: contract.profile_version } : {}),
    ...(contract.profile_digest ? { profile_digest: contract.profile_digest } : {}),
    job_id: contract.job_id,
    evaluated_at: (options.now?.() || new Date()).toISOString(),
    verdict,
    constraint_compliance: constraintCompliance,
    qualified_success: verdict === "completed" && constraintCompliance === "pass" && requiredEvidenceComplete,
    goal_attainment: goalAttainment(contract.required_outcomes, outcomes),
    evidence_confidence: evidenceConfidence,
    outcomes,
    constraints,
    execution_discipline: executionDiscipline,
    evidence_findings: [...new Set(evidenceFindings)],
  };
}

function validateIntentContract(contract: IntentContract): void {
  if (contract.schema_version !== "agentpass.intent-contract.v1") {
    throw new Error(`unsupported intent contract schema_version: ${contract.schema_version}`);
  }
  for (const [field, value] of [
    ["intent_id", contract.intent_id],
    ["profile", contract.profile],
    ["issuer", contract.issuer],
    ["job_id", contract.job_id],
    ["issued_at", contract.issued_at],
  ]) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`intent contract ${field} is required`);
  }
  if (!Array.isArray(contract.required_outcomes) || contract.required_outcomes.length === 0) {
    throw new Error("intent contract requires at least one required outcome");
  }
  if (!Array.isArray(contract.hard_constraints)) throw new Error("intent contract hard_constraints must be an array");
  const profileBindingCount = [
    contract.profile_version !== undefined,
    contract.profile_digest !== undefined,
    contract.profile_variables !== undefined,
  ].filter(Boolean).length;
  if (profileBindingCount !== 0 && profileBindingCount !== 3) {
    throw new Error("intent contract profile_version, profile_digest, and profile_variables are required together");
  }
  if (contract.profile_version && !contract.profile.endsWith(`.${contract.profile_version}`)) {
    throw new Error("intent contract profile must include profile_version");
  }
  if (contract.profile_digest && !/^[a-f0-9]{64}$/.test(contract.profile_digest)) {
    throw new Error("intent contract profile_digest must be a SHA-256 digest");
  }
  for (const [name, value] of Object.entries(contract.profile_variables || {})) {
    if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
      throw new Error(`intent contract profile variable is invalid: ${name}`);
    }
  }

  const predicateIds = new Set<string>();
  for (const predicate of [...contract.required_outcomes, ...contract.hard_constraints]) {
    validatePredicate(predicate);
    if (predicateIds.has(predicate.id)) throw new Error(`duplicate intent predicate id: ${predicate.id}`);
    predicateIds.add(predicate.id);
  }
  for (const source of contract.evidence_requirements || []) {
    if (!EVIDENCE_SOURCES.includes(source)) throw new Error(`unsupported intent evidence source: ${source}`);
  }
  validateTrustedObservationRequirements(contract.trusted_observation_requirements || []);
}

function validateIntentProfile(profile: IntentProfile): void {
  if (profile.schema_version !== "agentpass.intent-profile.v1") {
    throw new Error(`unsupported intent profile schema_version: ${profile.schema_version}`);
  }
  for (const [field, value] of [
    ["profile", profile.profile],
    ["version", profile.version],
    ["issuer", profile.issuer],
    ["issued_at", profile.issued_at],
  ]) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`intent profile ${field} is required`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(profile.profile)) {
    throw new Error("intent profile name contains unsupported characters");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(profile.version)) {
    throw new Error("intent profile version contains unsupported characters");
  }
  normalizeDateTime(profile.issued_at, "intent profile issued_at");
  if (!profile.variables || typeof profile.variables !== "object" || Array.isArray(profile.variables)) {
    throw new Error("intent profile variables must be an object");
  }
  for (const [name, definition] of Object.entries(profile.variables)) {
    validateProfileVariableDefinition(name, definition);
  }
  if (!Array.isArray(profile.required_outcomes) || profile.required_outcomes.length === 0) {
    throw new Error("intent profile requires at least one required outcome");
  }
  if (!Array.isArray(profile.hard_constraints)) throw new Error("intent profile hard_constraints must be an array");
  const predicateIds = new Set<string>();
  for (const predicate of [...profile.required_outcomes, ...profile.hard_constraints]) {
    validateProfilePredicate(profile, predicate);
    if (predicateIds.has(predicate.id)) throw new Error(`duplicate intent predicate id: ${predicate.id}`);
    predicateIds.add(predicate.id);
  }
  for (const source of profile.evidence_requirements || []) {
    if (!EVIDENCE_SOURCES.includes(source)) throw new Error(`unsupported intent evidence source: ${source}`);
  }
  validateTrustedObservationRequirements(profile.trusted_observation_requirements || []);
  for (const reference of collectVariableReferences(profile)) {
    const definition = profile.variables[reference];
    if (!definition) throw new Error(`unknown intent profile variable reference: ${reference}`);
    if (definition.required !== true && definition.default === undefined) {
      throw new Error(`referenced intent profile variable must be required or have a default: ${reference}`);
    }
  }
  for (const match of profile.objective_template?.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g) || []) {
    const reference = match[1] || "";
    const definition = profile.variables[reference];
    if (!definition) throw new Error(`unknown intent profile objective variable: ${reference}`);
    if (definition.required !== true && definition.default === undefined) {
      throw new Error(`objective intent profile variable must be required or have a default: ${reference}`);
    }
  }
}

function validateProfileVariableDefinition(name: string, definition: IntentProfileVariableDefinition): void {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
    throw new Error(`intent profile variable name is invalid: ${name}`);
  }
  if (!definition || !["string", "number", "integer", "boolean"].includes(definition.type)) {
    throw new Error(`intent profile variable type is invalid: ${name}`);
  }
  if (definition.minimum !== undefined && definition.maximum !== undefined && definition.minimum > definition.maximum) {
    throw new Error(`intent profile variable minimum exceeds maximum: ${name}`);
  }
  if (definition.pattern !== undefined) {
    if (definition.type !== "string") throw new Error(`intent profile variable pattern requires string type: ${name}`);
    try {
      new RegExp(definition.pattern);
    } catch {
      throw new Error(`intent profile variable pattern is invalid: ${name}`);
    }
  }
  if ((definition.minimum !== undefined || definition.maximum !== undefined) && !["number", "integer"].includes(definition.type)) {
    throw new Error(`intent profile variable numeric bounds require numeric type: ${name}`);
  }
  if (definition.default !== undefined) validateProfileVariableValue(name, definition.default, definition);
  for (const value of definition.enum || []) validateProfileVariableValue(name, value, definition, false);
}

function validateProfileVariableValue(
  name: string,
  value: unknown,
  definition: IntentProfileVariableDefinition,
  enforceEnum = true,
): void {
  const validType = definition.type === "integer"
    ? typeof value === "number" && Number.isInteger(value)
    : typeof value === definition.type && (typeof value !== "number" || Number.isFinite(value));
  if (!validType) throw new Error(`intent profile variable ${name} must be ${definition.type}`);
  if (typeof value === "number") {
    if (definition.minimum !== undefined && value < definition.minimum) {
      throw new Error(`intent profile variable ${name} is below minimum ${definition.minimum}`);
    }
    if (definition.maximum !== undefined && value > definition.maximum) {
      throw new Error(`intent profile variable ${name} exceeds maximum ${definition.maximum}`);
    }
  }
  if (typeof value === "string" && definition.pattern && !new RegExp(definition.pattern).test(value)) {
    throw new Error(`intent profile variable ${name} does not match its pattern`);
  }
  if (enforceEnum && definition.enum && !definition.enum.some((candidate) => deepEqual(candidate, value))) {
    throw new Error(`intent profile variable ${name} is not an allowed value`);
  }
}

function normalizeProfileVariables(
  profile: IntentProfile,
  input: Record<string, unknown>,
): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("intent profile issuance variables must be an object");
  }
  for (const name of Object.keys(input)) {
    if (!profile.variables[name]) throw new Error(`unknown intent profile issuance variable: ${name}`);
  }
  const normalized: Record<string, string | number | boolean> = {};
  for (const name of Object.keys(profile.variables).sort()) {
    const definition = profile.variables[name] as IntentProfileVariableDefinition;
    const supplied = Object.prototype.hasOwnProperty.call(input, name);
    const value = supplied ? input[name] : definition.default;
    if (value === undefined) {
      if (definition.required === true) throw new Error(`intent profile issuance variable is required: ${name}`);
      continue;
    }
    validateProfileVariableValue(name, value, definition);
    normalized[name] = value as string | number | boolean;
  }
  return normalized;
}

function validateProfilePredicate(profile: IntentProfile, predicate: IntentPredicate): void {
  if (!predicate.id) throw new Error("intent predicate id is required");
  if (!EVIDENCE_SOURCES.includes(predicate.source)) {
    throw new Error(`unsupported evidence source for ${predicate.id}: ${predicate.source}`);
  }
  if (predicate.weight !== undefined && (!Number.isFinite(predicate.weight) || predicate.weight <= 0)) {
    throw new Error(`intent predicate weight must be positive: ${predicate.id}`);
  }
  for (const filter of predicate.where || []) {
    if (!filter.path) throw new Error(`intent predicate filter path is required: ${predicate.id}`);
    if (["in", "not_in"].includes(filter.operator) && !Array.isArray(filter.value)) {
      throw new Error(`intent predicate filter ${filter.operator} requires an array value: ${predicate.id}`);
    }
    if (filter.operator !== "exists" && !("value" in filter)) {
      throw new Error(`intent predicate filter value is required: ${predicate.id}`);
    }
  }
  const assertion = predicate.assertion;
  if (!assertion?.operator) throw new Error(`intent predicate assertion is required: ${predicate.id}`);
  if (!COUNT_OPERATORS.has(assertion.operator) && !assertion.path) {
    throw new Error(`intent predicate assertion path is required: ${predicate.id}`);
  }
  if (assertion.operator !== "exists" && !("value" in assertion)) {
    throw new Error(`intent predicate assertion value is required: ${predicate.id}`);
  }
  if (["in", "not_in"].includes(assertion.operator) && !Array.isArray(assertion.value)) {
    throw new Error(`intent predicate assertion ${assertion.operator} requires an array value: ${predicate.id}`);
  }
  if (COUNT_OPERATORS.has(assertion.operator)) {
    const reference = variableReference(assertion.value);
    if (reference) {
      const definition = profile.variables[reference];
      if (definition && !["number", "integer"].includes(definition.type)) {
        throw new Error(`intent predicate count variable must be numeric: ${predicate.id}`);
      }
    } else if (typeof assertion.value !== "number") {
      throw new Error(`intent predicate count assertion requires a numeric value: ${predicate.id}`);
    }
  }
}

function validateTrustedObservationRequirements(requirements: IntentTrustedObservationRequirement[]): void {
  for (const requirement of requirements) {
    if (!requirement?.predicate) throw new Error("trusted observation requirement predicate is required");
    if (!Array.isArray(requirement.issuers) || requirement.issuers.length === 0 || requirement.issuers.some((issuer) => !issuer)) {
      throw new Error(`trusted observation requirement issuers are required: ${requirement.predicate}`);
    }
    if (new Set(requirement.issuers).size !== requirement.issuers.length) {
      throw new Error(`trusted observation requirement issuers must be unique: ${requirement.predicate}`);
    }
    if (requirement.verification_methods && requirement.verification_methods.length === 0) {
      throw new Error(`trusted observation verification methods cannot be empty: ${requirement.predicate}`);
    }
    for (const method of requirement.verification_methods || []) {
      if (!["oidc", "jws", "unsigned_dev"].includes(method)) {
        throw new Error(`unsupported trusted observation verification method: ${method}`);
      }
    }
    if (
      requirement.verification_methods &&
      new Set(requirement.verification_methods).size !== requirement.verification_methods.length
    ) {
      throw new Error(`trusted observation verification methods must be unique: ${requirement.predicate}`);
    }
  }
}

function hasTrustedObservation(
  observations: unknown[] | undefined,
  requirement: IntentTrustedObservationRequirement,
): boolean {
  return (observations || []).some((value) => matchesTrustedObservationRequirement(value, requirement));
}

function observationProfileTrustFinding(
  value: unknown,
  requirements: IntentTrustedObservationRequirement[],
): string | undefined {
  const observation = asRecord(value);
  if (!observation) return "outside profile trusted observation requirements";
  const applicable = requirements.filter((requirement) => requirement.predicate === observation.predicate);
  if (applicable.length === 0) return undefined;
  return applicable.some((requirement) => matchesTrustedObservationRequirement(value, requirement))
    ? undefined
    : "outside profile trusted observation requirements";
}

function matchesTrustedObservationRequirement(
  value: unknown,
  requirement: IntentTrustedObservationRequirement,
): boolean {
  const observation = asRecord(value);
  const provenance = asRecord(observation?.provenance);
  if (!observation || !provenance) return false;
  if (observation.predicate !== requirement.predicate) return false;
  if (!requirement.issuers.includes(String(observation.issuer))) return false;
  const methods = requirement.verification_methods || [];
  return methods.length === 0 || methods.includes(
    provenance.verification_method as "oidc" | "jws" | "unsigned_dev",
  );
}

function collectVariableReferences(value: unknown): string[] {
  const references = new Set<string>();
  const visit = (candidate: unknown): void => {
    const reference = variableReference(candidate);
    if (reference) {
      references.add(reference);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    const object = asRecord(candidate);
    if (object) Object.values(object).forEach(visit);
  };
  visit(value);
  return [...references];
}

function variableReference(value: unknown): string | undefined {
  const object = asRecord(value);
  if (!object || Object.keys(object).length !== 1 || typeof object.$variable !== "string") return undefined;
  return object.$variable;
}

function resolveProfileTemplate(value: unknown, variables: Record<string, string | number | boolean>): unknown {
  const reference = variableReference(value);
  if (reference) {
    if (!Object.prototype.hasOwnProperty.call(variables, reference)) {
      throw new Error(`intent profile issuance variable is unavailable: ${reference}`);
    }
    return variables[reference];
  }
  if (Array.isArray(value)) return value.map((entry) => resolveProfileTemplate(entry, variables));
  const object = asRecord(value);
  if (!object) return value;
  const resolved: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(object)) resolved[key] = resolveProfileTemplate(entry, variables);
  return resolved;
}

function interpolateProfileObjective(
  template: string,
  variables: Record<string, string | number | boolean>,
): string {
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      throw new Error(`intent profile objective variable is unavailable: ${name}`);
    }
    return String(variables[name]);
  });
}

function normalizeDateTime(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid date-time`);
  return new Date(timestamp).toISOString();
}

function validatePredicate(predicate: IntentPredicate): void {
  if (!predicate.id) throw new Error("intent predicate id is required");
  if (!EVIDENCE_SOURCES.includes(predicate.source)) {
    throw new Error(`unsupported evidence source for ${predicate.id}: ${predicate.source}`);
  }
  if (predicate.weight !== undefined && (!Number.isFinite(predicate.weight) || predicate.weight <= 0)) {
    throw new Error(`intent predicate weight must be positive: ${predicate.id}`);
  }
  for (const filter of predicate.where || []) {
    if (!filter.path) throw new Error(`intent predicate filter path is required: ${predicate.id}`);
    if (["in", "not_in"].includes(filter.operator) && !Array.isArray(filter.value)) {
      throw new Error(`intent predicate filter ${filter.operator} requires an array value: ${predicate.id}`);
    }
    if (filter.operator !== "exists" && !("value" in filter)) {
      throw new Error(`intent predicate filter value is required: ${predicate.id}`);
    }
  }

  const assertion = predicate.assertion;
  if (!assertion?.operator) throw new Error(`intent predicate assertion is required: ${predicate.id}`);
  if (!COUNT_OPERATORS.has(assertion.operator) && !assertion.path) {
    throw new Error(`intent predicate assertion path is required: ${predicate.id}`);
  }
  if (assertion.operator !== "exists" && !("value" in assertion)) {
    throw new Error(`intent predicate assertion value is required: ${predicate.id}`);
  }
  if (["in", "not_in"].includes(assertion.operator) && !Array.isArray(assertion.value)) {
    throw new Error(`intent predicate assertion ${assertion.operator} requires an array value: ${predicate.id}`);
  }
  if (COUNT_OPERATORS.has(assertion.operator) && typeof assertion.value !== "number") {
    throw new Error(`intent predicate count assertion requires a numeric value: ${predicate.id}`);
  }
}

function bindEvidence(
  contract: IntentContract,
  intentDigest: string,
  evidence: IntentEvidence,
  findings: string[],
): BoundEvidence {
  let job: unknown[] | undefined;
  if (evidence.job !== undefined) {
    if (isBoundRecord(evidence.job, contract, intentDigest)) {
      job = [evidence.job];
    } else {
      findings.push("ignored job evidence with missing or mismatched intent binding");
    }
  }
  return {
    decision_events: bindRecordArray("decision_events", evidence.decision_events, contract, intentDigest, findings),
    execution_receipts: bindRecordArray(
      "execution_receipts",
      evidence.execution_receipts,
      contract,
      intentDigest,
      findings,
    ),
    observations: bindRecordArray("observations", evidence.observations, contract, intentDigest, findings),
    job,
  };
}

function bindRecordArray(
  source: IntentEvidenceSource,
  records: ReadonlyArray<unknown> | undefined,
  contract: IntentContract,
  intentDigest: string,
  findings: string[],
): unknown[] | undefined {
  if (records === undefined) return undefined;
  const bound: unknown[] = [];
  records.forEach((record, index) => {
    if (!isBoundRecord(record, contract, intentDigest)) {
      findings.push(`ignored ${source}[${index}] with missing or mismatched intent binding`);
      return;
    }
    if (source === "observations") {
      const provenanceFinding = observationProvenanceFinding(record);
      if (provenanceFinding) {
        findings.push(`ignored observations[${index}] ${provenanceFinding}`);
        return;
      }
      const profileTrustFinding = observationProfileTrustFinding(
        record,
        contract.trusted_observation_requirements || [],
      );
      if (profileTrustFinding) {
        findings.push(`ignored observations[${index}] ${profileTrustFinding}`);
        return;
      }
    }
    bound.push(record);
  });
  return bound;
}

function observationProvenanceFinding(record: unknown): string | undefined {
  const observation = asRecord(record);
  if (!observation) return "without verified provenance";
  const provenance = asRecord(observation.provenance);
  const method = provenance?.verification_method;
  if (!provenance || !["oidc", "jws", "unsigned_dev"].includes(String(method))) {
    return "without verified provenance";
  }
  if (provenance.verified_issuer !== observation.issuer) return "with mismatched verified issuer";
  if (typeof provenance.verified_at !== "string" || !Number.isFinite(Date.parse(provenance.verified_at))) {
    return "without a valid provenance timestamp";
  }
  if (typeof observation.payload_digest !== "string" || !/^[a-f0-9]{64}$/.test(observation.payload_digest)) {
    return "without a valid payload digest";
  }
  if (digestIntentObservation(observation) !== observation.payload_digest) {
    return "with an invalid payload digest";
  }
  return undefined;
}

function isBoundRecord(record: unknown, contract: IntentContract, intentDigest: string): boolean {
  const object = asRecord(record);
  if (!object) return false;
  const recordIntentId = object.intent_id ?? object.intentId;
  const recordIntentDigest = object.intent_digest ?? object.intentDigest;
  const recordJobId = object.job_id ?? object.jobId;
  return (
    recordIntentId === contract.intent_id &&
    recordIntentDigest === intentDigest &&
    (recordJobId === undefined || recordJobId === contract.job_id)
  );
}

function evaluatePredicate(predicate: IntentPredicate, evidence: BoundEvidence): IntentPredicateEvaluation {
  const source = evidence[predicate.source];
  if (source === undefined) {
    return {
      predicate_id: predicate.id,
      status: "indeterminate",
      observed_count: 0,
      expected: predicate.assertion.value,
      reason: `evidence source is unavailable: ${predicate.source}`,
    };
  }

  const selected = source.filter((record) => matchesFilters(record, predicate.where || []));
  const assertion = predicate.assertion;
  if (COUNT_OPERATORS.has(assertion.operator)) {
    const passed = compareCount(selected.length, assertion.operator, assertion.value as number);
    return {
      predicate_id: predicate.id,
      status: passed ? "pass" : "fail",
      observed_count: selected.length,
      expected: assertion.value,
      actual: selected.length,
      reason: passed
        ? `${predicate.source} count satisfied ${assertion.operator}`
        : `${predicate.source} count did not satisfy ${assertion.operator}`,
    };
  }

  if (selected.length === 0) {
    return {
      predicate_id: predicate.id,
      status: "indeterminate",
      observed_count: 0,
      expected: assertion.value,
      reason: "no evidence matched the predicate selector",
    };
  }

  const comparisons = selected.map((record) => compareRecord(record, assertion));
  const quantifier = assertion.quantifier || "any";
  const status = quantifiedStatus(comparisons, quantifier);
  const actualValues = selected
    .map((record) => getPath(record, assertion.path || ""))
    .filter((lookup) => lookup.exists)
    .map((lookup) => jsonSafe(lookup.value));

  return {
    predicate_id: predicate.id,
    status,
    observed_count: selected.length,
    expected: assertion.value,
    actual: actualValues.length === 1 ? actualValues[0] : actualValues,
    reason:
      status === "indeterminate"
        ? `selected evidence did not contain path: ${assertion.path}`
        : `${quantifier} selected evidence ${status === "pass" ? "satisfied" : "did not satisfy"} ${assertion.operator}`,
  };
}

function matchesFilters(record: unknown, filters: IntentFilter[]): boolean {
  return filters.every((filter) => {
    const lookup = getPath(record, filter.path);
    if (filter.operator === "exists") return lookup.exists;
    if (!lookup.exists) return false;
    return compareValue(lookup.value, filter.operator, filter.value);
  });
}

function compareRecord(record: unknown, assertion: IntentAssertion): boolean | undefined {
  const lookup = getPath(record, assertion.path || "");
  if (assertion.operator === "exists") return lookup.exists;
  if (!lookup.exists) return undefined;
  return compareValue(lookup.value, assertion.operator, assertion.value);
}

function compareValue(actual: unknown, operator: IntentFilterOperator | IntentAssertionOperator, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return deepEqual(actual, expected);
    case "not_equals":
      return !deepEqual(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((candidate) => deepEqual(actual, candidate));
    case "not_in":
      return Array.isArray(expected) && expected.every((candidate) => !deepEqual(actual, candidate));
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    default:
      return false;
  }
}

function compareCount(actual: number, operator: IntentAssertionOperator, expected: number): boolean {
  if (operator === "count_equals") return actual === expected;
  if (operator === "count_lte") return actual <= expected;
  return actual >= expected;
}

function quantifiedStatus(
  comparisons: Array<boolean | undefined>,
  quantifier: "any" | "all",
): IntentPredicateEvaluation["status"] {
  if (quantifier === "all") {
    if (comparisons.some((result) => result === false)) return "fail";
    if (comparisons.some((result) => result === undefined)) return "indeterminate";
    return "pass";
  }
  if (comparisons.some((result) => result === true)) return "pass";
  if (comparisons.some((result) => result === undefined)) return "indeterminate";
  return "fail";
}

function outcomeVerdict(outcomes: IntentPredicateEvaluation[]): IntentEvaluationReceipt["verdict"] {
  const passed = outcomes.filter((outcome) => outcome.status === "pass").length;
  const determined = outcomes.filter((outcome) => outcome.status !== "indeterminate").length;
  if (passed === outcomes.length) return "completed";
  if (passed > 0) return "partial";
  if (determined > 0) return "failed";
  return "indeterminate";
}

function complianceVerdict(
  constraints: IntentPredicateEvaluation[],
): IntentEvaluationReceipt["constraint_compliance"] {
  if (constraints.some((constraint) => constraint.status === "fail")) return "fail";
  if (constraints.some((constraint) => constraint.status === "indeterminate")) return "indeterminate";
  return "pass";
}

function goalAttainment(predicates: IntentPredicate[], outcomes: IntentPredicateEvaluation[]): number {
  const denominator = totalWeight(predicates);
  if (denominator === 0) return 0;
  const numerator = predicates.reduce(
    (total, predicate, index) => total + (outcomes[index]?.status === "pass" ? predicate.weight || 1 : 0),
    0,
  );
  return roundMetric(numerator / denominator);
}

function totalWeight(predicates: IntentPredicate[]): number {
  return predicates.reduce((total, predicate) => total + (predicate.weight || 1), 0);
}

function determinedPredicateWeight(
  predicates: IntentPredicate[],
  evaluations: IntentPredicateEvaluation[],
): number {
  return predicates.reduce(
    (total, predicate, index) =>
      total + (evaluations[index]?.status === "indeterminate" ? 0 : predicate.weight || 1),
    0,
  );
}

function evaluateExecutionDiscipline(
  preferences: IntentPreferences | undefined,
  evidence: BoundEvidence,
): IntentExecutionDiscipline {
  const decisions = evidence.decision_events || [];
  const receipts = evidence.execution_receipts || [];
  const job = evidence.job?.[0];
  const replays = receipts.filter((receipt) => getPath(receipt, "status").value === "replayed").length;
  const executions = receipts.filter((receipt) => getPath(receipt, "status").value === "executed").length;
  const retries = maxNumericField(decisions, ["retryCount", "retry_count"]);
  const deniedDecisions = decisions.filter((event) => getPath(event, "decision").value === "deny").length;
  const challengeDecisions = decisions.filter(
    (event) => getPath(event, "decision").value === "challenge_required",
  ).length;
  const estimatedCostUsd = roundCurrency(
    decisions.reduce<number>(
      (total, event) => total + numericField(event, ["estimatedCostUsd", "estimated_cost_usd"]),
      0,
    ),
  );
  const runtimeMs = runtimeFromJob(job);
  const findings: string[] = [];
  let preferenceUnavailable = false;

  const checkLimit = (
    value: number | undefined,
    limit: number | undefined,
    label: string,
    sourceAvailable: boolean,
  ): void => {
    if (limit === undefined) return;
    if (!sourceAvailable || value === undefined) {
      preferenceUnavailable = true;
      findings.push(`${label} could not be evaluated because its evidence is unavailable`);
    } else if (value > limit) {
      findings.push(`${label} ${value} exceeds preference ${limit}`);
    }
  };

  checkLimit(decisions.length, preferences?.max_tool_calls, "tool calls", evidence.decision_events !== undefined);
  checkLimit(
    receipts.length,
    preferences?.max_execution_receipts,
    "execution receipts",
    evidence.execution_receipts !== undefined,
  );
  checkLimit(retries, preferences?.max_retries, "retries", evidence.decision_events !== undefined);
  checkLimit(replays, preferences?.max_replays, "replays", evidence.execution_receipts !== undefined);
  checkLimit(
    deniedDecisions,
    preferences?.max_denied_decisions,
    "denied decisions",
    evidence.decision_events !== undefined,
  );
  checkLimit(
    estimatedCostUsd,
    preferences?.max_estimated_cost_usd,
    "estimated cost USD",
    evidence.decision_events !== undefined,
  );
  checkLimit(runtimeMs, preferences?.max_runtime_ms, "runtime ms", evidence.job !== undefined);

  const hasPreferences = Boolean(preferences && Object.values(preferences).some((value) => value !== undefined));
  const hasViolation = findings.some((finding) => finding.includes("exceeds preference"));
  const preferencesMet = !hasPreferences ? null : hasViolation ? false : preferenceUnavailable ? null : true;

  return {
    tool_calls: decisions.length,
    execution_receipts: receipts.length,
    executions,
    replays,
    retries,
    denied_decisions: deniedDecisions,
    challenge_decisions: challengeDecisions,
    estimated_cost_usd: estimatedCostUsd,
    runtime_ms: runtimeMs,
    preferences_met: preferencesMet,
    preference_findings: findings,
  };
}

function runtimeFromJob(job: unknown): number | undefined {
  if (!job) return undefined;
  const started = stringField(job, ["started_at", "startedAt"]);
  const completed = stringField(job, ["completed_at", "completedAt"]);
  if (!started || !completed) return undefined;
  const startedMs = Date.parse(started);
  const completedMs = Date.parse(completed);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) return undefined;
  return Math.max(0, completedMs - startedMs);
}

function maxNumericField(records: unknown[], paths: string[]): number {
  return records.reduce<number>((maximum, record) => Math.max(maximum, numericField(record, paths)), 0);
}

function numericField(record: unknown, paths: string[]): number {
  for (const path of paths) {
    const lookup = getPath(record, path);
    if (lookup.exists && typeof lookup.value === "number" && Number.isFinite(lookup.value)) return lookup.value;
  }
  return 0;
}

function stringField(record: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const lookup = getPath(record, path);
    if (lookup.exists && typeof lookup.value === "string") return lookup.value;
  }
  return undefined;
}

function getPath(value: unknown, path: string): Lookup {
  if (!path) return { exists: false };
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(segment)) return { exists: false };
    const object = asRecord(current);
    if (!object || !Object.prototype.hasOwnProperty.call(object, segment)) return { exists: false };
    current = object[segment];
  }
  return { exists: true, value: current };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (input[key] !== undefined) output[key] = stableValue(input[key]);
  }
  return output;
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

function sha256(value: string): string {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotateRight = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits));

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15] || 0;
      const right = words[index - 2] || 0;
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = ((words[index - 16] || 0) + sigma0 + (words[index - 7] || 0) + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + (constants[index] || 0) + (words[index] || 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = ((state[0] || 0) + a) >>> 0;
    state[1] = ((state[1] || 0) + b) >>> 0;
    state[2] = ((state[2] || 0) + c) >>> 0;
    state[3] = ((state[3] || 0) + d) >>> 0;
    state[4] = ((state[4] || 0) + e) >>> 0;
    state[5] = ((state[5] || 0) + f) >>> 0;
    state[6] = ((state[6] || 0) + g) >>> 0;
    state[7] = ((state[7] || 0) + h) >>> 0;
  }

  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function randomEvaluationId(): string {
  return `eval_${Math.random().toString(36).slice(2, 12)}`;
}

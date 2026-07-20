import { createHash } from "node:crypto";

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

export type IntentContract = {
  schema_version: "agentpass.intent-contract.v1";
  intent_id: string;
  profile: string;
  issuer: string;
  job_id: string;
  objective?: string;
  required_outcomes: IntentPredicate[];
  hard_constraints: IntentPredicate[];
  preferences?: IntentPreferences;
  evidence_requirements?: IntentEvidenceSource[];
  issued_at: string;
  expires_at?: string;
  intent_digest?: string;
};

export type IntentObservation = {
  schema_version: "agentpass.intent-observation.v1";
  intent_id: string;
  intent_digest: string;
  predicate: string;
  value: unknown;
  observed_at: string;
  issuer: string;
  resource?: string;
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
  const confidenceDenominator = predicateWeight + requirements.length;
  const evidenceConfidence =
    confidenceDenominator === 0
      ? 1
      : roundMetric((determinedWeight + availableRequirements) / confidenceDenominator);
  const requiredEvidenceComplete = availableRequirements === requirements.length;

  return {
    schema_version: "agentpass.intent-evaluation.v1",
    evaluation_id: options.idGenerator?.() || randomEvaluationId(),
    intent_id: contract.intent_id,
    intent_digest: intentDigest,
    profile: contract.profile,
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

  const predicateIds = new Set<string>();
  for (const predicate of [...contract.required_outcomes, ...contract.hard_constraints]) {
    validatePredicate(predicate);
    if (predicateIds.has(predicate.id)) throw new Error(`duplicate intent predicate id: ${predicate.id}`);
    predicateIds.add(predicate.id);
  }
  for (const source of contract.evidence_requirements || []) {
    if (!EVIDENCE_SOURCES.includes(source)) throw new Error(`unsupported intent evidence source: ${source}`);
  }
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
    if (isBoundRecord(record, contract, intentDigest)) {
      bound.push(record);
    } else {
      findings.push(`ignored ${source}[${index}] with missing or mismatched intent binding`);
    }
  });
  return bound;
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
  return createHash("sha256").update(value).digest("hex");
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

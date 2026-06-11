export type AgentAction =
  | "read"
  | "write"
  | "send"
  | "delete"
  | "pay"
  | "deploy"
  | "export"
  | "admin"
  | string;

export type DecisionType = "allow" | "deny" | "challenge_required";

export type ToolPolicy = {
  action?: AgentAction;
  requiresApproval?: boolean;
  requiresApprovalIfPii?: boolean;
  maxAmountUsd?: number;
  requireIdempotencyKey?: boolean;
  singleUse?: boolean;
  allowedDomains?: string[];
  blockedFields?: string[];
  allowedFields?: string[];
};

export type FlowPolicy = {
  from: string;
  to: string;
  decision?: "allow" | "deny";
  requiresApproval?: boolean;
  dataClassification?: string[];
  allowedDomains?: string[];
  blockedFields?: string[];
  allowedFields?: string[];
  maxRecords?: number;
};

export type BudgetPolicy = {
  maxToolCallsPerJob?: number;
  maxRetriesPerTool?: number;
  maxTokensPerJob?: number;
  maxEstimatedCostUsdPerJob?: number;
};

export type GuardPolicy = {
  tools?: Record<string, ToolPolicy>;
  flows?: FlowPolicy[];
  budgets?: BudgetPolicy;
  defaultSensitiveDestinationDecision?: "allow" | "deny" | "challenge_required";
  sensitiveClassifications?: string[];
  sensitiveDestinationTypes?: string[];
};

export type GuardCheck = {
  agentId: string;
  tool: string;
  action: AgentAction;
  jobId?: string;
  userId?: string;
  resource?: string;
  amountUsd?: number;
  idempotencyKey?: string;
  retryCount?: number;
  approvalId?: string;
  dataFrom?: string;
  dataTo?: string;
  destinationType?: string;
  externalDomain?: string;
  dataClassification?: string[];
  fieldSet?: string[];
  recordCount?: number;
  estimatedTokens?: number;
  estimatedCostUsd?: number;
};

export type GuardDecision = {
  type: DecisionType;
  allow: boolean;
  challengeRequired: boolean;
  reasons: string[];
  challenge?: GuardChallenge;
  event: GuardDecisionEvent;
};

export type GuardChallenge = {
  reason: string;
  requiredApprovalFor: Array<"tool" | "flow" | "pii" | "budget">;
  tool: string;
  action: AgentAction;
  resource?: string;
  amountUsd?: number;
  dataFrom?: string;
  dataTo?: string;
  externalDomain?: string;
};

export type GuardDecisionEvent = {
  decisionId: string;
  decision: DecisionType;
  allowed: boolean;
  reasons: string[];
  agentId: string;
  tool: string;
  action: AgentAction;
  jobId?: string;
  userId?: string;
  resource?: string;
  amountUsd?: number;
  idempotencyKey?: string;
  approvalId?: string;
  dataFrom?: string;
  dataTo?: string;
  destinationType?: string;
  externalDomain?: string;
  dataClassification: string[];
  fieldSet: string[];
  recordCount?: number;
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  issuedAt: string;
};

export type AgentPassGuardOptions = {
  policy: GuardPolicy;
  now?: () => Date;
  idGenerator?: () => string;
};

type JobUsage = {
  toolCalls: number;
  tokens: number;
  estimatedCostUsd: number;
  toolAttempts: Map<string, number>;
};

const DEFAULT_SENSITIVE_CLASSIFICATIONS = [
  "pii",
  "phi",
  "payment",
  "secret",
  "regulated",
  "customer_data",
];

const DEFAULT_SENSITIVE_DESTINATIONS = [
  "external_email",
  "webhook",
  "third_party_saas",
  "file_export",
  "model_provider",
  "browser_form",
];

export class AgentPassGuard {
  private policy: GuardPolicy;
  private now: () => Date;
  private idGenerator: () => string;
  private usedIdempotencyKeys = new Set<string>();
  private usageByJob = new Map<string, JobUsage>();

  constructor(options: AgentPassGuardOptions) {
    this.policy = options.policy;
    this.now = options.now || (() => new Date());
    this.idGenerator = options.idGenerator || randomDecisionId;
  }

  check(input: GuardCheck): GuardDecision {
    const reasons: string[] = [];
    const challengeFor = new Set<"tool" | "flow" | "pii" | "budget">();
    const toolPolicy = this.policy.tools?.[input.tool];

    if (!toolPolicy) {
      reasons.push(`tool is not declared: ${input.tool}`);
      return this.decision("deny", input, reasons);
    }

    this.evaluateToolPolicy(input, toolPolicy, reasons, challengeFor);
    this.evaluateFlowPolicy(input, toolPolicy, reasons, challengeFor);
    this.evaluateBudgetPolicy(input, reasons);

    if (reasons.length > 0) return this.decision("deny", input, reasons);
    if (challengeFor.size > 0) {
      return this.decision("challenge_required", input, ["approval is required"], challengeFor);
    }

    this.commit(input, toolPolicy);
    return this.decision("allow", input, []);
  }

  reset(): void {
    this.usedIdempotencyKeys.clear();
    this.usageByJob.clear();
  }

  private evaluateToolPolicy(
    input: GuardCheck,
    policy: ToolPolicy,
    reasons: string[],
    challengeFor: Set<"tool" | "flow" | "pii" | "budget">,
  ): void {
    if (policy.action && policy.action !== input.action) {
      reasons.push(`tool action mismatch: expected ${policy.action}, got ${input.action}`);
    }
    if (policy.maxAmountUsd !== undefined && input.amountUsd !== undefined && input.amountUsd > policy.maxAmountUsd) {
      reasons.push(`amount exceeds maxAmountUsd ${policy.maxAmountUsd}`);
    }
    if (policy.requireIdempotencyKey && !input.idempotencyKey) {
      reasons.push("idempotencyKey is required");
    }
    if (policy.singleUse && input.idempotencyKey && this.usedIdempotencyKeys.has(input.idempotencyKey)) {
      reasons.push("idempotencyKey was already used");
    }
    if (policy.allowedDomains && input.externalDomain && !matchesAnyDomain(input.externalDomain, policy.allowedDomains)) {
      reasons.push(`externalDomain is not allowed: ${input.externalDomain}`);
    }
    for (const field of presentBlockedFields(input.fieldSet, policy.blockedFields)) {
      reasons.push(`field is blocked: ${field}`);
    }
    for (const field of absentAllowedFields(input.fieldSet, policy.allowedFields)) {
      reasons.push(`field is not allowed: ${field}`);
    }
    if (policy.requiresApproval && !input.approvalId) {
      challengeFor.add("tool");
    }
    if (policy.requiresApprovalIfPii && hasSensitiveData(input, this.policy) && !input.approvalId) {
      challengeFor.add("pii");
    }
  }

  private evaluateFlowPolicy(
    input: GuardCheck,
    toolPolicy: ToolPolicy,
    reasons: string[],
    challengeFor: Set<"tool" | "flow" | "pii" | "budget">,
  ): void {
    if (!input.dataFrom || !input.dataTo) {
      if (hasSensitiveData(input, this.policy) && isSensitiveDestination(input, this.policy)) {
        reasons.push("dataFrom and dataTo are required for sensitive data movement");
      }
      return;
    }

    const flow = this.policy.flows?.find((candidate) => matchesFlow(candidate, input));
    if (flow) {
      if (flow.decision === "deny") reasons.push(`flow is denied: ${input.dataFrom} -> ${input.dataTo}`);
      if (flow.maxRecords !== undefined && input.recordCount !== undefined && input.recordCount > flow.maxRecords) {
        reasons.push(`recordCount exceeds maxRecords ${flow.maxRecords}`);
      }
      if (flow.allowedDomains && input.externalDomain && !matchesAnyDomain(input.externalDomain, flow.allowedDomains)) {
        reasons.push(`externalDomain is not allowed for flow: ${input.externalDomain}`);
      }
      for (const field of presentBlockedFields(input.fieldSet, flow.blockedFields)) {
        reasons.push(`field is blocked by flow: ${field}`);
      }
      for (const field of absentAllowedFields(input.fieldSet, flow.allowedFields)) {
        reasons.push(`field is not allowed by flow: ${field}`);
      }
      if (flow.requiresApproval && !input.approvalId) challengeFor.add("flow");
      return;
    }

    if (hasSensitiveData(input, this.policy) && isSensitiveDestination(input, this.policy)) {
      const defaultDecision = this.policy.defaultSensitiveDestinationDecision || "deny";
      if (defaultDecision === "deny") {
        reasons.push(`sensitive data movement has no allowed flow: ${input.dataFrom} -> ${input.dataTo}`);
      } else if (defaultDecision === "challenge_required" && !input.approvalId) {
        challengeFor.add("pii");
      }
    }

    if (toolPolicy.requiresApprovalIfPii && hasSensitiveData(input, this.policy) && !input.approvalId) {
      challengeFor.add("pii");
    }
  }

  private evaluateBudgetPolicy(input: GuardCheck, reasons: string[]): void {
    const budget = this.policy.budgets;
    if (!budget || !input.jobId) return;

    const usage = this.usageByJob.get(input.jobId) || newJobUsage();
    const nextToolCalls = usage.toolCalls + 1;
    const nextTokens = usage.tokens + (input.estimatedTokens || 0);
    const nextCost = usage.estimatedCostUsd + (input.estimatedCostUsd || 0);
    const attemptKey = attemptKeyFor(input);
    const attempts = (usage.toolAttempts.get(attemptKey) || 0) + 1;

    if (budget.maxToolCallsPerJob !== undefined && nextToolCalls > budget.maxToolCallsPerJob) {
      reasons.push(`job exceeds maxToolCallsPerJob ${budget.maxToolCallsPerJob}`);
    }
    if (budget.maxTokensPerJob !== undefined && nextTokens > budget.maxTokensPerJob) {
      reasons.push(`job exceeds maxTokensPerJob ${budget.maxTokensPerJob}`);
    }
    if (budget.maxEstimatedCostUsdPerJob !== undefined && nextCost > budget.maxEstimatedCostUsdPerJob) {
      reasons.push(`job exceeds maxEstimatedCostUsdPerJob ${budget.maxEstimatedCostUsdPerJob}`);
    }
    if (budget.maxRetriesPerTool !== undefined && attempts > budget.maxRetriesPerTool + 1) {
      reasons.push(`tool exceeds maxRetriesPerTool ${budget.maxRetriesPerTool}`);
    }
  }

  private commit(input: GuardCheck, toolPolicy: ToolPolicy): void {
    if (toolPolicy.singleUse && input.idempotencyKey) {
      this.usedIdempotencyKeys.add(input.idempotencyKey);
    }
    if (!input.jobId) return;

    const usage = this.usageByJob.get(input.jobId) || newJobUsage();
    usage.toolCalls += 1;
    usage.tokens += input.estimatedTokens || 0;
    usage.estimatedCostUsd += input.estimatedCostUsd || 0;
    const attemptKey = attemptKeyFor(input);
    usage.toolAttempts.set(attemptKey, (usage.toolAttempts.get(attemptKey) || 0) + 1);
    this.usageByJob.set(input.jobId, usage);
  }

  private decision(
    type: DecisionType,
    input: GuardCheck,
    reasons: string[],
    challengeFor: Set<"tool" | "flow" | "pii" | "budget"> = new Set(),
  ): GuardDecision {
    const uniqueReasons = [...new Set(reasons)];
    const event = this.event(type, input, uniqueReasons);
    return {
      type,
      allow: type === "allow",
      challengeRequired: type === "challenge_required",
      reasons: uniqueReasons,
      challenge:
        type === "challenge_required"
          ? {
              reason: uniqueReasons[0] || "approval is required",
              requiredApprovalFor: [...challengeFor],
              tool: input.tool,
              action: input.action,
              resource: input.resource,
              amountUsd: input.amountUsd,
              dataFrom: input.dataFrom,
              dataTo: input.dataTo,
              externalDomain: input.externalDomain,
            }
          : undefined,
      event,
    };
  }

  private event(type: DecisionType, input: GuardCheck, reasons: string[]): GuardDecisionEvent {
    return {
      decisionId: this.idGenerator(),
      decision: type,
      allowed: type === "allow",
      reasons,
      agentId: input.agentId,
      tool: input.tool,
      action: input.action,
      jobId: input.jobId,
      userId: input.userId,
      resource: input.resource,
      amountUsd: input.amountUsd,
      idempotencyKey: input.idempotencyKey,
      approvalId: input.approvalId,
      dataFrom: input.dataFrom,
      dataTo: input.dataTo,
      destinationType: input.destinationType,
      externalDomain: input.externalDomain,
      dataClassification: input.dataClassification || [],
      fieldSet: input.fieldSet || [],
      recordCount: input.recordCount,
      estimatedTokens: input.estimatedTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      issuedAt: this.now().toISOString(),
    };
  }
}

export function createGuard(options: AgentPassGuardOptions): AgentPassGuard {
  return new AgentPassGuard(options);
}

function hasSensitiveData(input: GuardCheck, policy: GuardPolicy): boolean {
  const sensitive = new Set((policy.sensitiveClassifications || DEFAULT_SENSITIVE_CLASSIFICATIONS).map(normalize));
  return (input.dataClassification || []).some((classification) => sensitive.has(normalize(classification)));
}

function isSensitiveDestination(input: GuardCheck, policy: GuardPolicy): boolean {
  const destinations = new Set((policy.sensitiveDestinationTypes || DEFAULT_SENSITIVE_DESTINATIONS).map(normalize));
  return Boolean(input.destinationType && destinations.has(normalize(input.destinationType)));
}

function matchesFlow(flow: FlowPolicy, input: GuardCheck): boolean {
  if (!matchesPattern(flow.from, input.dataFrom || "")) return false;
  if (!matchesPattern(flow.to, input.dataTo || "")) return false;
  if (!flow.dataClassification || flow.dataClassification.length === 0) return true;

  const actual = new Set((input.dataClassification || []).map(normalize));
  return flow.dataClassification.some((classification) => actual.has(normalize(classification)));
}

function matchesPattern(pattern: string, value: string): boolean {
  return pattern === "*" || normalize(pattern) === normalize(value);
}

function presentBlockedFields(fieldSet: string[] | undefined, blockedFields: string[] | undefined): string[] {
  if (!fieldSet || !blockedFields) return [];
  const blocked = new Set(blockedFields.map(normalize));
  return fieldSet.filter((field) => blocked.has(normalize(field)));
}

function absentAllowedFields(fieldSet: string[] | undefined, allowedFields: string[] | undefined): string[] {
  if (!fieldSet || !allowedFields) return [];
  const allowed = new Set(allowedFields.map(normalize));
  return fieldSet.filter((field) => !allowed.has(normalize(field)));
}

function matchesAnyDomain(domain: string, allowedDomains: string[]): boolean {
  const normalizedDomain = normalize(domain);
  return allowedDomains.some((allowed) => {
    const normalizedAllowed = normalize(allowed);
    return normalizedDomain === normalizedAllowed || normalizedDomain.endsWith(`.${normalizedAllowed}`);
  });
}

function attemptKeyFor(input: GuardCheck): string {
  return [input.tool, input.action, input.resource || "", input.idempotencyKey || ""].join("|");
}

function newJobUsage(): JobUsage {
  return {
    toolCalls: 0,
    tokens: 0,
    estimatedCostUsd: 0,
    toolAttempts: new Map<string, number>(),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function randomDecisionId(): string {
  return `dec_${Math.random().toString(36).slice(2, 12)}`;
}

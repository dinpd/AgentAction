import { createHash } from "node:crypto";

export * from "./intent.js";

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
  enterpriseAuth?: EnterpriseAuthPolicy;
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
  destinationType?: string;
  decision?: "allow" | "deny";
  requiresApproval?: boolean;
  dataClassification?: string[];
  allowedDomains?: string[];
  blockedFields?: string[];
  allowedFields?: string[];
  maxRecords?: number;
};

export type BudgetPolicy = {
  challengeAfterToolCallsPerJob?: number;
  challengeAfterTokensPerJob?: number;
  challengeAfterEstimatedCostUsdPerJob?: number;
  challengeAfterRuntimeMsPerJob?: number;
  maxToolCallsPerJob?: number;
  maxSameToolCallsPerJob?: number;
  maxIdenticalToolCallsPerJob?: number;
  maxRetriesPerTool?: number;
  maxTokensPerJob?: number;
  maxEstimatedCostUsdPerJob?: number;
  maxRuntimeMsPerJob?: number;
};

export type EnterpriseAuthContext = {
  issuer?: string;
  subject?: string;
  clientId?: string;
  scopes?: string[];
  groups?: string[];
  acr?: string;
  amr?: string[];
  idJagGrantId?: string;
  tokenAudience?: string;
};

export type EnterpriseAuthPolicy = {
  requiredScopes?: string[];
  requiredGroups?: string[];
  allowedGroups?: string[];
  allowedClients?: string[];
  allowedIssuers?: string[];
};

export type GuardPolicy = {
  tools?: Record<string, ToolPolicy>;
  flows?: FlowPolicy[];
  budgets?: BudgetPolicy;
  enterpriseAuth?: EnterpriseAuthPolicy;
  defaultSensitiveDestinationDecision?: "allow" | "deny" | "challenge_required";
  sensitiveClassifications?: string[];
  sensitiveDestinationTypes?: string[];
};

export type GuardCheck = {
  agentId: string;
  tenantId?: string;
  intentId?: string;
  intentDigest?: string;
  tool: string;
  action: AgentAction;
  jobId?: string;
  caseId?: string;
  customerId?: string;
  userId?: string;
  resource?: string;
  callFingerprint?: string;
  amountUsd?: number;
  currency?: string;
  idempotencyKey?: string;
  requestDigest?: string;
  policyVersion?: string;
  policyFindings?: string[];
  priorAttemptCount?: number;
  budgetState?: Record<string, unknown>;
  approvalExpiresAt?: string;
  basisCategory?: string;
  basisRef?: string;
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
  enterpriseAuth?: EnterpriseAuthContext;
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
  evidence: ApprovalEvidence;
};

export type ApprovalEvidence = {
  schema_version: "agentpass.approval-evidence.v1";
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  user_id?: string;
  tenant_id?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  tool: string;
  action: AgentAction;
  resource?: string;
  amount?: number;
  currency?: string;
  data_from?: string;
  data_to?: string;
  destination_type?: string;
  external_domain?: string;
  field_set: string[];
  record_count?: number;
  idempotency_key?: string;
  call_fingerprint?: string;
  request_digest?: string;
  policy_version?: string;
  policy_findings: string[];
  prior_attempt_count?: number;
  budget_state?: Record<string, unknown>;
  expires_at?: string;
  basis_category?: string;
  basis_ref?: string;
};

export type GuardDecisionEvent = {
  decisionId: string;
  decision: DecisionType;
  allowed: boolean;
  reasons: string[];
  agentId: string;
  intentId?: string;
  intentDigest?: string;
  tool: string;
  action: AgentAction;
  jobId?: string;
  userId?: string;
  resource?: string;
  callFingerprint?: string;
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
  retryCount?: number;
  enterpriseAuth?: EnterpriseAuthContext;
  issuedAt: string;
  approvalEvidence: ApprovalEvidence;
};

export type AgentPassGuardOptions = {
  policy: GuardPolicy;
  now?: () => Date;
  idGenerator?: () => string;
};

export type ToolExecutionContext = {
  check: GuardCheck;
  decision: GuardDecision;
};

export type GuardedToolExecutor<TResult> = (
  context: ToolExecutionContext,
) => TResult | Promise<TResult>;

export type ProviderExecutionReceipt = {
  schema_version: "agentpass.provider-execution-receipt.v1";
  decision_id: string;
  intent_id?: string;
  intent_digest?: string;
  job_id?: string;
  tool: string;
  action: AgentAction;
  resource?: string;
  amount?: number;
  currency?: string;
  idempotency_key?: string;
  request_digest: string;
  status: "executed" | "replayed";
  executed_at: string;
  completed_at?: string;
  latency_ms?: number;
  result_digest?: string;
  outcome_code?: string;
  provider_resource_id?: string;
  error_code?: string;
  replayed_from_decision_id?: string;
  replay_count?: number;
};

export type GuardedToolExecutionResult<TResult> =
  | {
      executed: true;
      decision: GuardDecision;
      result: TResult;
      replayed: boolean;
      receipt: ProviderExecutionReceipt;
    }
  | {
      executed: false;
      decision: GuardDecision;
      result?: never;
      replayed?: never;
      receipt?: never;
    };

export type AgentPassToolGateOptions = AgentPassGuardOptions | { guard: AgentPassGuard };

export type McpToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type McpToolsCallRequest = {
  params: McpToolCall;
};

export type McpGuardContext = {
  agentId: string;
  tenantId?: string;
  intentId?: string;
  intentDigest?: string;
  jobId?: string;
  userId?: string;
  approvalId?: string;
  retryCount?: number;
  enterpriseAuth?: EnterpriseAuthContext;
};

type McpMappedValue<T> =
  | T
  | ((args: Record<string, unknown>, call: McpToolCall, context: McpGuardContext) => T | undefined);

export type McpToolMapping = {
  action?: McpMappedValue<AgentAction>;
  resource?: McpMappedValue<string>;
  callFingerprint?: McpMappedValue<string>;
  amountUsd?: McpMappedValue<number>;
  idempotencyKey?: McpMappedValue<string>;
  dataFrom?: McpMappedValue<string>;
  dataTo?: McpMappedValue<string>;
  destinationType?: McpMappedValue<string>;
  externalDomain?: McpMappedValue<string>;
  dataClassification?: McpMappedValue<string[]>;
  fieldSet?: McpMappedValue<string[]>;
  recordCount?: McpMappedValue<number>;
  estimatedTokens?: McpMappedValue<number>;
  estimatedCostUsd?: McpMappedValue<number>;
};

export type McpToolCallAdapterOptions = {
  mappings?: Record<string, McpToolMapping>;
  defaultAction?: AgentAction;
};

export type AgentPassMcpToolGateOptions = AgentPassToolGateOptions & McpToolCallAdapterOptions;

export type McpToolExecutionContext = ToolExecutionContext & {
  call: McpToolCall;
  arguments: Record<string, unknown>;
};

export type McpToolExecutor<TResult> = (
  context: McpToolExecutionContext,
) => TResult | Promise<TResult>;

type JobUsage = {
  startedAtMs: number;
  toolCalls: number;
  tokens: number;
  estimatedCostUsd: number;
  toolAttempts: Map<string, number>;
  toolCallsByName: Map<string, number>;
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
    this.evaluateEnterpriseAuthPolicy(input, toolPolicy, reasons);
    this.evaluateFlowPolicy(input, toolPolicy, reasons, challengeFor);
    this.evaluateBudgetPolicy(input, reasons, challengeFor);

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

  private evaluateEnterpriseAuthPolicy(input: GuardCheck, toolPolicy: ToolPolicy, reasons: string[]): void {
    addEnterpriseAuthFindings(input, this.policy.enterpriseAuth, "enterprise auth", reasons);
    addEnterpriseAuthFindings(input, toolPolicy.enterpriseAuth, `${input.tool} enterprise auth`, reasons);
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

  private evaluateBudgetPolicy(
    input: GuardCheck,
    reasons: string[],
    challengeFor: Set<"tool" | "flow" | "pii" | "budget">,
  ): void {
    const budget = this.policy.budgets;
    if (!budget || !input.jobId) return;

    const nowMs = this.now().getTime();
    const usage = this.usageByJob.get(input.jobId) || newJobUsage(nowMs);
    const nextToolCalls = usage.toolCalls + 1;
    const nextSameToolCalls = (usage.toolCallsByName.get(input.tool) || 0) + 1;
    const nextTokens = usage.tokens + (input.estimatedTokens || 0);
    const nextCost = usage.estimatedCostUsd + (input.estimatedCostUsd || 0);
    const nextRuntimeMs = nowMs - usage.startedAtMs;
    const attemptKey = attemptKeyFor(input);
    const attempts = (usage.toolAttempts.get(attemptKey) || 0) + 1;

    if (!input.approvalId) {
      if (
        budget.challengeAfterToolCallsPerJob !== undefined &&
        nextToolCalls > budget.challengeAfterToolCallsPerJob
      ) {
        challengeFor.add("budget");
      }
      if (budget.challengeAfterTokensPerJob !== undefined && nextTokens > budget.challengeAfterTokensPerJob) {
        challengeFor.add("budget");
      }
      if (
        budget.challengeAfterEstimatedCostUsdPerJob !== undefined &&
        nextCost > budget.challengeAfterEstimatedCostUsdPerJob
      ) {
        challengeFor.add("budget");
      }
      if (budget.challengeAfterRuntimeMsPerJob !== undefined && nextRuntimeMs > budget.challengeAfterRuntimeMsPerJob) {
        challengeFor.add("budget");
      }
    }

    if (budget.maxToolCallsPerJob !== undefined && nextToolCalls > budget.maxToolCallsPerJob) {
      reasons.push(`job exceeds maxToolCallsPerJob ${budget.maxToolCallsPerJob}`);
    }
    if (budget.maxSameToolCallsPerJob !== undefined && nextSameToolCalls > budget.maxSameToolCallsPerJob) {
      reasons.push(`job exceeds maxSameToolCallsPerJob ${budget.maxSameToolCallsPerJob}`);
    }
    if (budget.maxIdenticalToolCallsPerJob !== undefined && attempts > budget.maxIdenticalToolCallsPerJob) {
      reasons.push(`job exceeds maxIdenticalToolCallsPerJob ${budget.maxIdenticalToolCallsPerJob}`);
    }
    if (budget.maxTokensPerJob !== undefined && nextTokens > budget.maxTokensPerJob) {
      reasons.push(`job exceeds maxTokensPerJob ${budget.maxTokensPerJob}`);
    }
    if (budget.maxEstimatedCostUsdPerJob !== undefined && nextCost > budget.maxEstimatedCostUsdPerJob) {
      reasons.push(`job exceeds maxEstimatedCostUsdPerJob ${budget.maxEstimatedCostUsdPerJob}`);
    }
    if (budget.maxRuntimeMsPerJob !== undefined && nextRuntimeMs > budget.maxRuntimeMsPerJob) {
      reasons.push(`job exceeds maxRuntimeMsPerJob ${budget.maxRuntimeMsPerJob}`);
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

    const usage = this.usageByJob.get(input.jobId) || newJobUsage(this.now().getTime());
    usage.toolCalls += 1;
    usage.tokens += input.estimatedTokens || 0;
    usage.estimatedCostUsd += input.estimatedCostUsd || 0;
    const attemptKey = attemptKeyFor(input);
    usage.toolAttempts.set(attemptKey, (usage.toolAttempts.get(attemptKey) || 0) + 1);
    usage.toolCallsByName.set(input.tool, (usage.toolCallsByName.get(input.tool) || 0) + 1);
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
              evidence: event.approvalEvidence,
            }
          : undefined,
      event,
    };
  }

  private event(type: DecisionType, input: GuardCheck, reasons: string[]): GuardDecisionEvent {
    return decisionEvent(type, input, reasons, this.idGenerator(), this.now().toISOString());
  }
}

function approvalEvidence(input: GuardCheck, reasons: string[]): ApprovalEvidence {
  return {
    schema_version: "agentpass.approval-evidence.v1",
    agent_id: input.agentId,
    ...(input.intentId === undefined ? {} : { intent_id: input.intentId }),
    ...(input.intentDigest === undefined ? {} : { intent_digest: input.intentDigest }),
    user_id: input.userId,
    tenant_id: input.tenantId,
    job_id: input.jobId,
    case_id: input.caseId,
    customer_id: input.customerId,
    tool: input.tool,
    action: input.action,
    resource: input.resource,
    amount: input.amountUsd,
    currency: input.currency || (input.amountUsd === undefined ? undefined : "USD"),
    data_from: input.dataFrom,
    data_to: input.dataTo,
    destination_type: input.destinationType,
    external_domain: input.externalDomain,
    field_set: input.fieldSet || [],
    record_count: input.recordCount,
    idempotency_key: input.idempotencyKey,
    call_fingerprint: input.callFingerprint,
    request_digest: input.requestDigest,
    policy_version: input.policyVersion,
    policy_findings: input.policyFindings || reasons,
    prior_attempt_count: input.priorAttemptCount,
    budget_state: input.budgetState,
    expires_at: input.approvalExpiresAt,
    basis_category: input.basisCategory,
    basis_ref: input.basisRef,
  };
}

function syntheticDecision(
  type: "allow" | "deny",
  input: GuardCheck,
  reasons: string[],
  idGenerator: () => string,
  now: () => Date,
): GuardDecision {
  const uniqueReasons = [...new Set(reasons)];
  return {
    type,
    allow: type === "allow",
    challengeRequired: false,
    reasons: uniqueReasons,
    event: decisionEvent(type, input, uniqueReasons, idGenerator(), now().toISOString()),
  };
}

function decisionEvent(
  type: DecisionType,
  input: GuardCheck,
  reasons: string[],
  decisionId: string,
  issuedAt: string,
): GuardDecisionEvent {
  return {
    decisionId,
    decision: type,
    allowed: type === "allow",
    reasons,
    agentId: input.agentId,
    ...(input.intentId === undefined ? {} : { intentId: input.intentId }),
    ...(input.intentDigest === undefined ? {} : { intentDigest: input.intentDigest }),
    tool: input.tool,
    action: input.action,
    jobId: input.jobId,
    userId: input.userId,
    resource: input.resource,
    callFingerprint: input.callFingerprint,
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
    ...(input.retryCount === undefined ? {} : { retryCount: input.retryCount }),
    enterpriseAuth: input.enterpriseAuth,
    issuedAt,
    approvalEvidence: approvalEvidence(input, reasons),
  };
}

export function createGuard(options: AgentPassGuardOptions): AgentPassGuard {
  return new AgentPassGuard(options);
}

export class AgentPassToolGate {
  readonly guard: AgentPassGuard;
  private idempotencyResults = new Map<string, IdempotencyResultRecord<unknown>>();
  private now: () => Date;
  private idGenerator: () => string;

  constructor(options: AgentPassToolGateOptions) {
    this.guard = "guard" in options ? options.guard : new AgentPassGuard(options);
    this.now = "guard" in options ? () => new Date() : options.now || (() => new Date());
    this.idGenerator = "guard" in options ? randomDecisionId : options.idGenerator || randomDecisionId;
  }

  check(input: GuardCheck): GuardDecision {
    return this.guard.check(input);
  }

  async run<TResult>(
    input: GuardCheck,
    execute: GuardedToolExecutor<TResult>,
  ): Promise<GuardedToolExecutionResult<TResult>> {
    const replayKey = input.idempotencyKey;
    const requestDigest = requestDigestFor(input);
    const replayRecord = replayKey ? this.idempotencyResults.get(replayKey) : undefined;
    if (replayRecord) {
      if (replayRecord.requestDigest !== requestDigest) {
        return {
          executed: false,
          decision: syntheticDecision(
            "deny",
            input,
            ["idempotencyKey was already used with different request digest"],
            this.idGenerator,
            this.now,
          ),
        };
      }

      replayRecord.replayCount += 1;
      const decision = syntheticDecision("allow", input, ["idempotency result replayed"], this.idGenerator, this.now);
      return {
        executed: true,
        decision,
        result: replayRecord.result as TResult,
        replayed: true,
        receipt: providerExecutionReceipt(input, decision, requestDigest, "replayed", {
          replayedFromDecisionId: replayRecord.receipt.decision_id,
          replayCount: replayRecord.replayCount,
          executedAt: this.now().toISOString(),
          resultDigest: replayRecord.receipt.result_digest,
        }),
      };
    }

    const decision = this.guard.check(input);
    if (!decision.allow) {
      return {
        executed: false,
        decision,
      };
    }

    const executionStartedAtMs = this.now().getTime();
    const result = await execute({ check: input, decision });
    const completedAt = this.now();
    const receipt = providerExecutionReceipt(input, decision, requestDigest, "executed", {
      executedAt: completedAt.toISOString(),
      latencyMs: Math.max(0, completedAt.getTime() - executionStartedAtMs),
      resultDigest: resultDigestFor(result),
    });
    if (replayKey) {
      this.idempotencyResults.set(replayKey, {
        requestDigest,
        result,
        receipt,
        replayCount: 0,
      });
    }
    return {
      executed: true,
      decision,
      result,
      replayed: false,
      receipt,
    };
  }

  reset(): void {
    this.guard.reset();
    this.idempotencyResults.clear();
  }
}

type IdempotencyResultRecord<TResult> = {
  requestDigest: string;
  result: TResult;
  receipt: ProviderExecutionReceipt;
  replayCount: number;
};

export function createToolGate(options: AgentPassToolGateOptions): AgentPassToolGate {
  return new AgentPassToolGate(options);
}

export class AgentPassMcpToolGate {
  readonly gate: AgentPassToolGate;
  private mappings: Record<string, McpToolMapping>;
  private defaultAction: AgentAction;

  constructor(options: AgentPassMcpToolGateOptions) {
    this.gate = "guard" in options ? new AgentPassToolGate({ guard: options.guard }) : new AgentPassToolGate(options);
    this.mappings = options.mappings || {};
    this.defaultAction = options.defaultAction || "read";
  }

  check(callOrRequest: McpToolCall | McpToolsCallRequest, context: McpGuardContext): GuardDecision {
    return this.gate.check(this.toGuardCheck(callOrRequest, context));
  }

  async run<TResult>(
    callOrRequest: McpToolCall | McpToolsCallRequest,
    context: McpGuardContext,
    execute: McpToolExecutor<TResult>,
  ): Promise<GuardedToolExecutionResult<TResult>> {
    const call = normalizeMcpToolCall(callOrRequest);
    const check = this.toGuardCheck(call, context);
    return this.gate.run(check, ({ decision }) =>
      execute({
        check,
        decision,
        call,
        arguments: call.arguments || {},
      }),
    );
  }

  toGuardCheck(callOrRequest: McpToolCall | McpToolsCallRequest, context: McpGuardContext): GuardCheck {
    return mcpToolCallToGuardCheck(callOrRequest, context, {
      mappings: this.mappings,
      defaultAction: this.defaultAction,
    });
  }

  reset(): void {
    this.gate.reset();
  }
}

export function createMcpToolGate(options: AgentPassMcpToolGateOptions): AgentPassMcpToolGate {
  return new AgentPassMcpToolGate(options);
}

export function mcpToolCallToGuardCheck(
  callOrRequest: McpToolCall | McpToolsCallRequest,
  context: McpGuardContext,
  options: McpToolCallAdapterOptions = {},
): GuardCheck {
  const call = normalizeMcpToolCall(callOrRequest);
  const args = call.arguments || {};
  const mapping = options.mappings?.[call.name] || {};
  const action = readMcpMappedValue(mapping.action, args, call, context) || inferMcpAction(call.name, options.defaultAction);

  return {
    agentId: context.agentId,
    tenantId: context.tenantId,
    ...(context.intentId === undefined ? {} : { intentId: context.intentId }),
    ...(context.intentDigest === undefined ? {} : { intentDigest: context.intentDigest }),
    jobId: context.jobId,
    userId: context.userId,
    approvalId: context.approvalId,
    retryCount: context.retryCount,
    enterpriseAuth: context.enterpriseAuth,
    tool: call.name,
    action,
    resource: readMcpMappedValue(mapping.resource, args, call, context),
    callFingerprint:
      readMcpMappedValue(mapping.callFingerprint, args, call, context) || `${call.name}:${stableStringify(args)}`,
    amountUsd: readMcpMappedValue(mapping.amountUsd, args, call, context),
    idempotencyKey: readMcpMappedValue(mapping.idempotencyKey, args, call, context),
    dataFrom: readMcpMappedValue(mapping.dataFrom, args, call, context),
    dataTo: readMcpMappedValue(mapping.dataTo, args, call, context),
    destinationType: readMcpMappedValue(mapping.destinationType, args, call, context),
    externalDomain: readMcpMappedValue(mapping.externalDomain, args, call, context),
    dataClassification: readMcpMappedValue(mapping.dataClassification, args, call, context),
    fieldSet: readMcpMappedValue(mapping.fieldSet, args, call, context),
    recordCount: readMcpMappedValue(mapping.recordCount, args, call, context),
    estimatedTokens: readMcpMappedValue(mapping.estimatedTokens, args, call, context),
    estimatedCostUsd: readMcpMappedValue(mapping.estimatedCostUsd, args, call, context),
  };
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
  if (flow.destinationType && !matchesPattern(flow.destinationType, input.destinationType || "")) return false;
  if (!flow.dataClassification || flow.dataClassification.length === 0) return true;

  const actual = new Set((input.dataClassification || []).map(normalize));
  return flow.dataClassification.some((classification) => actual.has(normalize(classification)));
}

function matchesPattern(pattern: string, value: string): boolean {
  return pattern === "*" || normalize(pattern) === normalize(value);
}

function addEnterpriseAuthFindings(
  input: GuardCheck,
  policy: EnterpriseAuthPolicy | undefined,
  label: string,
  reasons: string[],
): void {
  if (!policy) return;

  const auth = input.enterpriseAuth;
  if (!auth) {
    reasons.push(`${label} context is required`);
    return;
  }

  const scopes = normalizeSet(auth.scopes);
  const groups = normalizeSet(auth.groups);

  for (const scope of missingValues(policy.requiredScopes, scopes)) {
    reasons.push(`${label} missing required scope: ${scope}`);
  }
  for (const group of missingValues(policy.requiredGroups, groups)) {
    reasons.push(`${label} missing required group: ${group}`);
  }
  if (policy.allowedGroups?.length && !hasAnyValue(policy.allowedGroups, groups)) {
    reasons.push(`${label} group is not allowed`);
  }
  if (policy.allowedClients?.length && !matchesAnyNormalized(auth.clientId, policy.allowedClients)) {
    reasons.push(`${label} client is not allowed: ${auth.clientId || "unknown"}`);
  }
  if (policy.allowedIssuers?.length && !matchesAnyNormalized(auth.issuer, policy.allowedIssuers)) {
    reasons.push(`${label} issuer is not allowed: ${auth.issuer || "unknown"}`);
  }
}

function missingValues(required: string[] | undefined, actual: Set<string>): string[] {
  if (!required) return [];
  return required.filter((value) => !actual.has(normalize(value)));
}

function hasAnyValue(expected: string[], actual: Set<string>): boolean {
  return expected.some((value) => actual.has(normalize(value)));
}

function matchesAnyNormalized(value: string | undefined, expected: string[]): boolean {
  if (!value) return false;
  const normalized = normalize(value);
  return expected.some((candidate) => normalize(candidate) === normalized);
}

function normalizeSet(values: string[] | undefined): Set<string> {
  return new Set((values || []).map(normalize));
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
  return [input.tool, input.action, input.callFingerprint || input.resource || "", input.idempotencyKey || ""].join("|");
}

function requestDigestFor(input: GuardCheck): string {
  if (input.requestDigest) return input.requestDigest;
  return sha256(
    stableStringify({
      agentId: input.agentId,
      tenantId: input.tenantId,
      intentId: input.intentId,
      intentDigest: input.intentDigest,
      tool: input.tool,
      action: input.action,
      jobId: input.jobId,
      caseId: input.caseId,
      customerId: input.customerId,
      userId: input.userId,
      resource: input.resource,
      callFingerprint: input.callFingerprint,
      amountUsd: input.amountUsd,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      approvalId: input.approvalId,
      dataFrom: input.dataFrom,
      dataTo: input.dataTo,
      destinationType: input.destinationType,
      externalDomain: input.externalDomain,
      dataClassification: input.dataClassification,
      fieldSet: input.fieldSet,
      recordCount: input.recordCount,
      basisCategory: input.basisCategory,
      basisRef: input.basisRef,
      enterpriseAuth: input.enterpriseAuth,
    }),
  );
}

function providerExecutionReceipt(
  input: GuardCheck,
  decision: GuardDecision,
  requestDigest: string,
  status: ProviderExecutionReceipt["status"],
  options: {
    executedAt: string;
    replayedFromDecisionId?: string;
    replayCount?: number;
    latencyMs?: number;
    resultDigest?: string;
  },
): ProviderExecutionReceipt {
  return {
    schema_version: "agentpass.provider-execution-receipt.v1",
    decision_id: decision.event.decisionId,
    ...(input.intentId === undefined ? {} : { intent_id: input.intentId }),
    ...(input.intentDigest === undefined ? {} : { intent_digest: input.intentDigest }),
    ...(input.jobId === undefined ? {} : { job_id: input.jobId }),
    tool: input.tool,
    action: input.action,
    resource: input.resource,
    amount: input.amountUsd,
    currency: input.currency || (input.amountUsd === undefined ? undefined : "USD"),
    idempotency_key: input.idempotencyKey,
    request_digest: requestDigest,
    status,
    executed_at: options.executedAt,
    completed_at: options.executedAt,
    latency_ms: options.latencyMs,
    result_digest: options.resultDigest,
    replayed_from_decision_id: options.replayedFromDecisionId,
    replay_count: options.replayCount,
  };
}

function resultDigestFor(result: unknown): string | undefined {
  try {
    return sha256(stableStringify(result));
  } catch {
    return undefined;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newJobUsage(startedAtMs: number): JobUsage {
  return {
    startedAtMs,
    toolCalls: 0,
    tokens: 0,
    estimatedCostUsd: 0,
    toolAttempts: new Map<string, number>(),
    toolCallsByName: new Map<string, number>(),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function randomDecisionId(): string {
  return `dec_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeMcpToolCall(callOrRequest: McpToolCall | McpToolsCallRequest): McpToolCall {
  return "params" in callOrRequest ? callOrRequest.params : callOrRequest;
}

function readMcpMappedValue<T>(
  value: McpMappedValue<T> | undefined,
  args: Record<string, unknown>,
  call: McpToolCall,
  context: McpGuardContext,
): T | undefined {
  if (typeof value === "function") {
    const mapper = value as (
      args: Record<string, unknown>,
      call: McpToolCall,
      context: McpGuardContext,
    ) => T | undefined;
    return mapper(args, call, context);
  }
  return value;
}

function inferMcpAction(toolName: string, defaultAction: AgentAction = "read"): AgentAction {
  const normalized = normalize(toolName);
  if (containsAny(normalized, ["refund", "credit", "charge", "payment", "pay", "transfer"])) return "pay";
  if (containsAny(normalized, ["send", "email", "message", "notify", "post"])) return "send";
  if (containsAny(normalized, ["delete", "remove", "destroy"])) return "delete";
  if (containsAny(normalized, ["deploy", "rollback", "release"])) return "deploy";
  if (containsAny(normalized, ["export", "download", "dump"])) return "export";
  if (containsAny(normalized, ["admin", "permission", "role", "iam", "secret", "shell", "exec"])) return "admin";
  if (containsAny(normalized, ["update", "write", "create", "insert", "patch", "set"])) return "write";
  if (containsAny(normalized, ["read", "get", "list", "search", "find", "lookup", "query"])) return "read";
  return defaultAction;
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
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
    output[key] = stableValue(input[key]);
  }
  return output;
}

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
  callFingerprint?: string;
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
  issuedAt: string;
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

export type GuardedToolExecutionResult<TResult> =
  | {
      executed: true;
      decision: GuardDecision;
      result: TResult;
    }
  | {
      executed: false;
      decision: GuardDecision;
      result?: never;
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
  jobId?: string;
  userId?: string;
  approvalId?: string;
  retryCount?: number;
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
      issuedAt: this.now().toISOString(),
    };
  }
}

export function createGuard(options: AgentPassGuardOptions): AgentPassGuard {
  return new AgentPassGuard(options);
}

export class AgentPassToolGate {
  readonly guard: AgentPassGuard;

  constructor(options: AgentPassToolGateOptions) {
    this.guard = "guard" in options ? options.guard : new AgentPassGuard(options);
  }

  check(input: GuardCheck): GuardDecision {
    return this.guard.check(input);
  }

  async run<TResult>(
    input: GuardCheck,
    execute: GuardedToolExecutor<TResult>,
  ): Promise<GuardedToolExecutionResult<TResult>> {
    const decision = this.guard.check(input);
    if (!decision.allow) {
      return {
        executed: false,
        decision,
      };
    }

    const result = await execute({ check: input, decision });
    return {
      executed: true,
      decision,
      result,
    };
  }

  reset(): void {
    this.guard.reset();
  }
}

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
    jobId: context.jobId,
    userId: context.userId,
    approvalId: context.approvalId,
    retryCount: context.retryCount,
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

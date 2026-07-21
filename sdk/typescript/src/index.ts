export type AgentPassClientOptions = {
  baseUrl: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
};

export type AgentIdClientOptions = AgentPassClientOptions;

export type IntentEvidenceSource = "decision_events" | "execution_receipts" | "observations" | "job";

export type IntentPredicate = {
  id: string;
  description?: string;
  source: IntentEvidenceSource;
  where?: Array<{
    path: string;
    operator: "equals" | "not_equals" | "in" | "not_in" | "exists";
    value?: unknown;
  }>;
  assertion: {
    operator:
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
    path?: string;
    value?: unknown;
    quantifier?: "any" | "all";
  };
  weight?: number;
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
  preferences?: {
    max_tool_calls?: number;
    max_execution_receipts?: number;
    max_retries?: number;
    max_replays?: number;
    max_denied_decisions?: number;
    max_runtime_ms?: number;
    max_estimated_cost_usd?: number;
  };
  evidence_requirements?: IntentEvidenceSource[];
  issued_at: string;
  expires_at?: string;
  intent_digest?: string;
};

export type RegisteredIntentContract = {
  schema_version: "agentpass.intent-registry-record.v1";
  intent_id: string;
  intent_digest: string;
  job_id: string;
  tenant_id?: string;
  registered_at: string;
  registered_by?: string;
  status: "pending" | "active" | "expired";
  contract: IntentContract;
  auth?: Record<string, unknown>;
};

export type IntentContractListResponse = {
  intent_contracts: RegisteredIntentContract[];
  count: number;
  auth?: Record<string, unknown>;
};

export type IntentObservationInput = {
  schema_version?: "agentpass.intent-observation.v1";
  observation_id: string;
  tenant_id?: string;
  intent_id?: string;
  intent_digest?: string;
  predicate: string;
  value: unknown;
  observed_at: string;
  issued_at: string;
  expires_at?: string;
  issuer: string;
  resource?: string;
  payload_digest?: string;
};

export type SignedIntentObservationInput = {
  jws: string;
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

export type IntentObservationResponse = {
  observation: IntentObservation;
  replayed: boolean;
  auth?: Record<string, unknown>;
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
  outcomes: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  execution_discipline: Record<string, unknown>;
  evidence_findings: string[];
  evaluation_mode?: "preview" | "final";
  snapshot_id?: string;
  evidence_digest?: string;
  auth?: Record<string, unknown>;
};

export type IntentEvaluationInput = {
  job?: Record<string, unknown>;
};

export type IntentEvidenceSourceManifest = {
  count: number;
  evidence_ids: string[];
  digest: string;
};

export type IntentEvidenceSnapshot = {
  schema_version: "agentpass.intent-evidence-snapshot.v1";
  snapshot_id: string;
  tenant_id: string;
  intent_id: string;
  intent_digest: string;
  job_id: string;
  captured_at: string;
  evidence_digest: string;
  sources: Record<IntentEvidenceSource, IntentEvidenceSourceManifest>;
  evidence: {
    decision_events: Array<Record<string, unknown>>;
    execution_receipts: Array<Record<string, unknown>>;
    observations: Array<Record<string, unknown>>;
    job?: Record<string, unknown>;
  };
};

export type IntentFinalizationResponse = {
  evaluation: IntentEvaluationReceipt & {
    evaluation_mode: "final";
    snapshot_id: string;
    evidence_digest: string;
  };
  snapshot: IntentEvidenceSnapshot;
  replayed: boolean;
  auth?: Record<string, unknown>;
};

export type IntentEvaluationHistoryResponse = {
  intent_id: string;
  intent_digest: string;
  job_id: string;
  tenant_id: string;
  evaluations: IntentEvaluationReceipt[];
  count: number;
  total_count: number;
  latest_preview?: IntentEvaluationReceipt;
  final?: IntentEvaluationReceipt;
  snapshot?: IntentEvidenceSnapshot;
  finalization_status: "open" | "finalizing" | "finalized";
  auth?: Record<string, unknown>;
};

export type ToolCallRequest = {
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  data_from?: string;
  data_to?: string;
  approved?: boolean;
  jit_grant_id?: string;
  resource?: string;
  called_agent?: string;
  delegated_tool?: string;
  delegation_depth?: number;
  delegation_grant_id?: string;
  approval_source?: "human" | "agent" | "system" | string;
  approval_agent?: string;
  tenant_id?: string;
  user_id?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  amount?: number;
  currency?: string;
  destination_type?: string;
  external_domain?: string;
  data_classification?: string[];
  field_set?: string[];
  record_count?: number;
  redaction_state?: string;
  retention?: string;
  idempotency_key?: string;
  call_fingerprint?: string;
  request_digest?: string;
  policy_version?: string;
  policy_findings?: string[];
  prior_attempt_count?: number;
  budget_state?: Record<string, unknown>;
  basis_category?: string;
  basis_ref?: string;
  context?: Record<string, string | number | boolean>;
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
  action: string;
  resource?: string;
  amount?: number;
  currency?: string;
  data_from?: string;
  data_to?: string;
  destination_type?: string;
  external_domain?: string;
  data_classification?: string[];
  field_set: string[];
  record_count?: number;
  redaction_state?: string;
  retention?: string;
  idempotency_key?: string;
  call_fingerprint?: string;
  request_digest: string;
  policy_version?: string;
  policy_findings: string[];
  prior_attempt_count?: number;
  budget_state?: Record<string, unknown>;
  expires_at: string;
  basis_category?: string;
  basis_ref?: string;
  context?: Record<string, string>;
};

export type ApprovalRequestInput = Omit<ToolCallRequest, "agent_id"> & {
  approval_id?: string;
  requested_by?: string;
  reason: string;
};

export type ApprovalRequest = {
  approval_id: string;
  status: "pending" | "approved" | "denied" | "expired";
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  resource: string;
  requested_by: string;
  reason: string;
  created_at: string;
  expires_at: string;
  decided_at?: string;
  decided_by?: string;
  decision_reason?: string;
  evidence: ApprovalEvidence;
  findings: string[];
  auth?: Record<string, unknown>;
};

export type ApprovalDecisionInput = {
  decided_by: string;
  decision_reason: string;
  findings?: string[];
};

export type ApprovalListResponse = {
  approvals: ApprovalRequest[];
  count: number;
  auth?: Record<string, unknown>;
};

export type AuditRecord = {
  audit_id: string;
  received_at: string;
  schema_version: string;
  type: string;
  tenant_id?: string | null;
  agent_id?: string;
  intent_id?: string;
  tool?: string;
  action?: string;
  resource?: string;
  approval_id?: string;
  jit_grant_id?: string;
  allow?: boolean;
  payload: Record<string, unknown>;
};

export type AuditListResponse = {
  events: AuditRecord[];
  count: number;
  auth?: Record<string, unknown>;
};

export type ProviderExecutionReceipt = {
  schema_version: "agentpass.provider-execution-receipt.v1";
  decision_id: string;
  intent_id?: string;
  intent_digest?: string;
  job_id?: string;
  tool: string;
  action: string;
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

export type ProviderAuthorizationReceipt = {
  jws: string;
};

export type ExecutionResultInput = ToolCallRequest & {
  result: unknown;
};

export type ExecutionResultRecord = {
  schema_version: "agentpass.idempotency-result.v1";
  idempotency_key: string;
  request_digest: string;
  agent_id: string;
  tool: string;
  action: string;
  resource?: string;
  amount?: number;
  currency?: string;
  approval_id?: string;
  jit_grant_id?: string;
  result: unknown;
  receipt: ProviderExecutionReceipt;
  created_at: string;
  replay_count: number;
  auth?: Record<string, unknown>;
};

export type AuthorizeResponse = {
  allow: boolean;
  decision: "allow" | "deny" | "challenge_required";
  findings: string[];
  event: Record<string, unknown>;
  replayed?: boolean;
  result?: unknown;
  receipt?: ProviderExecutionReceipt;
  authorization_receipt?: ProviderAuthorizationReceipt;
  auth?: Record<string, unknown>;
};

export type JitGrantRequest = {
  tool: string;
  action: string;
  intent_id?: string;
  intent_digest?: string;
  resource?: string;
  approval_id?: string;
  user_id?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  context?: Record<string, string | number | boolean>;
  [key: string]: unknown;
};

export type JitGrantResponse = {
  jit_grant_id: string;
  agent_id: string;
  intent_id?: string;
  intent_digest?: string;
  tool: string;
  action: string;
  resource: string;
  approval_id: string;
  user_id: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  expires_at: string;
  used: boolean;
  evidence?: ApprovalEvidence;
  auth?: Record<string, unknown>;
};

export class AgentPassDeniedError extends Error {
  response: AuthorizeResponse;

  constructor(response: AuthorizeResponse) {
    super(`AgentPass denied tool call: ${response.findings.join("; ") || response.decision}`);
    this.name = "AgentPassDeniedError";
    this.response = response;
  }
}

export class AgentPassHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`AgentPass gateway request failed with status ${status}`);
    this.name = "AgentPassHttpError";
    this.status = status;
    this.body = body;
  }
}

export class AgentPassClient {
  private baseUrl: string;
  private token?: AgentPassClientOptions["token"];
  private fetchImpl: typeof fetch;

  constructor(options: AgentPassClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch || fetch;
  }

  async registerIntentContract(tenantId: string, contract: IntentContract): Promise<RegisteredIntentContract> {
    return this.post<RegisteredIntentContract>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts`,
      contract,
      [200, 201],
    );
  }

  async listIntentContracts(tenantId: string): Promise<IntentContractListResponse> {
    return this.get<IntentContractListResponse>(`/tenants/${encodeURIComponent(tenantId)}/intent-contracts`, [200]);
  }

  async getIntentContract(tenantId: string, intentId: string): Promise<RegisteredIntentContract> {
    return this.get<RegisteredIntentContract>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts/${encodeURIComponent(intentId)}`,
      [200],
    );
  }

  async recordIntentObservation(
    tenantId: string,
    intentId: string,
    observation: IntentObservationInput | SignedIntentObservationInput,
  ): Promise<IntentObservationResponse> {
    return this.post<IntentObservationResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts/${encodeURIComponent(intentId)}/observations`,
      observation,
      [200, 201],
    );
  }

  async evaluateIntent(
    tenantId: string,
    intentId: string,
    request: IntentEvaluationInput = {},
  ): Promise<IntentEvaluationReceipt> {
    return this.post<IntentEvaluationReceipt>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts/${encodeURIComponent(intentId)}/evaluate`,
      request,
      [200],
    );
  }

  async finalizeIntent(
    tenantId: string,
    intentId: string,
    request: IntentEvaluationInput = {},
  ): Promise<IntentFinalizationResponse> {
    return this.post<IntentFinalizationResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts/${encodeURIComponent(intentId)}/finalize`,
      request,
      [200, 201],
    );
  }

  async getIntentEvaluations(
    tenantId: string,
    intentId: string,
    options: { limit?: number } = {},
  ): Promise<IntentEvaluationHistoryResponse> {
    const search = new URLSearchParams();
    if (options.limit) search.set("limit", String(options.limit));
    return this.get<IntentEvaluationHistoryResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-contracts/${encodeURIComponent(intentId)}/evaluations${
        search.size ? `?${search}` : ""
      }`,
      [200],
    );
  }

  async authorizeToolCall(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    return this.post<AuthorizeResponse>(`/tenants/${encodeURIComponent(tenantId)}/authorize`, request, [200, 403]);
  }

  async assertAllowed(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    const response = await this.authorizeToolCall(tenantId, request);
    if (!response.allow) throw new AgentPassDeniedError(response);
    return response;
  }

  async requestJitGrant(tenantId: string, request: JitGrantRequest): Promise<JitGrantResponse> {
    return this.post<JitGrantResponse>(`/tenants/${encodeURIComponent(tenantId)}/jit-grants`, request, [201]);
  }

  async recordExecutionResult(tenantId: string, request: ExecutionResultInput): Promise<ExecutionResultRecord> {
    return this.post<ExecutionResultRecord>(`/tenants/${encodeURIComponent(tenantId)}/execution-results`, request, [201, 200]);
  }

  async createApprovalRequest(tenantId: string, request: ApprovalRequestInput): Promise<ApprovalRequest> {
    return this.post<ApprovalRequest>(`/tenants/${encodeURIComponent(tenantId)}/approval-requests`, request, [201]);
  }

  async listApprovalRequests(
    tenantId: string,
    options: { status?: ApprovalRequest["status"] | "all"; limit?: number } = {},
  ): Promise<ApprovalListResponse> {
    const search = new URLSearchParams();
    if (options.status && options.status !== "all") search.set("status", options.status);
    if (options.limit) search.set("limit", String(options.limit));
    return this.get<ApprovalListResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/approval-requests${search.size ? `?${search}` : ""}`,
      [200],
    );
  }

  async getApprovalRequest(tenantId: string, approvalId: string): Promise<ApprovalRequest> {
    return this.get<ApprovalRequest>(
      `/tenants/${encodeURIComponent(tenantId)}/approval-requests/${encodeURIComponent(approvalId)}`,
      [200],
    );
  }

  async decideApprovalRequest(
    tenantId: string,
    approvalId: string,
    decision: "approve" | "deny",
    request: ApprovalDecisionInput,
  ): Promise<ApprovalRequest> {
    return this.post<ApprovalRequest>(
      `/tenants/${encodeURIComponent(tenantId)}/approval-requests/${encodeURIComponent(approvalId)}/${decision}`,
      request,
      [200],
    );
  }

  async listAuditEvents(
    options: { tenantId?: string; intentId?: string; approvalId?: string; jitGrantId?: string; limit?: number } = {},
  ): Promise<AuditListResponse> {
    const search = new URLSearchParams();
    if (options.tenantId) search.set("tenant_id", options.tenantId);
    if (options.intentId) search.set("intent_id", options.intentId);
    if (options.approvalId) search.set("approval_id", options.approvalId);
    if (options.jitGrantId) search.set("jit_grant_id", options.jitGrantId);
    if (options.limit) search.set("limit", String(options.limit));
    return this.get<AuditListResponse>(`/audit/events${search.size ? `?${search}` : ""}`, [200]);
  }

  private async post<T>(path: string, payload: unknown, expectedStatuses: number[]): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = await this.resolveToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!expectedStatuses.includes(response.status)) {
      throw new AgentPassHttpError(response.status, body);
    }
    return body as T;
  }

  private async get<T>(path: string, expectedStatuses: number[]): Promise<T> {
    const headers: Record<string, string> = {};
    const token = await this.resolveToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { headers });
    const body = await response.json().catch(() => ({}));
    if (!expectedStatuses.includes(response.status)) {
      throw new AgentPassHttpError(response.status, body);
    }
    return body as T;
  }

  private async resolveToken(): Promise<string | undefined> {
    if (!this.token) return undefined;
    if (typeof this.token === "function") return this.token();
    return this.token;
  }
}

export const AgentIdDeniedError = AgentPassDeniedError;
export const AgentIdHttpError = AgentPassHttpError;
export const AgentIdClient = AgentPassClient;

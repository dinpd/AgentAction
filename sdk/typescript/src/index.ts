export type AgentActionClientOptions = {
  baseUrl: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
};

export type AgentIdClientOptions = AgentActionClientOptions;

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
  trusted_observation_requirements?: IntentTrustedObservationRequirement[];
  profile_digest?: string;
};

export type RegisteredIntentProfile = {
  schema_version: "agentpass.intent-profile-registry-record.v1";
  profile_key: string;
  profile: string;
  version: string;
  profile_digest: string;
  tenant_id?: string;
  registered_at: string;
  registered_by?: string;
  status: "pending" | "active";
  definition: IntentProfile;
  auth?: Record<string, unknown>;
};

export type IntentProfileListResponse = {
  intent_profiles: RegisteredIntentProfile[];
  count: number;
  auth?: Record<string, unknown>;
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
  trusted_observation_requirements?: IntentTrustedObservationRequirement[];
  issued_at: string;
  expires_at?: string;
  intent_digest?: string;
};

export type RegisteredIntentContract = {
  schema_version: "agentpass.intent-registry-record.v1";
  intent_id: string;
  intent_digest: string;
  job_id: string;
  profile_key?: string;
  profile_version?: string;
  profile_digest?: string;
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
  profile_version?: string;
  profile_digest?: string;
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

export type IntentQualityRollupQuery = {
  from: string;
  to: string;
  profile_key?: string;
  profile_version?: string;
  agent_id?: string;
  verdict?: IntentEvaluationReceipt["verdict"];
  constraint_compliance?: IntentEvaluationReceipt["constraint_compliance"];
  minimum_sample_size?: number;
  limit?: number;
  cursor?: string;
};

export type IntentQualityCountRate = {
  count: number;
  rate: number;
};

export type IntentQualityAppliedFilters = {
  time_window: { from: string; to: string; boundary: "[from,to)"; maximum_days: 90 };
  profile_key?: string;
  profile_version?: string;
  agent_id?: string;
  verdict?: IntentEvaluationReceipt["verdict"];
  constraint_compliance?: IntentEvaluationReceipt["constraint_compliance"];
  minimum_sample_size: number;
};

export type IntentQualityExclusionReason =
  | "not_finalized"
  | "invalid_final_receipt"
  | "unversioned_profile"
  | "outside_time_window"
  | "profile_filter"
  | "agent_filter"
  | "verdict_filter"
  | "constraint_filter";

export type IntentQualityRollup = {
  schema_version: "agentpass.intent-quality-rollup.v1";
  tenant_id: string;
  profile_key: string;
  profile_version: string;
  profile_digest: string;
  time_window: { from: string; to: string; boundary: "[from,to)" };
  sample: {
    finalized_jobs: number;
    minimum_sample_size: number;
    meets_minimum_sample_size: boolean;
  };
  outcomes: {
    counts: Record<IntentEvaluationReceipt["verdict"], number>;
    rates: Record<IntentEvaluationReceipt["verdict"], number>;
    qualified_success: IntentQualityCountRate;
    goal_attainment_average: number;
  };
  constraint_compliance: {
    counts: Record<IntentEvaluationReceipt["constraint_compliance"], number>;
    rates: Record<IntentEvaluationReceipt["constraint_compliance"], number>;
  };
  evidence_confidence: {
    average: number;
    minimum: number;
    maximum: number;
    thresholds: { low_below: number; high_at_or_above: number };
    distribution: Record<"low" | "medium" | "high", IntentQualityCountRate>;
  };
  execution_discipline: {
    totals: Record<string, number>;
    averages: Record<string, number | null>;
    preference_compliance: {
      met: number;
      not_met: number;
      not_applicable: number;
      rate: number | null;
    };
    coverage: { runtime_ms_records: number; preference_records: number };
  };
  data_quality: {
    low_confidence_count: number;
    indeterminate_count: number;
    missing_agent_count: number;
    missing_runtime_count: number;
    findings: string[];
  };
};

export type IntentQualityRollupsResponse = {
  schema_version: "agentpass.intent-quality-rollups.v1";
  tenant_id: string;
  filters: IntentQualityAppliedFilters;
  records_scanned: number;
  finalized_records: number;
  matched_records: number;
  excluded_records: {
    total: number;
    by_reason: Record<IntentQualityExclusionReason, number>;
  };
  data_quality: { findings: string[] };
  rollups: IntentQualityRollup[];
  pagination: {
    limit: number;
    total_groups: number;
    returned_groups: number;
    next_cursor: string | null;
  };
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

export class AgentActionDeniedError extends Error {
  response: AuthorizeResponse;

  constructor(response: AuthorizeResponse) {
    super(`AgentAction denied tool call: ${response.findings.join("; ") || response.decision}`);
    this.name = "AgentActionDeniedError";
    this.response = response;
  }
}

export class AgentActionHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`AgentAction gateway request failed with status ${status}`);
    this.name = "AgentActionHttpError";
    this.status = status;
    this.body = body;
  }
}

export class AgentActionClient {
  private baseUrl: string;
  private token?: AgentActionClientOptions["token"];
  private fetchImpl: typeof fetch;

  constructor(options: AgentActionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch || fetch;
  }

  async registerIntentProfile(tenantId: string, profile: IntentProfile): Promise<RegisteredIntentProfile> {
    return this.post<RegisteredIntentProfile>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-profiles`,
      profile,
      [200, 201],
    );
  }

  async listIntentProfiles(tenantId: string): Promise<IntentProfileListResponse> {
    return this.get<IntentProfileListResponse>(`/tenants/${encodeURIComponent(tenantId)}/intent-profiles`, [200]);
  }

  async getIntentProfile(tenantId: string, profileKey: string): Promise<RegisteredIntentProfile> {
    return this.get<RegisteredIntentProfile>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-profiles/${encodeURIComponent(profileKey)}`,
      [200],
    );
  }

  async issueIntentContract(
    tenantId: string,
    profileKey: string,
    request: IntentProfileIssuanceInput,
  ): Promise<RegisteredIntentContract> {
    return this.post<RegisteredIntentContract>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-profiles/${encodeURIComponent(profileKey)}/issue`,
      request,
      [200, 201],
    );
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

  async getIntentQualityRollups(
    tenantId: string,
    options: IntentQualityRollupQuery,
  ): Promise<IntentQualityRollupsResponse> {
    const search = new URLSearchParams({ from: options.from, to: options.to });
    if (options.profile_key) search.set("profile_key", options.profile_key);
    if (options.profile_version) search.set("profile_version", options.profile_version);
    if (options.agent_id) search.set("agent_id", options.agent_id);
    if (options.verdict) search.set("verdict", options.verdict);
    if (options.constraint_compliance) search.set("constraint_compliance", options.constraint_compliance);
    if (options.minimum_sample_size !== undefined) {
      search.set("minimum_sample_size", String(options.minimum_sample_size));
    }
    if (options.limit !== undefined) search.set("limit", String(options.limit));
    if (options.cursor) search.set("cursor", options.cursor);
    return this.get<IntentQualityRollupsResponse>(
      `/tenants/${encodeURIComponent(tenantId)}/intent-quality/rollups?${search}`,
      [200],
    );
  }

  async authorizeToolCall(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    return this.post<AuthorizeResponse>(`/tenants/${encodeURIComponent(tenantId)}/authorize`, request, [200, 403]);
  }

  async assertAllowed(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    const response = await this.authorizeToolCall(tenantId, request);
    if (!response.allow) throw new AgentActionDeniedError(response);
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
      throw new AgentActionHttpError(response.status, body);
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
      throw new AgentActionHttpError(response.status, body);
    }
    return body as T;
  }

  private async resolveToken(): Promise<string | undefined> {
    if (!this.token) return undefined;
    if (typeof this.token === "function") return this.token();
    return this.token;
  }
}

export const AgentIdDeniedError = AgentActionDeniedError;
export const AgentIdHttpError = AgentActionHttpError;
export const AgentIdClient = AgentActionClient;

// Backward-compatible names retained for existing AgentPass integrations.
export type AgentPassClientOptions = AgentActionClientOptions;
export {
  AgentActionClient as AgentPassClient,
  AgentActionDeniedError as AgentPassDeniedError,
  AgentActionHttpError as AgentPassHttpError,
};

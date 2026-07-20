export type AgentPassClientOptions = {
  baseUrl: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
};

export type AgentIdClientOptions = AgentPassClientOptions;

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
    options: { tenantId?: string; approvalId?: string; jitGrantId?: string; limit?: number } = {},
  ): Promise<AuditListResponse> {
    const search = new URLSearchParams();
    if (options.tenantId) search.set("tenant_id", options.tenantId);
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

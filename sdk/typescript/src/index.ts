export type AgentIdClientOptions = {
  baseUrl: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
};

export type ToolCallRequest = {
  agent_id: string;
  tool: string;
  action: string;
  data_from?: string;
  data_to?: string;
  approved?: boolean;
  jit_grant_id?: string;
  resource?: string;
  called_agent?: string;
};

export type AuthorizeResponse = {
  allow: boolean;
  decision: "allow" | "deny";
  findings: string[];
  event: Record<string, unknown>;
  auth?: Record<string, unknown>;
};

export type JitGrantRequest = {
  tool: string;
  action: string;
  resource?: string;
  approval_id?: string;
  user_id?: string;
};

export type JitGrantResponse = {
  jit_grant_id: string;
  agent_id: string;
  tool: string;
  action: string;
  resource: string;
  approval_id: string;
  user_id: string;
  expires_at: string;
  used: boolean;
  auth?: Record<string, unknown>;
};

export class AgentIdDeniedError extends Error {
  response: AuthorizeResponse;

  constructor(response: AuthorizeResponse) {
    super(`AgentID denied tool call: ${response.findings.join("; ") || response.decision}`);
    this.name = "AgentIdDeniedError";
    this.response = response;
  }
}

export class AgentIdHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`AgentID gateway request failed with status ${status}`);
    this.name = "AgentIdHttpError";
    this.status = status;
    this.body = body;
  }
}

export class AgentIdClient {
  private baseUrl: string;
  private token?: AgentIdClientOptions["token"];
  private fetchImpl: typeof fetch;

  constructor(options: AgentIdClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch || fetch;
  }

  async authorizeToolCall(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    return this.post<AuthorizeResponse>(`/tenants/${encodeURIComponent(tenantId)}/authorize`, request, [200, 403]);
  }

  async assertAllowed(tenantId: string, request: ToolCallRequest): Promise<AuthorizeResponse> {
    const response = await this.authorizeToolCall(tenantId, request);
    if (!response.allow) throw new AgentIdDeniedError(response);
    return response;
  }

  async requestJitGrant(tenantId: string, request: JitGrantRequest): Promise<JitGrantResponse> {
    return this.post<JitGrantResponse>(`/tenants/${encodeURIComponent(tenantId)}/jit-grants`, request, [201]);
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
      throw new AgentIdHttpError(response.status, body);
    }
    return body as T;
  }

  private async resolveToken(): Promise<string | undefined> {
    if (!this.token) return undefined;
    if (typeof this.token === "function") return this.token();
    return this.token;
  }
}

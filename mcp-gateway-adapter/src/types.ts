export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type AgentIdAuthorizeRequest = {
  [key: string]: unknown;
  agent_id: string;
  tool: string;
  action: string;
  data_from?: string;
  data_to?: string;
  resource?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  user_id?: string;
  tenant_id?: string;
  approved?: boolean;
  jit_grant_id?: string;
};

export type AgentIdAuthorizeResponse = {
  allow: boolean;
  decision: "allow" | "deny";
  findings: string[];
  event: Record<string, unknown>;
};

export type ToolMapping = {
  action: string;
  data_from?: string;
  data_to?: string;
  resource?: string;
  resource_arg?: string;
  resource_template?: string;
  job_id_arg?: string;
  case_id_arg?: string;
  customer_id_arg?: string;
  user_id_arg?: string;
  approved_arg?: string;
  jit_grant_id_arg?: string;
  approval_id_arg?: string;
  amount_arg?: string;
  context_args?: Record<string, string>;
  receipt_required?: boolean;
  receipt_ttl_seconds?: number;
};

export type AdapterConfig = {
  listen?: {
    host?: string;
    port?: number;
  };
  agentid: {
    base_url: string;
    tenant_id?: string;
    token?: string;
  };
  downstream: {
    url: string;
  };
  agent: {
    id: string;
  };
  provider_receipts?: {
    tenant_id?: string;
    hmac_secret?: string;
    jws?: {
      private_key_pem?: string;
      private_key_env?: string;
      key_id?: string;
      issuer?: string;
      subject?: string;
      audience?: string;
      algorithm?: "RS256";
    };
  };
  tools: Record<string, ToolMapping>;
  filter_tools_list?: boolean;
};

export type AuthorizationDecisionLog = {
  [key: string]: unknown;
  event: "agentid.mcp.authorization";
  agent_id: string;
  tenant_id?: string;
  user_id?: string;
  tool: string;
  action: string;
  resource?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  allowed: boolean;
  decision: AgentIdAuthorizeResponse["decision"];
  findings: string[];
};

export type ProviderAuthorizationReceipt = {
  [key: string]: unknown;
  decision_id: string;
  tenant_id?: string;
  agent_id: string;
  user_id?: string;
  tool: string;
  action: string;
  resource?: string;
  job_id?: string;
  case_id?: string;
  customer_id?: string;
  approval_id?: string;
  jit_grant_id?: string;
  amount?: string;
  issued_at: string;
  expires_at: string;
};

export type SignedProviderAuthorizationReceipt = {
  alg: "HS256" | "RS256";
  payload: ProviderAuthorizationReceipt;
  signature: string;
};

export type JwsProviderAuthorizationReceipt = {
  jws: string;
};

export type RequestContext = {
  agentId?: string;
  tenantId?: string;
  userId?: string;
  logger?: (entry: AuthorizationDecisionLog) => void;
};

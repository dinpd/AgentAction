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
};

export type AdapterConfig = {
  listen?: {
    host?: string;
    port?: number;
  };
  agentid: {
    base_url: string;
    tenant_id: string;
    token?: string;
  };
  downstream: {
    url: string;
  };
  agent: {
    id: string;
  };
  tools: Record<string, ToolMapping>;
  filter_tools_list?: boolean;
};

export type RequestContext = {
  agentId?: string;
  tenantId?: string;
  userId?: string;
};

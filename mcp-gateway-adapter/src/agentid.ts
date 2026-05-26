import type { AgentIdAuthorizeRequest, AgentIdAuthorizeResponse, AdapterConfig } from "./types.js";

export class AgentIdClient {
  private config: AdapterConfig["agentid"];
  private fetchImpl: typeof fetch;

  constructor(config: AdapterConfig["agentid"], fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async authorize(payload: AgentIdAuthorizeRequest): Promise<AgentIdAuthorizeResponse> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;

    const baseUrl = this.config.base_url.replace(/\/+$/, "");
    const tenant = encodeURIComponent(this.config.tenant_id);
    const response = await this.fetchImpl(`${baseUrl}/tenants/${tenant}/authorize`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    return body as AgentIdAuthorizeResponse;
  }
}

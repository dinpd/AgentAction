import { mcpEndpointConfig } from "./mcp-endpoint-config.ts";
import { Validator } from "@cfworker/json-schema";

export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; annotations?: Record<string, unknown>; capabilityMetadataIssues?: string[] };
export type CatalogMetadata = { capturedAt: string; server?: {name?: string; version?: string}; tools: 'complete'; resources: {status:string;items:Record<string,string>[]}; resourceTemplates: {status:string;items:Record<string,string>[]} };
export type McpConnection = { endpoint: string; token?: string; tools: McpTool[]; protocol: string };
export class RuntimeError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export class McpPreflightError extends RuntimeError {}
// Fixed local failure categories only: never log provider responses or credentials.
export function mcpFailureReason(error: unknown): string {
  const reasons: Record<string, string> = {
    'A tool schema is too large.': 'schema_limit',
    'The tool catalog exceeds 80 tools or 512 KiB. Use a scoped MCP endpoint.': 'catalog_limit',
    'The server response exceeds the supported size limit.': 'response_limit',
    'This server uses an unsupported MCP version.': 'protocol_version',
    'MCP authentication failed. Reconnect the account or provide a valid bearer token.': 'authentication',
    'MCP request failed. Check the connection and retry discovery; tool execution is never retried automatically.': 'http_status',
    'MCP returned an invalid or failed response.': 'rpc_response',
    'MCP response could not be read. The request may have reached the server; execution will not be retried automatically.': 'response_read',
    'The server did not return a tool catalog.': 'missing_catalog',
    'The tool catalog has invalid or duplicate names.': 'tool_names',
    'No tools are available for this account.': 'empty_catalog',
    'The tool catalog could not be completely discovered.': 'pagination',
  };
  return error instanceof RuntimeError && Object.hasOwn(reasons, error.message) ? reasons[error.message] : 'unexpected';
}

const MAX_SCHEMA_BYTES = 128 * 1024;
const MAX_CATALOG_BYTES = 512 * 1024;
const encodedSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export const DEFAULT_ENDPOINTS = "https://mcp.firecrawl.dev/v2/mcp";
const SUPPORTED = ["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"];

export function parseEndpointURL(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new RuntimeError("Enter an approved MCP HTTPS endpoint.");
  let url: URL;
  try { url = new URL(value); } catch { throw new RuntimeError("Enter a valid MCP HTTPS endpoint."); }
  if (url.protocol !== "https:" || url.username || url.password || !mcpEndpointConfig().supportedQuery(url) || url.hash || (url.port && url.port !== "443")) throw new RuntimeError("Use an HTTPS endpoint without credentials or fragments. Only documented Apify single-Actor query configuration is supported.");
  return url.href;
}

export function endpointURL(value: unknown, allowed = DEFAULT_ENDPOINTS): string {
  const endpoint = parseEndpointURL(value);
  if (!allowed.split(",").map(v => v.trim()).includes(endpoint)) throw new RuntimeError("This endpoint needs workspace owner approval. Review it in Connection details before connecting.", 403);
  return endpoint;
}

export async function boundedText(response: Response, limit = 524288): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      size += chunk.value.byteLength;
      if (size > limit) throw new RuntimeError("The server response exceeds the supported size limit.", 502);
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RuntimeError("Expected an object.");
  return value as Record<string, unknown>;
}
export function textField(value: unknown, name: string, limit = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new RuntimeError(`Provide ${name} (up to ${limit} characters).`);
  return value.trim();
}
export function redact(value: unknown, token?: string): string {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (token) for (const secret of [token, encodeURIComponent(token), btoa(token)]) text = text.split(secret).join("[credential removed]");
  return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [removed]");
}

export class McpClient {
  private session: string | undefined;
  private counter = 0;
  private capabilities: Record<string, unknown> | undefined;
  private serverInfo: { name?: string; version?: string } = {};
  connection: McpConnection;
  fetcher: typeof fetch;
  private beforeRequest: () => Promise<void>;
  constructor(connection: McpConnection, fetcher: typeof fetch = (input, init) => fetch(input, init), beforeRequest: () => Promise<void> = async () => {}) { this.connection = connection; this.fetcher = fetcher; this.beforeRequest = beforeRequest; }
  async rpc(method: string, params: Record<string, unknown> = {}, notification = false, timeoutMs = 20000): Promise<Record<string, unknown>> {
    try { await this.beforeRequest(); } catch (error) {
      throw new McpPreflightError(error instanceof RuntimeError ? error.message : "Endpoint validation failed before sending the request.", error instanceof RuntimeError ? error.status : 400);
    }
    const id = notification ? undefined : ++this.counter;
    const modern = this.connection.protocol === "2026-07-28";
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": this.connection.protocol, "Mcp-Method": method };
    if (typeof params.name === "string") headers["Mcp-Name"] = params.name;
    if (this.connection.token) headers.authorization = `Bearer ${this.connection.token}`;
    if (this.session && !modern) headers["Mcp-Session-Id"] = this.session;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(this.connection.endpoint, {
        method: "POST", redirect: "manual", signal: controller.signal, headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params: modern ? { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": this.connection.protocol, "io.modelcontextprotocol/clientInfo": { name: "AgentAction", version: "0.16.0" }, "io.modelcontextprotocol/clientCapabilities": {} } } : params }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RuntimeError(response.status === 401 || response.status === 403 ? "MCP authentication failed. Reconnect the account or provide a valid bearer token." : "MCP request failed. Check the connection and retry discovery; tool execution is never retried automatically.", 502);
      }
      const session = response.headers.get("Mcp-Session-Id");
      if (session && /^[\x21-\x7e]{1,256}$/.test(session)) this.session = session;
      if (notification) { await response.body?.cancel(); return {}; }
      const body = await boundedText(response);
      const messages: unknown[] = response.headers.get("content-type")?.includes("text/event-stream")
        ? body.split(/\r?\n\r?\n/).filter(s => /^data:/m.test(s)).map(s => JSON.parse(s.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n")))
        : [JSON.parse(body)];
      const message = messages.map(object).find(m => m.id === id);
      if (!message || message.error || message.jsonrpc !== "2.0") throw new RuntimeError("MCP returned an invalid or failed response.", 502);
      return object(message.result);
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      throw new RuntimeError("MCP response could not be read. The request may have reached the server; execution will not be retried automatically.", 502);
    } finally { clearTimeout(timeout); }
  }
  async initialize(): Promise<void> {
    if (this.connection.protocol === "2026-07-28") return;
    const result = await this.rpc("initialize", { protocolVersion: this.connection.protocol, capabilities: {}, clientInfo: { name: "AgentAction", version: "0.16.0" } });
    if (!SUPPORTED.includes(String(result.protocolVersion)) || result.protocolVersion === "2026-07-28") throw new RuntimeError("This server uses an unsupported MCP version.", 502);
    this.connection.protocol = String(result.protocolVersion);
    this.capabilities = result.capabilities && typeof result.capabilities === 'object' && !Array.isArray(result.capabilities) ? result.capabilities as Record<string,unknown> : undefined;
    if(result.serverInfo && typeof result.serverInfo==='object' && !Array.isArray(result.serverInfo)) {
      const info=result.serverInfo as Record<string,unknown>;
      for(const key of ['name','version'] as const) if(typeof info[key]==='string') this.serverInfo[key]=info[key].slice(0,100);
    }
    await this.rpc("notifications/initialized", {}, true);
  }
  async discover(options: { allowEmpty?: boolean } = {}): Promise<McpTool[]> {
    await this.initialize();
    const tools: McpTool[] = [];
    const names = new Set<string>(), cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await this.rpc("tools/list", cursor ? { cursor } : {});
      if (!Array.isArray(result.tools)) throw new RuntimeError("The server did not return a tool catalog.", 502);
      for (const raw of result.tools) {
        const tool = object(raw);
        const name = textField(tool.name, "tool name", 128);
        if (!/^[a-zA-Z0-9_.:-]+$/.test(name) || names.has(name)) throw new RuntimeError("The tool catalog has invalid or duplicate names.", 502);
        const schema = object(tool.inputSchema);
        if (encodedSize(schema) > MAX_SCHEMA_BYTES) throw new RuntimeError("A tool schema is too large.", 502);
        names.add(name);
        const retained: McpTool = { name, description: typeof tool.description === "string" ? tool.description.slice(0, 1200) : "", inputSchema: schema };
        const issues:string[]=[];
        for (const key of ['outputSchema','annotations'] as const) if (tool[key]!==undefined) {
          if(!tool[key] || typeof tool[key]!=='object' || Array.isArray(tool[key]) || new TextEncoder().encode(JSON.stringify(tool[key])).byteLength>(key==='outputSchema'?MAX_SCHEMA_BYTES:2000)) issues.push(`${key==='outputSchema'?'Result schema':'Annotations'} omitted: malformed or exceeds the metadata limit.`);
          else retained[key]=tool[key] as Record<string,unknown>;
        }
        if(typeof tool.description==='string' && tool.description.length>1200) issues.push('Provider description truncated to 1,200 characters; some limits may be omitted.');
        if(issues.length) retained.capabilityMetadataIssues=issues;
        tools.push(retained);
        if (tools.length > 80 || encodedSize(tools) > MAX_CATALOG_BYTES) throw new RuntimeError("The tool catalog exceeds 80 tools or 512 KiB. Use a scoped MCP endpoint.", 502);
      }
      if (!result.nextCursor) { if (!tools.length && !options.allowEmpty) throw new RuntimeError("No tools are available for this account."); return tools; }
      cursor = textField(result.nextCursor, "tool cursor", 2048);
      if (cursors.has(cursor)) break;
      cursors.add(cursor);
    }
    throw new RuntimeError("The tool catalog could not be completely discovered.", 502);
  }
  discoveredServerInfo(): { name?: string; version?: string } { return { ...this.serverInfo }; }
  async discoverMetadata(): Promise<CatalogMetadata> {
    const deadline=Date.now()+10000;
    const catalog:CatalogMetadata={capturedAt:new Date().toISOString(),server:this.serverInfo,tools:'complete',resources:{status:'unknown',items:[]},resourceTemplates:{status:'unknown',items:[]}};
    if(!this.capabilities) return catalog;
    if(!Object.hasOwn(this.capabilities,'resources')) {catalog.resources.status='not_advertised';catalog.resourceTemplates.status='not_advertised';return catalog;}
    if(!this.capabilities.resources || typeof this.capabilities.resources!=='object') return catalog;
    let bytes=0;
    for(const [key,method,identity] of [['resources','resources/list','uri'],['resourceTemplates','resources/templates/list','uriTemplate']] as const) {
      const surface=catalog[key], cursors=new Set<string>(), identities=new Set<string>();let cursor:string|undefined;
      surface.status='incomplete';
      try {
        for(let page=0;page<3;page++) {
          if(Date.now()>=deadline) throw new RuntimeError('Resource discovery time limit.');
          const result=await this.rpc(method,cursor?{cursor}:{},false,Math.max(1,deadline-Date.now()));
          if(!Array.isArray(result[key])) break;
          for(const value of result[key]) {
            const raw=object(value), uri=textField(raw[identity],'resource identifier',2048);
            if(identities.has(uri)||surface.items.length>=32) throw new RuntimeError('Resource discovery limit.');
            const item:Record<string,string>={[identity]:uri};
            for(const field of ['name','description','mimeType']) if(typeof raw[field]==='string') item[field]=raw[field].slice(0,400);
            bytes+=new TextEncoder().encode(JSON.stringify(item)).byteLength;
            if(bytes>16000) throw new RuntimeError('Resource discovery size limit.');
            surface.items.push(item);identities.add(uri);
          }
          if(result.nextCursor===undefined || result.nextCursor===null) {surface.status='complete';break;}
          cursor=textField(result.nextCursor,'resource cursor',2048);
          if(cursors.has(cursor)) break;cursors.add(cursor);
        }
      } catch { /* A failed resource page cannot turn into an empty complete catalog. */ }
    }
    return catalog;
  }
  async close(): Promise<void> {
    if (!this.session) return;
    try {
      await this.beforeRequest();
      const response = await this.fetcher(this.connection.endpoint, { method: "DELETE", redirect: "manual", signal: AbortSignal.timeout(3000), headers: { "Mcp-Session-Id": this.session, "MCP-Protocol-Version": this.connection.protocol, ...(this.connection.token ? { authorization: `Bearer ${this.connection.token}` } : {}) } });
      await response.body?.cancel();
    } catch { /* Session cleanup must not replay or conceal the preceding result. */ }
  }
}

export function validateArguments(tool: McpTool, args: unknown): Record<string, unknown> {
  const value = object(args);
  if (JSON.stringify(value).length > 12000) throw new RuntimeError("Proposed tool arguments are too large.");
  try {
    const validator = new Validator(tool.inputSchema);
    const result = validator.validate(value);
    if (!result.valid) throw new RuntimeError(`The proposed arguments do not satisfy the input schema: ${result.errors[0]?.instanceLocation || "/"} ${result.errors[0]?.error || "invalid arguments"}`);
  } catch (error) { if (error instanceof RuntimeError) throw error; throw new RuntimeError("The proposed arguments do not satisfy this tool's input schema."); }
  return value;
}

import { Validator } from "@cfworker/json-schema";

export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type McpConnection = { endpoint: string; token?: string; tools: McpTool[]; protocol: string };
export class RuntimeError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const DEFAULT_ENDPOINTS = "https://mcp.firecrawl.dev/v2/mcp";
const SUPPORTED = ["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"];

export function endpointURL(value: unknown, allowed = DEFAULT_ENDPOINTS): string {
  if (typeof value !== "string" || value.length > 2048) throw new RuntimeError("Enter an approved MCP HTTPS endpoint.");
  let url: URL;
  try { url = new URL(value); } catch { throw new RuntimeError("Enter a valid MCP HTTPS endpoint."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443")) throw new RuntimeError("Use an HTTPS endpoint without credentials, query parameters or fragments.");
  if (!allowed.split(",").map(v => v.trim()).includes(url.href)) throw new RuntimeError("This endpoint is not enabled. Ask the workspace administrator to enable its exact HTTPS URL.", 403);
  return url.href;
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
  connection: McpConnection;
  fetcher: typeof fetch;
  constructor(connection: McpConnection, fetcher: typeof fetch = (input, init) => fetch(input, init)) { this.connection = connection; this.fetcher = fetcher; }
  async rpc(method: string, params: Record<string, unknown> = {}, notification = false): Promise<Record<string, unknown>> {
    const id = notification ? undefined : ++this.counter;
    const modern = this.connection.protocol === "2026-07-28";
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": this.connection.protocol, "Mcp-Method": method };
    if (typeof params.name === "string") headers["Mcp-Name"] = params.name;
    if (this.connection.token) headers.authorization = `Bearer ${this.connection.token}`;
    if (this.session && !modern) headers["Mcp-Session-Id"] = this.session;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.fetcher(this.connection.endpoint, {
        method: "POST", redirect: "manual", signal: controller.signal, headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params: modern ? { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": this.connection.protocol, "io.modelcontextprotocol/clientInfo": { name: "AgentAction", version: "0.16.0" } } } : params }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RuntimeError(response.status === 401 || response.status === 403 ? "MCP authentication failed. Use a valid bearer token; OAuth-only connections are not supported yet." : "MCP request failed. Check the connection and retry discovery; tool execution is never retried automatically.", 502);
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
    await this.rpc("notifications/initialized", {}, true);
  }
  async discover(): Promise<McpTool[]> {
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
        if (JSON.stringify(schema).length > 16000) throw new RuntimeError("A tool schema is too large.", 502);
        names.add(name);
        tools.push({ name, description: typeof tool.description === "string" ? tool.description.slice(0, 1200) : "", inputSchema: schema });
        if (tools.length > 80 || JSON.stringify(tools).length > 80000) throw new RuntimeError("This connection supports at most 80 tools. Use a scoped MCP endpoint.", 502);
      }
      if (!result.nextCursor) { if (!tools.length) throw new RuntimeError("No tools are available for this account."); return tools; }
      cursor = textField(result.nextCursor, "tool cursor", 2048);
      if (cursors.has(cursor)) break;
      cursors.add(cursor);
    }
    throw new RuntimeError("The tool catalog could not be completely discovered.", 502);
  }
  async close(): Promise<void> {
    if (!this.session) return;
    try {
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

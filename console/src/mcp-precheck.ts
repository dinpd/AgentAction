import { McpClient, RuntimeError, boundedText, object, type McpTool } from "./mcp-client.ts";
import { publicEndpointURL, validatePublicEndpoint } from "./endpoint-policy.ts";
import { capabilityEngine } from './mcp-capabilities.ts';

import { createReadinessProfile, type ReadinessProfile } from "./mcp-readiness.ts";

export type PrecheckFinding = { level: "info" | "review" | "blocked"; title: string; detail: string };
export type PrecheckReport = {
  readiness?: ReadinessProfile;
  server?: { name?: string; version?: string };
  capabilities?: ReturnType<ReturnType<typeof capabilityEngine>['inventory']>;
  endpoint: string; checkedAt: string; protocol: string; requestedProtocol?: string;
  authentication: "oauth" | "required" | "not-observed" | "unknown";
  visibility: "public-tools" | "authentication-required" | "unavailable";
  toolCount: number; tools: Array<{ name: string; description: string; inputs: string[] }>;
  providers: Array<{ issuer: string; metadata?: string; verified: boolean; authorizationEndpoint?: string; tokenEndpoint?: string; pkce: boolean }>;
  scopes: string[]; challengedScopes: string[]; evidence: Array<{ url: string; status: number }>;
  findings: PrecheckFinding[];
};
const strings = (v: unknown, max = 32): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 120).slice(0, max) : [];
const LIMIT_MS = 30_000, MAX_REQUESTS = 16;

// Inspection is deliberately separate from the credential-bearing MCP client
// policy: every destination is public-validated, and nothing grants endpoint access.
export async function inspectEndpoint(value: unknown, protocol = "2025-03-26", fetcher: typeof fetch = fetch): Promise<PrecheckReport> {
  const endpoint = publicEndpointURL(value);
  const report: PrecheckReport = { endpoint, checkedAt: new Date().toISOString(), protocol, requestedProtocol: protocol, authentication: "unknown", visibility: "unavailable", toolCount: 0, tools: [], providers: [], scopes: [], challengedScopes: [], evidence: [], findings: [] };
  const finding = (level: PrecheckFinding["level"], title: string, detail: string) => { if (report.findings.length < 20) report.findings.push({ level, title, detail }); };
  const deadline = AbortSignal.timeout(LIMIT_MS);
  let requests = 0, challenge = "", authRequired = false;
  let discoveredTools: McpTool[] = [];
  const limitedFetch: typeof fetch = (input, init) => fetcher(input, { ...init, credentials: "omit", redirect: "manual", signal: AbortSignal.any([deadline, AbortSignal.timeout(7000), ...(init?.signal ? [init.signal] : [])]) });
  const probe: typeof fetch = async (input, init = {}) => {
    if (deadline.aborted || ++requests > MAX_REQUESTS) throw new RuntimeError("Pre-check request or time limit reached.");
    if (init.method === "POST") {
      const rpc = object(JSON.parse(String(init.body)));
      if (String(input) !== endpoint || !["initialize", "notifications/initialized", "tools/list"].includes(String(rpc.method))) throw new RuntimeError("Pre-check only permits MCP discovery methods.");
    } else if (init.method && init.method !== "GET" && !(init.method === "DELETE" && String(input) === endpoint)) throw new RuntimeError("Unsupported pre-check request.");
    const url = await validatePublicEndpoint(String(input), limitedFetch);
    const headers = new Headers(init.headers);
    if (headers.has("authorization") || headers.has("cookie")) throw new RuntimeError("Pre-check cannot send credentials.");
    const response = await limitedFetch(url, { ...init, headers });
    report.evidence.push({ url, status: response.status });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new RuntimeError("A redirect was blocked. Inspect the final HTTPS endpoint directly."); }
    if (url === endpoint && init.method === "POST" && (response.status === 401 || response.status === 403)) {
      authRequired = true;
      challenge = (response.headers.get("www-authenticate") || "").slice(0, 8192);
    }
    return response;
  };
  const metadata = async (url: string): Promise<Record<string, unknown> | undefined> => {
    const response = await probe(url, { headers: { accept: "application/json" } });
    if (!response.ok) { await response.body?.cancel(); return; }
    return object(JSON.parse(await boundedText(response, 65536)));
  };
  try {
    await validatePublicEndpoint(endpoint, limitedFetch);
    finding("info", "Public HTTPS destination", "Public DNS and HTTPS transport checks passed. This does not establish provider trust.");
    const connection = { endpoint, protocol, tools: [] as McpTool[] };
    const client = new McpClient(connection, probe);
    try {
      const tools = await client.discover({ allowEmpty: true }); report.protocol = connection.protocol; discoveredTools = tools; report.server = client.discoveredServerInfo();
      report.visibility = "public-tools"; report.toolCount = tools.length;
      report.tools = tools.slice(0, 20).map(t => ({ name: t.name, description: t.description.slice(0, 160), inputs: Object.keys(t.inputSchema.properties && typeof t.inputSchema.properties === "object" ? t.inputSchema.properties : {}).slice(0, 8).map(s => s.slice(0, 40)) }));
      report.capabilities=capabilityEngine().inventory(tools.slice(0,20)).map(t=>({...t,description:t.description.slice(0,160),inputs:t.inputs.slice(0,8).map(p=>p.slice(0,120)),outputs:t.outputs.slice(0,8).map(p=>p.slice(0,120)),restrictions:t.restrictions.slice(0,2).map(s=>s.slice(0,200)),annotations:{}}));
      finding("info", "Public tool catalog inspected", `${tools.length} tools were listed without credentials. Up to 20 summaries are shown; no tools were executed.`);
      const concerning = tools.filter(t => /(?:delete|remove|write|send|execute|exec|shell|payment|purchase|admin)/i.test(`${t.name} ${t.description}`));
      if (concerning.length) finding("review", "Potentially consequential tools", `${concerning.length} tool descriptions or names mention modifying data, messaging, execution or administrative actions. This is a text-based signal, not verified behavior.`);
      if (tools.some(t => /ignore.{0,30}(?:instruction|previous)|system prompt|(?:send|reveal|exfiltrate).{0,30}(?:secret|credential|token)/i.test(t.description))) finding("review", "Suspicious instructions in tool metadata", "Some descriptions contain instruction-like or secret-related language. Treat provider metadata as untrusted; the pre-check does not pass it to AI.");
    } catch (error) {
      if (error instanceof RuntimeError && /redirect|public|request or time limit/i.test(error.message)) finding("blocked", "MCP probe blocked", error.message);
      report.visibility = authRequired ? "authentication-required" : "unavailable";
      finding("review", authRequired ? "Tool catalog requires authentication" : "Tool catalog could not be inspected", authRequired ? "The server rejected a credential-free MCP request. Account-specific tools and actual granted permissions remain unknown." : "MCP discovery failed, was blocked, or exceeded supported protocol, response, tool or time limits. Reachability alone is not tool compatibility.");
    } finally { await client.close(); }
    report.authentication = authRequired ? "required" : report.visibility === "public-tools" ? "not-observed" : "unknown";
    const challengeScopes = /\bscope\s*=\s*"([^"\r\n]*)"/i.exec(challenge)?.[1];
    report.challengedScopes = strings(challengeScopes?.split(/\s+/));
    if (challengeScopes && challengeScopes.split(/\s+/).length !== report.challengedScopes.length) finding("review", "Challenged scope list is incomplete", "Some scope values exceed display limits. Review the provider's complete consent request before authorizing.");
    const hints = [...challenge.matchAll(/\bresource_metadata\s*=\s*"([^"\r\n]*)"/gi)];
    if (hints.length > 1) throw new RuntimeError("Conflicting authorization metadata locations were advertised.");
    const base = new URL(endpoint);
    const candidates = hints.length ? [publicEndpointURL(hints[0][1])] : [...new Set([`${base.origin}/.well-known/oauth-protected-resource${base.pathname === "/" ? "" : base.pathname}`, `${base.origin}/.well-known/oauth-protected-resource`])];
    let resource: Record<string, unknown> | undefined;
    for (const url of candidates) {
      resource = await metadata(url);
      if (resource) {
        if (resource.resource !== endpoint) throw new RuntimeError("Protected-resource metadata does not match this exact MCP endpoint.");
        finding("info", "Protected-resource metadata found", "The metadata resource identifier matches the inspected endpoint. Provider declarations still require trust review.");
        break;
      }
    }
    if (resource) {
      if (!Array.isArray(resource.authorization_servers) || !resource.authorization_servers.length || resource.authorization_servers.length > 3 || resource.authorization_servers.some(v => typeof v !== "string")) throw new RuntimeError("Authorization provider metadata is missing or exceeds the supported three-provider limit.");
      const issuers = [...new Set(resource.authorization_servers.map(v => { publicEndpointURL(v); return v as string; }))];
      report.authentication = "oauth"; report.scopes = strings(resource.scopes_supported);
      if (resource.scopes_supported !== undefined && (!Array.isArray(resource.scopes_supported) || resource.scopes_supported.length !== report.scopes.length)) finding("review", "Supported scope list is incomplete", "The provider returned malformed or excessive scope values. Only up to 32 short scopes are shown; this is not a complete permissions assessment.");
      finding("review", "OAuth discovered · login not supported yet", "Public metadata advertises OAuth. AgentAction can inspect it, but cannot yet register an OAuth client, open consent, exchange tokens or refresh access.");
      for (const issuer of issuers) {
        const provider: PrecheckReport["providers"][number] = { issuer, verified: false, pkce: false }; report.providers.push(provider);
        const u = new URL(issuer), path = u.pathname.replace(/\/$/, "");
        if (u.origin !== base.origin) finding("review", "Separate authorization provider", `Authorization is delegated to ${u.origin}. A different provider domain is common, but should be reviewed before granting access.`);
        const urls = [...new Set([`${u.origin}/.well-known/oauth-authorization-server${path}`, `${u.origin}/.well-known/openid-configuration${path}`, `${u.origin}${path}/.well-known/openid-configuration`])];
        for (const url of urls) {
          const auth = await metadata(url); if (!auth) continue;
          // Issuer identifiers must match exactly, not merely share an origin.
          if (typeof auth.issuer !== "string" || auth.issuer !== issuer) throw new RuntimeError("Authorization-server issuer does not match the advertised provider.");
          provider.authorizationEndpoint = publicEndpointURL(auth.authorization_endpoint);
          provider.tokenEndpoint = publicEndpointURL(auth.token_endpoint);
          provider.metadata = url; provider.verified = true; provider.pkce = strings(auth.code_challenge_methods_supported).includes("S256");
          if (!provider.pkce) finding("review", "PKCE S256 not advertised", "The provider metadata does not advertise the PKCE method needed for the planned OAuth login flow. Support is unconfirmed.");
          break;
        }
        if (!provider.verified) finding("review", "Authorization metadata unavailable", "The provider's supported metadata locations could not be verified. OAuth login compatibility remains unknown.");
      }
    } else finding("review", "OAuth not established", "No matching protected-resource metadata was found. A Bearer challenge alone cannot distinguish OAuth from a static token; absence of discovery metadata does not rule out OAuth.");
    if (report.scopes.length || report.challengedScopes.length) finding("review", "Review advertised permissions", "Supported scopes and challenged scopes describe different things. Neither proves what an account will grant; review the actual consent request before authorization.");
  } catch (error) {
    finding("blocked", "Inspection incomplete or blocked", error instanceof RuntimeError ? error.message : "A request failed or returned malformed, oversized or timed-out metadata. No credentials were sent.");
  }
  finding("review", "Limited assessment, not a safety certification", "No provider account or OAuth client was created. No credentials, AI requests or tool executions were sent. Backend behavior, account permissions, pricing and data handling remain unverified; assess again after authorization.");
  report.readiness = await createReadinessProfile(report, discoveredTools);
  return report;
}

import type { McpTool } from './mcp-client.ts';
import type { PrecheckReport } from './mcp-precheck.ts';

export const READINESS_RULESET = '2026-09-22.1';
export const READINESS_PROTOCOLS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;
export const READINESS_ORIGIN = 'https://agentaction-mcp-check.drisw.workers.dev';
export type ReadinessFinding = {
  id: string; category: 'protocol' | 'usability' | 'action-safety';
  basis: 'requirement' | 'guidance' | 'heuristic' | 'observation';
  status: 'observed' | 'review' | 'fail' | 'untested';
  title: string; evidence: string; remediation: string; source: string; tool?: string;
};
export type ReadinessProfile = {
  schemaVersion: 'agentaction.mcp-readiness.v1'; ruleset: string;
  endpoint: string; requestedProtocol: string; observedProtocol: string;
  checkedAt: string; expiresAt: string; authenticationContext: 'anonymous';
  visibility: PrecheckReport['visibility']; authentication: PrecheckReport['authentication'];
  catalogFingerprint: string | null; fingerprintScope: 'bounded-discovered-tool-metadata';
  server?: { name?: string; version?: string };
  findingCounts: Record<ReadinessFinding["status"], number>;
  toolCount: number; tools: McpTool[]; findings: ReadinessFinding[];
  coverage: { discovery: 'observed' | 'incomplete'; metadata: 'bounded'; toolsShown: number; findingsOmitted: number; conformance: 'untested'; execution: 'untested'; permissions: 'untested'; retries: 'untested' };
};
export type ReadinessSummary = Pick<ReadinessProfile, 'endpoint' | 'checkedAt' | 'expiresAt' | 'ruleset' | 'requestedProtocol' | 'observedProtocol' | 'visibility' | 'catalogFingerprint' | 'toolCount'> & {
  id: string; stale: boolean; reviewCount: number; failureCount: number; toolNames: string[];
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function readinessStale(profile: Pick<ReadinessProfile, 'ruleset' | 'expiresAt' | 'checkedAt'>, now = Date.now()): boolean {
  const checked = Date.parse(profile.checkedAt), expiry = Date.parse(profile.expiresAt);
  return profile.ruleset !== READINESS_RULESET || !Number.isFinite(checked) || !Number.isFinite(expiry) || checked > now || expiry <= now;
}
export function summarizeReadiness(id: string, profile: ReadinessProfile, now = Date.now()): ReadinessSummary {
  const { endpoint, checkedAt, expiresAt, ruleset, requestedProtocol, observedProtocol, visibility, catalogFingerprint, toolCount } = profile;
  return { id, endpoint, checkedAt, expiresAt, ruleset, requestedProtocol, observedProtocol, visibility, catalogFingerprint, toolCount,
    stale: readinessStale(profile, now), reviewCount: profile.findingCounts.review,
    failureCount: profile.findingCounts.fail, toolNames: profile.tools.map(t => t.name) };
}
export async function createReadinessProfile(report: PrecheckReport, tools: McpTool[]): Promise<ReadinessProfile> {
  const visible = report.visibility === 'public-tools';
  const retained = visible ? tools : [];
  const spec = `https://modelcontextprotocol.io/specification/${report.protocol}`;
  const source = spec + '/server/tools';
  const findings: ReadinessFinding[] = [];
  const add = (finding: ReadinessFinding) => findings.push(finding);
  add({ id: 'discovery', category: 'protocol', basis: 'observation', status: visible ? 'observed' : 'untested', title: visible ? 'Anonymous tool discovery completed' : 'Tool discovery incomplete', evidence: visible ? `${retained.length} tools listed using ${report.protocol}. Catalog limits: 80 tools, five pages and 80,000 characters of retained metadata.` : 'Authentication, network, protocol or inspection limits prevented complete tool discovery.', remediation: visible ? 'Run the official conformance suite for the versions you support; discovery alone does not establish conformance.' : 'Review the probe details. Test an authenticated or scoped endpoint in your own environment; an incomplete check is not a protocol failure.', source: 'https://github.com/modelcontextprotocol/conformance' });
  for (const finding of report.findings.filter(f => f.level !== 'info' && !f.title.startsWith('Limited assessment') && !['Potentially consequential tools','Suspicious instructions in tool metadata'].includes(f.title))) add({ id: 'probe-' + finding.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), category: 'protocol', basis: 'observation', status: 'review', title: finding.title, evidence: finding.detail, remediation: 'Review the network and authentication observations below. Resolve blocked discovery or inspect the provider configuration locally before relying on this report.', source: spec + '/basic/authorization' });
  for (const tool of retained) {
    if (tool.inputSchema.type !== 'object') add({ id: 'input-object', tool: tool.name, category: 'protocol', basis: 'requirement', status: 'fail', title: 'Input schema must declare an object', evidence: `inputSchema.type is ${JSON.stringify(tool.inputSchema.type) ?? 'absent'}.`, remediation: 'Declare type: "object" at the input schema root.', source });
    if (report.protocol !== '2025-03-26' && tool.outputSchema && tool.outputSchema.type !== 'object') add({ id: 'output-object', tool: tool.name, category: 'protocol', basis: 'requirement', status: 'fail', title: 'Result schema must declare an object', evidence: `outputSchema.type is ${JSON.stringify(tool.outputSchema.type) ?? 'absent'}.`, remediation: 'When supplying an outputSchema, declare an object root.', source });
    if (!tool.description.trim()) add({ id: 'description', tool: tool.name, category: 'usability', basis: 'guidance', status: 'review', title: 'Explain when to use this tool', evidence: 'No non-empty tool description was returned.', remediation: 'Describe the operation, prerequisites, side effects and how to interpret the result.', source });
    if (!tool.outputSchema) add({ id: 'result-contract', tool: tool.name, category: 'usability', basis: 'guidance', status: 'review', title: 'Result shape is not declared', evidence: 'No retained outputSchema is available; this is optional metadata.', remediation: 'For protocols supporting structured outputs, consider publishing an outputSchema and matching structuredContent. Otherwise document the result format.', source });
    if (/(delete|remove|write|send|execute|exec|shell|payment|purchase|admin)/i.test(`${tool.name} ${tool.description}`)) add({ id: 'consequential', tool: tool.name, category: 'action-safety', basis: 'heuristic', status: 'review', title: 'Review possible side effects', evidence: 'The tool name or description mentions a potentially consequential operation. Behavior has not been tested.', remediation: 'Document required permissions, approval boundaries, retry/idempotency behavior and partial-failure recovery. Validate them in a sandbox.', source });
    if (/ignore.{0,30}(instruction|previous)|system prompt|(send|reveal|exfiltrate).{0,30}(secret|credential|token)/i.test(tool.description)) add({ id: 'instruction-text', tool: tool.name, category: 'action-safety', basis: 'heuristic', status: 'review', title: 'Review instruction-like metadata', evidence: 'Description text contains instruction-like or secret-related language; this is a heuristic, not an exploit finding.', remediation: 'Keep descriptions focused on tool use and treat all provider text as untrusted data.', source });
    for (const issue of tool.capabilityMetadataIssues || []) add({ id: 'metadata-limit', tool: tool.name, category: 'usability', basis: 'observation', status: 'review', title: 'Metadata coverage is limited', evidence: issue, remediation: 'Review the complete provider catalog locally; this report fingerprints only retained metadata.', source });
  }
  add({ id: 'behavior', category: 'action-safety', basis: 'observation', status: 'untested', title: 'Runtime behavior and permissions are untested', evidence: 'No tool calls, resource reads, credentials, consent flows or model evaluations were sent. Annotations are provider declarations, not enforced guarantees.', remediation: 'Use controlled fixtures to test account scopes, side effects, retries, partial completion, errors and workflow success.', source });
  const findingCounts = {fail:0,review:0,observed:0,untested:0};
  for (const f of findings) findingCounts[f.status]++;
  const rank = {fail:0,review:1,observed:2,untested:3};
  const visibleFindings = [...findings].filter(f=>f.id!=='behavior').sort((a,b)=>rank[a.status]-rank[b.status]).slice(0,31);
  visibleFindings.push(findings.find(f=>f.id==='behavior')!);
  const omitted = findings.length - visibleFindings.length;
  const shown: McpTool[] = []; let bytes = 0;
  for (const tool of retained) { const size = new TextEncoder().encode(JSON.stringify(tool)).byteLength; if (shown.length >= 20 || bytes + size > 32000) break; shown.push(tool); bytes += size; }
  return { schemaVersion: 'agentaction.mcp-readiness.v1', ruleset: READINESS_RULESET,
    endpoint: report.endpoint, requestedProtocol: report.requestedProtocol || report.protocol, observedProtocol: report.protocol,
    checkedAt: report.checkedAt, expiresAt: new Date(Date.parse(report.checkedAt) + 86400000).toISOString(), authenticationContext: 'anonymous',
    visibility: report.visibility, authentication: report.authentication,
    catalogFingerprint: visible ? await digest(canonical([...retained].sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) : null,
    fingerprintScope: 'bounded-discovered-tool-metadata', toolCount: retained.length, tools: shown, findings: visibleFindings, findingCounts, server: report.server,
    coverage: { discovery: visible ? 'observed' : 'incomplete', metadata: 'bounded', toolsShown: shown.length, findingsOmitted: omitted, conformance: 'untested', execution: 'untested', permissions: 'untested', retries: 'untested' } };
}

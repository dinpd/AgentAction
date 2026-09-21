import { boundedText } from './mcp-client.ts';
import type { CatalogServer } from './mcp-registry.ts';

export type Directory = 'smithery' | 'glama';
export type AdvertisedTool = { name: string; description: string; inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown> };
export type CatalogEvidence = {
  source: Directory; url: string; retrievedAt: string; observedAt?: string;
  status: 'available' | 'partial' | 'unknown'; tools: AdvertisedTool[]; advertisedCount?: number;
  authentication?: 'none' | 'api_key' | 'basic' | 'oauth2';
  note: string;
};
export type CatalogSource = {
  id: Directory; label: string; refreshMs: number;
  readPage(cursor?: string): Promise<{ servers: CatalogServer[]; cursor?: string }>;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const component = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(v) && v !== '.' && v !== '..' ? v : undefined;
export function catalogURL(value: unknown, endpoint = false): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || /[{}]/.test(value)) return;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (endpoint && u.port && u.port !== '443')) return;
    return u.href;
  } catch { return; }
}
function schema(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  // Retain whole schemas only; truncation must not create a different contract.
  if (new TextEncoder().encode(JSON.stringify(value)).length > 8192) return;
  return value as Record<string, unknown>;
}
export function advertisedTools(raw: unknown, count?: unknown): Pick<CatalogEvidence, 'tools' | 'status' | 'advertisedCount'> {
  const advertisedCount = Number.isSafeInteger(count) && Number(count) >= 0 ? Number(count) : Array.isArray(raw) ? raw.length : undefined;
  if (!Array.isArray(raw) || !raw.length) return { tools: [], status: 'unknown', advertisedCount };
  const tools: AdvertisedTool[] = [], names = new Set<string>();
  let partial = raw.length > 64, bytes = 0;
  for (const item of raw.slice(0, 64)) {
    const t = record(item), name = text(t.name, 128);
    if (!name || name !== t.name || names.has(name)) { partial = true; continue; }
    const inputSchema = schema(t.inputSchema), outputSchema = schema(t.outputSchema);
    if (!inputSchema || (t.outputSchema != null && !outputSchema)) partial = true;
    const tool = { name, description: text(t.description, 600), ...(inputSchema ? { inputSchema } : {}), ...(outputSchema ? { outputSchema } : {}) };
    const size = new TextEncoder().encode(JSON.stringify(tool)).length;
    if (bytes + size > 60_000) { partial = true; break; }
    tools.push(tool); names.add(name); bytes += size;
  }
  if (advertisedCount !== undefined && advertisedCount !== tools.length) partial = true;
  return { tools, advertisedCount, status: !tools.length ? 'unknown' : partial ? 'partial' : 'available' };
}

export function normalizeDirectory(source: Directory, summary: unknown, detail: unknown, retrievedAt: string): CatalogServer | undefined {
  const s = record(summary), d = record(detail);
  let identity: string, url: string, endpoint: string | undefined, publisher: string;
  if (source === 'smithery') {
    const parts = typeof s.qualifiedName === 'string' ? s.qualifiedName.split('/') : [];
    if (parts.length < 1 || parts.length > 2 || !parts.every(component)) return;
    identity = parts.join('/'); publisher = parts[0]; url = `https://smithery.ai/servers/${parts.map(encodeURIComponent).join('/')}`;
    // Never use a catalog for another server, even if its title looks similar.
    if (Object.keys(d).length && d.qualifiedName !== identity) throw new Error('Directory identity mismatch');
    endpoint = d.remote === true ? catalogURL(d.deploymentUrl, true) : undefined;
  } else {
    const namespace = component(s.namespace), slug = component(s.slug);
    if (!namespace || !slug || s.deprecatedAt) return;
    identity = `${namespace}/${slug}`; publisher = namespace; url = `https://glama.ai/mcp/connectors/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`;
    if (Object.keys(d).length && (d.namespace !== namespace || d.slug !== slug)) throw new Error('Directory identity mismatch');
    if (d.deprecatedAt) return;
    const connection = record(d.connection || s.connection);
    endpoint = connection.transport === 'streamable_http' ? catalogURL(connection.url, true) : undefined;
  }
  const normalized = advertisedTools(d.tools, source === 'glama' ? d.toolCount ?? s.toolCount : undefined);
  const observed = typeof d.lastTestedAt === 'string' && Number.isFinite(Date.parse(d.lastTestedAt)) ? new Date(d.lastTestedAt).toISOString() : undefined;
  return {
    name: `${source}:${identity}`, title: text(d.displayName || d.name || s.displayName || s.name, 120) || identity,
    description: text(d.description || s.description) || 'No server description provided.',
    version: 'not reported', publisher, website: catalogURL(d.documentationUrl || s.homepage || record(d.repository || s.repository).url),
    endpoints: endpoint ? [endpoint] : [], inspectableEndpoints: endpoint ? [endpoint] : [],
    hosting: endpoint ? 'Remote server' : 'Deployment details unconfirmed', setup: '', capabilities: [], authTypes: ['unspecified'],
    catalogEvidence: { ...normalized, source, url, retrievedAt, ...(observed ? { observedAt: observed } : {}),
      ...(source === 'glama' && ['none','api_key','basic','oauth2'].includes(String(record(d.connection || s.connection).authType)) ? { authentication: record(d.connection || s.connection).authType as CatalogEvidence['authentication'] } : {}),
      note: normalized.status === 'unknown' ? 'Tool catalog unavailable. This does not establish that a capability is unsupported.' : 'Registry indexed declarations. Account access, execution and result completeness are unverified.' },
  };
}

// All requests are to fixed directory origins. Never forward a user's query,
// endpoint, credential, or workflow to either directory. Never follow redirects.
export function directorySource(source: Directory, key: string, fetcher: typeof fetch = fetch, clock = Date.now): CatalogSource {
  const origin = source === 'smithery' ? 'https://api.smithery.ai' : 'https://glama.ai';
  const request = async (path: string) => {
    if (!key || /[\r\n]/.test(key)) throw new Error('Directory is not configured');
    const response = await fetcher(origin + path, { headers: { accept: 'application/json', authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Directory unavailable'); }
    const body = await boundedText(response, 1_048_576);
    if (body.includes(key)) throw new Error('Directory returned credential material');
    return record(JSON.parse(body));
  };
  return {
    id: source, label: source === 'smithery' ? 'Smithery' : 'Glama', refreshMs: 86_400_000,
    async readPage(cursor) {
      const params = source === 'smithery' ? new URLSearchParams({ pageSize: '10', page: cursor || '1', remote: 'true', seed: '245' }) : new URLSearchParams({ first: '10', sort: 'name:asc', ...(cursor ? { after: cursor } : {}) });
      if (source === 'smithery' && !/^[1-9][0-9]{0,4}$/.test(cursor || '1')) throw new Error('Invalid directory cursor');
      const page = await request((source === 'smithery' ? '/servers?' : '/api/mcp/v1/connectors?') + params);
      const entries = page[source === 'smithery' ? 'servers' : 'connectors'];
      if (!Array.isArray(entries) || entries.length > 10) throw new Error('Invalid directory page');
      let next: string | undefined;
      if (source === 'smithery') {
        const p = record(page.pagination), current = Number(cursor || '1');
        if (p.currentPage !== current || !Number.isSafeInteger(p.totalPages) || Number(p.totalPages) < 0) throw new Error('Invalid directory pagination');
        if (Number(p.totalPages) > current) next = String(current + 1);
      } else {
        const p = record(page.pageInfo);
        if (typeof p.hasNextPage !== 'boolean') throw new Error('Invalid directory pagination');
        if (p.hasNextPage) { if (typeof p.endCursor !== 'string' || !p.endCursor || p.endCursor.length > 2048) throw new Error('Invalid directory cursor'); next = p.endCursor; }
      }
      if (next && !entries.length) throw new Error('Empty directory page with continuation');
      const servers: CatalogServer[] = [];
      // Two requests at a time keep socket/CPU use bounded. A page failure leaves
      // the previous complete snapshot intact instead of publishing stale joins.
      for (let i = 0; i < entries.length; i += 2) {
        const batch = await Promise.all(entries.slice(i, i + 2).map(async entry => {
          const identity = normalizeDirectory(source, entry, undefined, new Date(clock()).toISOString());
          if (!identity) return;
          const id = identity.name.slice(source.length + 1);
          const path = source === 'smithery' ? '/servers/' + encodeURIComponent(id) : '/api/mcp/v1/connectors/' + id.split('/').map(encodeURIComponent).join('/');
          const detail = await request(path);
          return normalizeDirectory(source, entry, detail, new Date(clock()).toISOString());
        }));
        servers.push(...batch.filter((s): s is CatalogServer => Boolean(s)));
      }
      return { servers, cursor: next };
    },
  };
}

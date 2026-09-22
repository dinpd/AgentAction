import type { CatalogResult } from './mcp-registry.ts';
import { READINESS_ORIGIN, readinessStale, type ReadinessSummary } from './mcp-readiness.ts';
import { boundedText } from './mcp-client.ts';

type Service = { fetch(request: Request): Promise<Response> };
export async function enrichReadiness(catalog: CatalogResult, service?: Service): Promise<CatalogResult> {
  if (!service) return catalog;
  const endpoints = [...new Set(catalog.servers.flatMap(s => s.inspectableEndpoints || s.endpoints))].slice(0,180);
  if (!endpoints.length) return catalog;
  try {
    // Sends only public catalog URLs. Never tenant IDs, account state or search text.
    const response = await service.fetch(new Request(READINESS_ORIGIN + '/api/lookup', { method:'POST', signal:AbortSignal.timeout(5000), headers:{'content-type':'application/json',origin:READINESS_ORIGIN,'x-readiness-request':'mcp-check'}, body:JSON.stringify(endpoints) }));
    if (!response.ok) { await response.body?.cancel(); throw new Error('Unavailable'); }
    const profiles: ReadinessSummary[] = JSON.parse(await boundedText(response, 2000000));
    if (!Array.isArray(profiles) || profiles.length > 180) throw new Error('Invalid profiles');
    return {...catalog, servers: catalog.servers.map(server => ({...server, readiness: profiles.filter(p => /^[a-f0-9]{64}$/.test(p.id) && (server.inspectableEndpoints || server.endpoints).includes(p.endpoint)).map(p => ({...p,stale:readinessStale(p)}))}))};
  } catch { return {...catalog,notice:catalog.notice + ' Public readiness evidence is temporarily unavailable.'}; }
}
